import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clienteAuth, mensajeDeError } from '../auth/clienteAuth.js';
import CampoFormulario from '../auth/CampoFormulario.jsx';
import { esCorreoValido, MENSAJE_CORREO_INVALIDO } from '../utils/correo.js';
import useMetadatos from '../utils/useMetadatos.js';
import RegionViva from '../components/RegionViva.jsx';

/**
 * Pedir el correo para restablecer la contraseña.
 *
 * LA DECISIÓN QUE IMPORTA ACÁ: la pantalla contesta lo MISMO exista o no
 * exista una cuenta con ese correo. Es a propósito y no es un descuido de
 * redacción.
 *
 * Si dijera "no hay ninguna cuenta con ese correo", cualquiera podría probar
 * direcciones de a una y averiguar quién tiene cuenta en Pochoclo. Eso se
 * llama enumeración de usuarios, y acá tiene un costo real para la persona:
 * la lista de películas que alguien guarda dice cosas de esa persona, así
 * que hasta el dato de "tiene cuenta" es información suya. El precio es que
 * quien se equivocó de dirección no se entera enseguida, y es un precio
 * barato: si el mail no llega en unos minutos, vuelve y prueba con otra.
 *
 * Por el mismo motivo el backend tampoco distingue: Better Auth contesta 200
 * en los dos casos y solo manda el mail si la cuenta existe.
 */
export default function PaginaRecuperarContrasena() {
  useMetadatos('recuperarContrasena');

  const [correo, setCorreo] = useState('');
  const [errorCorreo, setErrorCorreo] = useState('');
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function revisarCorreo() {
    if (correo.trim() === '') setErrorCorreo('');
    else setErrorCorreo(esCorreoValido(correo) ? '' : MENSAJE_CORREO_INVALIDO);
  }

  async function alEnviar(evento) {
    evento.preventDefault();

    if (!esCorreoValido(correo)) {
      setErrorCorreo(MENSAJE_CORREO_INVALIDO);
      return;
    }

    setError('');
    setEnviando(true);
    try {
      const { error: fallo } = await clienteAuth.requestPasswordReset({
        email: correo.trim(),
        /**
         * A dónde manda el enlace del mail. Es una dirección de ESTE sitio, y
         * el backend solo acepta las de su lista de orígenes confiables, así
         * que nadie puede hacer que el enlace apunte a otro lado.
         */
        redirectTo: `${window.location.origin}/restablecer-contrasena`,
      });
      if (fallo) throw new Error(mensajeDeError(fallo));
      setEnviado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <main id="contenido" className="pagina-angosto">
        <h1 className="titulo-pagina">Revisá tu correo</h1>
        <p className="mt-4 leading-relaxed text-crema/80">
          Si hay una cuenta con esa dirección, te mandamos un enlace para elegir una contraseña nueva. El
          enlace vence en una hora y se puede usar una sola vez.
        </p>
        <p className="mt-4 text-sm text-crema/60">
          Si no te llega, fijate en la carpeta de correo no deseado, o probá de nuevo con otra dirección.
        </p>
        <Link to="/iniciar-sesion" className="boton-primario mt-8">
          Volver a iniciar sesión
        </Link>
      </main>
    );
  }

  return (
    <main id="contenido" className="pagina-angosto">
      <h1 className="titulo-pagina">Recuperar contraseña</h1>
      <p className="mt-2 text-crema/60">
        Escribí el correo de tu cuenta y te mandamos un enlace para elegir una contraseña nueva.
      </p>

      <form onSubmit={alEnviar} className="mt-8 space-y-5">
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

        {error && (
          <RegionViva rol="alert"  className="mensaje-error">
            {error}
          </RegionViva>
        )}

        <button type="submit" disabled={enviando} className="boton-destacado w-full">
          {enviando ? 'Enviando…' : 'Enviarme el enlace'}
        </button>
      </form>

      <p className="mt-6 text-sm text-crema/60">
        ¿Te acordaste?{' '}
        <Link to="/iniciar-sesion" className="font-semibold text-manteca hover:underline">
          Iniciá sesión
        </Link>
        .
      </p>
    </main>
  );
}
