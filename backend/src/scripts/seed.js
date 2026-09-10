import { discoverPeliculas, discoverSeries, obtenerKeywords } from '../services/tmdb.js';
import { upsertTitulo, contar } from '../repositories/titulos.js';
import { conLimite } from '../utils/concurrencia.js';
import { pool } from '../config/db.js';

/**
 * --- Constantes ajustables ---
 * Tanda A: popularidad general (alimenta Populares / C / Popularidad). 1500 total.
 */
const TANDA_A_PELICULAS = 750;
const TANDA_A_SERIES = 750;
// Tanda B: pre-2000 ordenado por vote_count (alimenta votosTotales_maxClasicos). 500 total.
const TANDA_B_PELICULAS = 250;
const TANDA_B_SERIES = 250;
const CORTE_CLASICOS = '1999-12-31';

const RESULTADOS_POR_PAGINA = 20;
const CONCURRENCIA_KEYWORDS = 25; // mismo orden que usa el Definitivo para Favoritas/Visto

function paginasNecesarias(totalDeseado) {
  return Math.ceil(totalDeseado / RESULTADOS_POR_PAGINA);
}

async function traerTanda({ tipo, paginas, sortBy, fechaLte }) {
  const titulos = [];
  for (let page = 1; page <= paginas; page++) {
    const resultados =
      tipo === 'pelicula'
        ? await discoverPeliculas({ page, sortBy, releaseDateLte: fechaLte })
        : await discoverSeries({ page, sortBy, airDateLte: fechaLte });
    titulos.push(...resultados);
    if (resultados.length < RESULTADOS_POR_PAGINA) break; // TMDb se quedó sin resultados
  }
  return titulos;
}

async function main() {
  console.log('Trayendo tanda A (popularidad general)...');
  const tandaA = [
    ...(await traerTanda({
      tipo: 'pelicula',
      paginas: paginasNecesarias(TANDA_A_PELICULAS),
      sortBy: 'popularity.desc',
    })),
    ...(await traerTanda({
      tipo: 'tv',
      paginas: paginasNecesarias(TANDA_A_SERIES),
      sortBy: 'popularity.desc',
    })),
  ];

  console.log('Trayendo tanda B (pre-2000 por votos, para Clásicos)...');
  const tandaB = [
    ...(await traerTanda({
      tipo: 'pelicula',
      paginas: paginasNecesarias(TANDA_B_PELICULAS),
      sortBy: 'vote_count.desc',
      fechaLte: CORTE_CLASICOS,
    })),
    ...(await traerTanda({
      tipo: 'tv',
      paginas: paginasNecesarias(TANDA_B_SERIES),
      sortBy: 'vote_count.desc',
      fechaLte: CORTE_CLASICOS,
    })),
  ];

  // Dedupe por (tipo, tmdb_id): un título puede caer en ambas tandas.
  const mapa = new Map();
  for (const t of [...tandaA, ...tandaB]) {
    mapa.set(`${t.tipo}:${t.tmdb_id}`, t);
  }
  const unicos = [...mapa.values()];
  console.log(`Total de títulos únicos a procesar: ${unicos.length}`);

  console.log('Trayendo keywords (esto es lo que más tarda, 1 llamada por título)...');
  const conKeywords = [];
  const tareas = unicos.map((t) => async () => {
    const keywords = await obtenerKeywords(t.tmdb_id, t.tipo);
    conKeywords.push({ ...t, keywords });
  });
  const resultados = await conLimite(tareas, CONCURRENCIA_KEYWORDS);
  const fallidos = resultados.filter((r) => r.status === 'rejected');
  if (fallidos.length) {
    console.warn(
      `${fallidos.length} títulos fallaron al traer keywords (se guardan igual, sin keywords). Ejemplo:`,
      fallidos[0].reason?.message
    );
  }

  console.log('Guardando en la base...');
  for (const t of conKeywords) {
    await upsertTitulo(t);
  }
  // Los que fallaron al traer keywords igual se guardan, con keywords vacías.
  const idsConKeywords = new Set(conKeywords.map((t) => `${t.tipo}:${t.tmdb_id}`));
  for (const t of unicos) {
    const key = `${t.tipo}:${t.tmdb_id}`;
    if (!idsConKeywords.has(key)) {
      await upsertTitulo({ ...t, keywords: [] });
    }
  }

  const total = await contar();
  console.log(`Listo. La tabla "titulos" tiene ${total} filas.`);
  console.log('Ahora corré "npm run recalcular" para calcular C, los máximos, es_clasico y complejidad.');

  await pool.end();
}

main().catch((err) => {
  console.error('Error en el seed:', err);
  process.exit(1);
});
