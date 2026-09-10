import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSesion } from '../auth/ContextoSesion.jsx';
import CampoFormulario from '../auth/CampoFormulario.jsx';
import { esCorreoValido, MENSAJE_CORREO_INVALIDO } from '../utils/correo.js';
import ReenviarVerificacion from '../components/ReenviarVerificacion.jsx';
import { problemaDeNombre } from '../utils/nombre.js';
import { anioDeNacimiento, edadCumplida, EDAD_MINIMA_CUENTA } from '../utils/edad.js';
import { problemaDeContrasena, LARGO_MINIMO_CONTRASENA } from '../utils/contrasena.js';
import RequisitosContrasena from '../auth/RequisitosContrasena.jsx';
import { RESPONSABLE_DOMICILIO, RESPONSABLE_NOMBRE } from '../config/sitio.js';
import useMetadatos from '../utils/useMetadatos.js';
import RegionViva from '../components/RegionViva.jsx';

/**
 * El primer largometraje es de fines del siglo XIX, pero acá el piso es
 * simplemente "una fecha de nacimiento plausible": sirve para atajar un
 * error de tipeo en el año, no para filtrar gente.
 */
const ANIO_MINIMO = 1900;

/**
 * Se valida todo en JavaScript y no solo con los atributos del HTML
 * (`required`, `type="email"`, `minLength`) porque esos se borran en dos
 * clics desde las devtools: sacando `required` se podía crear una cuenta con
 * el nombre vacío. Igual, la validación que de verdad no se puede saltear es
 * la del servidor (databaseHooks en backend/src/auth/auth.js); esta es para
 * avisar rápido y en español.
 */
function validar({ nombre, correo, contrasena, fechaNacimiento, aceptoTerminos }) {
  const problemaNombre = problemaDeNombre(nombre);
  if (problemaNombre) {
    return problemaNombre;
  }

  if (!esCorreoValido(correo)) {
    return MENSAJE_CORREO_INVALIDO;
  }

  /**
   * Los requisitos completos, no solo el largo. El servidor valida lo mismo
   * (backend/src/auth/validaciones.js), así que borrar el atributo del campo
   * desde las devtools no sirve de nada.
   */
  const problemaContrasena = problemaDeContrasena(contrasena);
  if (problemaContrasena) {
    return problemaContrasena;
  }

  const fecha = new Date(fechaNacimiento);
  if (Number.isNaN(fecha.getTime())) {
    return 'Revisá la fecha de nacimiento.';
  }
  if (fecha > new Date()) {
    return 'La fecha de nacimiento no puede estar en el futuro.';
  }
  /**
   * El año se lee en UTC, que es el día que la persona escribió (ver la nota
   * de utils/edad.js): en local, un nacimiento del 1 de enero da el anterior.
   */
  if (anioDeNacimiento(fecha) < ANIO_MINIMO) {
    return 'Revisá el año de nacimiento.';
  }

  /**
   * Edad mínima (punto 4 de los Términos). El servidor la vuelve a verificar
   * con su propio reloj, que es la que decide: esta copia es para avisar
   * antes de enviar en vez de que vuelva un error sin contexto.
   */
  if (edadCumplida(fecha) < EDAD_MINIMA_CUENTA) {
    return `Hay que tener ${EDAD_MINIMA_CUENTA} años o más para crear una cuenta. Pochoclo se puede usar entero sin cuenta.`;
  }

  if (!aceptoTerminos) {
    return 'Para crear la cuenta hay que aceptar los términos y condiciones.';
  }

  return null;
}

export default function PaginaCrearCuenta() {
  useMetadatos('crearCuenta');

  const { registrarse } = useSesion();
  const ubicacion = useLocation();

  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [aceptoTerminos, setAceptoTerminos] = useState(false);
  const [errorCorreo, setErrorCorreo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const destino = ubicacion.state?.destino ?? '/';

  /**
   * El correo se valida al SALIR del campo, no en cada tecla: escribiendo
   * "ana@sitio.com" se pasa por "a", "ana@" y "ana@sitio", así que avisar
   * mientras se tipea sería estar en rojo casi todo el tiempo. El campo vacío
   * no se marca: de eso se ocupa el `required` al enviar.
   */
  function revisarCorreo() {
    if (correo.trim() === '') setErrorCorreo('');
    else setErrorCorreo(esCorreoValido(correo) ? '' : MENSAJE_CORREO_INVALIDO);
  }

  async function alEnviar(evento) {
    evento.preventDefault();

    const problema = validar({ nombre, correo, contrasena, fechaNacimiento, aceptoTerminos });
    if (problema) {
      setError(problema);
      return;
    }

    setError('');
    setEnviando(true);
    try {
      await registrarse({
        nombre: nombre.trim(),
        correo: correo.trim(),
        contrasena,
        fechaNacimiento,
        aceptoTerminos,
        destino,
      });
      setEnviado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  /**
   * DOS COSAS CAMBIARON ACÁ Y LAS DOS SALEN DE LA MISMA DECISIÓN.
   *
   * Antes, crear la cuenta abría sesión al instante y esta pantalla navegaba
   * sola a `destino`. Con la verificación de correo obligatoria eso ya no
   * pasa: el alta no devuelve sesión, así que navegar llevaría a la persona a
   * una pantalla como anónima, y si era privada RutaPrivada la rebotaría al
   * login. Por eso ahora termina acá.
   *
   * Y EL TEXTO NO PUEDE DECIR SI LA DIRECCIÓN YA TENÍA CUENTA. Es la otra
   * mitad del cegado que hace el servidor (ver `onExistingUserSignUp` en
   * backend/src/auth/auth.js): de nada sirve que la respuesta sea idéntica si
   * la pantalla lo cuenta igual. Por eso nombra los dos casos sin decir cuál
   * ocurrió, que además es la verdad y no un rodeo.
   */
  if (enviado) {
    return (
      <main id="contenido" className="pagina-angosto">
        <h1 className="titulo-pagina">Revisá tu correo</h1>
        <p className="mt-4 leading-relaxed text-crema/80">
          Te mandamos un mensaje a <strong className="text-crema">{correo.trim()}</strong>. Si esa dirección
          todavía no tenía cuenta, adentro está el enlace para confirmarla y entrar. Si ya tenía, también te
          lo contamos ahí.
        </p>
        <p className="mt-4 leading-relaxed text-crema/80">
          Si no te llega en unos minutos, fijate en la carpeta de correo no deseado.
        </p>

        {/*
          El enlace del correo dura una hora, así que esta pantalla no puede
          ser la única oportunidad. Va acá y no solo en el login porque es el
          momento en que la persona está esperando el mensaje.
        */}
        <div className="mt-4">
          <ReenviarVerificacion correo={correo} destino={destino} />
        </div>

        <Link to="/iniciar-sesion" className="boton-destacado mt-8">
          Ir a iniciar sesión
        </Link>
      </main>
    );
  }

  return (
    <main id="contenido" className="pagina-angosto">
      <h1 className="titulo-pagina">Crear cuenta</h1>
      <p className="mt-2 text-crema/60">
        Pochoclo se puede usar sin cuenta. Sirve para guardar tus listas y para que las recomendaciones
        tengan en cuenta tus gustos.
      </p>

      <form onSubmit={alEnviar} className="mt-8 space-y-5">
        <CampoFormulario
          id="nombre"
          etiqueta="Nombre"
          valor={nombre}
          onCambiar={setNombre}
          autoComplete="name"
          ayuda="Es solo para saludarte. Puede ser un apodo."
        />
        <CampoFormulario
          id="correo"
          etiqueta="Correo"
          tipo="email"
          valor={correo}
          onCambiar={(v) => {
            setCorreo(v);
            if (errorCorreo) setErrorCorreo('');
          }}
          onBlur={revisarCorreo}
          error={errorCorreo}
          autoComplete="email"
        />
        <div>
          <CampoFormulario
            id="contrasena"
            etiqueta="Contraseña"
            tipo="password"
            valor={contrasena}
            onCambiar={setContrasena}
            autoComplete="new-password"
            minLength={LARGO_MINIMO_CONTRASENA}
            describePor="requisitos-contrasena"
          />
          <RequisitosContrasena id="requisitos-contrasena" valor={contrasena} />
        </div>
        <CampoFormulario
          id="fecha-nacimiento"
          etiqueta="Fecha de nacimiento"
          tipo="date"
          valor={fechaNacimiento}
          onCambiar={setFechaNacimiento}
          autoComplete="bday"
          ayuda={`Se usa para aplicar el límite de edad a las recomendaciones, y podés desactivarlo cuando quieras. Hay que tener ${EDAD_MINIMA_CUENTA} años o más para crear una cuenta.`}
        />

        {/*
          La aceptación de los Términos es una casilla explícita y no una
          leyenda del tipo "al continuar aceptás", porque el servidor la
          verifica: sin un `true` que el usuario haya puesto a mano, el alta
          se rechaza. Una leyenda daría una aceptación que el cliente manda
          solo, que no prueba nada.

          Arranca sin tildar a propósito. Una casilla de consentimiento
          pre-marcada no vale como consentimiento.

          Usa la clase `.casilla` del sistema de diseño (index.css), que es
          el checkbox dibujado a mano de toda la app.
        */}
        <label className="flex items-start gap-3 text-sm text-crema/70">
          <input
            id="acepto-terminos"
            type="checkbox"
            className="casilla mt-0.5 shrink-0"
            checked={aceptoTerminos}
            onChange={(e) => setAceptoTerminos(e.target.checked)}
          />
          <span>
            Leí y acepto los{' '}
            <Link to="/terminos" className="font-semibold text-manteca hover:underline">
              términos y condiciones
            </Link>
            .
          </span>
        </label>

        {error && (
          <RegionViva rol="alert"  className="mensaje-error">
            {error}
          </RegionViva>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="boton-destacado w-full"
        >
          {enviando ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>

      {/*
        POR QUÉ ACÁ HAY TEXTO Y NO SOLO UN ENLACE, que es lo primero que uno
        quiere hacer al ver la pantalla cargada.

        La Ley 25.326 pide informar EN EL MOMENTO de pedir los datos, no en
        una página aparte que hay que ir a abrir: el artículo 6 inciso b (qué
        se guarda, para qué, quién responde y con qué domicilio) y el artículo
        12, que es el que sostiene que los datos puedan vivir en Brasil y en
        Estados Unidos. Esa transferencia se apoya en el consentimiento del
        titular, y el consentimiento tiene que ser INFORMADO: el momento en
        que se presta es este botón, así que la advertencia no puede estar
        solo del otro lado de un enlace.

        LO QUE SÍ SE PUEDE, Y ES LO QUE HACE ESTE BLOQUE: separar lo que se
        consiente de lo que se detalla. Visible queda la frase que se está
        aceptando; el detalle enumerado va en un desplegable, que sigue
        estando en esta pantalla y a un clic, sin navegar a ningún lado.

        El <details> es nativo a propósito: se abre sin JavaScript, el lector
        de pantalla ya lo anuncia como grupo desplegable con su estado, y no
        hace falta ningún componente propio para algo que aparece una sola vez
        en toda la app.
      */}
      <p className="mt-6 text-sm text-crema/50">
        Al crear la cuenta prestás tu consentimiento para que tratemos tus datos como explica la{' '}
        <Link to="/privacidad" className="font-semibold text-manteca hover:underline">
          política de privacidad
        </Link>
        , incluida su transferencia a servidores de Brasil y de los Estados Unidos, países que la
        normativa argentina no considera de protección adecuada.
      </p>

      <details className="mt-3 text-sm text-crema/50">
        <summary className="cursor-pointer text-crema/60 hover:text-crema/80">
          Qué datos guardamos y quién responde por ellos
        </summary>
        <p className="mt-2 leading-relaxed">
          Guardamos tu nombre, tu correo, tu fecha de nacimiento y tu contraseña cifrada, y usamos una
          cookie para mantener la sesión abierta. Mientras estés conectado también queda registrada la
          dirección IP de cada sesión, para que puedas cerrarlas todas si hace falta. Nada de eso se
          comparte con nadie ni se usa con fines publicitarios.
          {RESPONSABLE_NOMBRE
            ? ` El responsable de esos datos es ${RESPONSABLE_NOMBRE}${
                RESPONSABLE_DOMICILIO ? `, con domicilio en ${RESPONSABLE_DOMICILIO}` : ''
              }.`
            : ''}{' '}
          Podés acceder a ellos, corregirlos o borrarlos en cualquier momento desde tu perfil. Sin
          cuenta, el sitio se usa igual, sin ninguna edad mínima y sin que nada de esto ocurra.
        </p>
      </details>

      <p className="mt-4 text-sm text-crema/60">
        ¿Ya tenés cuenta?{' '}
        <Link to="/iniciar-sesion" state={{ destino }} className="font-semibold text-manteca hover:underline">
          Iniciá sesión
        </Link>
        .
      </p>
    </main>
  );
}
