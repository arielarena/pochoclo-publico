import { createContext, useContext } from 'react';
import { clienteAuth, mensajeDeError } from './clienteAuth.js';

const ContextoSesion = createContext(null);

/**
 * Sesión del usuario, disponible en toda la app.
 *
 * `usuario` es null mientras no haya sesión, que es el estado normal: la
 * sección 1 del Definitivo mantiene Pochoclo usable sin registrarse, así
 * que ninguna pantalla puede asumir que hay cuenta.
 *
 * El estado real lo lleva el propio `useSession` de Better Auth, que se
 * encarga de refrescar la sesión y de avisarle a todos los componentes
 * cuando cambia. Este contexto solo le pone nombres en español y agrupa las
 * tres acciones, para que las páginas no tengan que conocer la librería.
 */
export function ProveedorSesion({ children }) {
  const { data, isPending } = clienteAuth.useSession();

  /**
   * `aceptoTerminos` viaja como un campo más del alta y el servidor lo
   * exige: sin un true explícito no crea la cuenta (ver el hook de
   * backend/src/auth/auth.js). Junto con la fecha de nacimiento son los dos
   * campos que se verifican del lado del servidor además de los obvios,
   * porque son los dos que tienen consecuencias legales.
   */
  /**
   * El mensaje ya viene traducido y listo para pantalla, pero **el código
   * también hace falta**: hay errores que además de decirse habilitan una
   * salida. El caso es `EMAIL_NOT_VERIFIED`, donde la pantalla de login ofrece
   * reenviar la confirmación (ver `components/ReenviarVerificacion.jsx`).
   *
   * Va como propiedad del error y no como un segundo valor de retorno para no
   * cambiarle la forma a `entrar` y `registrarse`, que hoy o resuelven o
   * lanzan. Y se guarda el código y no se reconoce el error por su texto,
   * que es exactamente lo que se dejó de hacer al armar la lista blanca de
   * mensajes: el texto es para leer, el código es para decidir.
   */
  function errorDeAuth(error) {
    const problema = new Error(mensajeDeError(error));
    problema.codigo = error?.code ?? null;
    return problema;
  }

  async function registrarse({
    nombre,
    correo,
    contrasena,
    fechaNacimiento,
    aceptoTerminos,
    destino = '/',
  }) {
    const { error } = await clienteAuth.signUp.email({
      name: nombre,
      email: correo,
      password: contrasena,
      fechaNacimiento: new Date(fechaNacimiento),
      aceptoTerminos: aceptoTerminos === true,
      /**
       * A dónde vuelve el usuario después de confirmar su correo desde el
       * mail. En ese momento ya queda con la sesión abierta
       * (`autoSignInAfterVerification`), así que puede ir directo a donde
       * quería entrar.
       *
       * ANTES ERA SIEMPRE EL INICIO, y alcanzaba porque el alta abría sesión
       * al instante y la pantalla navegaba sola a `destino`. Con la
       * verificación de correo obligatoria eso ya no pasa: el alta no
       * devuelve sesión, así que si esto no llevara el destino, quien fue
       * mandado a crear cuenta desde una pantalla privada terminaría en el
       * inicio y tendría que volver a buscarla.
       *
       * `destino` es una ruta interna que pone RutaPrivada, y va prefijada
       * con nuestro propio origen, así que no puede apuntar afuera.
       */
      callbackURL: `${window.location.origin}${destino}`,
    });
    if (error) throw errorDeAuth(error);
  }

  /**
   * `recordarme` decide si la cookie de sesión es persistente o no.
   *
   * Con true (el default), la sesión dura 30 días y sobrevive a cerrar el
   * navegador. Con false, Better Auth manda una cookie de sesión del
   * navegador: se borra al cerrarlo. Es la salida para la computadora
   * prestada, y el único caso en que este proyecto le pide al usuario que
   * elija algo sobre su sesión.
   */
  async function entrar({ correo, contrasena, recordarme = true }) {
    const { error } = await clienteAuth.signIn.email({
      email: correo,
      password: contrasena,
      rememberMe: recordarme,
    });
    if (error) throw errorDeAuth(error);
  }

  async function salir() {
    await clienteAuth.signOut();
  }

  const valor = {
    usuario: data?.user ?? null,
    cargando: isPending,
    registrarse,
    entrar,
    salir,
  };

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion() {
  const contexto = useContext(ContextoSesion);
  if (!contexto) {
    throw new Error('useSesion tiene que usarse dentro de <ProveedorSesion>');
  }
  return contexto;
}
