/**
 * Sección 11 del Definitivo: la clasificación de tres vías
 * película / miniserie / serie.
 *
 * Ahora se apoya en el campo `type` de TMDb, que es autoritativo y ya venía en
 * el detalle sin costar una llamada extra: sus valores posibles son
 * Documentary, News, Miniseries, Reality, Scripted, Talk Show y Video.
 *
 * Hasta el 2026-08-24 esto era `estado === 'Ended' && temporadas === 1`, y esa
 * heurística tenía un problema que se veía en los resultados: **un talk show o
 * una telenovela de una sola temporada ya terminada entraba como "miniserie"**.
 * Buscar "miniserie para relajar" devolvía The Tonight Show.
 *
 * Devuelve **null** para los formatos que no son algo para ver de la manera en
 * que la app recomienda: noticieros, talk shows, reality y compilados de
 * video. No es lo mismo que "no sé clasificarlo": es "esto no va en ninguna de
 * las tres categorías del Definitivo", y quien llama los descarta.
 */

/** Los `type` de TMDb que sí son una historia para ver. */
const TIPOS_NARRATIVOS = new Set(['Scripted', 'Documentary']);

/** Los que no. Se listan explícitos para que agregar uno sea una decisión. */
const TIPOS_NO_RECOMENDABLES = new Set(['News', 'Talk Show', 'Reality', 'Video']);

export function tipoContenido({ tipo, estado, temporadas, tipoTmdb }) {
  if (tipo === 'pelicula') return 'pelicula';

  if (tipoTmdb === 'Miniseries') return 'miniserie';
  if (TIPOS_NO_RECOMENDABLES.has(tipoTmdb)) return null;
  if (TIPOS_NARRATIVOS.has(tipoTmdb)) return 'serie';

  /**
   * Sin `type` (un detalle viejo del caché, o un título incompleto en TMDb)
   * se vuelve a la heurística de antes, que es mejor que no clasificar nada.
   */
  if (estado === 'Ended' && temporadas === 1) return 'miniserie';
  return 'serie';
}
