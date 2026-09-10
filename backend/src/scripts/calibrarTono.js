/**
 * Script descartable de calibración (misma convención que calibrarGenero.js:
 * pega contra TMDb y Neon reales, imprime por consola, se descarta después de
 * usarlo — queda en el repo porque es la herramienta a correr la PRÓXIMA vez
 * que aparezca el mismo síntoma, no para volver a derivarlo de memoria).
 *
 * Generaliza el procedimiento que resolvió el filtro de "dramedia de
 * prestigio" de "Quiero reírme" (4.29.8): un género amplio (ej.
 * Comedia) trae, mezclados con lo que promete, títulos donde el peso real
 * está en un género "serio" que convive en el mismo título (ej. Drama) —
 * Forrest Gump, El Show de Truman, La La Land cumplen "Comedia" tan bien como
 * Grand Budapest Hotel, pero no son lo que alguien espera al pedir eso.
 *
 * EL ORDEN IMPORTA, porque cada paso descarta una salida más simple:
 *
 * 1. **Primero probar UNA sola señal** (no este script): excluir el género
 *    serio entero de la rama (`sinGenerosRamaGenero`), exigir un keyword de
 *    tono positivo, o vetar un keyword de contenido pesado. Casi siempre
 *    alguna falla, y falla de dos formas distintas que conviene reconocer:
 *      - Excluir el género serio entero saca también títulos legítimos que
 *        cumplen el género amplio de sobra sin depender de él (mismo defecto
 *        que "excluir Drama de reirme" costaba El Gran Hotel Budapest).
 *      - Exigir o vetar UN keyword falla por cobertura: las keywords de tono
 *        de TMDb (`hilarious`, `dramatic`, `feelgood`...) están puestas en
 *        una fracción chica y pareja del catálogo, así que la MITAD de los
 *        títulos legítimos quedan con el mismo puntaje (cero) que los que se
 *        quiere sacar. Este script asume que ya se probó y falló así — si no
 *        se probó, probarlo primero es más barato que correr esto.
 * 2. **Combinar tres señales débiles y exigir al menos dos de tres**, no una
 *    sola: eso es lo que este script mide.
 *      a. El título NO lleva ninguna keyword de KEYWORDS_TONO_POSITIVO.
 *      b. El título SÍ lleva alguna keyword de KEYWORDS_CONTENIDO_PESADO.
 *      c. Su vote_count supera UMBRAL_VOTOS.
 *    Puntaje = a + b + c (0 a 3). Candidato a excluir con puntaje >= 2.
 * 3. **Medir contra dos poblaciones DISTINTAS, no una sola**:
 *      - La CABECERA real (2 páginas por vote_count.desc del género amplio,
 *        mismo tamaño de lote que usa el motor): dice qué pasaría en una
 *        búsqueda real hoy. Cambia con el catálogo de TMDb (advertencia de
 *        siempre: una medición en vivo que no se repite no es un hallazgo
 *        que no existe).
 *      - Una lista de CONTROL propia, elegida a mano (`--malos`/`--buenos`,
 *        IDs de TMDb separados por coma): títulos que uno sabe que tienen
 *        que entrar o salir, aunque no aparezcan hoy en la cabecera. Es la
 *        que de verdad mide falsos positivos sobre casos que importan y que
 *        la cabecera del día podría no incluir.
 * 4. **El script no decide el corte**: imprime el puntaje y sus tres
 *    componentes para cada título, y las dos listas de control aparte con su
 *    veredicto (correcto/incorrecto). El umbral final y las dos listas de
 *    keywords las ajusta una persona mirando qué se pierde, igual que se hizo
 *    para los 11 botones de Estado de Ánimo.
 *
 * Uso:
 *   node src/scripts/calibrarTono.js <generoAmplio> <generoSerio> [tipo]
 *   node src/scripts/calibrarTono.js 35 18 pelicula
 *
 * Con listas de control (recomendado — la cabecera sola no alcanza, ver 3):
 *   node src/scripts/calibrarTono.js 35 18 pelicula \
 *     --malos 13,37165,313369,637,490132 \
 *     --buenos 120467,350,77338,82693,773,7326
 *
 * Con keywords o umbral propios, si el dominio no es "comedia con drama de
 * fondo" (los defaults son justamente los que se calibraron para ese caso):
 *   node src/scripts/calibrarTono.js 27 18 pelicula \
 *     --positivas scary,creepy,unsettling --pesadas grief,cancer --umbral-votos 10000
 */
import { discoverPeliculas, discoverSeries } from '../services/tmdb.js';
import { completarDetalle } from '../buscador/motorBusqueda.js';
import { leerAgregados } from '../repositories/agregados.js';
import { GENEROS_TMDB } from '../data/genres.js';
import { pool } from '../config/db.js';

const PAGINAS_CABECERA = 2;

/**
 * Calibradas para "Comedia con Drama de fondo" (4.29.8). Para otro
 * par de géneros, medir de nuevo con --positivas/--pesadas: no hay motivo
 * para asumir que las mismas palabras separan bien un dominio distinto.
 */
const KEYWORDS_TONO_POSITIVO_DEFAULT = [
  'hilarious', 'joyous', 'cheerful', 'amused', 'sarcastic', 'sarcasm', 'absurd',
  'whimsical', 'satirical', 'satire', 'parody', 'farce', 'black humor',
  'slapstick', 'deadpan', 'witty', 'comic', 'funny', 'screwball', 'wisecrack',
];
const KEYWORDS_CONTENIDO_PESADO_DEFAULT = [
  'war', 'vietnam war', 'world war ii', 'holocaust (shoah)', 'concentration camp',
  'post-traumatic stress disorder (ptsd)', 'drug addiction', 'dystopia', 'paranoia',
  'video surveillance', 'depression', 'mental illness', 'mental institution',
  'dying and death', 'suicide', 'racism', 'genocide', 'illness',
  'obsessive compulsive disorder (ocd)', 'child with illness', 'cancer',
];
const UMBRAL_VOTOS_DEFAULT = 15000;

async function traerCabecera(generoAmplio, tipo) {
  const discover = tipo === 'pelicula' ? discoverPeliculas : discoverSeries;
  const paginas = await Promise.all(
    Array.from({ length: PAGINAS_CABECERA }, (_, i) =>
      discover({ page: i + 1, sortBy: 'vote_count.desc', generos: [generoAmplio] })
    )
  );
  const agregados = await leerAgregados();
  return completarDetalle(paginas.flat(), agregados, { soloRecomendables: true });
}

async function traerPorIds(ids, tipo, agregados) {
  const livianos = ids.map((tmdb_id) => ({ tipo, tmdb_id }));
  return completarDetalle(livianos, agregados, {});
}

function puntaje(candidato, generoSerio, positivas, pesadas, umbralVotos) {
  const keywords = (candidato.keywords ?? []).map((k) => k.toLowerCase());
  const tieneGeneroSerio = (candidato.generos ?? []).includes(generoSerio);
  const sinTonoPositivo = !keywords.some((k) => positivas.has(k));
  const conContenidoPesado = keywords.some((k) => pesadas.has(k));
  const muyVotado = (candidato.vote_count ?? 0) > umbralVotos;
  const total = Number(sinTonoPositivo) + Number(conContenidoPesado) + Number(muyVotado);
  return { tieneGeneroSerio, sinTonoPositivo, conContenidoPesado, muyVotado, total };
}

function imprimirCandidato(c, generoSerio, positivas, pesadas, umbralVotos, esperado) {
  const p = puntaje(c, generoSerio, positivas, pesadas, umbralVotos);
  const excluido = p.tieneGeneroSerio && p.total >= 2;
  const señales = p.tieneGeneroSerio
    ? `sinTono=${Number(p.sinTonoPositivo)} conPesado=${Number(p.conContenidoPesado)} muyVotado=${Number(p.muyVotado)} score=${p.total}`
    : 'sin género serio, no aplica';
  let marca = excluido ? ' -> EXCLUIDO' : ' -> queda';
  if (esperado !== undefined) {
    const correcto = excluido === esperado;
    marca += correcto ? ' (correcto)' : ' <-- INESPERADO';
  }
  console.log(`${c.titulo.padEnd(45)} votos=${String(c.vote_count).padEnd(7)} ${señales}${marca}`);
}

function parsearListaKeywords(csv, porDefecto) {
  return new Set((csv ? csv.split(',') : porDefecto).map((k) => k.trim().toLowerCase()));
}

async function main() {
  const args = process.argv.slice(2);
  const posicionales = args.filter((a) => !a.startsWith('--'));
  const [generoAmplio, generoSerio, tipo = 'pelicula'] = posicionales.map((v, i) => (i < 2 ? Number(v) : v));

  if (!generoAmplio || !generoSerio || (tipo !== 'pelicula' && tipo !== 'tv')) {
    console.error('Uso: node src/scripts/calibrarTono.js <generoAmplio> <generoSerio> [pelicula|tv] [--malos id,id] [--buenos id,id] [--positivas kw,kw] [--pesadas kw,kw] [--umbral-votos N]');
    process.exit(1);
  }

  const leerFlag = (nombre) => {
    const i = args.indexOf(nombre);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const positivas = parsearListaKeywords(leerFlag('--positivas'), KEYWORDS_TONO_POSITIVO_DEFAULT);
  const pesadas = parsearListaKeywords(leerFlag('--pesadas'), KEYWORDS_CONTENIDO_PESADO_DEFAULT);
  const umbralVotos = Number(leerFlag('--umbral-votos') ?? UMBRAL_VOTOS_DEFAULT);
  const idsMalos = leerFlag('--malos')?.split(',').map(Number) ?? [];
  const idsBuenos = leerFlag('--buenos')?.split(',').map(Number) ?? [];

  console.log(`\n########## Calibrando "${GENEROS_TMDB[generoAmplio]}" con drama de fondo = "${GENEROS_TMDB[generoSerio]}" (${tipo}) ##########`);
  console.log(`Umbral de votos: ${umbralVotos}. Puntaje >= 2 de 3 -> excluido.\n`);

  console.log('=== Cabecera real (vote_count.desc, sin ninguna corrección) ===');
  const cabecera = await traerCabecera(generoAmplio, tipo);
  for (const c of cabecera) imprimirCandidato(c, generoSerio, positivas, pesadas, umbralVotos);

  if (idsMalos.length || idsBuenos.length) {
    const agregados = await leerAgregados();
    if (idsMalos.length) {
      console.log('\n=== Control: títulos que DEBERÍAN quedar excluidos ===');
      const malos = await traerPorIds(idsMalos, tipo, agregados);
      for (const c of malos) imprimirCandidato(c, generoSerio, positivas, pesadas, umbralVotos, true);
    }
    if (idsBuenos.length) {
      console.log('\n=== Control: títulos que DEBERÍAN quedar adentro ===');
      const buenos = await traerPorIds(idsBuenos, tipo, agregados);
      for (const c of buenos) imprimirCandidato(c, generoSerio, positivas, pesadas, umbralVotos, false);
    }
  } else {
    console.log('\n(Sin --malos/--buenos: solo se midió la cabecera de hoy. Para una medición que no dependa de qué esté de moda en TMDb, pasar listas de control.)');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Error calibrando tono:', err);
  process.exit(1);
});
