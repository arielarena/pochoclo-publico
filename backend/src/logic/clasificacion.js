import {
  KEYWORDS_RELAJAR,
  KEYWORDS_PENSAR,
  KEYWORD_CLASICO,
} from '../data/keywords.js';
import { listasDeComplejidad, GENEROS_AMBIVALENTES } from '../data/genres.js';

/**
 * Umbral del segundo criterio de clásico (sección 16): qué proporción del
 * máximo de votos entre los pre-2000 hay que superar. Está acá y no suelto
 * en la fórmula porque el motor de búsqueda lo necesita para traducirlo a
 * un `vote_count.gte` de /discover (ver motorBusqueda.js) — si se cambia,
 * las dos puntas tienen que moverse juntas.
 */
export const UMBRAL_RATIO_CLASICO = 0.35;

/**
 * Valor sintético que representa "Clásicos" dentro del array de Género,
 * tanto en Preferencias como en Filtros (sección 12). No es un ID de
 * género de TMDb: el motor lo traduce a búsquedas propias y los filtros lo
 * resuelven contra el campo calculado es_clasico.
 */
export const VALOR_GENERO_CLASICOS = 'CLASICOS';

/**
 * Sección 12 del Definitivo. Es clásico si cumple CUALQUIERA de los dos:
 *  1. Tiene la keyword "classic".
 *  2. año < 2000 Y (vote_count / votosTotalesMaxClasicos) > UMBRAL_RATIO_CLASICO
 *
 * `titulo` necesita: { anio, vote_count, keywords }.
 * `votosTotalesMaxClasicos` es el máximo global (calculado sobre todo el
 * catálogo pre-2000), no algo por título.
 */
export function esClasico(titulo, votosTotalesMaxClasicos) {
  const tieneKeywordClasico = (titulo.keywords ?? []).includes(KEYWORD_CLASICO);
  if (tieneKeywordClasico) return true;

  if (titulo.anio == null || titulo.anio >= 2000) return false;
  if (!votosTotalesMaxClasicos || votosTotalesMaxClasicos <= 0) return false;

  const ratio = (titulo.vote_count ?? 0) / votosTotalesMaxClasicos;
  return ratio > UMBRAL_RATIO_CLASICO;
}

/**
 * Sección 15 del Definitivo. Devuelve 'relajar', 'pensar', o null
 * ("Sin clasificar"). `titulo` necesita: { tipo, keywords, generos }
 * (generos = IDs de TMDb).
 *
 * Paso 1 (keywords, más confiable): "pensar" gana si están las dos.
 *
 * Paso 2 (géneros): **cada género vota por su lado y gana el que tiene más
 * votos.** Los géneros neutros (Terror, Thriller, Western, y los formatos de
 * TV) no votan. Si los dos lados empatan, desempata el que tiene más géneros
 * NO ambivalentes, o sea el que trae la señal más específica; si ahí también
 * empatan, queda Sin clasificar.
 *
 * **Antes esto exigía pureza** (todos los géneros de un lado y ninguno del
 * otro), y era demasiado estricto: un solo género ambivalente, como Drama,
 * sacaba al título de las dos búsquedas. Medido sobre 320 títulos por
 * taxonomía, quedaba sin clasificar el 71% de las películas y el 48% de las
 * series, y lo que sobrevivía era la cola angosta de títulos de un género
 * solo. El cambio no mueve de lado a nada de lo que ya estaba clasificado
 * (verificado sobre esa muestra: cero títulos cambian), solo resuelve los que
 * antes se caían: Comedia+Drama pasa a "relajar" por su Comedia, y
 * Aventura+Drama+Ciencia Ficción a "pensar", que es dos contra uno.
 *
 * El desempate por géneros no ambivalentes es lo que evita que un solo género
 * de tema arrastre al título: Titanic (Drama+Romance) empata 1 a 1 y lo gana
 * Romance, que es el que de verdad dice cómo se ve.
 *
 * **El `tipo` no es opcional y no es decorativo**: TMDb tiene dos taxonomías
 * de género y los IDs no son intercambiables, así que las listas de relajar y
 * pensar son distintas para película y para serie (ver data/genres.js). Hasta
 * el 2026-08-24 esta función comparaba contra un Set que mezclaba las dos, y
 * quedaba desalineada con las ramas de discover del motor: el discover traía
 * bien y este filtro descartaba. Tienen que leer la MISMA lista.
 */
export function complejidad(titulo) {
  /**
   * OJO: acá se mira `titulo.generos` y NUNCA `titulo.generosInferidos`, que
   * son los géneros que una serie cumple por sus keywords (ver
   * inferirGenerosDeSerie). No es un olvido, está medido: contra el género real
   * en películas, ese proxy acierta el 41% en Historia y el 68-72% en Romance y
   * Música. Alcanza para BUSCAR, donde solo importa la cabeza del ranking, y no
   * para CLASIFICAR, que toca todos los títulos. Sumándolo, La familia Ingalls y
   * La maravillosa Sra. Maisel pasan a "pensar" por ser de época. Ver 4.15.9.
   */
  const keywords = titulo.keywords ?? [];

  if (keywords.some((k) => KEYWORDS_PENSAR.has(k))) return 'pensar';
  if (keywords.some((k) => KEYWORDS_RELAJAR.has(k))) return 'relajar';

  const generos = titulo.generos ?? [];
  if (generos.length === 0) return null;

  const { relajar, pensar } = listasDeComplejidad(titulo.tipo === 'pelicula' ? 'pelicula' : 'tv');

  let votosRelajar = 0;
  let votosPensar = 0;
  let definitoriosRelajar = 0;
  let definitoriosPensar = 0;

  for (const genero of generos) {
    const esAmbivalente = GENEROS_AMBIVALENTES.has(genero);
    if (relajar.has(genero)) {
      votosRelajar += 1;
      if (!esAmbivalente) definitoriosRelajar += 1;
    } else if (pensar.has(genero)) {
      votosPensar += 1;
      if (!esAmbivalente) definitoriosPensar += 1;
    }
  }

  if (votosRelajar > votosPensar) return 'relajar';
  if (votosPensar > votosRelajar) return 'pensar';

  /**
   * Empate. Si es 0 a 0 no hay nada que desempatar: son todos géneros neutros
   * (el terror puro cae acá, y está bien que caiga).
   */
  if (votosRelajar === 0) return null;

  if (definitoriosRelajar > definitoriosPensar) return 'relajar';
  if (definitoriosPensar > definitoriosRelajar) return 'pensar';

  return null;
}
