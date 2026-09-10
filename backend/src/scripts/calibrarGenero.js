/**
 * Script descartable de calibración (no forma parte del producto — misma
 * convención que scripts/probar.js: pega contra TMDb y Neon reales, imprime
 * por consola, se descarta después de usarlo).
 *
 * Generaliza a un procedimiento repetible lo que se hizo a mano para el botón
 * "Quiero acción" (4.15.5b): con `sort_by=vote_count.desc`, la
 * cabecera de un género amplio (Acción) quedaba tomada por géneros vecinos
 * con más votos (Aventura, Fantasía, Ciencia Ficción — El Señor de los
 * Anillos, Avatar, Star Wars), y se corrigió excluyendo esos géneros y
 * vetoneando keywords de superhéroes de esa rama. Este script mide, para
 * CUALQUIER género, si el mismo patrón se repite y con qué géneros/keywords.
 *
 * Uso: node src/scripts/calibrarGenero.js <generoId> <pelicula|tv>
 * Ej.:  node src/scripts/calibrarGenero.js 878 pelicula   (Ciencia Ficción)
 *       node src/scripts/calibrarGenero.js 35 pelicula    (Comedia)
 *
 * Metodología:
 * 1. Trae la CABECERA: los primeros ~40 candidatos (2 páginas, mismo tamaño
 *    de lote que usa el motor) de discover para el género pedido, ordenados
 *    por vote_count.desc — lo que de verdad entraría al lote 1 de una
 *    búsqueda real por Preferencias, HOY sin ninguna corrección.
 * 2. Para cada otro género H de la misma taxonomía, compara qué fracción de
 *    la cabecera lleva H (`pHead`) contra qué fracción del género G COMPLETO
 *    lleva H en TODO TMDb (`pBase`, medido con `total_results` en vivo, no
 *    contra el caché local de Postgres — que es ~9% del catálogo y está
 *    sesgado hacia lo ya buscado, ver la advertencia ya escrita en
 *    opciones/cruceDeTipo.js). El cociente (`lift`) dice cuánto más
 *    representado está H en la cabecera de lo que le toca por su peso real:
 *    un lift alto es la señal cuantitativa de "H se roba la cabecera de G".
 * 3. Igual con las keywords que aparecen en la cabecera.
 *
 * Los umbrales (LIFT_MINIMO, FRACCION_CABECERA_MINIMA, PISO_TAMANO) son un
 * punto de partida, calcado del orden de magnitud ya documentado a mano para
 * Acción — no una fórmula validada. Los números que imprime este script son
 * el insumo para decidir, no una decisión automática: la lista de control
 * final (títulos canónicos del género) y el juicio de qué se pierde al
 * excluir algo los pone una persona, igual que se hizo para los 11 botones de
 * Estado de Ánimo.
 */
import { discoverPeliculas, discoverSeries, discoverConTotales, resolverIdsDeKeywords, VOTOS_MINIMOS_DISCOVER } from '../services/tmdb.js';
import { completarDetalle } from '../buscador/motorBusqueda.js';
import { leerAgregados } from '../repositories/agregados.js';
import { GENEROS_TMDB, GENEROS_PELICULA, GENEROS_SERIE } from '../data/genres.js';
import { conLimite } from '../utils/concurrencia.js';
import { pool } from '../config/db.js';

/**
 * Medido en esta misma sesión: 18 discoverConTotales en paralelo (la sección
 * de géneros) no dispara 429, pero ~47 keywords × 2 llamadas cada una (resolver
 * + total) sí, de forma sostenida — el único reintento de tmdbFetch (ver
 * services/tmdb.js) no alcanza contra una ráfaga así. Es un script de
 * calibración de uso puntual, no una búsqueda de usuario: no hace falta
 * paralelismo alto, alcanza con no serializar del todo.
 */
const CONCURRENCIA_CALIBRACION = 5;
/**
 * Una keyword que aparece una sola vez entre 40 candidatos no es un patrón de
 * co-ocurrencia, es ruido — y cada una que se descarta acá es una llamada
 * menos a TMDb.
 */
const APARICIONES_MINIMAS_KEYWORD = 2;

const PAGINAS_CABECERA = 2;
/**
 * Por debajo de esto un total_results es ruido estadístico y no una señal
 * (mismo criterio que PROPORCION_MAXIMA en cruceDeTipo.js, adaptado: acá el
 * piso es de tamaño absoluto de la intersección, no de proporción del corpus).
 */
const PISO_TAMANO = 20;
/**
 * Puntos de partida, calcados de los números ya documentados a mano para
 * Acción (4.15.5b: Aventura/Fantasía/Ciencia Ficción se comían "las
 * primeras 40 posiciones"). Ajustar si el script da demasiado ruido.
 */
const LIFT_MINIMO = 2;
const FRACCION_CABECERA_MINIMA = 0.15;

async function total(tipo, opciones) {
  const { totalResultados } = await discoverConTotales({ tipo, voteCountGte: VOTOS_MINIMOS_DISCOVER, ...opciones });
  return totalResultados;
}

async function traerCabecera(generoId, tipo) {
  const discover = tipo === 'pelicula' ? discoverPeliculas : discoverSeries;
  const paginas = await Promise.all(
    Array.from({ length: PAGINAS_CABECERA }, (_, i) =>
      discover({ page: i + 1, sortBy: 'vote_count.desc', generos: [generoId] })
    )
  );
  const livianos = paginas.flat();
  const agregados = await leerAgregados();
  /**
   * soloRecomendables: true, mismo criterio que buscar() — es lo que un
   * usuario real vería, no el catálogo crudo (ver motorBusqueda.js:394).
   */
  return completarDetalle(livianos, agregados, { soloRecomendables: true });
}

function lift(pHead, pBase) {
  if (pBase > 0) return pHead / pBase;
  return pHead > 0 ? Infinity : 0;
}

async function generosSospechosos(generoId, tipo, cabecera) {
  const taxonomia = tipo === 'pelicula' ? GENEROS_PELICULA : GENEROS_SERIE;
  const otros = [...taxonomia].filter((g) => g !== generoId);
  const totalG = await total(tipo, { generos: [generoId] });

  const tareas = otros.map((h) => async () => {
    const pHead = cabecera.filter((c) => (c.generos ?? []).includes(h)).length / cabecera.length;
    /**
     * AND real (generosTodos), no OR: se necesita la intersección exacta
     * "cuántos títulos son G Y H a la vez", no la unión.
     */
    const totalGH = await total(tipo, { generosTodos: [generoId, h] });
    const pBase = totalG ? totalGH / totalG : 0;
    return { id: h, nombre: GENEROS_TMDB[h], pHead, pBase, lift: lift(pHead, pBase), totalGH };
  });
  const resueltas = await conLimite(tareas, CONCURRENCIA_CALIBRACION);
  const filas = resueltas.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  return filas.filter((f) => f.totalGH >= PISO_TAMANO).sort((a, b) => b.lift - a.lift);
}

async function keywordsSospechosas(generoId, tipo, cabecera) {
  const frecuencia = new Map();
  for (const c of cabecera) {
    for (const k of new Set(c.keywords ?? [])) frecuencia.set(k, (frecuencia.get(k) ?? 0) + 1);
  }
  const candidatas = [...frecuencia.entries()].filter(([, n]) => n >= APARICIONES_MINIMAS_KEYWORD);
  const totalG = await total(tipo, { generos: [generoId] });

  const tareas = candidatas.map(([keyword, n]) => async () => {
    /**
     * Una resolución por keyword, no un lote: resolverIdsDeKeywords()
     * devuelve el array ya filtrado de nulos, así que con un lote se pierde
     * la posición de la que falló en resolver — acá no hace falta, porque
     * cada llamada ya está cacheada en memoria si se repite.
     */
    const [id] = await resolverIdsDeKeywords([keyword]);
    if (!id) return null;
    const pHead = n / cabecera.length;
    const totalGK = await total(tipo, { generos: [generoId], keywords: [id] });
    const pBase = totalG ? totalGK / totalG : 0;
    return { keyword, pHead, pBase, lift: lift(pHead, pBase), totalGK };
  });
  const resueltas = await conLimite(tareas, CONCURRENCIA_CALIBRACION);
  const filas = resueltas.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  return filas.filter(Boolean).filter((f) => f.totalGK >= PISO_TAMANO).sort((a, b) => b.lift - a.lift);
}

function imprimirFila(etiqueta, f, sufijo) {
  const candidata = f.lift >= LIFT_MINIMO && f.pHead >= FRACCION_CABECERA_MINIMA;
  const marca = candidata ? ` <-- candidato a ${sufijo}` : '';
  console.log(
    `${etiqueta.padEnd(30)} cabecera=${(f.pHead * 100).toFixed(0)}%  real=${(f.pBase * 100).toFixed(2)}%  lift=${f.lift === Infinity ? '∞' : f.lift.toFixed(1)}${marca}`
  );
}

async function calibrar(generoId, tipo) {
  console.log(`\n\n########## Calibrando "${GENEROS_TMDB[generoId]}" (${generoId}), ${tipo} ##########\n`);
  const cabecera = await traerCabecera(generoId, tipo);
  console.log(`Cabecera: ${cabecera.length} candidatos (vote_count.desc, sin ninguna corrección).\n`);

  console.log(`=== Géneros co-ocurrentes (lift >= ${LIFT_MINIMO} y >= ${FRACCION_CABECERA_MINIMA * 100}% de la cabecera => candidato a sinGenerosRamaGenero) ===`);
  const generos = await generosSospechosos(generoId, tipo, cabecera);
  for (const g of generos) imprimirFila(g.nombre, g, 'excluir de la rama');

  console.log('\n=== Keywords (misma regla => candidata a vetoKeywords) ===');
  const keywords = await keywordsSospechosas(generoId, tipo, cabecera);
  for (const k of keywords.slice(0, 25)) imprimirFila(k.keyword, k, 'vetar');

  console.log('\n=== Top 15 de la cabecera, para juzgar a ojo contra una lista de control propia ===');
  for (const c of cabecera.slice(0, 15)) {
    console.log(`- ${c.titulo} (${c.anio}) — vote_count=${c.vote_count}, generos=${(c.generos ?? []).map((g) => GENEROS_TMDB[g] ?? g).join(', ')}`);
  }
}

/**
 * Acepta pares <generoId> <pelicula|tv> repetidos, para calibrar varios en
 * una sola corrida del proceso (una conexión a Neon, no una por género) —
 * EN SERIE y no en paralelo entre géneros: cada uno ya usa
 * CONCURRENCIA_CALIBRACION puertas adentro, y correr varios géneros a la vez
 * multiplicaría eso contra la misma API (mismo argumento que precalentar.js
 * corre sus 16 búsquedas fijas en serie, ver 4.13.1).
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.length % 2 !== 0) {
    console.error('Uso: node src/scripts/calibrarGenero.js <generoId> <pelicula|tv> [<generoId> <pelicula|tv> ...]\n');
    console.error('Géneros disponibles:');
    for (const [id, nombre] of Object.entries(GENEROS_TMDB)) console.error(`  ${id}\t${nombre}`);
    process.exit(1);
  }

  const pares = [];
  for (let i = 0; i < args.length; i += 2) {
    const generoId = Number(args[i]);
    const tipo = args[i + 1];
    if (!generoId || !GENEROS_TMDB[generoId] || (tipo !== 'pelicula' && tipo !== 'tv')) {
      console.error(`Par inválido: "${args[i]} ${args[i + 1]}"`);
      process.exit(1);
    }
    pares.push([generoId, tipo]);
  }

  for (const [generoId, tipo] of pares) {
    await calibrar(generoId, tipo);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Error calibrando género:', err);
  process.exit(1);
});
