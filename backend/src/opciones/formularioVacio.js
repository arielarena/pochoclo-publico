import { obtenerSimilares } from '../services/tmdb.js';
import { buscar, completarDetalle } from '../buscador/motorBusqueda.js';
import { leerAgregados } from '../repositories/agregados.js';
import { aplicarFiltros, ordenar as ordenarResultados, JITTER_ORDEN_NATURAL } from '../logic/resultados.js';
import { claveDe } from '../utils/clave.js';
import { combinarSimilares } from './parecidoA.js';
import { cruzarDeTipo, intercalarPorAfinidad } from './cruceDeTipo.js';
import { buscarGustosPorGenero } from './gustosPorGenero.js';
import {
  PESO_FAVORITAS,
  PESO_VISTO,
  conLimiteDeEdad,
  excluirVistos,
  gustosComoPreferencias,
  tieneGustosCargados,
} from './personalizacion.js';

/**
 * Tope de candidatos a los que se les pide detalle en el bloque de gustos
 * resultantes. Con hasta 25 referencias, las listas de similares suman
 * cientos de livianos, y cada detalle es una llamada a TMDb. Como
 * combinarSimilares ya los deja ordenados por Coincidencias, quedarse con
 * los primeros es quedarse con los más parecidos a lo que le gusta.
 *
 * **80 y no más, por CONCURRENCIA_DETALLE.** Con hasta 4 tandas de 25 en
 * paralelo el peor caso (todo caché frío) queda en ~3,7 s, contra los ~1,9 s
 * de antes con 40 — ninguna de las dos tandas se acerca al límite de TMDb
 * (medido en motorBusqueda.js: 80 en paralelo sin un solo 429). Subirlo más
 * empezaría a sumar tandas de verdad, no solo el margen que ya sobraba.
 */
const MAXIMO_A_DETALLAR = 80;

/**
 * Cuántos títulos de la misma franquicia que una referencia pueden aparecer
 * en el bloque. El caso que lo motivó: una cuenta con The Walking Dead como
 * única favorita recibía World Beyond, Fear the Walking Dead, Dead City,
 * Daryl Dixon, Tales of the Walking Dead y The Ones Who Live, o sea seis de
 * los diez primeros lugares gastados en la misma serie.
 *
 * **No es que estén mal**, y por eso el tope es 2 y no 0: quien puso The
 * Walking Dead en Favoritas probablemente quiera saber que existe Fear the
 * Walking Dead. Lo que no aporta es la lista completa de spin-offs, que
 * desplaza a Z Nation, Black Summer y Falling Skies, que es lo que la
 * persona no conocía.
 *
 * **Va SOLO en este bloque, no en "Parecido a" ni en los similares de la
 * Ficha**, y la distinción importa: ahí la referencia la escribió el usuario,
 * así que buscando "parecido a El Padrino" las secuelas son la respuesta
 * correcta y acotarlas sería contestar de menos. Acá la referencia es
 * implícita, sale de una lista, y la persona no pidió más de lo mismo.
 */
/**
 * Cuántas referencias se usan para el cruce de tipo. Cada una cuesta el detalle
 * de sus 20 recomendaciones (que casi siempre está cacheado) y no más, porque
 * las keywords definitorias de todas se juntan en un solo discover. El tope
 * existe igual: una cuenta puede traer 25 referencias entre Favoritas y Visto, y
 * ahí serían 500 títulos a resolver para agregar como mucho seis.
 */
const MAXIMO_REFERENCIAS_CRUCE = 3;

const MAXIMO_POR_FRANQUICIA = 2;

/**
 * El nombre reducido a palabras comparables: sin mayúsculas, sin acentos y
 * sin puntuación, con un espacio de guarda a cada lado.
 *
 * Los espacios de guarda son lo que evita el falso positivo de un `includes`
 * suelto: sin ellos, la referencia "The Office" se llevaría puesta a "The
 * Officer". Con ellos, la referencia tiene que aparecer como secuencia
 * completa de palabras.
 */
function nucleoDelNombre(titulo) {
  const limpio = (titulo ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return limpio ? ` ${limpio} ` : '';
}

/**
 * Un nombre más corto que esto no se usa para reconocer franquicias: "Up" o
 * "It" aparecen adentro de demasiados títulos ajenos, y el costo de
 * equivocarse es descartar un resultado bueno.
 */
const LARGO_MINIMO_DE_FRANQUICIA = 10;

/**
 * Y para el arranque compartido el piso es más alto, porque ahí no hay un
 * nombre completo que sostenga la coincidencia: con 10 alcanzaría "the
 * amazing", que emparentaría The Amazing Spider-Man con The Amazing Race.
 */
const LARGO_MINIMO_DE_ARRANQUE = 12;

/**
 * TMDb no tiene noción de franquicia para series (`belongs_to_collection`
 * existe solo en películas), así que el parentesco se reconoce por el nombre,
 * que es además como lo reconoce la persona que mira la grilla.
 *
 * **Hacen falta las dos reglas, y el segundo caso es fácil de no ver.** Con
 * solo la primera, The Walking Dead queda acotado y Harry Potter no: "Harry
 * Potter y el misterio del príncipe" **no contiene** a "Harry Potter y la
 * piedra filosofal", comparte el arranque. Y con solo la segunda pasa al
 * revés, porque "Fear the Walking Dead" empieza distinto.
 */
function mismaFranquicia(nucleoReferencia, nucleoCandidato) {
  if (
    nucleoReferencia.trim().length >= LARGO_MINIMO_DE_FRANQUICIA &&
    nucleoCandidato.includes(nucleoReferencia)
  ) {
    return true;
  }

  const palabrasReferencia = nucleoReferencia.trim().split(' ');
  const palabrasCandidato = nucleoCandidato.trim().split(' ');
  let iguales = 0;
  while (
    iguales < palabrasReferencia.length &&
    iguales < palabrasCandidato.length &&
    palabrasReferencia[iguales] === palabrasCandidato[iguales]
  ) {
    iguales++;
  }
  const arranque = palabrasReferencia.slice(0, iguales).join(' ');
  return iguales >= 2 && arranque.length >= LARGO_MINIMO_DE_ARRANQUE;
}

/**
 * **La comparación va después de `completarDetalle` a propósito**: ahí los dos
 * lados llevan el título que eligió la cadena de idioma (ver 4.27), y comparar
 * el título elegido de la referencia contra el crudo de la lista de TMDb es lo
 * que haría fallar el reconocimiento en cualquier título con dos nombres en
 * español.
 *
 * La cuenta es **por referencia y no por franquicia**: con The Walking Dead y
 * Fear the Walking Dead las dos en Favoritas, cada una acota lo suyo, que es
 * lo que corresponde cuando alguien marcó las dos a propósito.
 */
function acotarFranquicias(candidatos, titulosDeReferencia) {
  const nucleos = titulosDeReferencia.map(nucleoDelNombre).filter(Boolean);
  if (!nucleos.length) return candidatos;

  const cuenta = new Map();
  return candidatos.filter((c) => {
    const nombre = nucleoDelNombre(c.titulo);
    const cual = nucleos.findIndex((n) => mismaFranquicia(n, nombre));
    if (cual < 0) return true;
    const vistos = (cuenta.get(cual) ?? 0) + 1;
    cuenta.set(cual, vistos);
    return vistos <= MAXIMO_POR_FRANQUICIA;
  });
}

/**
 * Bloque 2 de la sección 5: "Favoritas/Visto ponderado".
 *
 * Es el mismo mecanismo que "Parecido a" (una lista de similares por cada
 * referencia, combinadas contando Coincidencias), con una diferencia que la
 * sección 16 marca explícitamente: acá **sí se pondera por origen**, porque
 * las referencias no las eligió el usuario en el momento sino que salen de
 * dos listas con jerarquía distinta. Por eso `combinarSimilares` recibe
 * pesos en vez de contar de a uno.
 *
 * "Si un título está en ambas listas, solo cuenta su aparición en
 * Favoritas": por eso Visto se criba contra las claves de Favoritas antes
 * de armar las referencias.
 */
export async function gustosResultantes(contexto, agregados) {
  const clavesFavoritas = new Set(contexto.favoritas.map(claveDe));
  const vistoSinRepetir = contexto.visto.filter((v) => !clavesFavoritas.has(claveDe(v)));

  const referencias = [
    ...contexto.favoritas.map((f) => ({ ...f, peso: PESO_FAVORITAS })),
    ...vistoSinRepetir.map((v) => ({ ...v, peso: PESO_VISTO })),
  ];
  if (!referencias.length) return [];

  /**
   * El detalle de las referencias va en paralelo con sus listas de similares,
   * así que reconocer las franquicias no agrega latencia. Y casi nunca cuesta
   * una llamada a TMDb: son títulos de las listas del usuario, o sea que ya
   * pasaron por el caché de detalle al mirarlas.
   */
  const [listas, detalleReferencias] = await Promise.all([
    Promise.all(
      referencias.map((ref) => obtenerSimilares(ref.tmdb_id, ref.tipo, 1).catch(() => []))
    ),
    completarDetalle(referencias, agregados).catch(() => []),
  ]);

  const clavesReferencias = new Set(referencias.map(claveDe));
  const combinados = combinarSimilares(
    listas,
    referencias.map((r) => r.peso)
  ).filter(({ candidato }) => !clavesReferencias.has(claveDe(candidato)));

  const mapaCoincidencias = new Map(
    combinados.map(({ candidato, coincidencias }) => [claveDe(candidato), coincidencias])
  );
  const mapaPosicion = new Map(
    combinados.map(({ candidato, mejorPosicion }) => [claveDe(candidato), mejorPosicion])
  );

  const livianos = combinados.map(({ candidato }) => candidato).slice(0, MAXIMO_A_DETALLAR);
  const completos = await completarDetalle(livianos, agregados, { soloRecomendables: true });

  /**
   * completarDetalle resuelve en paralelo y devuelve en orden de respuesta,
   * así que el orden de la sección 16 (Coincidencias, desempatado por la
   * posición de similitud de TMDb) hay que restaurarlo a mano.
   */
  const ordenados = completos
    .map((c) => ({ ...c, coincidencias: mapaCoincidencias.get(claveDe(c)) ?? 0 }))
    .sort(
      (a, b) =>
        b.coincidencias - a.coincidencias ||
        (mapaPosicion.get(claveDe(a)) ?? Infinity) - (mapaPosicion.get(claveDe(b)) ?? Infinity)
    );

  const acotados = acotarFranquicias(ordenados, detalleReferencias.map((r) => r.titulo));

  /**
   * Cruce de tipo: películas para quien tiene series en sus listas y al revés
   * (ver cruceDeTipo.js). TMDb no tiene recomendaciones cruzadas, así que esto
   * es lo único que puede sugerirle Guerra Mundial Z a quien puso The Walking
   * Dead en Favoritas.
   *
   * **VA AL FINAL Y NO DESPLAZA NADA**: se concatena después de lo que ya había
   * en vez de competir por un lugar, y sale con `coincidencias: 0`, así que
   * tampoco se cuela entre los de arriba si algo vuelve a ordenar la lista.
   *
   * **Y va SOLO en este bloque**, por el mismo argumento que el tope de
   * franquicia: acá el título de la sección es "Porque te gustaron", que cubre
   * sin mentir una película recomendada por una serie. En "Parecido a" la
   * referencia la escribió el usuario y pidió parecidos a ESE título, así que
   * meterle otro tipo ahí sería contestar otra cosa.
   *
   * Se le pasan las recomendaciones ya detalladas: de ahí sale la frecuencia de
   * cada keyword, así que detectar las definitorias no cuesta ninguna llamada.
   *
   * **Las recomendaciones se piden aparte, y no se reusan las que ya tienen
   * detalle.** Reusarlas parece lo barato y da mal en silencio: `completos` es
   * la mezcla de todas las referencias recortada a MAXIMO_A_DETALLAR, así que
   * con cinco favoritas a cada una le tocan 7 u 8 de sus 20, y encima sesgadas.
   * Medido: ahí `post-apocalyptic future` de The Walking Dead cae a **0,00** de
   * frecuencia y no se cruza nada, sin que falle nada.
   *
   * Pedirlas bien es barato porque casi todas ya están en el caché de detalle:
   * 3 referencias por sus 20 recomendaciones son 60 títulos en 169 ms.
   * **Emparejar por clave y no por índice.** `completarDetalle` resuelve en
   * paralelo y devuelve en orden de respuesta, así que `detalleReferencias[i]`
   * no es la referencia `i`: sin esto, a cada referencia le tocaba la lista de
   * recomendaciones de otra, y el cruce no encontraba ninguna keyword
   * definitoria. Es el mismo motivo por el que el orden de similitud de acá
   * arriba se restaura a mano.
   */
  const referenciaPorClave = new Map(detalleReferencias.map((r) => [claveDe(r), r]));
  const paraCruce = referencias.slice(0, MAXIMO_REFERENCIAS_CRUCE);
  const recomendacionesDeCruce = await completarDetalle(
    paraCruce.flatMap((_, i) => listas[i] ?? []),
    agregados
  ).catch(() => []);
  const detallePorClave = new Map(recomendacionesDeCruce.map((c) => [claveDe(c), c]));

  const { cruzados, afinidad } = await cruzarDeTipo({
    entradas: paraCruce.map((ref, i) => ({
      referencia: referenciaPorClave.get(claveDe(ref)),
      recomendaciones: (listas[i] ?? []).map((x) => detallePorClave.get(claveDe(x))).filter(Boolean),
    })),
    agregados,
    excluir: new Set([...clavesReferencias, ...acotados.map(claveDe)]),
  }).catch(() => ({ cruzados: [], afinidad: () => 0 }));

  /**
   * **Intercalados, no pegados al final**: cada uno entra después de todos los
   * del mismo tipo que le ganan en afinidad. El orden de los del mismo tipo
   * (Coincidencias ponderadas, desempatadas por la posición de similitud) no se
   * toca. Ver intercalarPorAfinidad.
   */
  return intercalarPorAfinidad(acotados, cruzados, afinidad);
}

/**
 * Búsqueda con formulario vacío (sección 5). La usan la Opción 1, la
 * Opción 3 y el modo Solo de "¿Quién está viendo?".
 *
 * Son **tres bloques independientes**, en el orden que fija la sección:
 * Gustos Registrados, Favoritas/Visto ponderado, y Populares. Los que
 * quedan vacíos no aparecen, así que un usuario sin nada cargado (y
 * cualquier visitante sin cuenta) recibe solo Populares, que es
 * exactamente lo que había hasta v2.
 *
 * **La respuesta es una lista plana**, con cada título marcado con el
 * bloque del que salió, más un índice de los bloques con sus títulos. Se
 * eligió así y no un array de arrays para no romper nada de lo que ya
 * existe: los filtros y el orden del cliente trabajan sobre una lista
 * plana, y "Me siento con suerte" sortea sobre una lista plana. Agrupar
 * para mostrar es un asunto de la pantalla, no de la respuesta.
 *
 * `preferenciasBase` es lo que preselecciona el flujo que llama (el Tipo de
 * la Opción 3, por ejemplo) y se aplica a los tres bloques.
 */
export async function buscarConFormularioVacio(
  contexto,
  { preferenciasBase = {}, filtros = {}, ordenar, lote = 1, sinLimiteDeEdad = false, soloRapido = false } = {}
) {
  const agregados = await leerAgregados();
  if (!agregados) {
    throw new Error('No hay agregados calculados todavía. Corré "npm run seed" y "npm run recalcular" primero.');
  }

  const filtrosConEdad = conLimiteDeEdad(filtros, contexto, { sinLimiteDeEdad });
  /**
   * El jitter (ver JITTER_ORDEN_NATURAL) solo va cuando nadie pidió un orden
   * a propósito: hoy ningún llamador real pasa `ordenar` (ni las rutas de
   * Opciones ni el precalentado), así que en la práctica siempre se aplica,
   * pero la condición queda para no pisar un pedido explícito si alguna vez
   * aparece uno.
   */
  const ordenPopulares = ordenar ?? { campo: 'popularidad', direccion: 'desc', jitter: JITTER_ORDEN_NATURAL };
  /**
   * **`soloRapido` fuerza a que no haya nada personalizado que pedir**, sin
   * tocar `pideGustosRegistrados` (que sigue reflejando si el usuario TIENE
   * gustos cargados, para el resto de la lógica de abajo). Lo usa el
   * frontend para pedir un primer pantallazo con Populares nada más —el
   * único bloque que no depende de Favoritas/Visto/Gustos y por eso el más
   * barato— mientras la respuesta completa se sigue armando en paralelo (ver
   * PaginaResultados.jsx). Populares nunca se saltea: es el que sostiene la
   * pantalla cuando no hay nada más, así que la versión rápida sin él no
   * serviría de adelanto de nada.
   */
  const pideGustosRegistrados = !soloRapido && contexto.hayUsuario && tieneGustosCargados(contexto.gustos);

  /**
   * Los tres bloques son búsquedas independientes entre sí — ninguna necesita
   * el resultado de otra para ejecutarse, solo la deduplicación de más abajo
   * necesita que las tres hayan terminado. Antes se pedían en fila (Populares,
   * después Gustos Registrados, después Favoritas/Visto), sin que hubiera
   * ninguna dependencia real que lo exigiera: para una cuenta con las tres
   * cosas cargadas y caché fría, eso sumaba el costo de las tres búsquedas en
   * vez de pagar solo la más lenta de ellas.
   */
  const [populares, gustosRegistrados, resultantes] = await Promise.all([
    /**
     * Es el único que siempre se pide, porque es el que sostiene la pantalla
     * cuando no hay nada personalizado que mostrar, y el único que pagina
     * (los otros dos no salen de discover).
     */
    buscar({ preferencias: preferenciasBase, ordenar: ordenPopulares, lote, agregados }),
    /**
     * Bloque 1: Gustos Registrados. Desde el 2026-09-02, si hay más de un
     * género marcado, ya no arma un solo with_genres combinado (eso dejaba
     * que el género con las franquicias más taquilleras se comiera a los
     * otros dos — ver el comentario de KEYWORDS_VETO_MARCA en
     * gustosPorGenero.js): una especificación por género, con veto de marca
     * en todas, para que cada uno tenga su propio lugar garantizado.
     */
    pideGustosRegistrados
      ? (() => {
          const { generos, tipo, anio } = { ...preferenciasBase, ...gustosComoPreferencias(contexto.gustos) };
          return buscarGustosPorGenero({
            generos: generos ?? [],
            tipo,
            anio,
            /**
             * 'CLASICOS' no viaja mezclado en `generos`: `gustos_usuario`
             * guarda esto en su propia columna (ver personalizacion.js y
             * 4.2), así que se pasa aparte y no por
             * gustosComoPreferencias().
             */
            clasicos: contexto.gustos.clasicos,
            ordenar: { campo: 'popularidad', direccion: 'desc', jitter: JITTER_ORDEN_NATURAL },
            agregados,
          });
        })()
      : null,
    // Bloque 2: Favoritas/Visto ponderado.
    !soloRapido && contexto.hayUsuario ? gustosResultantes(contexto, agregados) : null,
  ]);

  const bloques = [];

  /**
   * gustosResultantes() (bloque "Porque te gustaron") no conoce
   * `preferenciasBase`: arma sus candidatos a partir de Favoritas/Visto, sin
   * ninguna noción de Tipo. Sin este filtro, elegir "Película" en la Opción 3
   * seguía trayendo series ahí, aunque Populares y "Por tus gustos" (que sí
   * reciben `preferenciasBase`) ya respetaran el Tipo elegido.
   */
  const filtrosConTipo = preferenciasBase.tipo?.length && !filtrosConEdad.tipo?.length
    ? { ...filtrosConEdad, tipo: preferenciasBase.tipo }
    : filtrosConEdad;

  if (gustosRegistrados) {
    const limpios = excluirVistos(aplicarFiltros(gustosRegistrados.resultados, filtrosConEdad), contexto);
    if (limpios.length) {
      bloques.push({ clave: 'gustos', titulo: 'Por tus gustos', resultados: limpios });
    }
  }

  if (resultantes) {
    const limpios = excluirVistos(aplicarFiltros(resultantes, filtrosConTipo), contexto);
    if (limpios.length) {
      bloques.push({
        clave: 'gustosResultantes',
        titulo: 'Porque te gustaron',
        resultados: ordenar ? ordenarResultados(limpios, ordenar) : limpios,
      });
    }
  }

  /**
   * Los ya mostrados arriba no se repiten abajo: los tres bloques son
   * independientes, pero ver el mismo título tres veces en la misma
   * pantalla no es lo que la sección quiere decir con eso. El orden en que
   * se arma `bloques` (gustos, resultantes, populares) es el que decide quién
   * se queda con un título repetido, y es el mismo de siempre — lo único que
   * cambió es que las tres búsquedas ya terminaron para cuando esto corre, en
   * vez de haberse pedido una después de la otra.
   */
  const yaMostrados = new Set(bloques.flatMap((b) => b.resultados.map(claveDe)));

  const popularesLimpios = excluirVistos(
    aplicarFiltros(populares.resultados, filtrosConEdad),
    contexto
  ).filter((c) => !yaMostrados.has(claveDe(c)));

  if (popularesLimpios.length) {
    bloques.push({ clave: 'populares', titulo: 'Populares', resultados: popularesLimpios });
  }

  return {
    resultados: bloques.flatMap((b) => b.resultados.map((r) => ({ ...r, bloque: b.clave }))),
    bloques: bloques.map(({ clave, titulo }) => ({ clave, titulo })),
    hayMas: populares.hayMas,
  };
}
