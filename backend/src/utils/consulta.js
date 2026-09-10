/**
 * Validación del texto libre que llega por query string.
 *
 * Hoy el único texto que el usuario escribe y que viaja al servidor son las
 * búsquedas por nombre de los dos autocompletados (`/buscar-titulo` y
 * `/buscar-persona`). No se guarda en ningún lado, no se muestra de vuelta
 * como HTML y no arma ninguna consulta SQL: se le pasa a TMDb como parámetro
 * de su API. O sea que el riesgo de inyección acá es bajo. Lo que faltaba era
 * más aburrido:
 *
 *  1. `req.query.q` NO siempre es una cadena. Con `?q=a&q=b` Express entrega
 *     un array, y con `?q[x]=1` un objeto. Eso llegaba tal cual a la función
 *     que arma la URL de TMDb, que no lo espera.
 *  2. No había ningún tope de largo, así que se podía mandar un megabyte de
 *     texto en la URL y hacérselo reenviar al servidor de TMDb.
 *
 * No hace falta escapar nada para TMDb: la URL se arma con URLSearchParams
 * (ver services/tmdb.js), que codifica cada valor solo. Escapar a mano acá
 * sería escapar dos veces y romper las búsquedas con acentos.
 */

/** Más largo que el título más largo que existe, con margen de sobra. */
const LARGO_MAXIMO = 120;

/**
 * Devuelve `{ valor }` con el texto limpio, o `{ error }` con un mensaje
 * para contestar con 400.
 */
export function leerTextoDeBusqueda(crudo) {
  if (typeof crudo !== 'string') {
    // Cubre el ausente, el array de `?q=a&q=b` y el objeto de `?q[x]=1`.
    return { error: 'Falta el parámetro q, o vino repetido.' };
  }

  const valor = crudo.trim();
  if (!valor) return { error: 'Falta el parámetro q' };
  if (valor.length > LARGO_MAXIMO) {
    return { error: `La búsqueda no puede pasar de ${LARGO_MAXIMO} caracteres.` };
  }

  return { valor };
}
