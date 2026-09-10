import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clienteAuth, mensajeDeError } from '../auth/clienteAuth.js';
import CampoFormulario from '../auth/CampoFormulario.jsx';
import RequisitosContrasena from '../auth/RequisitosContrasena.jsx';
import { problemaDeContrasena, LARGO_MINIMO_CONTRASENA } from '../utils/contrasena.js';
import useMetadatos from '../utils/useMetadatos.js';
import RegionViva from '../components/RegionViva.jsx';

/**
 * Elegir la contraseña nueva. Es la pantalla a la que lleva el enlace del
 * mail, que trae el token en la query string.
 *
 * Dos cosas que se ven en pantalla y conviene entender:
 *
 * 1. SI NO HAY TOKEN, no se muestra el formulario. Alguien puede llegar acá
 *    escribiendo la dirección a mano, y un formulario que va a fallar sí o sí
 *    al enviarse es peor que decirlo de entrada.
 *
 * 2. SE PIDE LA CONTRASEÑA DOS VECES. En el login no haría falta (si te
 *    equivocás, no entrás y probás de nuevo), pero acá un error de tipeo se
 *    guarda: te quedás afuera con una contraseña que no sabés cuál es, y la
 *    única salida sería pedir otro enlace. Es el caso donde la confirmación
 *    se gana el lugar que ocupa.
 */
export default function PaginaRestablecerContrasena() {
  useMetadatos('restablecerContrasena');

  const [parametros] = useSearchParams();
  const navegar = useNavigate();
  const token = parametros.get('token');

  /**
   * Better Auth manda a esta misma dirección con ?error=INVALID_TOKEN cuando
   * el enlace ya venció o ya se usó.
   */
  const errorDelEnlace = parametros.get('error');

  const [contrasena, setContrasena] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  async function alEnviar(evento) {
    evento.preventDefault();

    const problema = problemaDeContrasena(contrasena);
    if (problema) {
      setError(problema);
      return;
    }
    if (contrasena !== repetida) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }

    setError('');
    setEnviando(true);
    try {
      const { error: fallo } = await clienteAuth.resetPassword({ newPassword: contrasena, token });
      if (fallo) throw new Error(mensajeDeError(fallo));
      setListo(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!token || errorDelEnlace) {
    return (
      <main id="contenido" className="pagina-angosto">
        <h1 className="titulo-pagina">Ese enlace ya no sirve</h1>
        <p className="mt-4 leading-relaxed text-crema/80">
          Los enlaces para cambiar la contraseña vencen en una hora y se pueden usar una sola vez. Pedí
          uno nuevo y probá otra vez.
        </p>
        <Link to="/recuperar-contrasena" className="boton-destacado mt-8">
          Pedir un enlace nuevo
        </Link>
      </main>
    );
  }

  if (listo) {
    return (
      <main id="contenido" className="pagina-angosto">
        <h1 className="titulo-pagina">Contraseña cambiada</h1>
        <p className="mt-4 leading-relaxed text-crema/80">
          Ya podés entrar con la contraseña nueva.
        </p>
        <button type="button" onClick={() => navegar('/iniciar-sesion')} className="boton-destacado mt-8">
          Iniciar sesión
        </button>
      </main>
    );
  }

  return (
    <main id="contenido" className="pagina-angosto">
      <h1 className="titulo-pagina">Elegí una contraseña nueva</h1>

      <form onSubmit={alEnviar} className="mt-8 space-y-5">
        <div>
          <CampoFormulario
            id="contrasena"
            etiqueta="Contraseña nueva"
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
          id="contrasena-repetida"
          etiqueta="Repetila"
          tipo="password"
          valor={repetida}
          onCambiar={setRepetida}
          autoComplete="new-password"
        />

        {error && (
          <RegionViva rol="alert"  className="mensaje-error">
            {error}
          </RegionViva>
        )}

        <button type="submit" disabled={enviando} className="boton-destacado w-full">
          {enviando ? 'Guardando…' : 'Guardar la contraseña'}
        </button>
      </form>
    </main>
  );
}
