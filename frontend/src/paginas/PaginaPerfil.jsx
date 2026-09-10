import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSesion } from '../auth/ContextoSesion.jsx';
import { clienteAuth, mensajeDeError } from '../auth/clienteAuth.js';
import CampoFormulario from '../auth/CampoFormulario.jsx';
import { anioDeNacimiento, edadCumplida, franjaDeEdad, EDAD_MINIMA_CUENTA } from '../utils/edad.js';
import RequisitosContrasena from '../auth/RequisitosContrasena.jsx';
import { problemaDeContrasena, LARGO_MINIMO_CONTRASENA } from '../utils/contrasena.js';
import { problemaDeNombre } from '../utils/nombre.js';
import useMetadatos from '../utils/useMetadatos.js';
import RegionViva from '../components/RegionViva.jsx';

const ANIO_MINIMO = 1900;

/**
 * Las mismas reglas que valida el alta, ahora también acá.
 *
 * Antes esta pantalla no validaba nada y mandaba lo que hubiera: se podía
 * dejar el nombre vacío o poner una fecha de nacimiento de 1300, o sea
 * exactamente lo que el registro rechaza. Del lado del servidor ahora hay un
 * hook de edición que corta igual (backend/src/auth/auth.js), y esta copia
 * es para avisar antes de enviar.
 */
function validar({ nombre, fechaNacimiento }) {
  const problemaNombre = problemaDeNombre(nombre);
  if (problemaNombre) return problemaNombre;

  const fecha = new Date(fechaNacimiento);
  if (Number.isNaN(fecha.getTime())) return 'Revisá la fecha de nacimiento.';
  if (fecha > new Date()) return 'La fecha de nacimiento no puede estar en el futuro.';
  /**
   * El año se lee en UTC, que es el día que la persona escribió (ver la nota
   * de utils/edad.js): en local, un nacimiento del 1 de enero da el anterior.
   */
  if (anioDeNacimiento(fecha) < ANIO_MINIMO) return 'Revisá el año de nacimiento.';
  if (edadCumplida(fecha) < EDAD_MINIMA_CUENTA) {
    return `Hay que tener ${EDAD_MINIMA_CUENTA} años o más para tener cuenta.`;
  }
  return null;
}

/** Una fecha ISO completa recortada a lo que entiende un <input type="date">. */
function aValorDeInput(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export default function PaginaPerfil() {
  useMetadatos('perfil');

  const { usuario, salir } = useSesion();
  const navegar = useNavigate();

  const [nombre, setNombre] = useState(usuario?.name ?? '');
  const [fechaNacimiento, setFechaNacimiento] = useState(aValorDeInput(usuario?.fechaNacimiento));
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [cambiando, setCambiando] = useState(false);
  const [contrasenaActual, setContrasenaActual] = useState('');
  const [contrasenaNueva, setContrasenaNueva] = useState('');
  const [errorContrasena, setErrorContrasena] = useState('');
  const [guardandoContrasena, setGuardandoContrasena] = useState(false);

  /**
   * Estado propio y no el `mensaje`/`error` del formulario de arriba: los dos
   * se renderizan a la vez en pantallas distintas de la misma página, así que
   * compartirlos hacía que un aviso de sesiones apareciera también dentro del
   * formulario de datos personales, sin venir a cuento.
   */
  const [cerrandoOtras, setCerrandoOtras] = useState(false);
  const [mensajeSesiones, setMensajeSesiones] = useState('');
  const [errorSesiones, setErrorSesiones] = useState('');

  const [borrando, setBorrando] = useState(false);
  const [contrasenaBorrado, setContrasenaBorrado] = useState('');
  const [errorBorrado, setErrorBorrado] = useState('');

  const edad = edadCumplida(fechaNacimiento);
  const franja = franjaDeEdad(edad);

  async function guardar(evento) {
    evento.preventDefault();
    setMensaje('');
    setError('');

    const problema = validar({ nombre, fechaNacimiento });
    if (problema) {
      setError(problema);
      return;
    }

    setGuardando(true);
    try {
      const { error: fallo } = await clienteAuth.updateUser({
        name: nombre,
        fechaNacimiento: new Date(fechaNacimiento),
      });
      if (fallo) throw new Error(mensajeDeError(fallo));
      setMensaje('Listo, se guardaron los cambios.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarContrasena(evento) {
    evento.preventDefault();
    setErrorContrasena('');

    const problema = problemaDeContrasena(contrasenaNueva);
    if (problema) {
      setErrorContrasena(problema);
      return;
    }
    if (contrasenaNueva === contrasenaActual) {
      setErrorContrasena('La contraseña nueva tiene que ser distinta de la actual.');
      return;
    }

    setGuardandoContrasena(true);
    try {
      const { error: fallo } = await clienteAuth.changePassword({
        currentPassword: contrasenaActual,
        newPassword: contrasenaNueva,
        /**
         * Cerrar las demás sesiones es la mitad del sentido de cambiar la
         * contraseña: si alguien cambia la suya porque sospecha que otro
         * entró, dejarle la sesión abierta a ese otro no arregla nada.
         */
        revokeOtherSessions: true,
      });
      if (fallo) throw new Error(mensajeDeError(fallo));
      setContrasenaActual('');
      setContrasenaNueva('');
      setCambiando(false);
      setMensaje('Listo, se cambió la contraseña. Se cerraron las sesiones abiertas en otros dispositivos.');
    } catch (err) {
      setErrorContrasena(err.message);
    } finally {
      setGuardandoContrasena(false);
    }
  }

  async function borrarCuenta() {
    setErrorBorrado('');

    /*
      El campo vacío se corta acá, y no es solo comodidad.

      Hasta el 2026-09-08 esto no existía y la contraseña vacía viajaba igual,
      y del otro lado `""` es falsy: Better Auth la trataba como "no vino
      ninguna" y caía a su chequeo de frescura de sesión, así que **apretar
      "Borrar definitivamente" sin escribir nada borraba la cuenta**. Ya está
      tapado en el servidor (ver el hook de /delete-user en auth/auth.js), que
      es donde tiene que estar; esto es para que el aviso sea inmediato en vez
      de un viaje de ida y vuelta.
    */
    if (!contrasenaBorrado) {
      setErrorBorrado('Escribí tu contraseña para confirmar.');
      return;
    }

    try {
      const { error: fallo } = await clienteAuth.deleteUser({ password: contrasenaBorrado });
      if (fallo) throw new Error(mensajeDeError(fallo));
      navegar('/', { replace: true });
    } catch (err) {
      setErrorBorrado(err.message);
    }
  }

  /**
   * Cierra todas las sesiones MENOS la de este dispositivo.
   *
   * Es la que sirve: alguien que sospecha que se dejó la sesión abierta en
   * otro lado quiere echar a los demás sin echarse a sí mismo. Cerrar también
   * la propia lo obligaría a volver a entrar para comprobar que funcionó.
   *
   * No pide confirmación porque no destruye nada: lo peor que pasa si se
   * aprieta sin querer es tener que iniciar sesión de nuevo en el otro
   * dispositivo. Pedir confirmación para una acción reversible es ruido.
   */
  async function cerrarOtrasSesiones() {
    setMensajeSesiones('');
    setErrorSesiones('');
    setCerrandoOtras(true);
    try {
      const { error: fallo } = await clienteAuth.revokeOtherSessions();
      if (fallo) throw new Error(mensajeDeError(fallo));
      setMensajeSesiones('Listo, se cerraron las sesiones de los demás dispositivos. Esta sigue abierta.');
    } catch (err) {
      setErrorSesiones(err.message);
    } finally {
      setCerrandoOtras(false);
    }
  }

  async function cerrarSesion() {
    await salir();
    navegar('/', { replace: true });
  }

  return (
    <main id="contenido" className="pagina-angosto">
      <h1 className="titulo-pagina">Tu perfil</h1>
      <p className="mt-2 text-crema/60">{usuario?.email}</p>

      <Link to="/listas/favoritas" className="boton-secundario mt-4 inline-flex">
        Ver mis listas
      </Link>

      <form onSubmit={guardar} className="mt-8 space-y-5">
        <CampoFormulario id="nombre" etiqueta="Nombre" valor={nombre} onCambiar={setNombre} autoComplete="name" />
        <CampoFormulario
          id="fecha-nacimiento"
          etiqueta="Fecha de nacimiento"
          tipo="date"
          valor={fechaNacimiento}
          onCambiar={setFechaNacimiento}
          autoComplete="bday"
          ayuda={
            franja
              ? `El límite de edad de tus búsquedas es ${franja}.`
              : 'Se usa para aplicar el límite de edad a las recomendaciones.'
          }
        />

        {error && (
          <RegionViva rol="alert"  className="mensaje-error">
            {error}
          </RegionViva>
        )}
        {mensaje && (
          <RegionViva rol="status"  className="text-sm text-manteca">
            {mensaje}
          </RegionViva>
        )}

        <button
          type="submit"
          disabled={guardando}
          className="boton-primario w-full"
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      {/*
        Cambiar la contraseña. Antes no se podía: la única forma de tener una
        nueva era olvidarse la vieja y usar la recuperación por correo, que es
        un rodeo absurdo para alguien que se acuerda de la suya y solo quiere
        cambiarla (porque la compartió, porque la reusaba en otro sitio, o
        porque sospecha que alguien la vio).

        Se pide la contraseña ACTUAL además de la nueva, y no alcanza con
        tener la sesión abierta: si alguien se queda un minuto frente a una
        computadora ajena sin bloquear, sin este paso podría cambiar la
        contraseña y quedarse con la cuenta. Es el mismo criterio con el que
        el borrado de cuenta de más abajo ya la pedía.
      */}
      <section className="mt-10 border-t border-linea pt-6">
        <h2 className="titulo-bloque">Cambiar la contraseña</h2>

        {!cambiando ? (
          <button type="button" onClick={() => setCambiando(true)} className="boton-secundario mt-4">
            Quiero cambiarla
          </button>
        ) : (
          <form onSubmit={cambiarContrasena} className="mt-4 space-y-5">
            <CampoFormulario
              id="contrasena-actual"
              etiqueta="Contraseña actual"
              tipo="password"
              valor={contrasenaActual}
              onCambiar={setContrasenaActual}
              autoComplete="current-password"
            />
            <div>
              <CampoFormulario
                id="contrasena-nueva"
                etiqueta="Contraseña nueva"
                tipo="password"
                valor={contrasenaNueva}
                onCambiar={setContrasenaNueva}
                autoComplete="new-password"
                minLength={LARGO_MINIMO_CONTRASENA}
                describePor="requisitos-contrasena"
              />
              <RequisitosContrasena id="requisitos-contrasena" valor={contrasenaNueva} />
            </div>

            {errorContrasena && (
              <RegionViva rol="alert"  className="mensaje-error">
                {errorContrasena}
              </RegionViva>
            )}

            <div className="flex gap-3">
              <button type="submit" disabled={guardandoContrasena} className="boton-primario">
                {guardandoContrasena ? 'Guardando…' : 'Guardar la contraseña'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCambiando(false);
                  setContrasenaActual('');
                  setContrasenaNueva('');
                  setErrorContrasena('');
                              }}
                className="boton-secundario"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="mt-10 border-t border-linea pt-6">
        <h2 className="titulo-bloque">Sesiones</h2>
        <p className="mt-2 text-sm text-crema/60">
          Tu sesión dura 30 días y se renueva sola mientras uses Pochoclo. Si te quedó abierta en algún
          dispositivo que ya no usás o que no es tuyo, podés cerrarlas todas desde acá.
        </p>

        {errorSesiones && (
          <RegionViva rol="alert"  className="mensaje-error mt-3">
            {errorSesiones}
          </RegionViva>
        )}
        {mensajeSesiones && (
          <RegionViva rol="status"  className="mt-3 text-sm text-manteca">
            {mensajeSesiones}
          </RegionViva>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={cerrarSesion} className="boton-secundario">
            Cerrar sesión
          </button>
          <button
            type="button"
            onClick={cerrarOtrasSesiones}
            disabled={cerrandoOtras}
            className="boton-secundario"
          >
            {cerrandoOtras ? 'Cerrando…' : 'Cerrar en los demás dispositivos'}
          </button>
        </div>
      </section>

      <section className="rounded-panel mt-10 border border-terciopelo/40 p-5">
        <h2 className="titulo-bloque">Borrar la cuenta</h2>
        <p className="mt-2 text-sm text-crema/60">
          Se borra todo: tu cuenta, tus listas y tus gustos. No se puede deshacer.
        </p>

        {!borrando ? (
          <button
            type="button"
            onClick={() => setBorrando(true)}
            className="boton-destructivo mt-4"
          >
            Quiero borrar mi cuenta
          </button>
        ) : (
          /*
            Esto NO es un <form>, y es a propósito.

            El navegador ofrece guardar la contraseña cuando se envía un
            formulario que contiene un campo de contraseña, y acá eso no tiene
            ningún sentido: el usuario está borrando la cuenta, o sea que la
            contraseña que acaba de escribir deja de existir en un segundo.
            Ofrecerle guardarla es, además de ruido, confuso.
            `autocomplete="off"` no alcanza, porque Chrome lo ignora seguido
            para el guardado de contraseñas; sin formulario no hay envío que
            detectar, y el problema desaparece de raíz.

            Lo único que se pierde es el envío con Enter, que se repone con el
            onKeyDown del campo.
          */
          <div className="mt-4 space-y-4">
            <CampoFormulario
              id="contrasena-borrado"
              etiqueta="Confirmá con tu contraseña"
              tipo="password"
              valor={contrasenaBorrado}
              onCambiar={setContrasenaBorrado}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  borrarCuenta();
                }
              }}
            />
            {errorBorrado && (
              <RegionViva rol="alert"  className="mensaje-error">
                {errorBorrado}
              </RegionViva>
            )}
            <div className="flex gap-3">
              {/*
                El fondo es terciopelo-fuerte y no terciopelo porque con el
                claro el texto crema queda en 3.67:1, debajo del 4.5 que pide
                WCAG AA. Con el oscuro da 5.23. Por eso mismo el hover no
                cambia el color, solo levanta el botón como el resto de la app.
              */}
              <button
                type="button"
                onClick={borrarCuenta}
                className="boton-destructivo-solido"
              >
                Borrar definitivamente
              </button>
              <button
                type="button"
                onClick={() => {
                  setBorrando(false);
                  setContrasenaBorrado('');
                  setErrorBorrado('');
                }}
                className="boton-secundario"
              >
                Mejor no
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
