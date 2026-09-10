import { Router } from 'express';
import { pool } from '../config/db.js';
import { responderError } from '../utils/responder.js';
import { exigirSesion } from '../auth/sesion.js';
import { registroSeguridad } from '../auth/registroEventos.js';
import { FECHA_TERMINOS_TEXTO, aceptacionPendiente } from '../config/terminos.js';

/**
 * Re-aceptación de los Términos y Condiciones.
 *
 * POR QUÉ EXISTE: el punto 9 de los Términos promete que a quien ya tiene
 * cuenta se le vuelve a pedir la aceptación ante un cambio que le imponga algo
 * nuevo, en vez de darla por hecha con el "seguir usando el sitio significa que
 * lo aceptás" que vale para quien navega sin cuenta. Esa distinción existe
 * porque el alta de una cuenta pide una casilla explícita y guarda la fecha:
 * habiendo pedido un consentimiento expreso una vez, cambiar el documento y
 * darlo por revalidado en silencio sería peor que no haberlo pedido nunca.
 *
 * POR QUÉ NO SE PUEDE HACER CON `updateUser` DE BETTER AUTH, que es la vía
 * obvia y está cerrada a propósito: el hook `user.update.before` de
 * `auth/auth.js` RECHAZA cualquier pedido que traiga `aceptoTerminos` o
 * `terminosAceptadosEn`. Eso es lo que impide que un cliente se declare a sí
 * mismo como aceptante, o se invente la fecha en la que dice haber aceptado.
 * Esa puerta se queda cerrada; esta ruta es la única que escribe esos campos, y
 * **la fecha la pone el reloj del servidor** (`NOW()` en el SQL), nunca el
 * cuerpo del pedido. El cliente no manda ninguna fecha porque no tiene ninguna
 * que mandar.
 *
 * QUÉ NO HACE ESTA RUTA, y es una decisión de producto que conviene ver
 * escrita: **no bloquea nada**. Quien tiene la aceptación pendiente sigue
 * pudiendo usar el sitio entero, incluidas sus listas y su perfil. Se le
 * muestra el pedido en pantalla y se lo deja decidir. Los dos motivos:
 *
 *  1. Lo que los Términos prometen es PEDIR, no impedir. Cortarle el acceso a
 *     sus propias listas a alguien que todavía no leyó un documento nuevo es
 *     una presión para que acepte sin leer, que es justo lo contrario de lo
 *     que un consentimiento tiene que ser.
 *  2. El propio punto 9 le ofrece como salida borrar la cuenta desde su
 *     perfil. Bloquear el perfil dejaría esa salida sin puerta.
 */
export const terminosRouter = Router();

/**
 * GET /terminos/estado
 *
 * Sin sesión contesta `pendiente: false`, que no es un caso raro: es el uso
 * normal del sitio. La pantalla pregunta siempre, sin fijarse antes si hay
 * usuario, y acá se decide.
 *
 * LA COMPARACIÓN SE HACE ACÁ Y NO EN EL FRONTEND a propósito, aunque
 * `terminosAceptadosEn` viaje dentro de la sesión y el frontend pudiera
 * hacerla solo. Si la hiciera allá, la fecha vigente tendría que estar
 * duplicada en los dos paquetes, y dos copias de esa fecha se contradicen en
 * silencio: nadie se entera de que a la mitad de la gente se le está pidiendo
 * de más o de menos.
 */
terminosRouter.get('/terminos/estado', (req, res) => {
  res.json({
    /**
     * La fecha de la VERSIÓN del documento, que es lo que significa "vigentes
     * desde" para quien lo lea. No es lo mismo que FECHA_TERMINOS, que es el
     * corte con el que se compara (el fin de ese día en hora argentina, ver
     * config/terminos.js) y es un detalle interno de la comparación.
     */
    vigentesDesde: FECHA_TERMINOS_TEXTO,
    pendiente: aceptacionPendiente(req.usuario),
  });
});

/**
 * POST /terminos/aceptar
 *
 * Sin cuerpo: lo único que este pedido puede significar es "acepto", y el
 * único dato que hace falta guardar (cuándo) lo sabe el servidor. Una casilla
 * en el cuerpo sería una casilla que el cliente puede mandar en false, o sea
 * una forma de registrar una aceptación que no ocurrió.
 *
 * Es idempotente: aceptar dos veces solo mueve la fecha hacia adelante. No
 * hace falta comprobar antes si estaba pendiente.
 */
terminosRouter.post('/terminos/aceptar', exigirSesion, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE "user"
          SET "aceptoTerminos" = TRUE,
              "terminosAceptadosEn" = NOW(),
              "updatedAt" = NOW()
        WHERE id = $1
        RETURNING "terminosAceptadosEn"`,
      [req.usuario.id]
    );

    /**
     * La sesión existe pero la fila no: la cuenta se borró entre que se leyó
     * la cookie y llegó este pedido. Es raro y no es un error nuestro.
     */
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Esa cuenta ya no existe.' });
    }

    /**
     * Va al mismo registro que los ingresos y las bajas: aceptar los Términos
     * es de las pocas cosas que una persona hace en esta app y que después
     * puede necesitar que se pueda demostrar cuándo pasó.
     *
     * LA IP SALE DE `req.ip`, NO DE UN ENCABEZADO. El `x-ip-cliente` que lee
     * auth.js lo escribe un middleware montado solo en `/api/auth`, así que
     * acá no existe; leerlo igual habría dejado dos defectos juntos: la línea
     * salía sin IP, y el único valor posible de ese encabezado en esta ruta
     * sería el que mandara el cliente, o sea una IP inventada por quien
     * después va a querer que el registro no lo señale.
     */
    registroSeguridad.aceptacionDeTerminos(req.usuario.id, req.ip);

    res.json({ aceptadosEn: rows[0].terminosAceptadosEn, pendiente: false });
  } catch (err) {
    responderError(res, err, 'terminos/aceptar');
  }
});
