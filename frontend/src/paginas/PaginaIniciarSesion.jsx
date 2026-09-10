import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSesion } from '../auth/ContextoSesion.jsx';
import CampoFormulario from '../auth/CampoFormulario.jsx';
import { esCorreoValido, MENSAJE_CORREO_INVALIDO } from '../utils/correo.js';
import useMetadatos from '../utils/useMetadatos.js';
import RegionViva from '../components/RegionViva.jsx';
import ReenviarVerificacion from '../components/ReenviarVerificacion.jsx';

export default function PaginaIniciarSesion() {
  useMetadatos('iniciarSesion');

  const { entrar } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [recordarme, setRecordarme] = useState(true);
  const [errorCorreo, setErrorCorreo] = useState('');
  const [error, setError] = useState('');
  /**
   * El código del último fallo, aparte del mensaje: `EMAIL_NOT_VERIFIED` no
   * solo se cuenta, también habilita el botón de reenviar la confirmación.
   */
  const [codigoError, setCodigoError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  /**
   * A dónde quería ir el usuario antes de que lo mandáramos acá. Lo deja
   * RutaPrivada en el state al redirigir.
   */
  const destino = ubicacion.state?.destino ?? '/';

  /**
   * El correo se valida al SALIR del campo, no mientras se escribe: tipeando
   * "ana@sitio.com" se pasa por "a", "ana@" y "ana@sitio", que son inválidos,
   * y avisar en cada tecla sería estar en rojo casi todo el tiempo. Al salir,
   * en cambio, ya es una respuesta terminada.
   *
   * El campo vacío no se marca acá: de eso se ocupa el `required` al enviar,
   * y marcarlo en rojo por pasar de largo sin escribir nada es un reto que
   * el usuario todavía no se ganó.
   */
  function revisarCorreo() {
    if (correo.trim() === '') setErrorCorreo('');
    else setErrorCorreo(esCorreoValido(correo) ? '' : MENSAJE_CORREO_INVALIDO);
  }

  async function alEnviar(evento) {
    evento.preventDefault();

    /**
     * Se revisa de nuevo acá y no solo con el type="email" del input: ese
     * atributo se saltea desde las devtools, y además el navegador da por
     * bueno "juan@gmail" (sin punto), que no es una dirección utilizable.
     */
    if (!esCorreoValido(correo)) {
      setErrorCorreo(MENSAJE_CORREO_INVALIDO);
      return;
    }

    setError('');
    setCodigoError(null);
    setEnviando(true);
    try {
      await entrar({ correo: correo.trim(), contrasena, recordarme });
      navegar(destino, { replace: true });
    } catch (err) {
      setError(err.message);
      setCodigoError(err.codigo ?? null);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main id="contenido" className="pagina-angosto">
      <h1 className="titulo-pagina">Iniciar sesión</h1>
      <p className="mt-2 text-crema/60">
        Con una cuenta podés guardar tus listas y que las recomendaciones tengan en cuenta tus gustos.
      </p>

      <form onSubmit={alEnviar} className="mt-8 space-y-5">
        <CampoFormulario
          id="correo"
          etiqueta="Correo"
          tipo="email"
          valor={correo}
          onCambiar={(v) => {
            setCorreo(v);
            /**
             * Sacar el error apenas se empieza a corregir: dejarlo puesto
             * mientras el usuario ya está arreglando el campo es ruido.
             */
            if (errorCorreo) setErrorCorreo('');
          }}
          onBlur={revisarCorreo}
          error={errorCorreo}
          autoComplete="email"
        />
        <CampoFormulario
          id="contrasena"
          etiqueta="Contraseña"
          tipo="password"
          valor={contrasena}
          onCambiar={setContrasena}
          autoComplete="current-password"
        />

        {/*
          Arranca TILDADO, que es lo contrario de la casilla de los Términos y
          por un motivo distinto: acá no se consiente nada, se elige una
          comodidad. El default correcto es el que sirve a la mayoría (su
          propia computadora), y quien está en una prestada lo destilda.
        */}
        <label className="flex items-start gap-3 text-sm text-crema/70">
          <input
            id="recordarme"
            type="checkbox"
            className="casilla mt-0.5 shrink-0"
            checked={recordarme}
            onChange={(e) => setRecordarme(e.target.checked)}
          />
          <span>
            Mantener la sesión abierta
            <span className="block text-crema/50">
              Destildalo si estás en una computadora prestada: la sesión se cierra al salir del navegador.
            </span>
          </span>
        </label>

        {error && (
          <RegionViva rol="alert"  className="mensaje-error">
            {error}
          </RegionViva>
        )}

        {/*
          El único error de esta pantalla que deja a la persona sin salida por
          su cuenta: el enlace de confirmación dura una hora y se manda una
          sola vez, así que sin esto la única forma de volver a intentarlo era
          borrar la cuenta, que tampoco se puede hacer sin poder entrar.
        */}
        {codigoError === 'EMAIL_NOT_VERIFIED' && (
          <ReenviarVerificacion correo={correo} destino={destino} />
        )}

        <button type="submit" disabled={enviando} className="boton-destacado w-full">
          {enviando ? 'Iniciando sesión…' : 'Iniciar sesión'}
        </button>
      </form>

      <p className="mt-6 text-sm text-crema/60">
        ¿Todavía no tenés cuenta?{' '}
        <Link to="/crear-cuenta" state={{ destino }} className="font-semibold text-manteca hover:underline">
          Creá una
        </Link>
        .
      </p>

      <p className="mt-2 text-sm text-crema/60">
        ¿Olvidaste la contraseña?{' '}
        <Link to="/recuperar-contrasena" className="font-semibold text-manteca hover:underline">
          Recuperala
        </Link>
        .
      </p>
    </main>
  );
}
