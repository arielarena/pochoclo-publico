import { discoverPeliculas, discoverSeries, obtenerDetalle, resolverIdsDeKeywords } from '../services/tmdb.js';
import { claveDe } from '../utils/clave.js';
import { KEYWORDS_RELAJAR, KEYWORDS_PENSAR } from '../data/keywords.js';
import {
  generosParaTaxonomia,
  generosRecreablesEnSerie,
  inferirGenerosDeSerie,
  listasDeComplejidad,
  GENEROS_AMBIVALENTES,
  GENEROS_FORMATO_SERIE,
  KEYWORDS_DE_GENERO_SERIE,
  GENERO_ANCLA_SERIE,
  CORRECCIONES_POR_GENERO,
  excluidoPorFiltroDeGenero,
} from '../data/genres.js';
import { leerDetallesFrescos, guardarLote } from '../repositories/titulos.js';
import { leerAgregados } from '../repositories/agregados.js';
import { leerPorImdb } from '../repositories/seriesTvmaze.js';
import {
  esClasico,
  complejidad,
  UMBRAL_RATIO_CLASICO,
  VALOR_GENERO_CLASICOS,
} from '../logic/clasificacion.js';
import { limiteEdad } from '../logic/edad.js';
import { puntuacion, popularidad } from '../logic/formulas.js';
import { tipoContenido } from '../logic/tipoContenido.js';
import { esRecomendable } from '../logic/recomendable.js';
import { aplicarFiltros, ordenar as ordenarResultados, normalizarTramosAnio } from '../logic/resultados.js';
import { conLimite } from '../utils/concurrencia.js';

/**
 * Cuántas páginas de /discover pide cada especificación por lote. Subirlo
 * trae más candidatos de una, pero el costo es lineal: cada candidato
 * nuevo son ~1 llamada de detalle a TMDb (ver "Costo de la búsqueda" en el
 * README). Bajarlo hace cada lote más liviano y más frecuente.
 */
const PAGINAS_POR_LOTE = 2;
const RESULTADOS_POR_PAGINA = 20;
// Tope duro de /discover, no nuestro: TMDb no sirve páginas más allá de la 500.
const PAGINA_MAXIMA_TMDB = 500;
/**
 * Cuántos detalles se le piden a TMDb a la vez. Medido el 2026-08-21: 25 en
 * paralelo tardan 930 ms y 80 tardan lo mismo, así que TMDb no estaba
 * limitando y este número se podía subir. En su momento se dejó en 25
 * porque la escritura a Neon era el cuello de botella real (ver las notas de decisiones del proyecto
 * 4.13); desde que `guardarLote()` la bajó a una sola consulta por lote
 * (2026-09-01), el detalle-fetch volvió a ser el componente más pesado de
 * un lote grande. El 2026-09-02 se subió primero a 50 (valor intermedio,
 * sin entrar en el territorio nunca medido de 80) y ESE MISMO DÍA se
 * remidió con pedidos de detalle reales (mismo append_to_response que este
 * archivo pide, IDs reales y distintos por ronda, no el /configuration
 * liviano de la medición de discover): **80 sigue limpio** (p50 823 ms,
 * p99 1414 ms, cero 429 — coincide con la medición vieja), pero **100 ya
 * degrada fuerte** (p50 2301 ms, casi el triple, todavía sin error) y 150
 * tira 429 de verdad (10 de 150). O sea que subir de 80 a 100 no ahorra
 * nada: las tandas bajan de 2,5 a 2, pero cada pedido tarda casi 3 veces
 * más, así que el total empeora. 80 es el techo que conviene, confirmado
 * dos veces — no hay que volver a probar más alto sin releer esto primero.
 */
const CONCURRENCIA_DETALLE = 80;

/**
 * Cuántas especificaciones de /discover se piden a la vez.
 *
 * Antes se recorrían en serie, y como el costo se multiplica (países ×
 * tipos × tramos de año), una búsqueda de 5 países por 4 décadas eran 40
 * especificaciones, 80 llamadas a /discover una detrás de la otra: 19,5
 * segundos de puro esperar. Medido contra TMDb el 2026-08-21: las mismas 80
 * en paralelo tardan 2,9 s, o sea 7 veces menos, sin un solo 429.
 *
 * **Subida de 20 a 40 el 2026-09-02.** A diferencia del detalle, acá el
 * pool de verdad (ver utils/concurrencia.js) no alcanzaba para tapar el
 * límite entero: la latencia de /discover es pareja (sin la cola larga que
 * tiene el detalle), así que 40 especificaciones a concurrencia 20 son, en
 * la práctica, dos rondas casi completas y no una sola. Medido en vivo con
 * las 40 especificaciones reales del peor caso (5 países × 2 tipos × 4
 * tramos): 1318 ms con el límite en 20, 779 ms con el límite en 40 — un
 * 41% menos, sin un solo 429. 40 es también el tamaño exacto de ese peor
 * caso documentado (4.9.1), así que cubre a este límite entero de una sola
 * tanda. Probado además a 80 especificaciones con concurrencia 80: 3,1 s,
 * cero 429 — pero ahí la latencia por pedido ya empieza a crecer (mismo
 * patrón que con el detalle), así que no hay evidencia de que subir más
 * allá de 40 ayude al caso real, que nunca junta más de 40 specs.
 *
 * Las páginas DENTRO de cada especificación siguen en serie a propósito: la
 * segunda solo se pide si la primera vino completa, y ese corte ahorra una
 * llamada por especificación sin costar tiempo (las cadenas de a dos corren
 * en paralelo entre sí).
 */
const CONCURRENCIA_DISCOVER = 40;

/**
 * Tope de candidatos a los que se les pide detalle por lote.
 *
 * Sin esto, aquella búsqueda de 40 especificaciones juntaba 1530 títulos y
 * le pedía el detalle a los 1530, que es de dónde salían los 86 segundos
 * del peor caso medido. Y son 1530 pósters que nadie va a mirar: la
 * pantalla ya trae de a lotes.
 *
 * El reparto no es "los 200 más populares de todo el montón", sino
 * equitativo entre especificaciones (ver repartirEntreEspecificaciones):
 * quedarse con los más populares a secas dejaría que un país con cine más
 * visto se coma a los otros, y el usuario los pidió a todos por igual.
 *
 * Una búsqueda normal (1 o 2 especificaciones, ~80 candidatos) ni lo toca.
 * Si alguna vez los resultados se sienten flacos con muchos filtros
 * combinados, este es el número a subir.
 */
const TOPE_CANDIDATOS_POR_LOTE = 200;
/**
 * Techo de especificaciones de discover por búsqueda (2026-09-08).
 *
 * **EL COSTO DE UNA BÚSQUEDA NO TENÍA NINGUNA COTA.** Las specs son el
 * producto cartesiano `tipos × países × años × ramas` (género, géneros
 * recreados en serie, Clásicos, Complejidad), y ninguno de esos factores
 * tenía tope, así que el peor caso no era el de 40 specs que documenta la
 * 4.9.1 sino el que quisiera pedir el pedido. Medido contra TMDb el
 * 2026-09-08, con lo que un usuario armó de verdad en el formulario (9
 * géneros + Clásicos, 5 países, 3 décadas y 2 años sueltos, película y
 * miniserie): **1335 especificaciones, 1545 llamadas a TMDb y 34 segundos.**
 *
 * Y el grueso de eso era trabajo tirado: de esas 1335, solo 238 devolvieron
 * algún candidato y **183 aportaron alguno al resultado final**. La causa es
 * que el reparto del tope de candidatos es por turnos entre especificaciones
 * (ver repartirEntreEspecificaciones), así que con más specs que candidatos
 * la primera vuelta ya llena el cupo y **de todas las demás no se conserva
 * ni un título**: sus llamadas se descartan enteras.
 *
 * De ahí sale el valor: pedir mucho más que TOPE_CANDIDATOS_POR_LOTE specs
 * no puede traer más resultados, solo más espera. Se deja un margen sobre
 * ese número porque en una búsqueda ancha buena parte de las specs vuelve
 * vacía (combinaciones como "Documental + Argentina + 2021 + serie"), y esas
 * no ocupan lugar en el reparto.
 */
const MAXIMO_ESPECIFICACIONES = 300;
/**
 * Techo de combinaciones país×año, que son las dos dimensiones que
 * multiplican el bucle de especificaciones. Va de la mano del de arriba: con
 * MAXIMO_ESPECIFICACIONES en 300 y dos tipos de contenido, más de 150
 * combinaciones no puede aportar ni una spec nueva, porque el recorte por
 * turnos ya se queda sin cupo tomando una sola de cada grupo.
 */
const MAXIMO_COMBINACIONES_PAIS_ANIO = 150;
/**
 * Cuánto vale un detalle cacheado antes de volver a pedírselo a TMDb (v2).
 * Lo que guardamos casi no se mueve (duración, temporadas, estado,
 * certificaciones, país, idioma); lo que sí se mueve son los votos y la
 * popularidad, que corren la Puntuación unas décimas, y la disponibilidad
 * en plataformas, que es el dato que más puede quedar viejo. Una semana es
 * el punto donde el ahorro es enorme y el desfasaje sigue siendo aceptable
 * para un recomendador. Bajarlo cuesta llamadas; subirlo, exactitud.
 */
const HORAS_FRESCURA_DETALLE = 24 * 7;

export function tiposDiscoverNecesarios(preferenciasTipo) {
  const solicitados = preferenciasTipo?.length ? preferenciasTipo : ['pelicula', 'miniserie', 'serie'];
  const discover = new Set(solicitados.map((t) => (t === 'pelicula' ? 'pelicula' : 'tv')));
  return [...discover];
}

/**
 * El `with_type` de `/discover/tv` que corresponde a los tipos pedidos.
 *
 * Los valores son de TMDb: 0 Documentary, 1 News, 2 Miniseries, 3 Reality,
 * 4 Scripted, 5 Talk Show, 6 Video. Acepta OR con `|` (verificado: 2|4 da
 * exactamente la suma de los dos por separado).
 *
 * Sirve para dos cosas a la vez. La primera es que "miniserie" deja de
 * resolverse solo en memoria: antes se traían 200 candidatos de cualquier tipo
 * y se descartaban casi todos DESPUÉS de pagarles el detalle a TMDb. La
 * segunda es que pedir Scripted y Documentary saca de raíz los noticieros, los
 * talk shows y los reality, que no son algo para ver en el sentido en que la
 * app recomienda y aparecían mezclados entre los resultados.
 *
 * Devuelve undefined si no hay preferencia de tipo, y ahí no se manda el
 * parámetro: sin pedido explícito no hay por qué acotar.
 */
export function tipoTmdbParaDiscover(preferenciasTipo) {
  if (!preferenciasTipo?.length) return undefined;
  const valores = [];
  if (preferenciasTipo.includes('miniserie')) valores.push(2);
  if (preferenciasTipo.includes('serie')) valores.push(4, 0);
  return valores.length ? valores.join('|') : undefined;
}

/**
 * Trae las páginas de /discover que le tocan a un lote. El lote 1 son las
 * páginas 1-2, el lote 2 las 3-4, etc. Devuelve también `hayMas`, que es
 * lo que le permite al frontend saber si tiene sentido ofrecer "Traer más
 * resultados" sin gastar un pedido entero para descubrir que no hay nada.
 */
async function traerCandidatosLivianos(spec, lote) {
  const candidatos = [];
  const primera = (lote - 1) * PAGINAS_POR_LOTE + 1;
  const ultima = Math.min(primera + PAGINAS_POR_LOTE - 1, PAGINA_MAXIMA_TMDB);
  let hayMas = false;

  for (let page = primera; page <= ultima; page++) {
    /**
     * sortBy/fechaLte/votosMinimos vienen en la spec solo para la rama de
     * clásicos por fórmula (ver especificacionesDeClasicos); el resto de
     * las búsquedas usa el orden por popularidad de siempre.
     */
    const sortBy = spec.sortBy ?? 'popularity.desc';
    const resultados =
      spec.tipo === 'pelicula'
        ? await discoverPeliculas({ page, sortBy, generos: spec.generos, sinGeneros: spec.sinGeneros, keywords: spec.keywords, sinKeywords: spec.sinKeywords, idiomas: spec.idiomas, pais: spec.pais, plataformas: spec.plataformas, actores: spec.actores, directores: spec.directores, anio: spec.anio, releaseDateLte: spec.fechaLte, voteCountGte: spec.votosMinimos })
        : await discoverSeries({ page, sortBy, generos: spec.generos, sinGeneros: spec.sinGeneros, keywords: spec.keywords, sinKeywords: spec.sinKeywords, idiomas: spec.idiomas, pais: spec.pais, plataformas: spec.plataformas, anio: spec.anio, airDateLte: spec.fechaLte, voteCountGte: spec.votosMinimos, conTipo: spec.conTipo });
    candidatos.push(...resultados);
    /**
     * Una página incompleta significa que TMDb se quedó sin resultados
     * para esta especificación: no hay lote siguiente que pedir.
     */
    hayMas = resultados.length === RESULTADOS_POR_PAGINA && page < PAGINA_MAXIMA_TMDB;
    if (resultados.length < RESULTADOS_POR_PAGINA) break;
  }

  return { candidatos, hayMas };
}

/**
 * Lo que TVMaze le agrega a un candidato, con la regla de precedencia de la
 * sección 2 del Definitivo: **TMDb manda, TVMaze solo aporta lo que TMDb no
 * tiene**.
 *
 * En la práctica eso deja un solo aporte real, `duracionTotal`, que es el
 * tiempo que lleva ver la serie entera. TMDb no lo tiene de ninguna forma:
 * devuelve la cantidad de episodios, pero su `episode_run_time` viene vacío
 * en buena parte del catálogo (medido: 9 de 24 series). Es el dato que hace
 * respondible "algo que pueda terminar en un fin de semana" (sección 1).
 *
 * Es un valor **aproximado**: duración promedio por episodio × cantidad de
 * episodios. La suma exacta episodio por episodio existe en TVMaze, pero
 * cuesta una llamada por serie, que es justo lo que este diseño evita.
 *
 * `estado` es solo un respaldo por si TMDb no dijo nada, y casi nunca se
 * usa (medido: TMDb lo trae en 40 de 40). Nunca pisa al de TMDb, y el
 * motivo importa: TVMaze no distingue las series canceladas de las
 * terminadas, y el filtro de Estado de la sección 7 excluye a las
 * canceladas de sus dos valores, así que perder esa distinción cambiaría
 * los resultados.
 */
function datosDeTvmaze(detalle, tvmaze) {
  if (!tvmaze) return {};

  const duracionEpisodio = tvmaze.duracion_episodio ?? null;
  const episodios = detalle.episodios ?? null;

  return {
    duracionEpisodio,
    duracionTotal: duracionEpisodio && episodios ? duracionEpisodio * episodios : null,
    estado: detalle.estado ?? tvmaze.estado ?? null,
  };
}

/**
 * Segunda mitad del núcleo: dado un array de candidatos "livianos" (ya
 * traídos de donde sea — discover, similar, etc.), dedupea, pide detalle,
 * clasifica, calcula fórmulas, y hace upsert (crecimiento orgánico).
 * Separado de obtenerCandidatosCompletos() para que "Parecido a" (que trae
 * sus candidatos de /recommendations, no de discover) pueda reusar exactamente el
 * mismo enriquecimiento sin duplicar lógica.
 */
export async function completarDetalle(livianos, agregados, { soloRecomendables = false } = {}) {
  const mapaLivianos = new Map();
  for (const l of livianos) mapaLivianos.set(claveDe(l), l);
  const livianosUnicos = [...mapaLivianos.values()];

  /**
   * Caching (v2): el detalle de cada candidato es la llamada más cara del
   * motor, una por título en cada búsqueda. Se lee de la base lo que esté
   * fresco, en una sola consulta para todo el lote, y a TMDb se le pide
   * únicamente lo que falta.
   */
  const cacheados = await leerDetallesFrescos(livianosUnicos, HORAS_FRESCURA_DETALLE);
  const faltantes = livianosUnicos.filter((l) => !cacheados.has(claveDe(l)));

  const detallados = [...cacheados.values()];
  /**
   * Qué títulos se trajeron de verdad de TMDb en esta pasada, para no
   * reescribir en la base los que ya vinieron de ella.
   */
  const clavesFrescas = new Set();
  const tareas = faltantes.map((c) => async () => {
    const detalle = await obtenerDetalle(c.tmdb_id, c.tipo);
    detallados.push(detalle);
    clavesFrescas.add(claveDe(detalle));
  });
  const resultadosDetalle = await conLimite(tareas, CONCURRENCIA_DETALLE);
  const fallidos = resultadosDetalle.filter((r) => r.status === 'rejected');
  if (fallidos.length) {
    console.warn(`${fallidos.length} candidatos fallaron al traer detalle y se descartan.`);
  }

  const c = Number(agregados.c);
  const popularityMax = Number(agregados.popularity_max);
  const votosMax = agregados.votos_totales_max;
  const votosMaxClasicos = agregados.votos_totales_max_clasicos;

  /**
   * Datos de series de TVMaze, cruzados por IMDb ID contra el espejo local
   * (ver seedTvmaze.js). Es una sola consulta a nuestra base para todo el
   * lote, sin ninguna llamada a la API de TVMaze.
   */
  const porImdb = await leerPorImdb(detallados.filter((d) => d.tipo === 'tv').map((d) => d.imdb_id));

  const completos = detallados.map((d) => {
    const tvmaze = d.tipo === 'tv' && d.imdb_id ? porImdb.get(d.imdb_id) : undefined;
    return {
      ...d,
      /**
       * Las clasificaciones y las fórmulas se recalculan siempre, incluso
       * sobre un detalle cacheado: dependen de los agregados del catálogo
       * (C, máximos), que cambian aunque el título no.
       */
      tipoContenido: tipoContenido(d),
      es_clasico: esClasico(d, votosMaxClasicos),
      complejidad: complejidad(d),
      /**
       * Los géneros que TMDb no tiene para series (Terror, Thriller, Historia,
       * Romance, Música) y que este título cumple por sus keywords. Va acá, con
       * el resto de lo que se recalcula en cada búsqueda, porque es lo que hace
       * que la respuesta sea la misma sin importar por dónde se llegó.
       *
       * **complejidad() NO lo mira, a propósito** (ver 4.15.9): el proxy
       * alcanza para buscar y no para clasificar. Por eso el campo va aparte y
       * no se suma a `generos`.
       */
      ...(d.tipo === 'tv' ? { generosInferidos: inferirGenerosDeSerie(d.keywords) } : {}),
      edad: limiteEdad(d.certificaciones),
      puntuacion: puntuacion({ votos: d.vote_count, promedio: Number(d.vote_average ?? 0), c }),
      popularidadScore: popularidad({ popularity: Number(d.popularity ?? 0), votos: d.vote_count, popularityMax, votosMax }),
      ...datosDeTvmaze(d, tvmaze),
    };
  });

  /**
   * En el caché va el detalle tal como vino de TMDb, no el objeto
   * completo: la clasificación y las fórmulas se recalculan en cada
   * búsqueda porque dependen de los agregados del catálogo, así que
   * guardarlas sería guardar algo que nace viejo.
   */
  const crudoPorClave = new Map(detallados.map((x) => [claveDe(x), x]));

  /**
   * Solo se escribe lo que se acaba de traer de TMDb. Un acierto de caché
   * no aporta nada nuevo que guardar, y saltearlo evita mandar filas que ya
   * están iguales en la base.
   *
   * Antes esto eran tres consultas en serie por título (upsert,
   * clasificación, detalle), paralelizadas de a 10 títulos. Medido: con 200
   * títulos nuevos son 600 idas y vueltas a Neon, a ~50 ms cada una, ~4 s en
   * el camino crítico de la búsqueda. `guardarLote()` las funde en una sola
   * consulta con `jsonb_to_recordset` — mismo caso que 200 filas: ~200 ms.
   */
  const filas = completos
    .filter((t) => clavesFrescas.has(claveDe(t)))
    .map((t) => ({
      tmdb_id: t.tmdb_id,
      tipo: t.tipo,
      titulo: t.titulo ?? null,
      anio: t.anio ?? null,
      vote_count: t.vote_count ?? 0,
      vote_average: t.vote_average ?? null,
      popularity: t.popularity ?? null,
      generos: t.generos ?? [],
      keywords: t.keywords ?? [],
      es_clasico: t.es_clasico,
      complejidad: t.complejidad,
      detalle: crudoPorClave.get(claveDe(t)),
    }));

  try {
    await guardarLote(filas);
  } catch (err) {
    /**
     * No es fatal: lo que se trajo de TMDb ya se pagó y esta función igual
     * devuelve los resultados. Lo único que se pierde es que la próxima
     * búsqueda tenga que volver a pedirle el detalle a TMDb.
     */
    console.warn(`No se pudo guardar el lote de ${filas.length} títulos en la base: ${err.message}`);
  }

  /**
   * El piso de calidad se aplica acá, en un solo lugar, y no en cada
   * consumidor del motor: quedan afuera los formatos que no son una historia
   * para ver, los títulos sin póster, los que no llegan al mínimo de votos y
   * los bloqueados por keyword (ver logic/recomendable.js).
   *
   * Es OPCIONAL a propósito. Esta misma función resuelve el detalle de las
   * listas guardadas del usuario, y ahí no corresponde filtrar: si alguien
   * guardó algo sin póster, es suyo y tiene que seguir viéndolo. Las rutas de
   * listas no piden la opción; todos los caminos de búsqueda sí.
   *
   * Se descarta DESPUÉS de guardar el detalle a propósito: lo que se trajo de
   * TMDb ya se pagó y sirve igual para la Ficha y para el caché.
   */
  return soloRecomendables ? completos.filter(esRecomendable) : completos;
}

/**
 * Núcleo reutilizable del motor: dado un array de "especificaciones" de
 * discover ({ tipo, generos, anio, keywords }), trae candidatos de TODAS
 * ellas, las une (dedupe por tipo+tmdb_id — esto es lo que le da semántica
 * de OR cuando se le pasan varias specs distintas, ej. género-o-keyword de
 * la Opción 4), y delega el resto en completarDetalle().
 *
 * Devuelve { candidatos, hayMas }: `hayMas` dice si el lote siguiente
 * puede traer algo nuevo (ver traerCandidatosLivianos).
 */
/**
 * Reparte el tope de candidatos entre las especificaciones por turnos: el
 * primero de cada una, después el segundo de cada una, y así.
 *
 * El orden dentro de cada especificación es el que trae /discover (por
 * popularidad, salvo la rama de clásicos), así que ir por turnos se queda
 * con los mejores de cada una. Ordenar todo junto por popularidad y cortar
 * sería más simple pero peor: en una búsqueda de varios países, el de cine
 * más visto se comería a los otros, y el usuario los pidió a todos por
 * igual (son un OR, ver la sección 6 del Definitivo).
 */
function repartirEntreEspecificaciones(porEspecificacion, tope) {
  const elegidos = [];
  const vistos = new Set();
  const masLarga = Math.max(0, ...porEspecificacion.map((l) => l.length));

  for (let posicion = 0; posicion < masLarga && elegidos.length < tope; posicion++) {
    for (const lista of porEspecificacion) {
      if (elegidos.length >= tope) break;
      const candidato = lista[posicion];
      if (!candidato) continue;
      const clave = claveDe(candidato);
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      elegidos.push(candidato);
    }
  }
  return elegidos;
}

/**
 * Aplana los grupos de especificaciones (uno por combinación tipo×país×año)
 * respetando MAXIMO_ESPECIFICACIONES.
 *
 * **El recorte es POR TURNOS entre combinaciones, no "las primeras N".** Es
 * el mismo argumento que ya decide el reparto de candidatos (4.9.1): las
 * specs se generan en orden tipo → país → año, así que cortar la lista plana
 * dejaría la búsqueda entera dentro de los primeros países y sin una sola
 * spec de los últimos, cuando el usuario los pidió a todos por igual. Yendo
 * por turnos, lo que se pierde es la cola de cada combinación y ninguna se
 * queda sin nada.
 *
 * Por debajo del tope no toca nada: devuelve las mismas specs en el mismo
 * orden en que se generaban antes, que es el caso de cualquier búsqueda
 * normal.
 */
/**
 * Recorta la más larga de las dos listas hasta que su producto entre en
 * MAXIMO_COMBINACIONES_PAIS_ANIO. Ver el comentario del llamador.
 */
export function acotarCombinaciones(paises, anios) {
  if (paises.length * anios.length <= MAXIMO_COMBINACIONES_PAIS_ANIO) return [paises, anios];

  /**
   * Se calcula de una en vez de ir sacando de a un elemento: el caso que esto
   * protege es justamente el de listas enormes, y recortar en un bucle sería
   * cuadrático ahí adentro.
   */
  const paisesEsCorta = paises.length <= anios.length;
  const [corta, larga] = paisesEsCorta ? [paises, anios] : [anios, paises];
  const nCorta = Math.min(corta.length, MAXIMO_COMBINACIONES_PAIS_ANIO);
  const nLarga = Math.max(1, Math.floor(MAXIMO_COMBINACIONES_PAIS_ANIO / nCorta));
  const [p, a] = paisesEsCorta
    ? [corta.slice(0, nCorta), larga.slice(0, nLarga)]
    : [larga.slice(0, nLarga), corta.slice(0, nCorta)];

  console.warn(
    `Búsqueda muy ancha: ${paises.length} países x ${anios.length} tramos de año recortados a ${p.length} x ${a.length}.`
  );
  return [p, a];
}

/**
 * Recorta la lista de especificaciones a MAXIMO_ESPECIFICACIONES.
 *
 * **El recorte es POR TURNOS entre combinaciones, no "las primeras N".** Es
 * el mismo argumento que ya decide el reparto de candidatos (4.9.1): las
 * specs se generan en orden tipo -> país -> año, así que cortar la lista
 * plana dejaría la búsqueda entera dentro de los primeros países y sin una
 * sola spec de los últimos, cuando el usuario los pidió a todos por igual.
 * Yendo por turnos, lo que se pierde es la cola de cada combinación y ninguna
 * se queda sin nada.
 *
 * **Los grupos se deducen de la propia spec** (`tipo`, `pais` y `anio`, que
 * todas llevan) en vez de pedírselos a quien llama, y eso es lo que lo vuelve
 * una red de seguridad de verdad: vive adentro de obtenerCandidatosCompletos,
 * así que la heredan los TRES generadores que lo usan hoy —`buscar()`,
 * `buscarPorEstadoAnimo()` y `buscarGustosPorGenero()`— y cualquiera que se
 * agregue mañana, sin que nadie tenga que acordarse. Es la lección que este
 * proyecto ya aprendió dos veces con las tablas compartidas (4.29.5, 4.29.7):
 * un consumidor nuevo que no se entera del mecanismo es el modo de fallo más
 * probable, no el más raro.
 *
 * Por debajo del tope no toca nada: devuelve las mismas specs en el mismo
 * orden, que es el caso de cualquier búsqueda normal.
 */
function recortarEspecificaciones(especificaciones) {
  if (especificaciones.length <= MAXIMO_ESPECIFICACIONES) return especificaciones;

  const grupos = new Map();
  for (const spec of especificaciones) {
    const clave = `${spec.tipo}|${spec.pais ?? ''}|${spec.anio?.desde ?? ''}-${spec.anio?.hasta ?? ''}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(spec);
  }

  const listas = [...grupos.values()];
  const elegidas = [];
  const maximo = Math.max(...listas.map((g) => g.length));
  for (let posicion = 0; posicion < maximo && elegidas.length < MAXIMO_ESPECIFICACIONES; posicion++) {
    for (const grupo of listas) {
      if (elegidas.length >= MAXIMO_ESPECIFICACIONES) break;
      if (grupo[posicion]) elegidas.push(grupo[posicion]);
    }
  }
  console.warn(
    `Búsqueda muy ancha: ${especificaciones.length} especificaciones recortadas a ${elegidas.length}.`
  );
  return elegidas;
}

export async function obtenerCandidatosCompletos(especificacionesPedidas, agregados, { lote = 1 } = {}) {
  /**
   * En paralelo, no en serie: es el cambio que baja el peor caso de 19,5 s
   * de espera pura a menos de 3 (ver CONCURRENCIA_DISCOVER).
   */
  const especificaciones = recortarEspecificaciones(especificacionesPedidas);
  const tareas = especificaciones.map((spec) => () => traerCandidatosLivianos(spec, lote));
  const resueltas = await conLimite(tareas, CONCURRENCIA_DISCOVER);

  const fallidas = resueltas.filter((r) => r.status === 'rejected');
  if (fallidas.length) {
    console.warn(`${fallidas.length} especificaciones de discover fallaron y se descartan.`);
  }

  const porEspecificacion = resueltas
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value.candidatos);

  /**
   * Alcanza con que UNA especificación tenga más para que el lote siguiente
   * valga la pena: las otras simplemente no aportarán nada.
   */
  const hayMas = resueltas.some((r) => r.status === 'fulfilled' && r.value.hayMas);

  const livianos = repartirEntreEspecificaciones(porEspecificacion, TOPE_CANDIDATOS_POR_LOTE);

  return { candidatos: await completarDetalle(livianos, agregados, { soloRecomendables: true }), hayMas };
}

/**
 * Traduce la Complejidad (sección 15) a especificaciones de /discover, para
 * que pueda pedirse como Preferencia y no solo como Filtro.
 *
 * Son dos ramas, que se unen por OR gracias al dedupe de
 * obtenerCandidatosCompletos, igual que hace Clásicos (ver 4.9):
 *
 *  1. **Keywords**, que es el paso 1 del Definitivo y la señal más
 *     confiable: with_keywords con las del lado pedido.
 *  2. **Géneros**, que es el paso 2: `with_genres` con los del lado pedido
 *     (OR) más `without_genres` para sacar al otro lado. Verificado contra
 *     TMDb: sin la exclusión, solo 6 de 20 resultados eran del lado pedido;
 *     con ella, 20 de 20.
 *
 *     **El `without_genres` NO excluye a los géneros ambivalentes**, y ahí
 *     está el cambio del 2026-08-24: excluirlos era lo que dejaba afuera de
 *     "para relajar" a todo lo que llevara Drama, o sea a las comedias
 *     dramáticas enteras. Tampoco excluye a los neutros (Terror, Thriller),
 *     que ya no vetan. Sí siguen afuera los formatos de TV que no son
 *     historias.
 *
 * El resultado igual pasa por aplicarFiltros con la complejidad, que aplica
 * la regla exacta (incluida la precedencia de keywords del paso 1, que
 * discover no sabe expresar). Estas ramas solo tienen que traer un buen
 * conjunto de candidatos, no ser exactas.
 */
export async function especificacionesDeComplejidad(
  base,
  complejidadPedida,
  { unaSolaSpec = false, sinKeywordsDeSpec = [] } = {}
) {
  const esRelajar = complejidadPedida === 'relajar';
  /**
   * `sinKeywordsDeSpec` saca nombres de ACÁ, no de `KEYWORDS_RELAJAR`/
   * `KEYWORDS_PENSAR`: esos sets siguen enteros para que `complejidad()`
   * (logic/clasificacion.js) clasifique igual que siempre a cualquier título
   * que llegue por otra vía. Lo único que cambia es qué specs de discover se
   * arman ACÁ para salir a buscar candidatos. Ver el comentario de
   * "pasarElTiempo" en data/estadosAnimo.js para el caso que lo motivó.
   */
  const nombresKeywords = [...(esRelajar ? KEYWORDS_RELAJAR : KEYWORDS_PENSAR)].filter(
    (k) => !sinKeywordsDeSpec.includes(k)
  );

  /**
   * Las listas son POR TAXONOMÍA, y el `sinGeneros` se calcula sobre los
   * géneros de ESE endpoint. Hasta el 2026-08-24 salía de una lista mezclada y
   * del diccionario completo, con dos consecuencias medidas: de los 11 géneros
   * de "relajar", 5 no existían en TV y viajaban como ramas muertas del OR; y
   * el `without_genres` excluía Infantil, Noticias y Reality de TV sin que
   * fueran "para pensar", solo por ser "todo lo demás".
   */
  const { relajar, pensar } = listasDeComplejidad(base.tipo);
  const idsDelLado = [...(esRelajar ? relajar : pensar)];
  const idsDeOtros = [
    ...[...(esRelajar ? pensar : relajar)].filter((id) => !GENEROS_AMBIVALENTES.has(id)),
    ...(base.tipo === 'pelicula' ? [] : GENEROS_FORMATO_SERIE),
  ];

  const specs = [
    {
      ...base,
      generos: idsDelLado,
      sinGeneros: idsDeOtros,
      /**
       * Por vote_count y no por popularity, con el mismo argumento que la rama
       * de Clásicos (ver 4.9). La popularidad de TMDb es una métrica de
       * tendencia corta y fácil de inflar, y en una rama angosta como esta lo
       * que sube son títulos con 7 a 90 votos; el conteo de votos es
       * acumulativo y trae los que de verdad vio gente (300 a 550 votos en el
       * mismo grupo). Es la diferencia entre que "miniserie para relajar"
       * devuelva anime adulto o devuelva Knuckles y Cars: En la carretera.
       */
      sortBy: 'vote_count.desc',
    },
  ];

  /**
   * **UNA SPEC POR KEYWORD, no una sola con todas juntas** (2026-08-29). Es la
   * misma lección que los estados de ánimo aprendieron el 2026-08-24 y que esta
   * rama no había recibido: las dos formas dan el mismo OR, pero el tope de
   * candidatos se reparte POR TURNOS entre especificaciones, así que metidas en
   * un solo `with_keywords` la keyword más grande se come el cupo entero.
   *
   * Se vio al sumar `superhero` (630 películas y 376 series) a KEYWORDS_RELAJAR:
   * con una sola spec, la Preferencia "para relajar" pasó a encabezar con The
   * Boys, Batman, Flash, Loki y Umbrella Academy, y bajó de 134 a 110
   * resultados, porque las keywords chicas ('feelgood' son 28 títulos,
   * 'popcorn' 3) no llegaban a asomar.
   *
   * **SALVO que `unaSolaSpec` lo pida** (2026-09-01): quien llama desde `buscar()`
   * ya está adentro de un bucle tipo×país×año, y esta función se invoca UNA VEZ
   * POR COMBINACIÓN. Con más de un país o más de un tramo de año, "una spec por
   * keyword" deja de ser 7-11 specs y pasa a ser 7-11 × esas combinaciones — con
   * 3 países y 2 tramos ya son 42-66 llamadas a discover solo para esta rama,
   * muy por encima del peor caso que documenta la 4.9.1 (40 specs en total). Ahí
   * es mejor perder el reparto por turnos entre keywords (que un `with_keywords`
   * con OR sí puede degradar, como describe el comentario de arriba) que dejar
   * sin cota real el costo de una búsqueda: es la misma prioridad que ya eligió
   * el tope de candidatos por lote.
   */
  const idsKeywords = await resolverIdsDeKeywords(nombresKeywords);
  if (unaSolaSpec) {
    if (idsKeywords.length) specs.push({ ...base, keywords: idsKeywords, sortBy: 'vote_count.desc' });
  } else {
    for (const id of idsKeywords) specs.push({ ...base, keywords: [id], sortBy: 'vote_count.desc' });
  }

  return specs;
}

/**
 * Fecha de corte para la rama de clásicos por fórmula (sección 16: año <
 * 2000). Si el usuario además puso una preferencia de Año, hay que
 * combinarlas: un "Desde 2005" hace imposible que haya clásicos por esta
 * vía (devuelve null y la rama no se pide), y un "Hasta 1980" es más
 * restrictivo que el corte propio, así que gana el del usuario.
 */
function fechaCorteClasicos(anio) {
  if (anio?.exacto != null) return anio.exacto < 2000 ? `${anio.exacto}-12-31` : null;
  if (anio?.desde != null && anio.desde >= 2000) return null;
  if (anio?.hasta != null && anio.hasta < 2000) return `${anio.hasta}-12-31`;
  return '1999-12-31';
}

/**
 * Traduce "Clásicos" (valor sintético del campo Género, sección 12) a
 * especificaciones de /discover. Es lo que permite pedirlo como
 * Preferencia y no solo como Filtro: TMDb no sabe qué es un clásico, pero
 * el segundo criterio del Definitivo (sección 16: año < 2000 Y
 * votos/votosMaxClasicos > UMBRAL) se traduce exactamente a
 * primary_release_date.lte + vote_count.gte, que es el mismo corte que
 * después vuelve a verificar esClasico() sobre el detalle.
 *
 * **Por qué el primer criterio (la keyword "classic") no se busca acá:**
 * medido contra TMDb el 2026-08-20, esa keyword está aplicada a 18 títulos
 * en total (17 películas + 1 serie), casi todos con 0 votos y estrenos
 * recientes tipo "Classic! (2025)" o "La Belle au bois dormant (2025)". No
 * es una curaduría de clásicos, es una etiqueta suelta. Como criterio de
 * CLASIFICACIÓN sigue valiendo tal cual lo pide la sección 12 (esClasico()
 * la respeta, y un título con esa keyword que aparezca por cualquier otra
 * vía se muestra como Clásico); lo que no se hace es salir a BUSCAR por
 * ella, porque inyectaría esos 18 títulos en todos los resultados de "Ver
 * clásicos". Si algún día la keyword se usa mejor en TMDb, alcanza con
 * volver a agregar una spec { ...base, keywords: [id] } acá.
 *
 * Las specs que salen de acá se suman al resto y el dedupe de
 * obtenerCandidatosCompletos les da la semántica de OR que pide la
 * sección 12 ("Comedia OR Clásicos"), sin ninguna excepción de lógica.
 *
 * Exportada porque `gustosPorGenero.js` la reusa para el toggle "Ver
 * clásicos" de Mis Gustos (sección 19): mismo mecanismo, otra entrada.
 */
export function especificacionesDeClasicos(base, votosMaxClasicos) {
  const fechaLte = fechaCorteClasicos(base.anio);
  if (!fechaLte || !(votosMaxClasicos > 0)) return [];

  return [
    {
      ...base,
      fechaLte,
      /**
       * esClasico() exige ratio > UMBRAL, o sea estrictamente más votos que
       * el umbral; vote_count.gte es inclusivo, de ahí el +1.
       */
      votosMinimos: Math.floor(votosMaxClasicos * UMBRAL_RATIO_CLASICO) + 1,
      /**
       * Por popularidad, un pre-2000 con muchos votos casi nunca entra en
       * las primeras páginas; ordenar por votos es lo que hace que esta
       * rama devuelva justamente los que superan el umbral.
       */
      sortBy: 'vote_count.desc',
    },
  ];
}

/**
 * `preferencias`: { tipo: ['pelicula'|'miniserie'|'serie'], generos: [ids o VALOR_GENERO_CLASICOS],
 *   anio: {exacto|desde,hasta} o un array de esos objetos (ver
 *   normalizarTramosAnio en logic/resultados.js) }
 * `filtros`: ver logic/resultados.js (aplicarFiltros) — usa tipoContenido para Tipo.
 * `ordenar`: { campo, direccion }
 * `lote`: qué tanda de páginas de discover pedir (1 = las primeras). El
 *   cliente lo va subiendo para acumular más candidatos sin repetir los
 *   que ya tiene; ver PAGINAS_POR_LOTE.
 * `agregados`: opcional. `agregados_catalogo` es una fila que casi no
 *   cambia (se recalcula una vez por semana), así que un llamador que ya la
 *   leyó (la búsqueda con formulario vacío, las divisiones por prioridad) la
 *   pasa acá en vez de hacer que cada `buscar()` la vuelva a pedir.
 *
 * Devuelve { resultados, hayMas }.
 */
export async function buscar({ preferencias = {}, filtros = {}, ordenar, lote = 1, agregados: agregadosProvistos } = {}) {
  const agregados = agregadosProvistos ?? (await leerAgregados());
  if (!agregados) {
    throw new Error('No hay agregados calculados todavía. Corré "npm run seed" y "npm run recalcular" primero.');
  }

  /**
   * with_origin_country no tiene confirmado soporte de múltiples valores
   * (a diferencia de género/keyword/idioma, que sí lo tienen). Para no
   * arriesgarnos, con más de un país hacemos un discover por cada uno y
   * los unimos — el dedupe de obtenerCandidatosCompletos les da semántica
   * de OR sin lógica extra. Ojo con el costo: N países × M tipos = N×M
   * rondas de discover en vez de 1.
   */
  const paisesPedidos = preferencias.paises?.length ? preferencias.paises : [undefined];

  /**
   * Mismo mecanismo que País, por el mismo motivo: discover no sabe pedir
   * "1994 o los años 80" en una sola llamada, así que va un discover por
   * tramo y el dedupe de obtenerCandidatosCompletos les da el OR. Ojo con
   * el costo, que acá se multiplica: N países × M tipos × K tramos.
   */
  const tramosAnio = normalizarTramosAnio(preferencias.anio);
  const aniosPedidos = tramosAnio.length ? tramosAnio : [undefined];

  /**
   * **La cota tiene que estar ANTES del bucle y no solo después.**
   * MAXIMO_ESPECIFICACIONES recorta lo que se le pide a TMDb, que es el
   * costo que se ve; pero armar el producto cartesiano igual cuesta tiempo
   * y memoria del proceso, y esas dos listas vienen del cuerpo del pedido
   * sin ningún tope. El selector de País tiene ~100 opciones y el de años
   * sueltos ~140, así que **hasta desde la propia pantalla** se llega a
   * 14.000 combinaciones, y por la API a las que uno quiera: ahí el proceso
   * se queda generando specs que después iban a descartarse igual, y con un
   * solo pedido, así que el límite de 30 por minuto por IP no protege nada.
   *
   * Se recorta la lista más larga hasta que el producto entre. Cortar la
   * larga y no las dos por igual es lo que conserva entera a la corta:
   * "5 países × 200 años" queda con sus 5 países.
   */
  const [paises, anios] = acotarCombinaciones(paisesPedidos, aniosPedidos);

  /**
   * Con más de una combinación de país×año, la rama de Complejidad-como-
   * Preferencia (más abajo) colapsa sus keywords en una sola spec por
   * combinación en vez de una por keyword — ver el comentario de
   * especificacionesDeComplejidad.
   */
  const combinacionesPaisAnio = paises.length * anios.length;

  /**
   * TMDb no soporta with_cast/with_crew en discover/tv (confirmado, no es
   * una limitación de esta implementación). Devolver series sin filtrar
   * por esa persona sería engañoso, así que Actor/Director restringe la
   * búsqueda a películas — mejor una limitación explícita que resultados
   * que parecen filtrados pero no lo están.
   */
  const usaActorODirector = preferencias.actores?.length > 0 || preferencias.directores?.length > 0;
  if (usaActorODirector) {
    console.warn('Actor/Director activo: la búsqueda se restringe a películas (TMDb no soporta este filtro para series).');
  }
  const tipos = usaActorODirector ? ['pelicula'] : tiposDiscoverNecesarios(preferencias.tipo);

  /**
   * "Clásicos" viaja dentro del array de Género (sección 12), pero no es
   * un ID de TMDb: se separa acá y se resuelve con sus propias
   * especificaciones de discover.
   */
  const generosPedidos = preferencias.generos ?? [];
  const pideClasicos = generosPedidos.includes(VALOR_GENERO_CLASICOS);
  const generosReales = generosPedidos.filter((g) => g !== VALOR_GENERO_CLASICOS);

  /**
   * La Complejidad se resuelve como Preferencia (con sus propias
   * especificaciones de discover) SOLO si el usuario no pidió géneros. Si
   * pidió los dos, mandan los géneros y la complejidad queda como
   * refinamiento sobre esos candidatos, que es el comportamiento de
   * siempre. El motivo es que las dos cosas compiten por el mismo campo de
   * discover y se contradicen seguido: "Comedia" y "Para pensar" no tienen
   * intersección posible por la rama de géneros (Comedia es un género de
   * relajar), así que combinarlas ahí devolvería cero. Como refinamiento,
   * en cambio, todavía puede encontrar una comedia con keyword de pensar.
   */
  const usaComplejidadComoPreferencia = Boolean(preferencias.complejidad) && generosReales.length === 0;

  /**
   * Los géneros que no existen en la taxonomía de TV (Terror, Thriller,
   * Historia, Romance, Música) se recrean con una rama de keywords, que es lo
   * único que permite buscarlos en series. Ver KEYWORDS_DE_GENERO_SERIE.
   *
   * Se resuelven acá arriba y no adentro de los tres bucles: los IDs son los
   * mismos para todos los países y tramos de año, y aunque resolverlos está
   * cacheado en memoria, pedirlos una vez deja claro que no dependen del bucle.
   */
  const keywordsPorGeneroSerie = new Map();
  if (tipos.includes('tv')) {
    /**
     * En paralelo y no en serie: son llamadas independientes entre sí (una
     * por género pedido), y encadenarlas con `await` adentro del `for` paga
     * un round-trip detrás de otro en caché frío cuando se piden varios
     * géneros recreados a la vez (p. ej. Terror + Romance + Historia). Mismo
     * criterio que ya sigue `resolverIdsDeKeywords` para las keywords sueltas.
     */
    const generos = generosRecreablesEnSerie(generosReales);
    const resueltos = await Promise.all(
      generos.map((genero) => resolverIdsDeKeywords(KEYWORDS_DE_GENERO_SERIE[genero]))
    );
    generos.forEach((genero, i) => {
      if (resueltos[i].length) keywordsPorGeneroSerie.set(genero, resueltos[i]);
    });
  }

  /**
   * Corrección conocida para un género amplio que "vote_count.desc" deja
   * tomado por una franquicia vecina (CORRECCIONES_POR_GENERO en
   * data/genres.js — medida en 4.15.5b/4.29). Antes esto solo lo
   * tenían el botón "Quiero acción" de Estado de Ánimo y Gustos Registrados:
   * buscar por Preferencias normales seguía sin corrección para NINGÚN
   * género. Se resuelven acá arriba, una sola vez para toda la búsqueda, los
   * IDs de veto de cada género pedido que tenga una corrección conocida —
   * los usan tanto el caso de un solo género como el de varios (ver abajo).
   */
  const generosConCorreccion = generosReales.filter((g) => CORRECCIONES_POR_GENERO[g]);
  const sinKeywordsPorGenero = new Map(
    await Promise.all(
      generosConCorreccion
        .filter((g) => CORRECCIONES_POR_GENERO[g].vetoKeywords)
        .map(async (g) => [g, await resolverIdsDeKeywords(CORRECCIONES_POR_GENERO[g].vetoKeywords)])
    )
  );
  const correccionGenero =
    generosReales.length === 1 ? CORRECCIONES_POR_GENERO[generosReales[0]] : undefined;
  const sinKeywordsCorreccion = correccionGenero ? sinKeywordsPorGenero.get(generosReales[0]) : undefined;

  const especificaciones = [];
  for (const tipo of tipos) {
    for (const pais of paises) {
      for (const anio of anios) {
        const base = {
          tipo,
          idiomas: preferencias.idiomas,
          plataformas: preferencias.plataformas,
          actores: preferencias.actores,
          directores: preferencias.directores,
          pais,
          anio,
          // Solo lo usa discoverSeries; en el endpoint de películas se ignora.
          conTipo: tipo === 'tv' ? tipoTmdbParaDiscover(preferencias.tipo) : undefined,
        };

        /**
         * Los géneros pedidos se traducen a la taxonomía del endpoint que se va
         * a llamar. TMDb tiene dos listas de género que comparten solo 8 IDs, y
         * mandar uno de la otra no da error: se ignora en silencio. Antes de
         * esto, "serie de acción" pedía with_genres=28 a /discover/tv, que no
         * existe ahí, y devolvía todas las series.
         */
        const generosDelEndpoint = generosReales.length
          ? generosParaTaxonomia(generosReales, tipo)
          : [];

        /**
         * Si el usuario pidió géneros y NINGUNO existe en esta taxonomía, la
         * spec no se manda. Es el caso de "serie de terror": Terror no existe
         * para series en TMDb, y mandar la spec sin `with_genres` no sería
         * "sin filtro", sería traer todas las series.
         */
        const generosSeQuedaronVacios = generosReales.length > 0 && generosDelEndpoint.length === 0;

        /**
         * Si lo único que se pidió fue "Clásicos" o una Complejidad, no se
         * agrega una rama sin género: sería traer el catálogo entero para
         * después descartarlo contra lo que sí se pidió.
         */
        const hayRamaPropia = pideClasicos || usaComplejidadComoPreferencia;

        if (generosReales.length > 1 && generosConCorreccion.length) {
          /**
           * Al menos uno de los géneros combinados tiene una corrección
           * conocida (hoy Acción o Ciencia Ficción, ver CORRECCIONES_POR_GENERO
           * en data/genres.js). No se le puede aplicar `sinGeneros` a un
           * `with_genres` combinado (A|B): excluiría también títulos del OTRO
           * género que el usuario sí pidió — a Interstellar, que es Drama Y
           * Ciencia Ficción, lo sacaría una corrección de Acción si Acción y
           * Drama se combinaran. Se arma UNA SPEC POR GÉNERO en vez de una
           * combinada (mismo mecanismo que ya usa gustosPorGenero.js para que
           * Thriller no quede invisible detrás de Acción y Ciencia Ficción), y
           * la corrección se aplica solo a la spec del género que la tiene:
           * los demás géneros de la combinación siguen exactamente igual que
           * siempre.
           */
          for (const g of generosReales) {
            const [traducido] = generosParaTaxonomia([g], tipo);
            if (!traducido) continue;
            const correccion = CORRECCIONES_POR_GENERO[g];
            especificaciones.push({
              ...base,
              generos: [traducido],
              ...(correccion
                ? {
                    sortBy: correccion.sortBy,
                    sinGeneros: correccion.sinGenerosRamaGenero?.[tipo],
                    sinKeywords: sinKeywordsPorGenero.get(g),
                  }
                : {}),
            });
          }
        } else if (!generosSeQuedaronVacios && (generosDelEndpoint.length || !hayRamaPropia)) {
          especificaciones.push({
            ...base,
            generos: generosDelEndpoint.length ? generosDelEndpoint : undefined,
            ...(correccionGenero
              ? {
                  sortBy: correccionGenero.sortBy,
                  sinGeneros: correccionGenero.sinGenerosRamaGenero?.[tipo],
                  sinKeywords: sinKeywordsCorreccion,
                }
              : {}),
          });
        }
        /**
         * UNA SPEC POR KEYWORD, no una sola con todas juntas: el reparto del
         * tope de candidatos es por turnos entre especificaciones, así que
         * metidas en un solo `with_keywords` la más grande se come el cupo.
         * Es el mismo argumento de 4.15.3b, y el mismo que hace que País y Año
         * armen una spec por valor.
         *
         * La spec no necesita decir a qué género corresponde: el candidato se
         * marca solo, en completarDetalle, a partir de sus propias keywords
         * (ver inferirGenerosDeSerie). Así la respuesta es la misma se haya
         * llegado por esta rama o por cualquier otro camino.
         *
         * **`GENERO_ANCLA_SERIE` y `CORRECCIONES_POR_GENERO` se suman acá
         * desde el 2026-09-03**, para los géneros recreados que sí tienen un
         * género real al que anclarse (Ciencia Ficción/Fantasía/Acción/
         * Aventura, fundidos de a pares por TMDb — ver el comentario de
         * `GENERO_ANCLA_SERIE` en genres.js). Sin esto la rama nueva iría en
         * `popularity.desc` sin veto de Marvel ni exclusión de Animación,
         * repitiendo el defecto que motivó media sesión de arreglos para
         * Ciencia Ficción (4.29). Los cinco géneros originales
         * (Terror/Thriller/Historia/Romance/Música) no tienen entrada en
         * ninguna de las dos tablas, así que siguen exactamente igual.
         */
        if (tipo === 'tv') {
          for (const [genero, idsKeyword] of keywordsPorGeneroSerie.entries()) {
            const ancla = GENERO_ANCLA_SERIE[genero];
            const correccion = CORRECCIONES_POR_GENERO[genero];
            /**
             * **UNA SOLA SPEC CON TODAS LAS KEYWORDS SI HAY MÁS DE UNA
             * COMBINACIÓN PAÍS×AÑO** (2026-09-08). Es exactamente la regla
             * que `especificacionesDeComplejidad` ya aplica con
             * `unaSolaSpec`, por el mismo motivo y con el mismo costo
             * aceptado: estamos adentro del bucle tipo×país×año, así que
             * "una spec por keyword" no son 6-15 specs sino 6-15 × esas
             * combinaciones. Ciencia Ficción sola son 15 keywords; con 5
             * países y 5 tramos de año pasan a ser 375 llamadas a discover
             * de un solo género.
             *
             * Medido el 2026-09-08 sobre el caso reportado (9 géneros, 5
             * países, 5 tramos, 2 tipos): de esta rama salían 975 de las
             * 1335 especificaciones de la búsqueda, y el reparto por turnos
             * del tope de candidatos ya estaba tan pulverizado que 1152 de
             * esas 1335 no aportaban ni un título.
             *
             * Lo que se pierde es el reparto por turnos ENTRE las keywords
             * de un mismo género (la más grande se come el cupo de ese
             * género), que es real y es el motivo por el que la rama nació
             * con una spec por keyword (4.15.3b). Con una sola combinación
             * país×año — el caso normal — nada de esto se activa y la rama
             * sigue funcionando exactamente como siempre.
             */
            const idsPorSpec = combinacionesPaisAnio > 1 ? [idsKeyword] : idsKeyword.map((id) => [id]);
            for (const ids of idsPorSpec) {
              especificaciones.push({
                ...base,
                keywords: ids,
                ...(ancla ? { generos: [ancla] } : {}),
                ...(correccion?.sortBy ? { sortBy: correccion.sortBy } : {}),
                ...(correccion?.sinGenerosRamaGenero?.tv ? { sinGeneros: correccion.sinGenerosRamaGenero.tv } : {}),
                ...(sinKeywordsPorGenero.get(genero)?.length ? { sinKeywords: sinKeywordsPorGenero.get(genero) } : {}),
              });
            }
          }
        }
        if (pideClasicos) {
          especificaciones.push(...especificacionesDeClasicos(base, agregados.votos_totales_max_clasicos));
        }
        if (usaComplejidadComoPreferencia) {
          especificaciones.push(
            ...(await especificacionesDeComplejidad(base, preferencias.complejidad, {
              unaSolaSpec: combinacionesPaisAnio > 1,
            }))
          );
        }
      }
    }
  }

  // El tope de especificaciones lo aplica obtenerCandidatosCompletos, que es
  // por donde pasan los tres generadores. Ver recortarEspecificaciones.
  const { candidatos: completos, hayMas } = await obtenerCandidatosCompletos(especificaciones, agregados, { lote });

  /**
   * Cierra el OR de la sección 12 sobre los candidatos ya clasificados: un
   * título entra si matchea alguno de los géneros pedidos O si es clásico.
   * Las ramas de clásicos ya devuelven solo clásicos por construcción, así
   * que esto es sobre todo una red de seguridad ante datos que cambien
   * entre el discover y el detalle.
   */
  const porGeneroOClasico = pideClasicos
    ? aplicarFiltros(completos, { generos: [...generosReales, VALOR_GENERO_CLASICOS] })
    : completos;

  /**
   * La Complejidad se verifica siempre sobre el candidato ya clasificado,
   * venga de su propia rama de discover o de un refinamiento: la regla del
   * Definitivo (precedencia de keywords, pureza de géneros) es más fina de
   * lo que discover puede expresar.
   */
  const porComplejidad = preferencias.complejidad
    ? aplicarFiltros(porGeneroOClasico, { complejidad: preferencias.complejidad })
    : porGeneroOClasico;

  const porTipoSolicitado = preferencias.tipo?.length
    ? porComplejidad.filter((t) => preferencias.tipo.includes(t.tipoContenido))
    : porComplejidad;

  const filtrados = aplicarFiltros(porTipoSolicitado, filtros).filter(
    (c) => !excluidoPorFiltroDeGenero(c, generosReales)
  );
  return { resultados: ordenarResultados(filtrados, ordenar), hayMas };
}
