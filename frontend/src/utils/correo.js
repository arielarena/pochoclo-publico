import { FORMATO_CORREO, LARGO_MAXIMO_CORREO, MENSAJE_CORREO_INVALIDO } from '../../../comun/cuenta.js';

/**
 * Validación de correo del lado del cliente, antes de molestar al servidor.
 *
 * La regla base es la pedida: algo@algo.algo. Se le suman tres cosas que
 * atajan errores de tipeo obvios sin ponerse exquisitas: nada de espacios,
 * nada de puntos al principio o al final de una parte, y nada de puntos
 * seguidos. Con eso "juan@gmail" (falta el punto), "juan @gmail.com" (espacio
 * de más) y "juan@gmail..com" (punto doble) quedan afuera.
 *
 * **Deliberadamente no va más allá.** Las expresiones regulares que intentan
 * implementar el RFC 5322 completo son enormes y rechazan direcciones que en
 * realidad existen, que es el peor error posible acá: dejar afuera a alguien
 * con una casilla válida. Lo único que prueba de verdad que un correo existe
 * es mandarle un mail, y eso está fuera de alcance hasta tener una casilla
 * propia (ver la lista de publicación en la sección 3 del Definitivo).
 *
 * Esto es comodidad, no seguridad: la validación que no se puede saltear es
 * la del servidor, en backend/src/auth/auth.js.
 */
/* FORMATO_CORREO viene de comun/cuenta.js, el mismo que usa el servidor. */

/**
 * Largo máximo del correo, el de la norma: 254 caracteres (RFC 5321).
 *
 * ESTÁ ACÁ PORQUE EL FORMATO SOLO NO ALCANZA: sus partes son `[^\s@.]+`, o
 * sea "uno o más" sin techo, así que una dirección absurdamente larga pasa la
 * expresión regular sin problema. **El espejo de esto en el servidor es el
 * que de verdad protege** (backend/src/auth/validaciones.js), y allá se
 * agregó después de comprobar que un correo de 100.000 caracteres creaba la
 * cuenta. Acá es para avisar antes de enviar, como todo este archivo.
 *
 * El valor vive en comun/cuenta.js, igual que el formato, y lo importan las
 * dos puntas.
 */
export { LARGO_MAXIMO_CORREO };

export function esCorreoValido(texto) {
  const correo = (texto ?? '').trim();
  return FORMATO_CORREO.test(correo) && correo.length <= LARGO_MAXIMO_CORREO;
}

export { MENSAJE_CORREO_INVALIDO };
