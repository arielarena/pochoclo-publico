import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSesion } from '../auth/ContextoSesion.jsx';
import { useTerminos } from '../auth/ContextoTerminos.jsx';
import { FECHA_ACTUALIZACION } from '../config/sitio.js';
import Cargando from '../components/Cargando.jsx';
import useMetadatos from '../utils/useMetadatos.js';
import RegionViva from '../components/RegionViva.jsx';

/**
 * Qué cambió en la versión vigente de los Términos.
 *
 * HAY QUE ACTUALIZARLA CADA VEZ QUE SE MUEVE `FECHA_TERMINOS` en
 * `backend/src/config/terminos.js`, y es lo único de este archivo que hay que
 * tocar. Sin esto la pantalla diría "aceptá de nuevo" sin decir qué, que es
 * pedir una firma en blanco: nadie puede consentir algo que no sabe qué es.
 *
 * Es un resumen y no el documento: el documento entero está a un clic, y
 * enfrentar a alguien con diez secciones sin decirle cuál cambió es la forma
 * más segura de que no lea ninguna.
 */
const CAMBIOS = [
  'Ahora decimos quién opera el sitio y dónde, en vez de decir solamente que lo mantiene una persona.',
  'Escribimos un procedimiento para suspender o dar de baja una cuenta: te avisamos con el motivo concreto, podés contestar y lo revisamos, y antes de borrar nada te damos tiempo de pedirnos una copia de tus listas.',
  'Aclaramos qué NO limita nuestra cláusula de responsabilidad, y que si algo de este documento va en contra de tus derechos como consumidor, esa parte no vale y el resto sigue en pie.',
  'Dijimos con todas las letras que tus datos se guardan en Brasil y en los Estados Unidos, que la normativa argentina no considera que esos países tengan protección adecuada, y que la transferencia se apoya en tu consentimiento.',
  'La política de privacidad sumó tres secciones: qué datos no te pedimos, qué hacemos con tus gustos, y qué medidas de seguridad concretas están puestas.',
];

/**
 * Pantalla de re-aceptación de los Términos (punto 9 de /terminos).
 *
 * Se llega por el aviso que aparece arriba de todas las pantallas. **No hay
 * ninguna ruta que redirija acá a la fuerza**, y es a propósito: lo que los
 * Términos prometen es pedir, no impedir. El razonamiento completo está en
 * `components/AvisoTerminos.jsx` y en `backend/src/routes/terminos.js`.
 *
 * DOS COSAS QUE ESTA PANTALLA HACE IGUAL QUE EL REGISTRO, porque es el mismo
 * consentimiento y no puede valer menos por ser el segundo:
 *
 *  - La casilla **arranca sin tildar**. Una casilla de consentimiento
 *    pre-marcada no vale como consentimiento.
 *  - El botón está deshabilitado hasta que se tilda, así que la aceptación es
 *    siempre un acto deliberado y no un clic de más.
 *
 * Y UNA QUE NO HACE EL REGISTRO: ofrece la salida. Quien no está de acuerdo no
 * tiene por qué quedarse con una cuenta bajo unos Términos que no acepta, así
 * que la baja está a la vista, en la misma pantalla y no escondida en un
 * párrafo. Es lo que el punto 9 promete.
 */
export default function PaginaAceptarTerminos() {
  useMetadatos('aceptarTerminos');

  const { usuario, cargando: cargandoSesion } = useSesion();
  const { pendiente, consultado, aceptar } = useTerminos();
  const navegar = useNavigate();

  const [acepto, setAcepto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  if (cargandoSesion || !consultado) {
    return (
      <main id="contenido" className="pagina-lectura">
        <Cargando mensaje="Un segundo…" />
      </main>
    );
  }

  /**
   * Sin cuenta esta pantalla no significa nada: los Términos se aceptan por
   * uso y no hay dónde registrar nada. Se manda al inicio y no a
   * /iniciar-sesion, que sería pedirle una cuenta a alguien que no la quiere.
   */
  if (!usuario) return <Navigate to="/" replace />;

  /**
   * Ya está al día: llegó por el enlace guardado, por el botón de atrás, o
   * porque aceptó en otra pestaña.
   */
  if (!pendiente) {
    return (
      <main id="contenido" className="pagina-lectura">
        <h1 className="titulo-pagina">Ya está</h1>
        <p className="bajada mt-3">
          Tenés aceptada la versión vigente de los Términos y Condiciones. No hay nada pendiente.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/" className="boton-primario px-5 py-2.5">
            Volver al inicio
          </Link>
          <Link to="/terminos" className="boton-secundario px-5 py-2.5">
            Leer los Términos
          </Link>
        </div>
      </main>
    );
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (!acepto || enviando) return;

    setError('');
    setEnviando(true);
    try {
      await aceptar();
      /**
       * Al inicio y no a la pantalla anterior: el aviso de arriba ya
       * desapareció solo, así que quedarse acá mostraría el "Ya está", que es
       * un estado de paso y no una confirmación que alguien quiera leer.
       */
      navegar('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <main id="contenido" className="pagina-lectura">
      <h1 className="titulo-pagina">Actualizamos los Términos</h1>
      <p className="bajada mt-3">
        Cambiamos el texto de los Términos y Condiciones el {FECHA_ACTUALIZACION}. Como los habías aceptado
        marcando una casilla, te los pedimos de nuevo en vez de darlos por aceptados sin avisarte.
      </p>

      <section className="panel mt-8 p-5">
        <h2 className="titulo-bloque">Qué cambió</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-crema/80">
          {CAMBIOS.map((cambio) => (
            <li key={cambio}>{cambio}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-crema/70">
          Este es el resumen. El documento completo está en{' '}
          <Link to="/terminos" className="font-semibold text-manteca hover:underline">
            Términos y Condiciones
          </Link>
          , y qué hacemos con tus datos sigue estando en la{' '}
          <Link to="/privacidad" className="font-semibold text-manteca hover:underline">
            política de privacidad
          </Link>
          .
        </p>
      </section>

      <form onSubmit={enviar} className="mt-8 space-y-5">
        {/* Sin tildar de entrada y con el botón deshabilitado hasta que se
            tilde: es el mismo criterio que en el registro, porque es el mismo
            consentimiento. Ver PaginaCrearCuenta. */}
        <label className="flex items-start gap-3 text-sm text-crema/70">
          <input
            id="acepto-terminos"
            type="checkbox"
            className="casilla mt-0.5 shrink-0"
            checked={acepto}
            onChange={(e) => setAcepto(e.target.checked)}
          />
          <span>
            Leí y acepto los{' '}
            <Link to="/terminos" className="font-semibold text-manteca hover:underline">
              términos y condiciones
            </Link>{' '}
            actualizados.
          </span>
        </label>

        {error && (
          <RegionViva rol="alert"  className="mensaje-error">
            {error}
          </RegionViva>
        )}

        <button type="submit" disabled={!acepto || enviando} className="boton-destacado w-full">
          {enviando ? 'Guardando…' : 'Aceptar y continuar'}
        </button>
      </form>

      <div className="panel mt-8 p-5 text-sm text-crema/70">
        <h2 className="titulo-bloque">Si no estás de acuerdo</h2>
        <p className="mt-2 leading-relaxed">
          Podés seguir usando Pochoclo mientras lo pensás. Ninguna función se bloquea y tus listas siguen donde
          estaban. Este aviso va a seguir apareciendo hasta que nos contestes.
        </p>
        <p className="mt-3 leading-relaxed">
          Si preferís no aceptarlos, podés{' '}
          <Link to="/perfil" className="font-semibold text-manteca hover:underline">
            borrar tu cuenta desde tu perfil
          </Link>
          . Se lleva tus listas y tus gustos, es inmediato y no se puede deshacer. El sitio se puede seguir
          usando entero sin cuenta.
        </p>
      </div>
    </main>
  );
}
