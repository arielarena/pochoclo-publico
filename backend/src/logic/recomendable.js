import { sinAlfabetoLatino } from '../utils/alfabeto.js';

/**
 * El piso de calidad que tiene que pasar un título para ENTRAR EN UNA
 * RECOMENDACIÓN.
 *
 * Existe porque los filtros del lado de TMDb no alcanzan para todo. El piso de
 * votos y el bloqueo de keywords viven en `/discover` (ver services/tmdb.js),
 * así que cubren las búsquedas por Preferencias, las Opciones y los Estados de
 * ánimo. Pero "Parecido a" trae sus candidatos de `/recommendations`, que no acepta
 * ninguno de esos parámetros, y ahí no se aplicaba nada: la misma basura que
 * se había sacado de un lado entraba por el otro.
 *
 * Acá está el criterio una sola vez, y se aplica sobre el título ya completo,
 * o sea después del detalle. Eso permite dos cosas que discover no puede:
 * mirar el póster (que no viene en todos los endpoints) y mirar las keywords
 * por nombre en vez de por ID.
 *
 * OJO CON DÓNDE SE APLICA: esto NO corre sobre las listas guardadas del
 * usuario (Favoritas, Visto, Ver más tarde). Si alguien guardó algo sin póster
 * o un talk show, es suyo y tiene que seguir viéndolo; hacerlo desaparecer de
 * su propia lista sería un bug, no una mejora. Por eso `completarDetalle()`
 * recibe esto como una opción y las rutas de listas no la piden.
 */

/**
 * Mínimo de votos para que un título sea recomendable.
 *
 * Es el MISMO umbral que exige la fórmula de Puntuación (sección 16): abajo de
 * esto el título se muestra como "S/D" igual. Que sea el mismo número no es
 * casualidad ni comodidad: hace que la app se comporte igual venga el
 * candidato de discover o de /recommendations, en vez de tener dos ideas distintas de
 * qué es suficiente.
 */
const VOTOS_MINIMOS = 10;

/**
 * Keywords que descalifican un título.
 *
 * Acá van por NOMBRE y no por ID, porque el detalle ya los trae resueltos. Es
 * la misma keyword que bloquea discover; la lista corta está justificada allá
 * (las otras candidatas censuraban cine legítimo).
 */
const KEYWORDS_EXCLUIDAS = new Set(['hentai']);

export function esRecomendable(titulo) {
  /**
   * Formatos que no son una historia para ver: noticieros, talk shows,
   * reality, compilados. tipoContenido() los marca con null.
   */
  if (titulo.tipoContenido === null) return false;

  /**
   * Sin póster. El criterio es del usuario y la razón es buena: en TMDb, un
   * título sin imagen casi siempre es una ficha abandonada, un duplicado o
   * algo directamente falso. Y en una grilla de pósters, una tarjeta que dice
   * "Sin imagen" no es una recomendación, es un hueco.
   */
  if (!titulo.poster) return false;

  if ((titulo.vote_count ?? 0) < VOTOS_MINIMOS) return false;

  const keywords = titulo.keywords ?? [];
  if (keywords.some((k) => KEYWORDS_EXCLUIDAS.has(String(k).toLowerCase()))) return false;

  /**
   * Título que no se puede leer desde una app en español, porque TMDb no tiene
   * ninguna traducción y devolvió el original en su alfabeto (東宮, เคว้ง).
   *
   * Es el último tramo de la cadena de idiomas de la 4.27, y ahí ya no queda
   * nada por intentar: no es que elegimos mal la traducción, es que no existe
   * ninguna. Una tarjeta con un nombre ilegible no es una recomendación.
   *
   * **Se mide "sin ninguna letra latina" y no "tiene algún carácter raro"**,
   * que es más flojo a propósito: el criterio estricto se llevaba puesto a
   * "Saiki Kusuo no Ψ-nan", romanizado entero salvo una letra griega. Ver
   * utils/alfabeto.js, que tiene la medición.
   */
  if (sinAlfabetoLatino(titulo.titulo)) return false;

  return true;
}
