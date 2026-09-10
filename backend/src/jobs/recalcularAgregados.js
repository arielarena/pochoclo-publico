import { pool } from '../config/db.js';
import { obtenerTodos, actualizarClasificacion } from '../repositories/titulos.js';
import { guardarAgregados } from '../repositories/agregados.js';
import { esClasico, complejidad } from '../logic/clasificacion.js';
import { VOTOS_MINIMOS_PUNTUACION } from '../logic/formulas.js';
import { discoverConTotales } from '../services/tmdb.js';
import { conLimite } from '../utils/concurrencia.js';

/**
 * Los cuatro agregados del catálogo (sección 16), calculados contra TMDb y
 * no contra nuestra tabla local.
 *
 * **Por qué cambió.** Antes salían de los ~2.000 títulos del seed, que son
 * una muestra sesgada a lo popular. Medido el 2026-08-21, eso resultó ser
 * un problema mucho menor de lo esperado para tres de los cuatro: los
 * máximos ya daban bien (0,2% a 3% de error), porque **son máximos**, y una
 * muestra tomada de lo más popular y más votado contiene necesariamente los
 * máximos. Pedirlos directo igual sale casi gratis y da el valor exacto.
 *
 * El que sí estaba mal era **C**, el promedio de notas del catálogo, que
 * por definición depende de la muestra: 7,22 sobre títulos populares contra
 * ~7,10 sobre una muestra repartida. Como C es el ancla bayesiana, ese
 * sesgo corría la Puntuación de todos los títulos de la app.
 *
 * **Por qué no se resolvió llenando la tabla con 124.000 títulos**, que era
 * la otra opción: cuesta ~10 minutos, ~50 MB y un script nuevo que hay que
 * acordarse de refrescar, para terminar estimando lo mismo que una muestra
 * de unas 400 llamadas. Los máximos, encima, quedarían aproximados en vez
 * de exactos.
 */

/**
 * El catálogo que le importa a la app: debajo de este umbral no hay
 * Puntuación, así que promediar esos títulos en C sería promediar títulos
 * que después nunca se puntúan.
 */
const VOTOS_MINIMOS = VOTOS_MINIMOS_PUNTUACION;

/**
 * Desde dónde se muestrea. Antes de 1920 hay muy poco con votos suficientes
 * (medido: 2.195 películas en toda la era muda, el 2% del catálogo), y cada
 * año suma llamadas.
 */
const ANIO_INICIAL_MUESTRA = 1920;

/**
 * Páginas al azar por cada (año, tipo), además de la primera que se pide
 * igual para saber los totales. Dos alcanzan: el error estándar de la media
 * con ~5.000 títulos muestreados queda por debajo de 0,02, mucho más fino
 * que la diferencia que estamos corrigiendo.
 */
const PAGINAS_AL_AZAR = 2;

const CONCURRENCIA = 20;
const TIPOS = ['pelicula', 'tv'];
const CORTE_CLASICOS = '1999-12-31';

/**
 * El máximo de un campo en todo el catálogo, en una sola llamada por tipo:
 * se le pide a TMDb ordenado por ese campo y se mira el primero.
 *
 * Es exacto, no una aproximación, y es la ventaja de preguntarle a la
 * fuente en vez de mirar nuestra copia parcial.
 */
async function maximoDelCatalogo(campo, { fechaLte } = {}) {
  const porTipo = await Promise.all(
    TIPOS.map(async (tipo) => {
      const { resultados } = await discoverConTotales({
        tipo,
        page: 1,
        sortBy: `${campo}.desc`,
        fechaLte,
      });
      return resultados[0] ?? null;
    })
  );

  /**
   * `campo` es el nombre que usa TMDb para ordenar y también el nombre del
   * campo ya normalizado, así que sirve para las dos cosas.
   */
  const valores = porTipo.filter(Boolean).map((t) => Number(t[campo] ?? 0));
  return valores.length ? Math.max(...valores) : 0;
}

function enteroAlAzar(desde, hasta) {
  return desde + Math.floor(Math.random() * (hasta - desde + 1));
}

/**
 * C: el promedio de notas del catálogo, estimado por muestreo.
 *
 * Dos cuidados que hacen la diferencia entre una estimación buena y una que
 * repite el sesgo que veníamos a corregir:
 *
 *  1. **Se muestrea por año**, y no el catálogo entero de una. Discover no
 *     sirve más allá de la página 500, o sea 10.000 títulos por consulta;
 *     partiendo por año ninguno se acerca a ese techo (el más denso, 2019,
 *     tiene 3.604 películas), así que cualquier título es alcanzable.
 *  2. **Se toman páginas al azar, no las primeras.** La página 1 son los
 *     más populares de ese año, que es exactamente el sesgo del que
 *     queremos salir. La primera se pide igual, pero solo para conocer los
 *     totales; sus títulos no entran en el promedio salvo que el año tenga
 *     una sola página.
 *
 * El promedio final se pondera por la cantidad real de títulos de cada año,
 * porque el catálogo está muy cargado hacia lo reciente (medido: 47.693
 * películas desde 2010 contra 2.195 en toda la era muda). Sin ponderar, un
 * año flaco de 1930 pesaría lo mismo que 2019.
 */
async function promedioDelCatalogo() {
  const anioActual = new Date().getFullYear();
  const tramos = [];
  for (let anio = ANIO_INICIAL_MUESTRA; anio <= anioActual; anio++) {
    for (const tipo of TIPOS) tramos.push({ anio, tipo });
  }

  // Primera pasada: totales de cada tramo.
  const tareasTotales = tramos.map((tramo) => async () => ({
    ...tramo,
    ...(await discoverConTotales({
      tipo: tramo.tipo,
      page: 1,
      anioExacto: tramo.anio,
      voteCountGte: VOTOS_MINIMOS,
    })),
  }));
  const totales = (await conLimite(tareasTotales, CONCURRENCIA))
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((t) => t.totalResultados > 0);

  // Segunda pasada: páginas al azar de cada tramo que tenga más de una.
  const tareasMuestra = [];
  for (const tramo of totales) {
    if (tramo.totalPaginas <= 1) continue;
    const paginas = new Set();
    for (let i = 0; i < PAGINAS_AL_AZAR; i++) paginas.add(enteroAlAzar(1, tramo.totalPaginas));
    for (const page of paginas) {
      tareasMuestra.push(async () => ({
        clave: `${tramo.tipo}:${tramo.anio}`,
        ...(await discoverConTotales({
          tipo: tramo.tipo,
          page,
          anioExacto: tramo.anio,
          voteCountGte: VOTOS_MINIMOS,
        })),
      }));
    }
  }
  const muestras = (await conLimite(tareasMuestra, CONCURRENCIA))
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);

  /**
   * Notas de cada tramo. Los tramos de una sola página usan la que ya se
   * pidió: ahí no hay sesgo posible, es el año entero.
   */
  const notasPorTramo = new Map();
  const agregarNotas = (clave, resultados) => {
    if (!notasPorTramo.has(clave)) notasPorTramo.set(clave, []);
    const notas = notasPorTramo.get(clave);
    for (const t of resultados) {
      if (t.vote_count >= VOTOS_MINIMOS && t.vote_average > 0) notas.push(Number(t.vote_average));
    }
  };
  for (const tramo of totales) {
    if (tramo.totalPaginas <= 1) agregarNotas(`${tramo.tipo}:${tramo.anio}`, tramo.resultados);
  }
  for (const m of muestras) agregarNotas(m.clave, m.resultados);

  // Promedio ponderado por el tamaño real de cada tramo.
  let sumaPonderada = 0;
  let pesoTotal = 0;
  let titulosMuestreados = 0;
  for (const tramo of totales) {
    const notas = notasPorTramo.get(`${tramo.tipo}:${tramo.anio}`);
    if (!notas?.length) continue;
    const media = notas.reduce((a, n) => a + n, 0) / notas.length;
    sumaPonderada += media * tramo.totalResultados;
    pesoTotal += tramo.totalResultados;
    titulosMuestreados += notas.length;
  }

  if (!pesoTotal) return null;
  return {
    c: sumaPonderada / pesoTotal,
    titulosMuestreados,
    catalogoEstimado: pesoTotal,
    tramos: totales.length,
    llamadas: tramos.length + tareasMuestra.length,
  };
}

async function main() {
  console.log('Calculando los agregados del catálogo contra TMDb...');

  // Los tres máximos: exactos, una llamada por tipo cada uno.
  const [popularityMax, votosTotalesMax, votosTotalesMaxClasicos] = await Promise.all([
    maximoDelCatalogo('popularity'),
    maximoDelCatalogo('vote_count'),
    maximoDelCatalogo('vote_count', { fechaLte: CORTE_CLASICOS }),
  ]);

  console.log(`  popularity_max            = ${popularityMax}`);
  console.log(`  votos_totales_max         = ${votosTotalesMax}`);
  console.log(`  votos_totales_max_clasicos = ${votosTotalesMaxClasicos}`);

  console.log(`Muestreando el catálogo para C (títulos con ${VOTOS_MINIMOS}+ votos)...`);
  const muestra = await promedioDelCatalogo();
  if (!muestra) {
    throw new Error('No se pudo muestrear el catálogo para calcular C. ¿Anda TMDb?');
  }

  console.log(
    `  C = ${muestra.c.toFixed(3)}  (${muestra.titulosMuestreados} títulos muestreados ` +
      `sobre ${muestra.catalogoEstimado.toLocaleString('es-AR')} del catálogo, ` +
      `${muestra.tramos} tramos, ${muestra.llamadas} llamadas)`
  );

  await guardarAgregados({ c: muestra.c, popularityMax, votosTotalesMax, votosTotalesMaxClasicos });
  console.log('Agregados guardados.');

  /**
   * Reclasificación de la tabla local.
   *
   * Ojo: `es_clasico` y `complejidad` son columnas que hoy **nadie lee** —
   * el motor las recalcula sobre el detalle en cada búsqueda (ver
   * completarDetalle). Esto se mantiene porque el seed las llena y tenerlas
   * coherentes con los agregados nuevos no cuesta casi nada, pero si alguna
   * vez hay que acelerar este job, es lo primero que se puede sacar.
   */
  const titulos = await obtenerTodos();
  if (titulos.length === 0) {
    console.log('La tabla "titulos" está vacía; no hay nada que reclasificar.');
    await pool.end();
    return;
  }

  const reclasificaciones = titulos.map((t) => () =>
    actualizarClasificacion(t.tmdb_id, t.tipo, {
      esClasico: esClasico(t, votosTotalesMaxClasicos),
      complejidad: complejidad(t),
    })
  );
  await conLimite(reclasificaciones, 10);

  console.log(`Listo. ${titulos.length} títulos locales re-clasificados.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Error en el batch job:', err);
  process.exit(1);
});
