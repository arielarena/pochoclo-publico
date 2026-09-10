/**
 * Vigencia de los Términos y Condiciones.
 *
 * QUÉ RESUELVE ESTE ARCHIVO: la fecha estaba escrita a mano adentro de
 * `scripts/terminosPendientes.js`, que era su único consumidor. Desde que
 * existe la pantalla de re-aceptación hay tres lugares que necesitan la misma
 * respuesta (el script, la ruta que la sirve y la que la registra), y tres
 * copias de una fecha es la forma más fácil de que la pantalla le pida la
 * aceptación a gente que ya aceptó, o peor, que no se la pida a quien no.
 *
 * SIGUE HABIENDO UNA COPIA DEL LADO DEL FRONTEND, pero no de esta fecha: allá
 * está `FECHA_ACTUALIZACION` en `config/sitio.js`, que es el texto que se
 * MUESTRA en el encabezado de las páginas legales. Son dos cosas distintas
 * aunque hoy coincidan, y conviene que sigan separadas: se puede corregir una
 * errata de la página sin obligar a todo el mundo a aceptar de nuevo. **El
 * frontend no decide nada acá**: pregunta por `GET /terminos/estado` y el
 * servidor contesta, así que la comparación vive en un solo lado.
 *
 * CUÁNDO TOCARLA: solo cuando el cambio del texto le imponga algo nuevo a
 * quien ya tiene cuenta. Eso es lo que el punto 9 de los Términos promete que
 * se le va a volver a pedir. Un arreglo de redacción no cuenta, y subir esta
 * fecha por un arreglo de redacción le pide la aceptación a todo el mundo sin
 * motivo, que es la forma más rápida de que la gente empiece a aceptar sin
 * leer.
 *
 * SON DOS CONSTANTES Y SE MUEVEN JUNTAS: `FECHA_TERMINOS_TEXTO` es la fecha
 * de la versión, la que se muestra y la que se dice en voz alta ("la versión
 * del 25 de agosto"); `FECHA_TERMINOS`, acá abajo, es el instante contra el
 * que se compara.
 */
export const FECHA_TERMINOS_TEXTO = '2026-08-29';

/**
 * El corte con el que se compara, y por qué es un INSTANTE y no una fecha
 * pelada.
 *
 * `new Date('2026-08-25')` es medianoche **UTC**, o sea las 21:00 del día
 * anterior en Argentina. Con eso, quien aceptó el texto VIEJO el 24 a la
 * noche quedaba registrado como si hubiera consentido el nuevo: su fecha de
 * aceptación cae después del corte aunque el documento que leyó fuera el
 * otro. Es justo la afirmación falsa que este archivo existe para evitar.
 *
 * Tampoco sirve correrlo al fin del día, que es el reflejo opuesto: quien
 * acepta el texto nuevo esa misma tarde seguiría contando como pendiente
 * DESPUÉS de haber aceptado, así que el aviso volvería a aparecerle una y
 * otra vez hasta el día siguiente. Un pedido que no se puede satisfacer es
 * peor que no pedir nada.
 *
 * Lo único que parte bien las dos poblaciones es el momento exacto en que el
 * texto nuevo quedó publicado, con su huso escrito. **Al mover esta fecha,
 * poner la hora del despliegue**, no la del commit, si no salen juntos: entre
 * una y otra la gente sigue leyendo el texto anterior.
 */
export const FECHA_TERMINOS = new Date('2026-08-29T12:00:00-03:00');

/*
 * PUESTA AL DÍA DEL DESPLIEGUE, HECHA EL 2026-09-04.
 *
 * La revisión legal (agregó la identificación del responsable, el
 * procedimiento de suspensión de cuentas del punto 6, y la declaración de
 * transferencia internacional) quedó publicada junto con el resto del sitio
 * el 2026-08-29, así que el corte pasa a esa fecha. **La hora (12:00) es una
 * estimación razonable, no un dato verificado**: no hay un commit ni un log
 * que marque el instante exacto en que el sitio quedó accesible al público
 * (publicar es una acción de infraestructura en Cloudflare/la notebook, no
 * un commit). No le cambia la vida a nadie hoy porque la base sigue en cero
 * cuentas — si eso deja de ser cierto y hace falta precisión real, buscar en
 * los logs de `cloudflared`/Cloudflare Pages de ese día.
 */

/**
 * ¿Esta persona tiene que volver a aceptar los Términos?
 *
 * Las dos situaciones que devuelven true son distintas y las dos importan:
 *
 *  1. **Nunca aceptó nada** (`aceptoTerminos` en false, o sin fecha). Son las
 *     cuentas creadas antes de que el documento existiera. Es correcto que
 *     figuren así: no aceptaron porque no había nada que aceptar.
 *  2. **Aceptó una versión anterior** a la vigente.
 *
 * Un usuario anónimo NUNCA tiene nada pendiente: los Términos se aceptan por
 * uso, sin casilla, y pedirle algo a quien no tiene cuenta no tendría dónde
 * quedar registrado.
 *
 * @param {{ aceptoTerminos?: boolean, terminosAceptadosEn?: Date|string|null }|null} usuario
 */
export function aceptacionPendiente(usuario) {
  if (!usuario) return false;
  if (!usuario.aceptoTerminos) return true;

  const aceptadosEn = usuario.terminosAceptadosEn ? new Date(usuario.terminosAceptadosEn) : null;
  /**
   * Una fecha ilegible se trata como pendiente y no como aceptada: ante la
   * duda, preguntar de más molesta; dar por aceptado de menos es una
   * afirmación falsa sobre lo que una persona consintió.
   */
  if (!aceptadosEn || Number.isNaN(aceptadosEn.getTime())) return true;

  return aceptadosEn < FECHA_TERMINOS;
}
