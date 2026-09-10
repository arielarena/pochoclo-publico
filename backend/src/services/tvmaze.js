const BASE_URL = 'https://api.tvmaze.com';

/**
 * TVMaze permite alrededor de 20 llamadas cada 10 segundos por IP, bastante
 * menos que las ~40 por segundo de TMDb. Como el catálogo se importa entero
 * de una sola vez (ver scripts/seedTvmaze.js) y después las búsquedas
 * consultan nuestra base, este límite solo aplica a la importación: se
 * respeta esperando entre páginas en vez de disparar en paralelo.
 */
export const LLAMADAS_POR_VENTANA = 20;
export const VENTANA_MS = 10_000;
const ESPERA_ENTRE_LLAMADAS_MS = Math.ceil(VENTANA_MS / LLAMADAS_POR_VENTANA);

const REINTENTOS_POR_429 = 3;
const ESPERA_TRAS_429_MS = 12_000;

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET contra TVMaze, respetando el ritmo permitido y reintentando si igual
 * nos devuelve un 429. Un 404 no es un error: es cómo TVMaze indica que se
 * terminaron las páginas del índice.
 */
async function tvmazeFetch(path) {
  for (let intento = 0; intento <= REINTENTOS_POR_429; intento++) {
    const res = await fetch(BASE_URL + path, { headers: { Accept: 'application/json' } });

    if (res.status === 404) return null;
    if (res.status === 429) {
      if (intento === REINTENTOS_POR_429) {
        throw new Error(`TVMaze sigue respondiendo 429 en ${path} después de ${REINTENTOS_POR_429} reintentos`);
      }
      await dormir(ESPERA_TRAS_429_MS);
      continue;
    }
    if (!res.ok) {
      throw new Error(`TVMaze respondió ${res.status} en ${path}: ${await res.text()}`);
    }

    const datos = await res.json();
    await dormir(ESPERA_ENTRE_LLAMADAS_MS);
    return datos;
  }
  return null;
}

function anioDe(fecha) {
  if (!fecha) return null;
  const anio = Number(String(fecha).slice(0, 4));
  return Number.isInteger(anio) ? anio : null;
}

/**
 * Normaliza un show del índice a lo que guardamos. Devuelve null si no
 * tiene IMDb ID: sin él no hay forma de cruzarlo con nuestros títulos, así
 * que guardarlo sería ocupar espacio con una fila inalcanzable (pasa en
 * alrededor de 1 de cada 240).
 */
export function normalizarShow(show) {
  const imdb = show.externals?.imdb;
  if (!imdb) return null;

  return {
    tvmaze_id: show.id,
    imdb_id: imdb,
    nombre: show.name ?? null,
    /**
     * TVMaze usa 'Running' | 'Ended' | 'To Be Determined' | 'In Development'.
     * No distingue las canceladas de las terminadas, a diferencia de TMDb:
     * por eso TMDb sigue siendo la autoridad para el estado (ver el filtro
     * de Estado de la sección 7, que excluye las canceladas).
     */
    estado: show.status ?? null,
    duracion_episodio: show.averageRuntime ?? show.runtime ?? null,
    tipo: show.type ?? null,
    anio_inicio: anioDe(show.premiered),
    anio_fin: anioDe(show.ended),
  };
}

/**
 * Una página del índice completo de shows. TVMaze las sirve de a 240 y
 * responde 404 cuando se pasan de la última, que es cómo sabemos dónde
 * cortar. Devuelve null en ese caso.
 */
export async function obtenerPaginaDeShows(page) {
  const datos = await tvmazeFetch(`/shows?page=${page}`);
  if (!datos) return null;
  return datos;
}
