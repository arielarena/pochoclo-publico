import { resolverIdsDeKeywords, discoverPeliculas, discoverSeries } from '../services/tmdb.js';
import { completarDetalle } from '../buscador/motorBusqueda.js';
import { contarPorKeyword, contar } from '../repositories/titulos.js';
import { generosParaTaxonomia } from '../data/genres.js';
import { claveDe } from '../utils/clave.js';

/**
 * ============ CRUCE PELÍCULA <-> SERIE ============
 *
 * **TMDb no tiene recomendaciones cruzadas.** `/recommendations` de una serie
 * devuelve series, siempre, así que para que The Walking Dead sugiera Guerra
 * Mundial Z hay que construirlo. Lo único que describe a la referencia son sus
 * keywords, y el problema entero es elegir CUÁLES.
 *
 * **LO QUE NO FUNCIONA, medido el 2026-08-30 para no volver a intentarlo:**
 *
 * - El OR de todas las keywords de la referencia: `survival` y `horror` tapan a
 *   `zombie` y traen Dunkerque y Marte.
 * - Quedarse con la más frecuente entre las recomendaciones: la de The Walking
 *   Dead es `zombie`, pero la de Stranger Things es `horror`, que no define nada.
 * - **Exigirle al candidato que comparta DOS keywords definitorias.** Parece lo
 *   más sano y es lo que más daño hace: el vocabulario de TMDb está fragmentado
 *   (`zombie` / `zombie apocalypse` / `undead`, `post-apocalyptic future` /
 *   `apocalypse` / `end of the world`), así que dos obras sobre lo mismo casi
 *   nunca comparten dos cadenas exactas. Medido contra The Walking Dead y El
 *   Padrino: Guerra Mundial Z, Train to Busan, 28 días después, Peaky Blinders
 *   y Narcos comparten **una sola o ninguna**. Exigir dos deja afuera justo las
 *   respuestas canónicas.
 *
 * **LO QUE SÍ FUNCIONA son tres cosas juntas:**
 *
 * 1. **Frecuencia entre las recomendaciones del mismo tipo, pesada por rareza**
 *    (idf). Sin el peso gana siempre la keyword más grande. Con él, Breaking Bad
 *    pasa de elegir `new mexico` (que traía Thor) a `cartel`; Interstellar de
 *    `space` (que traía Dragon Ball) a `space travel`; y Arcane de `magic` (que
 *    traía Harry Potter) a `adult animation`.
 * 2. **Un tope duro de tamaño**: una keyword que cubre más del 2% del catálogo
 *    no define nada, por más frecuente que sea. Es lo que saca `horror` de
 *    Stranger Things y `based on novel or book` de El Padrino.
 * 3. **Abstenerse con menos de dos definitorias.** Con una sola no hay forma de
 *    verificar nada, y es de donde salían los dos peores resultados: Stranger
 *    Things devolvía cuatro Destino final, y Breaking Bad películas narco
 *    desconocidas. Ahora los dos se abstienen.
 *
 * **ABSTENERSE ES UN RESULTADO VÁLIDO Y ES LA MITAD DEL DISEÑO.** De siete
 * referencias medidas, tres no producen nada (Breaking Bad, Stranger Things,
 * Pulp Fiction) y está bien: es preferible no agregar nada a reponer el ruido
 * que la 4.11.1 vino a sacar.
 *
 * **NO DESPLAZA NADA.** Los títulos cruzados salen con `coincidencias: 0`, así
 * que quedan al final del bloque que los muestra; se suman a lo que ya había en
 * vez de ocupar su lugar.
 */

/**
 * Keywords que describen un dispositivo de trama tan universal que no
 * definen nada, aunque pasen el tope de tamaño y el puntaje de rareza.
 *
 * **`saving the world` es el caso que lo destapó** (2026-09-01): "parecido a
 * Soy Leyenda" cruzaba El ascenso del héroe del escudo, My Hero Academia y
 * Avatar: La leyenda de Aang. Las cuatro obras "salvan el mundo", pero de
 * maneras que no tienen nada que ver entre sí. Medido contra el caché: la
 * llevan 36 títulos de 8404 (0,43% del catálogo local), muy por debajo del
 * 2% de `PROPORCION_MAXIMA`, y entre ellos Matrix, Avengers, Harry Potter,
 * Terminator, Indiana Jones y Men in Black — o sea que su "rareza" medida
 * contra el caché es un artefacto de que el caché está cargado de acción y
 * superhéroes, no una señal real de tema compartido. Es el mismo modo de
 * fallo que describe la 4.15.3b: la keyword nombra el género, no la obra.
 */
const KEYWORDS_VETADAS_CRUCE = new Set(['saving the world']);

/** Piso de puntaje para que una keyword se considere definitoria. */
const PISO_DEFINITORIA = 1.0;

/** Cuántas definitorias se usan como mucho para armar el discover. */
const MAXIMAS_DEFINITORIAS = 4;

/**
 * Con menos de esto no se cruza. Ver el punto 3 de arriba: una sola keyword no
 * se puede verificar contra nada.
 */
const MINIMAS_DEFINITORIAS = 2;

/** Proporción del catálogo arriba de la cual una keyword no define nada. */
const PROPORCION_MAXIMA = 0.02;

/**
 * Piso de votos para un candidato cruzado, mucho más alto que el de
 * `esRecomendable`. Esto es un añadido, no una búsqueda que el usuario pidió:
 * si lo que se puede agregar es oscuro, mejor no agregar nada. Medido sobre
 * Breaking Bad, es lo que saca las películas narco de 12 votos.
 */
const VOTOS_MINIMOS_CRUCE = 300;

/** Cuántos títulos cruzados se suman como mucho. */
const MAXIMO_CRUZADOS = 6;

/** Cuánto suma compartir un género con la referencia. Ver la nota de abajo. */
const BONUS_GENERO = 0.5;

const otroTipo = (tipo) => (tipo === 'pelicula' ? 'tv' : 'pelicula');

/**
 * El tamaño del catálogo, cacheado en memoria con un TTL de una hora — no
 * hace falta pedirlo en cada búsqueda para que un logaritmo cambie en la
 * cuarta decimal.
 *
 * **Hasta el 2026-09-01 se memoizaba para siempre** ("se mueve de a puñados
 * por búsqueda", decía el comentario), y eso desincronizaba silenciosamente
 * los dos lados de la rareza: `contarPorKeyword()` (más abajo) SÍ se
 * consulta en vivo en cada búsqueda, así que el numerador (`corpus`) podía
 * quedar clavado en un valor de semanas atrás mientras el denominador
 * seguía fresco. Medido contra producción: la tabla `titulos` se mueve entre
 * 24 y 2.024 filas por día, y el backend corre como servicio de systemd que
 * se reinicia poco — el desvío solo podía crecer. El sesgo era siempre en la
 * misma dirección (menos definitorias, más abstenciones), nunca al revés,
 * porque un `corpus` viejo es siempre más chico que el real.
 *
 * De paso tapa un segundo bug: si la primerísima llamada a `contar()`
 * fallaba, `corpusCacheado` quedaba en 0 **para siempre** (0 no es `null`),
 * y con `corpus` en 0 esta función no vuelve a cruzar nada nunca más (ver
 * `cruzarDeTipo`, `if (!corpus) return SIN_NADA`). Ahora un fallo no pisa el
 * último valor bueno, y se reintenta en la próxima llamada en vez de
 * esperar el TTL entero.
 */
const TTL_CORPUS_MS = 60 * 60 * 1000;
let corpusCacheado = null;
let corpusCacheadoEn = 0;
async function tamanoDelCorpus() {
  if (corpusCacheado != null && Date.now() - corpusCacheadoEn < TTL_CORPUS_MS) return corpusCacheado;
  const nuevo = await contar().catch(() => null);
  if (nuevo != null) {
    corpusCacheado = nuevo;
    corpusCacheadoEn = Date.now();
  }
  return corpusCacheado ?? 0;
}

/**
 * Las keywords de la referencia que de verdad la definen, con su puntaje.
 *
 * `recomendaciones` son las del MISMO tipo que ya trajo quien llama, con su
 * detalle resuelto: contar en cuántas aparece cada keyword de la referencia es
 * la señal, y en el bloque de "Porque te gustaron" sale gratis, porque esos
 * detalles ya se piden igual.
 */
function definitorias(referencia, recomendaciones, tamanos, corpus) {
  const frecuencia = new Map();
  for (const r of recomendaciones) {
    for (const k of new Set(r.keywords ?? [])) frecuencia.set(k, (frecuencia.get(k) ?? 0) + 1);
  }
  const total = Math.max(recomendaciones.length, 1);
  const topeTamano = Math.max(Math.round(corpus * PROPORCION_MAXIMA), 1);

  return (referencia.keywords ?? [])
    .filter((k) => !KEYWORDS_VETADAS_CRUCE.has(k))
    .filter((k) => (tamanos.get(k) ?? 0) <= topeTamano)
    .map((k) => {
      const n = Math.max(tamanos.get(k) ?? 1, 1);
      return { keyword: k, puntaje: ((frecuencia.get(k) ?? 0) / total) * Math.log(corpus / n) };
    })
    .filter((x) => x.puntaje >= PISO_DEFINITORIA)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, MAXIMAS_DEFINITORIAS);
}

/**
 * Títulos del OTRO tipo para un conjunto de referencias.
 *
 * - `entradas`: un `{ referencia, recomendaciones }` por referencia, con el
 *   detalle ya resuelto de las dos partes. Las recomendaciones son las que TMDb
 *   dio para ESA referencia, y por eso el cálculo no cuesta ninguna llamada.
 *
 *   **Van atribuidas y no todas juntas**, que es un error que ya se cometió:
 *   con las de todas las referencias en una bolsa, la frecuencia se diluye
 *   (una keyword de The Walking Dead aparece en 8 de sus 20 recomendaciones,
 *   pero en 8 de las 60 de tres series) y ninguna llega al piso. El síntoma es
 *   silencioso: una cuenta con cinco favoritas no cruzaba nada y no fallaba.
 * - `excluir`: claves que ya están en la lista, para no repetir.
 *
 * Devuelve `{ cruzados, afinidad }`. **`afinidad(candidato)` puntúa CUALQUIER
 * título con la misma vara** —cuántas keywords definitorias de las referencias
 * comparte, pesadas por rareza, más el bonus de género—, y es lo que permite
 * intercalarlos entre los del mismo tipo en vez de dejarlos abajo de todo (ver
 * intercalarPorAfinidad).
 *
 * `cruzados` viene vacío cuando no hay nada confiable que agregar, que es lo
 * esperable en buena parte de los casos.
 */
export async function cruzarDeTipo({ entradas, agregados, excluir = new Set() }) {
  const SIN_NADA = { cruzados: [], afinidad: () => 0 };
  if (!entradas?.length) return SIN_NADA;

  const todasLasKeywords = entradas.flatMap((e) => e.referencia?.keywords ?? []);
  if (!todasLasKeywords.length) return SIN_NADA;

  const [tamanos, corpus] = await Promise.all([
    contarPorKeyword(todasLasKeywords).catch(() => new Map()),
    tamanoDelCorpus(),
  ]);
  if (!corpus) return SIN_NADA;

  /**
   * Las definitorias se juntan de TODAS las referencias y se pide un solo
   * discover por dirección, en vez de uno por referencia. Así el costo es el
   * mismo con una favorita que con veinte, que es lo que vuelve esto viable en
   * el bloque más caro de la app.
   *
   * `porTipo` guarda un acumulado por CADA taxonomía: la de destino y la propia
   * de la referencia. La de destino sirve para salir a buscar, y las dos para
   * puntuar. `destinos` es el subconjunto al que hay que ir a buscar de verdad,
   * y va aparte y no como una marca adentro del acumulado: con referencias de
   * los dos tipos, la misma taxonomía es destino de unas y propia de otras, así
   * que una marca se pisaría sola.
   */
  const porTipo = new Map();
  const destinos = new Set();
  const acumuladoDe = (tipo) => {
    if (!porTipo.has(tipo)) porTipo.set(tipo, { definitorias: new Map(), generos: new Set() });
    return porTipo.get(tipo);
  };

  for (const { referencia: ref, recomendaciones: propias } of entradas) {
    if (!ref || !propias?.length) continue;
    const defs = definitorias(ref, propias, tamanos, corpus);
    if (defs.length < MINIMAS_DEFINITORIAS) continue;

    const propio = ref.tipo === 'pelicula' ? 'pelicula' : 'tv';
    const destino = otroTipo(propio);
    destinos.add(destino);

    for (const tipo of [destino, propio]) {
      const acumulado = acumuladoDe(tipo);
      for (const d of defs) {
        // Si dos referencias comparten una definitoria, vale por la más fuerte.
        acumulado.definitorias.set(d.keyword, Math.max(acumulado.definitorias.get(d.keyword) ?? 0, d.puntaje));
      }
      for (const g of generosParaTaxonomia(ref.generos ?? [], tipo)) acumulado.generos.add(g);
    }
  }
  if (!destinos.size) return SIN_NADA;

  const afinidad = (candidato) => {
    const acumulado = porTipo.get(candidato.tipo === 'pelicula' ? 'pelicula' : 'tv');
    if (!acumulado) return 0;
    const suyas = new Set(candidato.keywords ?? []);
    let total = 0;
    for (const [keyword, valor] of acumulado.definitorias) if (suyas.has(keyword)) total += valor;
    /**
     * **El género suma, no filtra.** Medido: usarlo como `with_genres` empeora
     * (le cuesta It y El resplandor a Stranger Things), y como puntaje no
     * descarta nada.
     */
    if ((candidato.generos ?? []).some((g) => acumulado.generos.has(g))) total += BONUS_GENERO;
    return total;
  };

  const tandas = await Promise.all(
    [...destinos].map((destino) => traerDelOtroTipo(destino, porTipo.get(destino)))
  );

  const livianos = [];
  const vistos = new Set(excluir);
  for (const t of tandas) {
    for (const c of t.crudos) {
      const clave = claveDe(c);
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      livianos.push(c);
    }
  }
  if (!livianos.length) return { cruzados: [], afinidad };

  const completos = await completarDetalle(livianos, agregados, { soloRecomendables: true });

  const cruzados = completos
    .map((c) => ({ ...c, coincidencias: 0, cruzado: true }))
    .filter((c) => afinidad(c) > 0)
    .sort((a, b) => afinidad(b) - afinidad(a))
    .slice(0, MAXIMO_CRUZADOS);

  return { cruzados, afinidad };
}

/**
 * Mete los cruzados entre los del mismo tipo, cada uno **después de todos los
 * que le ganan en afinidad**. Devuelve una lista sola.
 *
 * **NO reordena a los del mismo tipo**, y esa es la propiedad que lo vuelve
 * seguro: su orden queda como venía (Coincidencias y, dentro de eso, la
 * posición de similitud que da TMDb), que está bien y no hay por qué tocar. La
 * afinidad se usa nada más que para elegir el punto de inserción, o sea para
 * contestar "¿a cuántos de estos les gana?".
 *
 * **Antes los cruzados iban al final y eso los condenaba**: una película que se
 * parece a la referencia más que la decimoquinta serie de la lista quedaba
 * igual abajo de todo, solo por ser de otro tipo.
 *
 * No sale una alternancia pareja ni tiene por qué salir: si los diez primeros
 * del mismo tipo le ganan a todos los cruzados, los cruzados van del once en
 * adelante, y está bien que así sea.
 *
 * **EL LÍMITE CONOCIDO, y por qué se acepta.** La lista del mismo tipo NO está
 * ordenada por afinidad sino por Coincidencias y posición de similitud, así que
 * un cruzado puede quedar arriba de uno del mismo tipo con más afinidad que él,
 * si ese está ranqueado bajo por TMDb. Medido en "parecido a El Padrino": El
 * irlandés puntúa 5,9 y está 13º, así que Gomorra (4,4) le queda por encima.
 *
 * Se probó la alternativa que lo evita del todo —insertar recién después del
 * ÚLTIMO del mismo tipo que le gana— y **es peor**: con ella los cruzados no
 * entran ni entre los doce primeros en ninguna de las tres referencias medidas,
 * o sea que vuelven a quedar abajo de todo, que es justo lo que se vino a
 * arreglar. Siempre hay algún título del mismo tipo con puntaje alto en el
 * fondo de la lista, y alcanza uno para hundirlos a todos.
 *
 * La única forma de no tener ninguna inversión sería reordenar también a los
 * del mismo tipo por afinidad, y eso es cambiar el orden de "Parecido a"
 * entero, que hoy funciona bien y no se vino a tocar.
 */
export function intercalarPorAfinidad(mismoTipo, cruzados, afinidad) {
  if (!cruzados?.length) return mismoTipo;

  const puntajes = mismoTipo.map(afinidad);
  const porPosicion = new Map();
  for (const c of [...cruzados].sort((a, b) => afinidad(b) - afinidad(a))) {
    const cuantosLeGanan = puntajes.filter((p) => p >= afinidad(c)).length;
    if (!porPosicion.has(cuantosLeGanan)) porPosicion.set(cuantosLeGanan, []);
    porPosicion.get(cuantosLeGanan).push(c);
  }

  const salida = [];
  for (let i = 0; i <= mismoTipo.length; i++) {
    for (const c of porPosicion.get(i) ?? []) salida.push(c);
    if (i < mismoTipo.length) salida.push(mismoTipo[i]);
  }
  return salida;
}

async function traerDelOtroTipo(destino, { definitorias: defs }) {
  const ids = await resolverIdsDeKeywords([...defs.keys()]);
  if (!ids.length) return { crudos: [] };

  /**
   * Una sola página: esto es un añadido de a lo sumo MAXIMO_CRUZADOS títulos,
   * así que traer más candidatos solo agregaría llamadas de detalle para
   * descartarlas después.
   */
  const comun = { page: 1, sortBy: 'vote_count.desc', keywords: ids, voteCountGte: VOTOS_MINIMOS_CRUCE };
  const crudos = await (destino === 'pelicula' ? discoverPeliculas(comun) : discoverSeries(comun)).catch(() => []);
  return { crudos };
}
