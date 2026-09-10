import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Cliente de Better Auth. Habla con el mismo backend que api/cliente.js,
 * pero por su propia ruta (/api/auth), que es la que monta el handler de
 * la librería en el Express.
 *
 * `inferAdditionalFields` es lo que hace que fechaNacimiento (el campo que
 * agregamos al usuario en backend/src/auth/auth.js) viaje en el registro y
 * vuelva dentro de la sesión. Sin esto el cliente lo descarta por no ser
 * uno de los campos que la librería trae de fábrica.
 */
export const clienteAuth = createAuthClient({
  baseURL: BASE_URL,
  plugins: [
    inferAdditionalFields({
      user: {
        fechaNacimiento: { type: 'date', required: true },
      },
    }),
  ],
});

/**
 * Código con el que el backend marca sus PROPIOS errores de validación (ver
 * CODIGO_VALIDACION en backend/src/auth/auth.js). Está duplicado a mano
 * porque no hay nada compartido entre las dos carpetas; si se cambia allá,
 * cambiarlo acá.
 */
const CODIGO_VALIDACION = 'VALIDACION_POCHOCLO';

const MENSAJE_GENERICO = 'Algo salió mal. Probá de nuevo en un momento.';

/**
 * Traduce los errores de Better Auth a algo que una persona pueda leer.
 *
 * LA REGLA, que es lo importante de este archivo: **solo llega a la pantalla
 * texto que escribimos nosotros.** O es uno de los mensajes de acá abajo, o
 * es un mensaje del backend marcado con CODIGO_VALIDACION, que son los que
 * están redactados para leerse ("Esa contraseña aparece en filtraciones de
 * otros sitios..."). Cualquier otra cosa cae en el genérico.
 *
 * Antes, el último renglón devolvía el texto crudo del error, así que un
 * mensaje inesperado de la librería se mostraba tal cual: en inglés, con
 * nombres internos de campo, y sin ningún control nuestro sobre qué dice. No
 * era una fuga grave (son mensajes de una librería, no datos de nadie), pero
 * es la clase de renglón por la que un día sale a pantalla algo que no
 * debería. El texto crudo no se pierde: queda en la consola.
 */
export function mensajeDeError(error) {
  const codigo = error?.code;
  const texto = error?.message ?? '';

  // Lo nuestro, ya en español y pensado para el usuario.
  if (codigo === CODIGO_VALIDACION && texto) return texto;

  const porCodigo = {
    USER_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo.',
    INVALID_EMAIL_OR_PASSWORD: 'El correo o la contraseña no coinciden.',
    INVALID_EMAIL: 'Ese correo no parece válido.',
    PASSWORD_TOO_SHORT: 'La contraseña tiene que tener al menos 8 caracteres.',
    PASSWORD_TOO_LONG: 'La contraseña es demasiado larga.',
    INVALID_PASSWORD: 'La contraseña no es correcta.',

    /**
     * Los tres de abajo son los que aparecen recién cuando el correo entra en
     * juego, y por eso se habían pasado por alto al armar la lista: sin SMTP
     * configurado ninguno se puede disparar. El primero es el más importante
     * de todos, porque su modo de fallo es un callejón sin salida: con
     * EXIGIR_CORREO_VERIFICADO en true, quien no confirmó su casilla no puede
     * entrar, y con el genérico leería "algo salió mal" y probaría la misma
     * contraseña para siempre sin enterarse de que le falta un paso.
     */
    EMAIL_NOT_VERIFIED:
      'Falta confirmar tu correo. Buscá el mensaje que te mandamos al crear la cuenta y abrí el enlace.',
    /**
     * Estos dos llegan desde el enlace de cambiar la contraseña, cuando venció
     * (dura una hora) o cuando ya se usó una vez.
     */
    INVALID_TOKEN: 'Ese enlace ya no sirve. Pedí uno nuevo desde "Olvidé mi contraseña".',
    TOKEN_EXPIRED: 'Ese enlace ya venció. Pedí uno nuevo desde "Olvidé mi contraseña".',
  };
  if (codigo && porCodigo[codigo]) return porCodigo[codigo];

  // El límite de intentos no llega como código, sino como estado 429.
  if (error?.status === 429) {
    return 'Demasiados intentos seguidos. Esperá un minuto y volvé a probar.';
  }

  /**
   * Los errores de validación de campo de Better Auth llegan con el mensaje
   * crudo de su validador ("[body.email] Invalid email address"), que el
   * usuario veía tal cual, en inglés y con el nombre interno del campo. Se
   * reconocen por texto y se contestan con uno nuestro; el suyo no se muestra.
   */
  if (/body\.email|invalid email/i.test(texto)) {
    return 'Escribí un correo con la forma nombre@sitio.com.';
  }
  if (/body\.password/i.test(texto)) {
    return 'Revisá la contraseña: tiene que tener al menos 8 caracteres.';
  }
  if (/body\.name/i.test(texto)) {
    return 'Escribí un nombre. Puede ser un apodo.';
  }

  /**
   * Todo lo demás: genérico en pantalla, detalle en la consola. Si algo
   * aparece seguido acá, la salida es sumarle su traducción arriba, no
   * volver a mostrar el texto crudo.
   */
  if (texto || codigo) console.warn('[auth] error sin traducir:', codigo ?? 'sin código', texto);
  return MENSAJE_GENERICO;
}
