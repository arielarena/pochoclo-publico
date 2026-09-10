import 'dotenv/config';
import { NO_LATINO } from '../utils/alfabeto.js';
import { memorizarCorto, claveEstable } from '../utils/cacheCorta.js';

const BASE_URL = 'https://api.themoviedb.org/3';

if (!process.env.TMDB_API_TOKEN) {
  throw new Error('Falta TMDB_API_TOKEN en el .env (ver .env.example)');
}

/**
 * Sin esto, una conexión a TMDb que se acepta y después se cuelga no la corta
 * nadie hasta el default de Node (~300s). Como el motor pide detalles y
 * discover en tandas de CONCURRENCIA_DETALLE/CONCURRENCIA_DISCOVER en
 * paralelo (ver utils/concurrencia.js), una sola llamada colgada frena la
 * tanda entera y con ella cualquier búsqueda. Mismo criterio que ya usan
 * contrasenaFiltrada.js (HIBP) y vigilancia.js para sus llamadas salientes.
 */
const TMDB_TIMEOUT_MS = 10_000;

/**
 * Ver 4.9.1: medido el 2026-08-21, TMDb no devolvía ningún 429 ni
 * con 80 pedidos de detalle en paralelo, así que esto es una red de
 * seguridad y no una necesidad probada. Se agrega igual porque subir
 * `CONCURRENCIA_DETALLE` (motorBusqueda.js) corre ese límite más cerca de
 * donde alguna vez podría estar el de TMDb, y sin reintento un 429 hoy
 * descarta el candidato en silencio (ver el `console.warn` de
 * `completarDetalle`). Mismo patrón que ya usa `services/tvmaze.js`, con
 * menos reintentos porque el límite real de TMDb nunca se vio actuar.
 */
const REINTENTOS_POR_429 = 1;
const ESPERA_TRAS_429_MS = 800;
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tmdbFetch(path, params = {}, intento = 0) {
  const url = new URL(BASE_URL + path);
  url.searchParams.set('language', 'es-ES');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(TMDB_TIMEOUT_MS),
  });

  if (res.status === 429 && intento < REINTENTOS_POR_429) {
    /**
     * TMDb a veces manda `Retry-After`; si no, la espera fija alcanza porque
     * nunca se vio a TMDb frenar por más que un instante (ver el comentario
     * de arriba).
     */
    const segundos = Number(res.headers.get('retry-after'));
    await dormir(Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : ESPERA_TRAS_429_MS);
    return tmdbFetch(path, params, intento + 1);
  }

  if (!res.ok) {
    const err = new Error(`TMDb respondió ${res.status} en ${path}: ${await res.text()}`);
    /**
     * El código viaja en el error para que quien lo atrape pueda distinguir
     * "ese título no existe" (404) de "TMDb se cayó" (5xx). Sin esto, pedir
     * la ficha de un id inventado terminaba en un 500 y el visitante leía
     * "algo falló de nuestro lado" por una dirección mal escrita.
     */
    err.estado = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Caché corto + fusión de pedidos en vuelo para /discover (ver
 * utils/cacheCorta.js). 4.9.1 documentaba que el discover "nunca
 * se cachea": dejó de ser cierto el 2026-09-02. Dos minutos alcanza para que
 * las corridas de "Priorizar preferencias" (4.20), que piden
 * especificaciones casi idénticas entre sí a milisegundos de distancia, se
 * aprovechen entre ellas sin arriesgar resultados viejos — el catálogo de
 * TMDb no se mueve de forma perceptible en ese lapso.
 */
const CACHE_DISCOVER_MS = 120_000;
const cacheDiscover = memorizarCorto(CACHE_DISCOVER_MS);

/**
 * Caché corto para el detalle por candidato. Es DISTINTO del caché de Neon
 * (`titulos.detalle`, con ventana de horas, ver 4.13): este es
 * nada más que un puente de segundos para cuando varias corridas paralelas
 * (de nuevo, "Priorizar preferencias") piden el detalle del mismo candidato
 * nunca visto antes de que ninguna llegue a escribirlo en la base — sin
 * esto, cada una le pide lo mismo a TMDb por su cuenta.
 */
const CACHE_DETALLE_MS = 30_000;
const cacheDetalleTmdb = memorizarCorto(CACHE_DETALLE_MS);

/**
 * LA CADENA DE IDIOMA DE LOS TEXTOS, y por qué hace falta una nuestra.
 *
 * Todo lo que pedimos va con `language=es-ES`, y TMDb **no tiene ninguna noción
 * de cadena de respaldo**: si no hay traducción a ese idioma exacto, no cae al
 * español de otro país ni al inglés, devuelve el texto original. Para el título
 * eso significa el nombre en su alfabeto original: la película 564177 llega como
 * "Njan Prakashan" en malayalam, con póster y 53 votos, o sea que pasa el piso de
 * `esRecomendable` y se muestra en la grilla. Eran 227 de 6404 títulos del caché.
 *
 * Y hay un segundo problema, más frecuente y menos visible: **`es-ES` es el
 * español de España**, así que Marley & Me llega como "Una pareja de tres"
 * cuando en México se llama "Marley y Yo", y hay títulos cuya sinopsis existe en
 * es-MX y está vacía en es-ES.
 *
 * Por eso el orden lo elegimos nosotros, con `append_to_response=translations`,
 * que trae todas las traducciones **en la misma llamada**: español
 * latinoamericano, después España, después inglés, y por último lo que haya
 * venido. Medido: el payload sube de 146 a 176 kB en un título muy traducido y
 * de 13 a 14 kB en uno oscuro, y como `guardarDetalle` almacena lo que devuelve
 * `obtenerDetalle` (ya normalizado, no la respuesta cruda), se paga una sola vez
 * por título. Un segundo pedido a `/translations` costaría lo mismo en bytes más
 * un viaje de ida y vuelta.
 *
 * **LA CADENA SE RECORRE CAMPO POR CAMPO, NO TRADUCCIÓN POR TRADUCCIÓN**, y esto
 * es lo que hay que entender antes de tocarla: una traducción puede existir con
 * el campo vacío. Juego de tronos tiene es-MX con `name: ""` y una sinopsis de
 * 270 caracteres, y es-ES con el nombre completo. Eligiendo "la mejor
 * traducción" y usándola entera, la serie se quedaría sin título.
 *
 * **En TMDb el español son solo dos países.** Medido sobre 60 títulos del caché:
 * aparecen MX (29) y ES (27), y ninguno más. No existe `es-AR` ni `es-419`. La
 * lista de países latinoamericanos igual está completa y con Argentina primero,
 * porque no cuesta nada y el día que TMDb sume una traducción argentina la toma
 * sola.
 */
const PAISES_ES_LATINO = [
  'AR', 'MX', '419', 'UY', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'PY',
  'CR', 'DO', 'GT', 'HN', 'NI', 'PA', 'SV', 'PR', 'CU', 'US',
];

/**
 * Devuelve `{ texto, idioma }`, porque **la Ficha necesita saber en qué idioma
 * terminó**: cuando la sinopsis no es en español lo avisa antes de mostrarla
 * (ver `Ficha.jsx`). El idioma es el código ISO 639-1 de la traducción elegida,
 * o null si no hay texto.
 *
 * Después del inglés la cadena sigue con **el idioma original del título y
 * después cualquiera**, que es lo que evita que una ficha quede sin sinopsis
 * habiendo una. El aviso de la Ficha es lo que hace que eso no sea confuso.
 */
function elegirTexto(data, campo) {
  const traducciones = data.translations?.translations ?? [];
  const buscar = (cumple) => traducciones.find((t) => cumple(t) && t.data?.[campo]);

  for (const pais of PAISES_ES_LATINO) {
    const latino = buscar((t) => t.iso_639_1 === 'es' && t.iso_3166_1 === pais);
    if (latino) return { texto: latino.data[campo], idioma: 'es', pais };
  }

  /**
   * **EL TÍTULO ORIGINAL LE GANA AL DE ESPAÑA CUANDO EL ORIGINAL ES ESPAÑOL O
   * INGLÉS**, y solo para el nombre, nunca para la sinopsis.
   *
   * El caso que lo obliga es una vergüenza que estuvo en pantalla: **El
   * Eternauta se mostraba como "The Eternaut"**, y La casa de papel como "Money
   * Heist". Cuando el idioma original es el español, TMDb deja las dos
   * traducciones al español **vacías** (no hay nada que traducir), así que la
   * cadena seguía de largo hasta el inglés. Lo mismo le pasaba a Relatos
   * salvajes ("Wild Tales"), Amores perros y Culpa nuestra ("Our Fault").
   *
   * La otra mitad de la regla es de uso local: cuando el original es inglés y no
   * hay traducción latinoamericana, en Argentina se usa el nombre en inglés y no
   * el de España. Monsters, Inc. es el caso testigo (su es-MX existe pero con el
   * título vacío, así que caía a "Monstruos, S.A."), y con la regla también
   * quedan bien Hawkeye, Vikings e I Am Not Your Negro.
   *
   * **Solo se aplica a esos dos idiomas, y es a propósito**: para una película
   * francesa o coreana el original no se puede leer o no se usa acá, así que ahí
   * el de España sigue ganando (Intouchables se muestra "Amigos Intocables", y
   * 기생충 "Parásitos"). Medido sobre 160 títulos populares: cambian 6, o sea el
   * 3,8%, y de esos cuatro son correcciones claras. El riesgo asumido es el caso
   * inverso, un título inglés cuyo nombre de España sí se use acá y que no tenga
   * entrada latinoamericana en TMDb; en la muestra no apareció ninguno.
   */
  const original = data.original_title ?? data.original_name;
  const esNombre = campo === 'title' || campo === 'name';
  if (esNombre && original && (data.original_language === 'es' || data.original_language === 'en')) {
    return { texto: original, idioma: data.original_language, pais: null };
  }

  const elegido =
    buscar((t) => t.iso_639_1 === 'es' && t.iso_3166_1 === 'ES') ??
    buscar((t) => t.iso_639_1 === 'es') ??
    buscar((t) => t.iso_639_1 === 'en' && t.iso_3166_1 === 'US') ??
    buscar((t) => t.iso_639_1 === 'en') ??
    buscar((t) => t.iso_639_1 === data.original_language);
  if (elegido) return { texto: elegido.data[campo], idioma: elegido.iso_639_1, pais: elegido.iso_3166_1 ?? null };

  /**
   * **ESTE PASO VA ANTES DEL COMODÍN Y NO DESPUÉS**, que es el orden que parece
   * natural y está mal. Es lo que devolvió `language=es-ES`, o sea la traducción
   * al español si existe y el texto ORIGINAL si no. Medido el 2026-08-29 con
   * Avatar: sus traducciones al español y al inglés tienen el `title` **vacío**,
   * porque coincide con el original, así que la cadena entera se caía hasta el
   * comodín de abajo y elegía la primera traducción con texto de toda la lista,
   * que resultó ser la alemana: "Avatar - Aufbruch nach Pandora". Acá `data`
   * dice "Avatar", que es lo correcto.
   */
  const crudo = data[campo] || null;
  if (crudo) return { texto: crudo, idioma: data.original_language ?? null, pais: null };

  /**
   * Comodín, y solo cuando no hay ni traducción ni texto propio. En la práctica
   * lo usa la sinopsis (que TMDb devuelve vacía cuando no hay traducción) y casi
   * nunca el título. La Ficha avisa cuando el idioma no es español.
   */
  const cualquiera = buscar(() => true);
  return cualquiera
    ? { texto: cualquiera.data[campo], idioma: cualquiera.iso_639_1, pais: cualquiera.iso_3166_1 ?? null }
    : { texto: null, idioma: null, pais: null };
}

function textoTraducido(data, campo) {
  return elegirTexto(data, campo).texto;
}

/** Los dos campos que la Ficha necesita de la sinopsis, en una sola pieza. */
function sinopsisConIdioma(data) {
  const { texto, idioma } = elegirTexto(data, 'overview');
  return { sinopsis: texto, sinopsisIdioma: texto ? idioma : null };
}

/**
 * EL PÓSTER TIENE QUE SEGUIR AL TÍTULO, y por eso lo decide la misma elección.
 *
 * `poster_path` es la portada que TMDb eligió para el idioma que le pedimos, o
 * sea es-ES, así que la imagen venía con el título de España **aunque arriba
 * mostráramos el latinoamericano**: "Las ventajas de ser invisible" con un
 * póster que dice "Las ventajas de ser un marginado" (es el caso que lo
 * destapó, verificado el 2026-08-30). Es el mismo problema que la cadena de
 * textos ya resolvía, en la otra mitad de la ficha, y por eso no se resuelve
 * aparte: el póster usa la decisión que ganó el título, así que **no se pueden
 * desincronizar**.
 *
 * Lo que lo hace posible es que **cada imagen trae `iso_3166_1` además de
 * `iso_639_1`**, aunque la documentación solo nombre el idioma. Viaja en el
 * mismo `append_to_response` que las traducciones, con
 * `include_image_language=es,en`, o sea **sin una llamada extra**: medido, el
 * payload sube de 175 a 190 kB promedio (+9%) y el tiempo no cambia (50
 * detalles tardan lo mismo con y sin `images`). Como `guardarDetalle` almacena
 * lo ya normalizado y no la respuesta cruda, la base no crece.
 *
 * **NO SE ORDENAN LAS IMÁGENES, SE TOMA LA PRIMERA QUE COINCIDE**, y es lo que
 * hay que respetar antes de intentar mejorarlo: TMDb devuelve la lista en su
 * propio ranking, y `poster_path` es el primero de esa lista que habla el
 * idioma pedido. Verificado sobre 15 títulos: "el primero del array" coincide
 * con lo que elige TMDb en 38 de 39 casos (español, es-MX e inglés). Rankear
 * por `vote_average` parece lo obvio y da peor: en Las ventajas hay un póster
 * inglés con 5 votos y 10,00 de promedio que TMDb deja abajo de otro con 21
 * votos y 4,57.
 *
 * **LOS BACKDROPS NO SE TOCAN**, y no es un olvido: TMDb ya devuelve el mismo
 * para es-ES y es-MX en los cinco títulos medidos, porque los de fondo casi
 * nunca llevan texto (de los 129 de El padrino, 31 tienen idioma). Para poder
 * elegirlos habría que incluir los de idioma `null`, que son la mayoría, y eso
 * cuesta otro 8% de payload para arreglar algo que no está roto.
 *
 * Si no hay ninguna imagen del idioma que ganó, queda `poster_path`, o sea
 * exactamente lo que se mostraba hasta ahora. Medido sobre 100 títulos del
 * caché: cambia el 47% y **ninguno se queda sin póster**, que es lo que lo
 * sacaría de los resultados por `esRecomendable`.
 */
const IDIOMAS_DE_IMAGEN = 'es,en';

function paisesDePoster({ idioma, pais }) {
  /**
   * Medido sobre 5680 pósters de 50 títulos: los únicos pares que existen son
   * en-US (4973), es-ES (589) y es-MX (118), y ninguna imagen viene sin país.
   * La lista latinoamericana completa va igual, por el mismo motivo que en los
   * textos: no cuesta nada y toma sola una traducción argentina el día que
   * TMDb la tenga.
   */
  if (idioma === 'es') return pais === 'ES' ? ['ES'] : [pais, ...PAISES_ES_LATINO].filter(Boolean);
  if (idioma === 'en') return [pais, 'US'].filter(Boolean);
  return pais ? [pais] : [];
}

function elegirPoster(data, decision) {
  const posters = data.images?.posters ?? [];
  const porDefecto = data.poster_path ?? null;
  if (!posters.length || !decision.idioma) return porDefecto;

  const enElIdioma = (p) => p.iso_639_1 === decision.idioma;
  for (const pais of paisesDePoster(decision)) {
    const delPais = posters.find((p) => enElIdioma(p) && p.iso_3166_1 === pais);
    if (delPais) return delPais.file_path;
  }
  return posters.find(enElIdioma)?.file_path ?? porDefecto;
}

/**
 * CORRECCIONES PUNTUALES DE TÍTULO, por id de TMDb y no por texto (para no
 * confundir dos títulos distintos con el mismo nombre).
 *
 * La cadena de `elegirTexto` no es una heurística rota: "Cómo conocí a tu
 * madre", "La Teoría del Big Bang" y "Los Simpson" SON las traducciones
 * es-MX correctas, las que se usan acá, y reordenar la cadena para preferir
 * el inglés rompería esos casos. El problema es más angosto que eso: son
 * traducciones puntuales de la comunidad de TMDb que no reflejan cómo se
 * conoce el título en Argentina, y eso no se puede detectar en código.
 *
 * The Office (US) es el primer caso, medido el 2026-09-01: TMDb trae "La
 * Oficina" en es-MX, no vacía, así que gana el primer paso de la cadena
 * antes de llegar a la regla que preferiría el original en inglés (esa regla
 * solo corre cuando es-MX/es-ES vienen vacíos, ver el comentario de
 * `elegirTexto`). Acá se conoce por su nombre en inglés.
 *
 * **EL CRITERIO PARA JUZGAR UN CASO NUEVO ES ARGENTINA, NO "LATINOAMÉRICA",
 * Y SON COSAS DISTINTAS.** El nombre "oficial" de doblaje/streaming para toda
 * la región (el que traen Doblaje Wiki o la página de Prime Video) puede
 * existir y ser real y aun así no ser como se lo nombra acá. Se midió esto
 * al agregar Chicago Fire, Chicago P.D. y Suits: los tres tienen doblaje y
 * título "de Latinoamérica" (Chicago en llamas, Policías de Chicago, La Ley
 * de los Audaces), pero Infobae — medio argentino — los nombra en inglés de
 * forma consistente en su cobertura. Antes de esa corrección se había
 * descartado agregarlos por error, verificando solo contra el nombre
 * regional. La señal que sirve es cómo los nombra la prensa/el uso
 * argentino, no el catálogo de doblaje.
 *
 * El póster va con la misma corrección y no solo el texto, por la regla de
 * 4.27.1: no pueden desincronizarse. Medido: hay pósters en inglés de buena
 * calidad contra cero o un solo póster es-MX en los cuatro casos de acá
 * abajo, así que corregir el idioma de la decisión también mejora la
 * portada.
 */
const CORRECCIONES_TITULO = {
  'tv:2316': { titulo: 'The Office', idioma: 'en', pais: 'US' },
  /**
   * Modern Family: TMDb trae "Una Familia Moderna" en es-MX. Reportado por el
   * usuario el 2026-09-01, mismo patrón que The Office.
   */
  'tv:1421': { titulo: 'Modern Family', idioma: 'en', pais: 'US' },
  /**
   * Chicago Fire y Chicago P.D.: "Chicago en llamas" y "Policías de Chicago"
   * son los nombres reales de doblaje/streaming para Latinoamérica (Universal+,
   * verificados), pero Infobae los nombra en inglés en su cobertura argentina.
   */
  'tv:44006': { titulo: 'Chicago Fire', idioma: 'en', pais: 'US' },
  'tv:58841': { titulo: 'Chicago P.D.', idioma: 'en', pais: 'US' },
  /**
   * Suits: "La Ley de los Audaces" es el título real de Prime Video/streaming
   * en la región, pero Infobae y el uso post-resurgimiento en Netflix (2023)
   * lo nombran en inglés en Argentina.
   */
  'tv:37680': { titulo: 'Suits', idioma: 'en', pais: 'US' },
  /**
   * El resto de este lote salió de repasar los 200 títulos en inglés más
   * populares de TMDb (más un lote de sitcoms) contra `site:infobae.com`, el
   * 2026-09-02. Confirmados por uso consistente en inglés en la cobertura de
   * Infobae, a pesar de tener traducción es-MX real y en uso en la región:
   */
  'tv:1416': { titulo: "Grey's Anatomy", idioma: 'en', pais: 'US' }, // MX: "Anatomía según Grey"
  'tv:4614': { titulo: 'NCIS', idioma: 'en', pais: 'US' }, // MX: "NCIS: Criminología Naval"
  'tv:32692': { titulo: 'Blue Bloods', idioma: 'en', pais: 'US' }, // MX: "Sangre Azul"
  'tv:2122': { titulo: 'King of the Hill', idioma: 'en', pais: 'US' }, // MX: "Los Reyes de la Colina"
  'tv:8592': { titulo: 'Parks and Recreation', idioma: 'en', pais: 'US' }, // MX: "Construyendo un Parque"
  'tv:46952': { titulo: 'The Blacklist', idioma: 'en', pais: 'US' }, // MX: "La lista negra"
  'tv:4057': { titulo: 'Criminal Minds', idioma: 'en', pais: 'US' }, // MX: "Mentes Criminales"
  'tv:18165': { titulo: 'The Vampire Diaries', idioma: 'en', pais: 'US' }, // MX: "Diarios de Vampiros"
  'tv:269': { titulo: 'One Tree Hill', idioma: 'en', pais: 'US' }, // MX: "Hermanos Rebeldes"
  'tv:4586': { titulo: 'Gilmore Girls', idioma: 'en', pais: 'US' }, // MX: "Las Chicas Gilmore"
  'tv:2691': { titulo: 'Two and a Half Men', idioma: 'en', pais: 'US' }, // MX: "Dos Hombres y Medio"
  'tv:693': { titulo: 'Desperate Housewives', idioma: 'en', pais: 'US' }, // MX: "Esposas Desesperadas"
  'tv:1435': { titulo: 'The Good Wife', idioma: 'en', pais: 'US' }, // MX: "La esposa ejemplar"
  // "24": la cadena elegía "24 Horas" (es-MX). Infobae siempre dice solo "24".
  'tv:1973': { titulo: '24', idioma: 'en', pais: 'US' },
  /**
   * The Flash: la cadena elegía "Flash" (es-MX, sin artículo). Infobae dice
   * siempre "The Flash".
   */
  'tv:60735': { titulo: 'The Flash', idioma: 'en', pais: 'US' },
};

function corregirNombre(tipo, tmdbId, nombre) {
  const correccion = CORRECCIONES_TITULO[`${tipo}:${tmdbId}`];
  if (!correccion) return nombre;
  return { texto: correccion.titulo, idioma: correccion.idioma, pais: correccion.pais };
}


/**
 * El último tramo de la cadena para `/search/multi`, que **no acepta
 * `append_to_response`**. Los dos primeros (latino y España) los resuelve
 * `buscarTitulo` pidiendo la lista dos veces, que cuesta una llamada por
 * búsqueda; este cuesta una por título, así que se usa solo cuando hace falta de
 * verdad: cuando el nombre sigue viniendo en otro alfabeto, o sea que no hay
 * ninguna traducción al español y hay que ir a buscar la inglesa.
 */
async function tituloDesdeTraducciones(titulo, ruta) {
  if (!NO_LATINO.test(titulo ?? '')) return titulo;
  try {
    const data = await tmdbFetch(ruta + '/translations');
    const campo = ruta.startsWith('/movie/') ? 'title' : 'name';
    return textoTraducido({ translations: data, [campo]: titulo }, campo);
  } catch {
    // Nunca conviene romper una búsqueda entera por esto.
    return titulo;
  }
}

function normalizarPelicula(r) {
  return {
    tmdb_id: r.id,
    tipo: 'pelicula',
    titulo: r.title,
    anio: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
    vote_count: r.vote_count ?? 0,
    vote_average: r.vote_average ?? null,
    popularity: r.popularity ?? null,
    generos: r.genre_ids ?? [],
    idioma: r.original_language ?? null,
    poster: r.poster_path ?? null,
  };
}

function normalizarSerie(r) {
  return {
    tmdb_id: r.id,
    tipo: 'tv',
    titulo: r.name,
    anio: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : null,
    vote_count: r.vote_count ?? 0,
    vote_average: r.vote_average ?? null,
    popularity: r.popularity ?? null,
    generos: r.genre_ids ?? [],
    idioma: r.original_language ?? null,
    poster: r.poster_path ?? null,
  };
}

/**
 * TMDb: coma = AND, pipe = OR. Género y Keyword se combinan con OR dentro
 * de sí mismos (sección 4), así que siempre usamos "|".
 *
 * `without_genres` es la excepción y va con coma: verificado contra TMDb
 * que excluye un título si tiene CUALQUIERA de los géneros listados, con
 * coma o con pipe indistintamente. Lo usa la Preferencia de Complejidad
 * para exigir pureza de géneros (ver especificacionesDeComplejidad).
 */
function joinConOr(ids) {
  return ids?.length ? ids.join('|') : undefined;
}

/**
 * Sin perfil de usuario en v1 no hay de dónde sacar una región elegible,
 * así que queda fija en Argentina. watch_region es de un solo valor por
 * llamada (confirmado) — no se puede combinar con otras regiones a la vez.
 */
const REGION_PROVEEDORES = 'AR';

/**
 * Tope duro de TMDb, no nuestro: pedir la página 501 devuelve un error
 * explícito ("Pages start at 1 and max at 500"), aunque total_pages diga
 * que hay más. En la práctica significa que una sola consulta de discover
 * alcanza como mucho 10.000 títulos, y para pasar de ahí hay que partir la
 * consulta (el job de agregados la parte por año).
 */
export const PAGINA_MAXIMA_DISCOVER = 500;

/**
 * Piso de votos para TODO discover.
 *
 * No es arbitrario: es el mismo umbral que exige la fórmula de Puntuación
 * (sección 16), así que un título con menos votos ya se muestra como "S/D".
 * O sea que abajo de esto no hay nada que la app pueda puntuar, y sí hay
 * muchísimo ruido: de los 1.400.881 títulos de TMDb, solo 124.329 llegan a
 * los 10 votos.
 *
 * Medido el 2026-08-24, lo que queda con el piso puesto: 806 películas
 * argentinas, 5.444 en español, 2.730 de los años 40, 33.961 comedias. O sea
 * que las búsquedas angostas siguen dando resultados.
 */
/**
 * Exportado para que `calibrarGenero.js` pueda pasarle el mismo piso a
 * `discoverConTotales` (que no lo aplica solo — ver el comentario ahí) y medir
 * lo que un usuario real vería, no el catálogo entero sin filtrar.
 */
export const VOTOS_MINIMOS_DISCOVER = 10;

/**
 * Keywords que se excluyen de toda búsqueda.
 *
 * **Es una sola, y la lista corta es deliberada.** Se evaluaron cinco
 * candidatas contra TMDb el 2026-08-24 y cuatro censuran cine legítimo:
 * `pornography` marca Taxi Driver y The Deuce (películas SOBRE la
 * pornografía), `adult animation` marca Princess Mononoke y La tumba de las
 * luciérnagas, `softcore` marca Nymphomaniac, y `ecchi` marca anime
 * mainstream tipo Fairy Tail. Ninguna discrimina lo que se quiere sacar.
 *
 * `hentai` es la única específica: 31 títulos en todo TMDb. El costo asumido
 * son dos o tres películas de autor japonesas que la llevan mal etiquetada,
 * entre ellas Belladonna of Sadness (1973).
 *
 * Ojo: esto NO es lo que mantiene la categoría abajo. Lo que de verdad
 * funciona es el piso de votos de arriba más pedir por vote_count.desc en las
 * ramas angostas, porque ese contenido vive de popularidad inflada y pocos
 * votos. La lista negra es un complemento, no la defensa.
 */
const KEYWORDS_EXCLUIDAS = [198385]; // hentai

/**
 * La lista negra global más el veto propio de quien llama.
 *
 * `sinKeywords` lo usa hoy el estado de ánimo "Quiero llorar" (ver
 * data/estadosAnimo.js): hay keywords que sobreviven a cualquier filtro de
 * género porque el título ES un drama, y la única forma de sacarlas es por
 * keyword. Medido el 2026-08-29: vetar `superhero` en las series de
 * "loss of loved one" + Drama saca Bruja Escarlata y Visión (15 a 14
 * resultados) y en las películas de "grief" + Drama no cuesta un solo título
 * (217 a 217). Eso es lo que la exclusión por género no puede hacer: los
 * géneros que traen a los intrusos (Bélica, Comedia, Fantasía) son también
 * los de La lista de Schindler, La vida es bella y After Life.
 */
function keywordsVetadas(sinKeywords) {
  return [...KEYWORDS_EXCLUIDAS, ...(sinKeywords ?? [])].join(',');
}

/**
 * GET /discover/movie — una página (hasta 20 resultados).
 * `anio` acepta { exacto } o { desde, hasta } (década / antes-después ya
 * resueltos a un rango antes de llegar acá). No implementa todavía
 * selección de varios años sueltos no contiguos (ver nota en la respuesta).
 * `actores`/`directores`: SOLO existen acá — TMDb no soporta with_cast ni
 * with_crew en discover/tv (confirmado, no es una omisión mía).
 */

export async function discoverPeliculas(opciones) {
  const { page, sortBy, generos, sinGeneros, keywords, sinKeywords, idiomas, pais, plataformas, actores, directores, anio, releaseDateLte, voteCountGte } = opciones;
  const clave = `pelicula:${claveEstable(opciones)}`;
  return cacheDiscover(clave, async () => {
    const data = await tmdbFetch('/discover/movie', {
      page,
      sort_by: sortBy,
      with_genres: joinConOr(generos),
      without_genres: sinGeneros?.length ? sinGeneros.join(',') : undefined,
      with_keywords: joinConOr(keywords),
      with_original_language: joinConOr(idiomas),
      with_origin_country: pais,
      with_watch_providers: joinConOr(plataformas),
      watch_region: plataformas?.length ? REGION_PROVEEDORES : undefined,
      with_cast: joinConOr(actores),
      with_crew: joinConOr(directores),
      primary_release_year: anio?.exacto,
      'primary_release_date.gte': anio?.desde ? `${anio.desde}-01-01` : undefined,
      'primary_release_date.lte': releaseDateLte ?? (anio?.hasta ? `${anio.hasta}-12-31` : undefined),
      'vote_count.gte': Math.max(VOTOS_MINIMOS_DISCOVER, voteCountGte ?? 0),
      without_keywords: keywordsVetadas(sinKeywords),
    });
    return data.results.map(normalizarPelicula);
  });
}

/** GET /discover/tv — una página (hasta 20 resultados). Mismas reglas de `anio` que discoverPeliculas. */
export async function discoverSeries(opciones) {
  const { page, sortBy, generos, sinGeneros, keywords, sinKeywords, idiomas, pais, plataformas, anio, airDateLte, voteCountGte, conTipo } = opciones;
  const clave = `tv:${claveEstable(opciones)}`;
  return cacheDiscover(clave, async () => {
    const data = await tmdbFetch('/discover/tv', {
      page,
      sort_by: sortBy,
      with_genres: joinConOr(generos),
      without_genres: sinGeneros?.length ? sinGeneros.join(',') : undefined,
      with_keywords: joinConOr(keywords),
      with_original_language: joinConOr(idiomas),
      with_origin_country: pais,
      with_watch_providers: joinConOr(plataformas),
      watch_region: plataformas?.length ? REGION_PROVEEDORES : undefined,
      first_air_date_year: anio?.exacto,
      'first_air_date.gte': anio?.desde ? `${anio.desde}-01-01` : undefined,
      'first_air_date.lte': airDateLte ?? (anio?.hasta ? `${anio.hasta}-12-31` : undefined),
      'vote_count.gte': Math.max(VOTOS_MINIMOS_DISCOVER, voteCountGte ?? 0),
      without_keywords: keywordsVetadas(sinKeywords),
      with_type: conTipo,
    });
    return data.results.map(normalizarSerie);
  });
}

/**
 * Discover que además devuelve los totales, que las dos funciones de arriba
 * descartan.
 *
 * Lo usa el job de agregados, que necesita `totalResultados` por dos
 * motivos: para ponderar cada tramo del catálogo según cuántos títulos
 * tiene, y para saber hasta qué página tiene sentido pedir. Las búsquedas
 * normales no lo necesitan, por eso no se cambió la firma de las otras dos.
 *
 * `tipo` es 'pelicula' | 'tv'; el resto de los parámetros son los mismos.
 */
/**
 * Ojo: esta NO aplica el piso de VOTOS_MINIMOS_DISCOVER ni la lista negra de
 * keywords por su cuenta, y es a propósito: el llamador decide (`voteCountGte`
 * queda en `undefined` si no se pasa). El recálculo de agregados depende de
 * ese comportamiento: muestrea el catálogo COMPLETO para estimar C, y
 * filtrar por votos ahí lo inflaría (sección 4.9.2 del las notas de decisiones del proyecto).
 *
 * `generos`/`sinGeneros`/`keywords` se sumaron para `calibrarGenero.js`
 * (medición de qué tan relevante es un género respecto de otro dentro del
 * catálogo real de TMDb, ver el comentario al principio de ese script), que sí
 * necesita filtrar y sí quiere pasar su propio `voteCountGte`. Con `tipo` y
 * nada más, el comportamiento es idéntico al de antes de este cambio.
 */
export async function discoverConTotales({ tipo, ...parametros }) {
  const esPelicula = tipo === 'pelicula';
  const data = await tmdbFetch(esPelicula ? '/discover/movie' : '/discover/tv', {
    page: parametros.page,
    sort_by: parametros.sortBy,
    /**
     * `generos` es OR (coma en TMDb es AND, `|` es OR — mismo `with_genres`
     * que usan discoverPeliculas/discoverSeries, para que un candidato con
     * varios géneros marcados en Preferencias se comporte igual acá).
     * `generosTodos` es la excepción: AND real, sin pasar por `joinConOr`,
     * porque `calibrarGenero.js` necesita medir la intersección exacta de dos
     * géneros (cuántos títulos son G Y H a la vez), no la unión.
     */
    with_genres: parametros.generosTodos?.length
      ? parametros.generosTodos.join(',')
      : joinConOr(parametros.generos),
    without_genres: parametros.sinGeneros?.length ? parametros.sinGeneros.join(',') : undefined,
    with_keywords: joinConOr(parametros.keywords),
    'vote_count.gte': parametros.voteCountGte,
    ...(esPelicula
      ? {
          primary_release_year: parametros.anioExacto,
          'primary_release_date.lte': parametros.fechaLte,
        }
      : {
          first_air_date_year: parametros.anioExacto,
          'first_air_date.lte': parametros.fechaLte,
        }),
  });

  return {
    resultados: (data.results ?? []).map(esPelicula ? normalizarPelicula : normalizarSerie),
    totalResultados: data.total_results ?? 0,
    /**
     * TMDb no sirve más allá de la 500 aunque diga tener más (devuelve un
     * error explícito), así que se recorta acá y no en cada llamador.
     */
    totalPaginas: Math.min(data.total_pages ?? 0, PAGINA_MAXIMA_DISCOVER),
  };
}

/**
 * Keywords de un título puntual. OJO: el endpoint de película y el de
 * serie devuelven la lista bajo una key distinta ("keywords" vs "results").
 * La sigue usando el seed (que no necesita duración/temporadas/certificaciones).
 */
export async function obtenerKeywords(tmdbId, tipo) {
  if (tipo === 'pelicula') {
    const data = await tmdbFetch(`/movie/${tmdbId}/keywords`);
    return (data.keywords ?? []).map((k) => k.name);
  }
  const data = await tmdbFetch(`/tv/${tmdbId}/keywords`);
  return (data.results ?? []).map((k) => k.name);
}

/**
 * Resuelve el nombre de una keyword (en inglés, como las usa TMDb) a su ID
 * numérico — necesario porque discover recibe with_keywords por ID, no por
 * nombre. Usa el primer resultado de la búsqueda; no hay mucho margen de
 * ambigüedad para keywords puntuales como "suspense" o "tearjerker".
 */
export async function buscarIdKeyword(nombre) {
  const data = await tmdbFetch('/search/keyword', { query: nombre });
  const buscado = nombre.trim().toLowerCase();

  /**
   * EXIGE COINCIDENCIA EXACTA, y devuelve null si no la hay. Antes se tomaba
   * `results[0]` a ciegas, y /search/keyword hace matcheo parcial, así que el
   * primero muchas veces es otra cosa. Auditadas las 18 keywords del proyecto
   * el 2026-08-24, cuatro estaban mal resueltas y dos eran graves:
   *
   *   "horror"    -> devolvía "b-horror"        (un subgénero marginal)
   *   "feel-good" -> devolvía "feel good music" (la rama de "relajar" venía
   *                                              buscando MÚSICA)
   *   "car chase" -> devolvía "car crash"       (choques en vez de persecuciones)
   *   "feel-good comedy" -> no existe
   *
   * Con un nombre que no existe, null y la rama no se pide: es mejor no
   * agregar una keyword que agregar la equivocada, porque lo segundo trae
   * resultados que parecen buenos y no lo son.
   */
  return data.results?.find((k) => k.name?.trim().toLowerCase() === buscado)?.id ?? null;
}

/**
 * Caché en memoria del proceso para los IDs de keyword. Los nombres son fijos
 * (salen de data/keywords.js y data/estadosAnimo.js, o de las keywords de un
 * título, nunca de lo que escribe el usuario), así que no tiene sentido
 * volver a pedírselos a TMDb en cada búsqueda. Se pierde al reiniciar y no
 * hace falta persistirla.
 */
const cacheIdsDeKeyword = new Map();

/**
 * Resuelve varios nombres de keyword a sus IDs, salteando los que no existen.
 *
 * **Estaba duplicada en tres lugares** (el motor, los estados de ánimo y el
 * cruce de tipo), cada uno con su propia caché, así que el mismo nombre se le
 * pedía a TMDb hasta tres veces. Vive acá, al lado de `buscarIdKeyword`, que es
 * lo único que necesita.
 *
 * **VA EN PARALELO Y ANTES IBA EN SERIE**, que no es un detalle: resolver las
 * cuatro keywords de un título tardaba 750 ms en fila, y es lo que hacía que el
 * cruce de tipo le sumara segundo y medio a la búsqueda. Las ramas de
 * Complejidad resuelven hasta 22, así que ahí el ahorro es mayor todavía.
 * `Promise.all` conserva el orden, y los nulos se filtran después igual.
 */
export async function resolverIdsDeKeywords(nombres = []) {
  const pendientes = [...new Set(nombres)].filter((n) => !cacheIdsDeKeyword.has(n));
  await Promise.all(
    pendientes.map(async (nombre) => {
      const id = await buscarIdKeyword(nombre).catch((err) => {
        console.warn(`No se pudo resolver la keyword "${nombre}": ${err.message}`);
        return null;
      });
      cacheIdsDeKeyword.set(nombre, id);
    })
  );
  return nombres.map((n) => cacheIdsDeKeyword.get(n)).filter(Boolean);
}

/**
 * GET /movie|tv/{id}/recommendations — la "lista de similares" de la sección
 * 16, que alimenta "Parecido a", los similares de la Ficha y el bloque
 * "Porque te gustaron" de la búsqueda con formulario vacío.
 *
 * **ES `/recommendations` Y NO `/similar`, Y ESA ES LA DECISIÓN QUE IMPORTA**
 * (2026-08-30). Las dos rutas devuelven exactamente los mismos campos, así que
 * son intercambiables en el código, pero **no miden lo mismo**: `/similar`
 * cruza géneros y keywords, mientras que `/recommendations` sale del
 * comportamiento de la gente. El Definitivo pide "el endpoint correspondiente
 * de TMDb" sin nombrar cuál, así que esto no es apartarse de la especificación.
 *
 * El caso que lo destapó: una cuenta con **The Walking Dead** como única
 * favorita recibía Iyanu, Thunderstone, Jeremiah, The Last Train y Garth
 * Marenghi's Darkplace. Con `/recommendations` recibe Fear the Walking Dead,
 * Z Nation, Black Summer, Falling Skies, Van Helsing y Fallout.
 *
 * Medido sobre 50 títulos (mitad muy vistos, mitad de cola larga):
 *
 * | | /similar | /recommendations |
 * |---|---|---|
 * | mediana de votos de lo que trae | 23 | **1418** |
 * | de 20 resultados, cuántos pasan el piso de 10 votos | 10,4 | **20** |
 * | títulos sin ningún resultado | 1 | **0** |
 *
 * O sea que `/similar` gastaba **la mitad** de cada página en títulos que
 * `esRecomendable` iba a descartar igual, y de lo que sobrevivía, la mitad
 * eran series de una o dos temporadas con 15 votos. No era un problema de
 * nuestro filtrado: la fuente traía ruido.
 *
 * **LA PROFUNDIDAD ALCANZA, que era la única duda razonable.** `/similar`
 * reporta cifras enormes (331.254 resultados para El padrino) y esa
 * profundidad es de lo que se agarra "Parecido a" cuando la primera página no
 * deja suficientes candidatos que cumplan las Preferencias. `/recommendations`
 * devuelve mucho menos, pero **sigue siendo de sobra para las 5 páginas que
 * como mucho se piden**: medido sobre 40 títulos, la mediana es de 579
 * resultados y el más flaco tiene 63 (4 páginas). Sobre 40 títulos de cola
 * larga (10 a 40 votos), ninguno se quedó sin recomendaciones.
 *
 * `page` existe por eso mismo, y la lista va bajando en afinidad a medida que
 * avanza.
 */
export async function obtenerSimilares(tmdbId, tipo, page = 1) {
  if (tipo === 'pelicula') {
    const data = await tmdbFetch(`/movie/${tmdbId}/recommendations`, { page });
    return data.results.map(normalizarPelicula);
  }
  const data = await tmdbFetch(`/tv/${tmdbId}/recommendations`, { page });
  return data.results.map(normalizarSerie);
}

/**
 * Búsqueda por texto (no discover): para encontrar el tmdb_id de un título
 * de referencia por nombre, ej. para armar una búsqueda de "Parecido a".
 * Usa /search/multi y descarta resultados de tipo "person".
 */
export async function buscarTitulo(query) {
  /**
   * **DOS BÚSQUEDAS EN PARALELO, Y NO UNA.** `/search/multi` no acepta
   * `append_to_response`, así que la cadena de idioma que usa el detalle (ver
   * textoTraducido) acá no se puede hacer en la misma llamada. Pero sí se puede
   * pedir la lista entera dos veces, en es-MX y en es-ES, y elegir por
   * resultado: es **una** llamada extra por búsqueda, no una por título.
   *
   * Medido: cinco búsquedas tardan 842 ms de a una y 895 ms de a dos, o sea
   * +11 ms cada una, porque las dos van en paralelo.
   *
   * **Cómo se sabe si TMDb tradujo o no**, que es la parte que no es obvia:
   * cuando no hay traducción al idioma pedido, TMDb **no devuelve vacío,
   * devuelve el título original**. Así que "hay traducción mexicana" se
   * reconoce comparando contra `original_title`. Si son iguales, se prueba con
   * el de España, y si ese también coincide, es que no hay ninguna.
   *
   * Se evaluó y se descartó resolverlo con nuestro propio caché de títulos, que
   * ya tiene el nombre bien elegido y saldría gratis: **la cobertura es muy
   * baja** porque un buscador se usa justamente para lo que todavía no se vio.
   * Medido: 0 de 13 resultados de "marley", 3 de 16 de "padrino" y 2 de 20 de
   * "batman" estaban en el caché.
   */
  const [latino, espana] = await Promise.all([
    tmdbFetch('/search/multi', { query, language: 'es-MX' }),
    tmdbFetch('/search/multi', { query }),
  ]);

  const clave = (r) => `${r.media_type}:${r.id}`;
  const porClave = new Map((espana.results ?? []).map((r) => [clave(r), r]));
  const encontrados = (latino.results ?? [])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => {
      const normalizado = r.media_type === 'movie' ? normalizarPelicula(r) : normalizarSerie(r);
      const original = r.original_title ?? r.original_name;
      const deEspana = porClave.get(clave(r));
      const titulo = deEspana?.title ?? deEspana?.name;
      /**
       * `titulo === original` significa que no hay traducción latinoamericana:
       * TMDb devuelve el original cuando no tiene el idioma pedido. Ahí manda la
       * misma regla que en el detalle (ver elegirTexto): si el original es
       * español o inglés se queda, y si no, gana el de España. Sin esta segunda
       * condición el buscador decía "Monstruos, S.A." y "Juego de tronos"
       * mientras la grilla decía "Monsters, Inc." y "Game of Thrones".
       */
      const prefiereOriginal = r.original_language === 'es' || r.original_language === 'en';
      if (!prefiereOriginal && normalizado.titulo === original && titulo && titulo !== original) {
        normalizado.titulo = titulo;
      }
      normalizado.titulo = corregirNombre(normalizado.tipo, normalizado.tmdb_id, { texto: normalizado.titulo }).texto;
      return normalizado;
    });

  /**
   * Y para los que no tienen ninguna traducción al español queda el último paso
   * de la cadena, que sí necesita un pedido por título: es el buscador con el
   * que se agrega algo a una lista o se elige una referencia de "Parecido a",
   * así que alguien puede escribir "Njan Prakashan" en inglés, que TMDb
   * encuentra, y recibir una fila en malayalam. Son cero o una por búsqueda.
   */
  await Promise.all(
    encontrados.map(async (r) => {
      const ruta = r.tipo === 'pelicula' ? `/movie/${r.tmdb_id}` : `/tv/${r.tmdb_id}`;
      r.titulo = await tituloDesdeTraducciones(r.titulo, ruta);
    })
  );
  return encontrados;
}

/** GET /search/person — autocompletado para Actor/Director (sección 6). */
export async function buscarPersona(query) {
  const data = await tmdbFetch('/search/person', { query });
  return (data.results ?? []).map((p) => ({
    id: p.id,
    nombre: p.name,
    departamentoConocido: p.known_for_department ?? null,
    foto: p.profile_path,
  }));
}

function certificacionesDesdeReleaseDates(data) {
  const mapa = {};
  for (const r of data.release_dates?.results ?? []) {
    const conCertificacion = r.release_dates.find((rd) => rd.certification);
    if (conCertificacion) mapa[r.iso_3166_1] = conCertificacion.certification;
  }
  return mapa;
}

function certificacionesDesdeContentRatings(data) {
  const mapa = {};
  for (const r of data.content_ratings?.results ?? []) {
    if (r.rating) mapa[r.iso_3166_1] = r.rating;
  }
  return mapa;
}

/**
 * IDs de las personas de un título, para poder filtrar por Actor/Director
 * sobre resultados ya obtenidos (sección 7). Se guardan **solo los IDs**,
 * no los nombres: el filtro compara contra lo que elige el autocompletado,
 * que ya trabaja con IDs, y así el caché de detalle crece unos 570 bytes
 * por título en vez de arrastrar el reparto entero.
 *
 * Traerlos no cuesta una llamada extra: `credits` viaja en el mismo
 * append_to_response que el resto del detalle. Lo único que crece es el
 * payload (medido: de 96 kB a 146 kB en El padrino).
 *
 * Para series se usa `created_by` en vez de filtrar el crew por "Director",
 * por el mismo motivo que en obtenerFicha(): TMDb no completa ese dato de
 * forma confiable a nivel serie, es más un concepto por episodio.
 */
function idsDeReparto(data) {
  const esSerie = Array.isArray(data.created_by);
  return {
    actores: (data.credits?.cast ?? []).map((p) => p.id),
    directores: esSerie
      ? (data.created_by ?? []).map((p) => p.id)
      : (data.credits?.crew ?? []).filter((p) => p.job === 'Director').map((p) => p.id),
  };
}

const CATEGORIAS_DISPONIBILIDAD = ['flatrate', 'rent', 'buy', 'free', 'ads'];

/** IDs de proveedor planos (cualquier categoría), para filtrar candidatos. */
function plataformasPlanas(data) {
  const porRegion = data['watch/providers']?.results?.[REGION_PROVEEDORES];
  if (!porRegion) return [];
  const ids = new Set();
  for (const categoria of CATEGORIAS_DISPONIBILIDAD) {
    for (const p of porRegion[categoria] ?? []) ids.add(p.provider_id);
  }
  return [...ids];
}

/**
 * Desglose con nombre/logo por categoría, para mostrar en la Ficha de Título.
 *
 * `enlace` es la página de "dónde verla" que arma TMDb con datos de
 * JustWatch, que lista cada plataforma con su link real al título dentro de
 * esa plataforma. La Ficha lo usa en un enlace de texto ("Ver dónde verla,
 * con precios"), no en los logos: **TMDb no da un link por plataforma**, así
 * que enlazar el logo de Netflix llevaría a TMDb, que no es lo que ese logo
 * promete.
 *
 * Conviene saberlo antes de intentar hacerlo mejor: cada proveedor viene con
 * id, nombre, logo y prioridad, y nada más (verificado contra la API el
 * 2026-08-22). Un link directo a "El padrino dentro de Netflix" existe del
 * lado de JustWatch, cuya API es paga. La alternativa casera sería armar URLs
 * de búsqueda por plataforma a mano, que se rompen en silencio cuando
 * cualquiera de ellas cambia su formato y dejan al usuario en una búsqueda
 * vacía.
 *
 * El enlace además cumple con los términos de uso de este endpoint, que piden
 * atribuir la fuente a JustWatch.
 */
function plataformasDetalladas(data) {
  const porRegion = data['watch/providers']?.results?.[REGION_PROVEEDORES];
  if (!porRegion) return { suscripcion: [], alquiler: [], compra: [], enlace: null };
  const mapear = (lista) => (lista ?? []).map((p) => ({ id: p.provider_id, nombre: p.provider_name, logo: p.logo_path }));
  return {
    suscripcion: mapear(porRegion.flatrate),
    alquiler: mapear(porRegion.rent),
    compra: mapear(porRegion.buy),
    enlace: porRegion.link ?? null,
  };
}

/**
 * Cuánto vale la lista de proveedores en memoria antes de volver a
 * pedírsela a TMDb. Cambia, como mucho, mes a mes (agregan o sacan una
 * plataforma), así que una hora es de sobra.
 */
const TTL_PROVEEDORES_MS = 60 * 60 * 1000;
let proveedoresCacheados = null;
let proveedoresCacheadosEn = 0;

/**
 * Lista de plataformas disponibles en la región configurada (para armar un
 * selector de "Disponible en"), combinando el catálogo de película y de
 * serie, sin duplicados.
 *
 * **Memoizada en proceso con TTL desde el 2026-09-01.** Antes pegaba dos
 * llamadas a TMDb en CADA pedido a `/proveedores` — medido en vivo: 1,0 s
 * por pedido, para una lista que casi no cambia. `PaginaBuscar` y
 * `PaginaResultados` la piden cada una en su propio efecto, así que un
 * recorrido buscar → resultados → volver a buscar la pedía varias veces.
 */
export async function obtenerProveedoresDisponibles() {
  if (proveedoresCacheados && Date.now() - proveedoresCacheadosEn < TTL_PROVEEDORES_MS) {
    return proveedoresCacheados;
  }

  const [pelis, series] = await Promise.all([
    tmdbFetch('/watch/providers/movie', { watch_region: REGION_PROVEEDORES }),
    tmdbFetch('/watch/providers/tv', { watch_region: REGION_PROVEEDORES }),
  ]);
  const mapa = new Map();
  for (const p of [...(pelis.results ?? []), ...(series.results ?? [])]) {
    mapa.set(p.provider_id, { id: p.provider_id, nombre: p.provider_name, logo: p.logo_path });
  }
  proveedoresCacheados = [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  proveedoresCacheadosEn = Date.now();
  return proveedoresCacheados;
}

/**
 * Detalle completo de un título puntual, para cuando necesitamos más que lo
 * que devuelve /discover (duración, temporadas, episodios, estado,
 * keywords, certificaciones por país) — todo en UNA sola llamada vía
 * append_to_response, para no multiplicar requests por título.
 */
export async function obtenerDetalle(tmdbId, tipo) {
  return cacheDetalleTmdb(`${tipo}:${tmdbId}`, () => obtenerDetalleSinCache(tmdbId, tipo));
}

async function obtenerDetalleSinCache(tmdbId, tipo) {
  if (tipo === 'pelicula') {
    const data = await tmdbFetch(`/movie/${tmdbId}`, {
      append_to_response: 'keywords,release_dates,watch/providers,credits,translations,images',
      include_image_language: IDIOMAS_DE_IMAGEN,
    });
    const nombre = corregirNombre('pelicula', data.id, elegirTexto(data, 'title'));
    return {
      tmdb_id: data.id,
      tipo: 'pelicula',
      ...idsDeReparto(data),
      titulo: nombre.texto,
      anio: data.release_date ? Number(data.release_date.slice(0, 4)) : null,
      vote_count: data.vote_count ?? 0,
      vote_average: data.vote_average ?? null,
      popularity: data.popularity ?? null,
      generos: (data.genres ?? []).map((g) => g.id),
      keywords: (data.keywords?.keywords ?? []).map((k) => k.name),
      duracion: data.runtime ?? null,
      idioma: data.original_language ?? null,
      /**
       * origin_country, NO production_countries: es lo único que discover
       * puede filtrar (ver nota en buscar()), así que usamos el mismo
       * campo acá para que Preferencia y Filtro sean consistentes entre sí.
       */
      paisOrigen: data.origin_country ?? [],
      plataformas: plataformasPlanas(data),
      poster: elegirPoster(data, nombre),
      certificaciones: certificacionesDesdeReleaseDates(data),
    };
  }

  /**
   * external_ids trae el imdb_id, que es el puente hacia TVMaze (sección 2
   * del Definitivo). Viaja en la misma request que ya se hacía, así que no
   * cuesta una llamada extra, y queda guardado en el caché de detalle.
   */
  const data = await tmdbFetch(`/tv/${tmdbId}`, {
    append_to_response: 'keywords,content_ratings,watch/providers,external_ids,credits,translations,images',
    include_image_language: IDIOMAS_DE_IMAGEN,
  });
  const nombre = corregirNombre('tv', data.id, elegirTexto(data, 'name'));
  return {
    imdb_id: data.external_ids?.imdb_id ?? null,
    tmdb_id: data.id,
    tipo: 'tv',
    ...idsDeReparto(data),
    titulo: nombre.texto,
    anio: data.first_air_date ? Number(data.first_air_date.slice(0, 4)) : null,
    vote_count: data.vote_count ?? 0,
    vote_average: data.vote_average ?? null,
    popularity: data.popularity ?? null,
    generos: (data.genres ?? []).map((g) => g.id),
    keywords: (data.keywords?.results ?? []).map((k) => k.name),
    temporadas: data.number_of_seasons ?? null,
    episodios: data.number_of_episodes ?? null,
    estado: data.status ?? null,
    /**
     * El `type` de TMDb (Miniseries / Scripted / Talk Show / Reality / News /
     * Documentary / Video) es lo que decide si esto es una miniserie, y de
     * paso lo que deja afuera los formatos que no son una historia para ver.
     * Ver logic/tipoContenido.js. Antes no se leía y la miniserie se
     * adivinaba con "una temporada y terminada", que metía talk shows.
     */
    tipoTmdb: data.type ?? null,
    idioma: data.original_language ?? null,
    paisOrigen: data.origin_country ?? [],
    plataformas: plataformasPlanas(data),
    poster: elegirPoster(data, nombre),
    certificaciones: certificacionesDesdeContentRatings(data),
  };
}

const CANTIDAD_REPARTO_PRINCIPAL = 10;

/**
 * Detalle "grande" para la Ficha de Título (sección 10): todo lo de
 * obtenerDetalle() más sinopsis, reparto, dirección y país de producción.
 * Deliberadamente separado de obtenerDetalle(): esta llamada es más pesada
 * (trae credits completos) y el motor de búsqueda la pide una sola vez por
 * título visto, no por cada candidato de cada búsqueda — mezclarla con
 * obtenerDetalle() encarecería innecesariamente cada búsqueda.
 */
export async function obtenerFicha(tmdbId, tipo) {
  if (tipo === 'pelicula') {
    const data = await tmdbFetch(`/movie/${tmdbId}`, {
      append_to_response: 'keywords,release_dates,credits,watch/providers,translations,images',
      include_image_language: IDIOMAS_DE_IMAGEN,
    });
    const nombre = corregirNombre('pelicula', data.id, elegirTexto(data, 'title'));
    return {
      tmdb_id: data.id,
      tipo: 'pelicula',
      titulo: nombre.texto,
      ...sinopsisConIdioma(data),
      anio: data.release_date ? Number(data.release_date.slice(0, 4)) : null,
      vote_count: data.vote_count ?? 0,
      vote_average: data.vote_average ?? null,
      popularity: data.popularity ?? null,
      generos: (data.genres ?? []).map((g) => g.id),
      keywords: (data.keywords?.keywords ?? []).map((k) => k.name),
      duracion: data.runtime ?? null,
      idioma: data.original_language ?? null,
      paisesProduccion: (data.production_countries ?? []).map((p) => p.iso_3166_1),
      certificaciones: certificacionesDesdeReleaseDates(data),
      reparto: (data.credits?.cast ?? []).slice(0, CANTIDAD_REPARTO_PRINCIPAL).map((p) => p.name),
      direccion: (data.credits?.crew ?? []).filter((p) => p.job === 'Director').map((p) => p.name),
      plataformas: plataformasDetalladas(data),
      poster: elegirPoster(data, nombre),
      backdrop: data.backdrop_path ?? null,
    };
  }

  const data = await tmdbFetch(`/tv/${tmdbId}`, {
    append_to_response: 'keywords,content_ratings,credits,watch/providers,external_ids,translations,images',
    include_image_language: IDIOMAS_DE_IMAGEN,
  });
  const nombre = corregirNombre('tv', data.id, elegirTexto(data, 'name'));
  return {
    // El puente hacia TVMaze, igual que en obtenerDetalle().
    imdb_id: data.external_ids?.imdb_id ?? null,
    tmdb_id: data.id,
    tipo: 'tv',
    titulo: nombre.texto,
    ...sinopsisConIdioma(data),
    anio: data.first_air_date ? Number(data.first_air_date.slice(0, 4)) : null,
    vote_count: data.vote_count ?? 0,
    vote_average: data.vote_average ?? null,
    popularity: data.popularity ?? null,
    generos: (data.genres ?? []).map((g) => g.id),
    keywords: (data.keywords?.results ?? []).map((k) => k.name),
    temporadas: data.number_of_seasons ?? null,
    episodios: data.number_of_episodes ?? null,
    estado: data.status ?? null,
    /**
     * El `type` de TMDb (Miniseries / Scripted / Talk Show / Reality / News /
     * Documentary / Video) es lo que decide si esto es una miniserie, y de
     * paso lo que deja afuera los formatos que no son una historia para ver.
     * Ver logic/tipoContenido.js. Antes no se leía y la miniserie se
     * adivinaba con "una temporada y terminada", que metía talk shows.
     */
    tipoTmdb: data.type ?? null,
    idioma: data.original_language ?? null,
    paisesProduccion: (data.production_countries ?? []).map((p) => p.iso_3166_1),
    certificaciones: certificacionesDesdeContentRatings(data),
    reparto: (data.credits?.cast ?? []).slice(0, CANTIDAD_REPARTO_PRINCIPAL).map((p) => p.name),
    /**
     * Para series, TMDb no siempre completa "crew" con un Director a nivel
     * serie (es más un concepto por episodio) — created_by es el campo que
     * sí viene poblado de forma confiable a nivel serie, así que lo uso
     * como equivalente de "Director/a (y equipo)" para este tipo.
     */
    direccion: (data.created_by ?? []).map((p) => p.name),
    plataformas: plataformasDetalladas(data),
    poster: elegirPoster(data, nombre),
    backdrop: data.backdrop_path ?? null,
  };
}
