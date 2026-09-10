import { obtenerSimilares, obtenerDetalle, discoverPeliculas, discoverSeries } from '../services/tmdb.js';
import { completarDetalle, buscar } from '../buscador/motorBusqueda.js';
import { leerAgregados } from '../repositories/agregados.js';
import { aplicarFiltros, ordenar as ordenarResultados } from '../logic/resultados.js';
import { VALOR_GENERO_CLASICOS } from '../logic/clasificacion.js';
import { generosRecreablesEnSerie } from '../data/genres.js';
import { cruzarDeTipo, intercalarPorAfinidad } from './cruceDeTipo.js';
import { claveDe } from '../utils/clave.js';

/**
 * Si tras contar Coincidencias(t) quedan menos candidatos que esto, se
 * completa con populares priorizando género compartido (sección 16).
 */
const CANTIDAD_OBJETIVO = 20;

/**
 * Cuántas páginas de /recommendations se pueden pedir por referencia. Solo se
 * llega al tope cuando hay Preferencias que dejan afuera a casi todos los
 * similares: sin Preferencias, la primera página ya alcanza y el bucle
 * corta ahí (mismo costo que antes de que esto existiera).
 */
const PAGINAS_SIMILARES_MAXIMAS = 5;

/**
 * Tope de candidatos a los que se les pide detalle. Ir más profundo en
 * /recommendations puede acumular cientos de livianos, y cada detalle es una
 * llamada a TMDb; como combinarSimilares() ya los deja ordenados por
 * Coincidencias y posición, quedarse con los primeros es quedarse con los
 * más parecidos.
 */
const MAXIMO_CANDIDATOS_A_DETALLAR = 60;

/**
 * Tope de títulos de referencia por búsqueda (2026-09-08).
 *
 * **NO HABÍA NINGUNO**: la ruta solo comprobaba que `referencias` fuera un
 * array no vacío, así que un pedido con mil títulos armaba mil pedidos a
 * TMDb *por página de recomendaciones* — y `traerSimilares` los lanza con
 * `Promise.all`, o sea todos a la vez. Medido el 2026-09-08, el pico de
 * llamadas simultáneas es exactamente la cantidad de referencias (30 refs ->
 * pico 30, 40 -> 40), y de los 429 de TMDb ya se sabe que empiezan bastante
 * antes de mil (ver CONCURRENCIA_DETALLE en motorBusqueda.js).
 *
 * El valor sale de dos mediciones del mismo día:
 *
 *  - **Los resultados se saturan enseguida**: 5, 15, 30 y 40 referencias
 *    devuelven las mismas 66 recomendaciones, porque el tope real es
 *    MAXIMO_CANDIDATOS_A_DETALLAR. Lo único que siguen mejorando es el ORDEN
 *    (las Coincidencias máximas suben de 3 a 8), y eso ya está bien servido
 *    mucho antes de treinta.
 *  - **30 deja el pico por debajo de lo probado**: es el mismo orden que
 *    CONCURRENCIA_DISCOVER (40), que es concurrencia medida sin un solo 429.
 *
 * Se recorta en vez de rechazar, igual que MAXIMO_PRIORIDADES: el pedido
 * sigue funcionando y devuelve lo mismo. El caso real que motivó revisar
 * esto tenía 18 referencias cargadas a mano, así que ni lo toca.
 */
const MAXIMO_REFERENCIAS = 30;

/**
 * El mismo tope cuando el usuario pidió más resultados a propósito. Es más
 * alto porque ahí el costo lo eligió él y la espera está anunciada por el
 * botón, y llega justo a las 5 páginas por referencia que permite el tope de
 * arriba (5 x 20 = 100 livianos con una sola referencia).
 */
const MAXIMO_CANDIDATOS_A_DETALLAR_AMPLIADO = 100;

/**
 * Combina varias listas de similares (una por referencia) en un solo
 * conjunto, contando Coincidencias(t). Desempate: la mejor (menor)
 * posición que alcanzó en cualquiera de las listas, que es el orden de
 * similitud que ya devuelve TMDb.
 *
 * `pesos` es opcional y da el peso de cada lista, en el mismo orden. Sin
 * él, todas pesan 1, que es "Parecido a": las referencias las eligió el
 * usuario en el momento y ninguna vale más que otra (sección 16).
 *
 * Con pesos es el puntaje de gustos resultantes de la misma sección, donde
 * las referencias salen de dos listas con jerarquía distinta:
 * `peso(Favoritas) = 5` y `peso(Visto) = 3`.
 *
 * **CADA LISTA SUMA UNA SOLA VEZ POR TÍTULO**, y hace falta decirlo porque el
 * bucle recorre apariciones y no referencias. Una lista puede traer el mismo
 * título dos veces cuando se pidió más de una página: **TMDb repite entre
 * páginas** si su ranking se mueve entre un pedido y el siguiente (medido el
 * 2026-08-30: 1 de 60 en Buenos Muchachos). Sin este cuidado esa repetición
 * suma una coincidencia falsa, y no es solo un número mal: con tres
 * referencias hacía que un título con 4 coincidencias (imposible) encabezara
 * la lista por encima de los que de verdad compartían las tres.
 */
export function combinarSimilares(listasPorReferencia, pesos = []) {
  const mapa = new Map();
  listasPorReferencia.forEach((lista, indiceLista) => {
    const peso = pesos[indiceLista] ?? 1;
    const yaContados = new Set();
    lista.forEach((candidato, indice) => {
      const key = claveDe(candidato);
      if (!mapa.has(key)) mapa.set(key, { candidato, coincidencias: 0, mejorPosicion: indice });
      const entrada = mapa.get(key);
      entrada.mejorPosicion = Math.min(entrada.mejorPosicion, indice);
      if (yaContados.has(key)) return;
      yaContados.add(key);
      entrada.coincidencias += peso;
    });
  });
  return [...mapa.values()].sort(
    (a, b) => b.coincidencias - a.coincidencias || a.mejorPosicion - b.mejorPosicion
  );
}

/**
 * Las Preferencias (sección 6) se verifican acá como si fueran Filtros:
 * /recommendations no acepta ningún parámetro de búsqueda, así que la única forma
 * de combinarlo con el resto del formulario es quedarse con los similares
 * que además cumplen lo pedido. aplicarFiltros() ya sabe evaluar todos
 * estos campos, así que no hay lógica nueva que mantener en paralelo.
 *
 * **ACTOR/ACTRIZ Y DIRECTOR/A TAMBIÉN, desde el 2026-08-30**, y lo que hay que
 * saber es por qué no estaban: el motivo era que verificarlos exigía pedir los
 * credits de cada candidato, una llamada extra por título. **Ese motivo venció
 * en v2 y nadie volvió a mirarlo.** Desde que `credits` viaja en el
 * `append_to_response` del detalle (ver 4.12), cada candidato ya llega con los
 * IDs de su reparto y su dirección, así que la comprobación es una comparación
 * en memoria y no cuesta ni una llamada.
 *
 * Medido sobre los 40 candidatos de El Padrino: Al Pacino deja Brasco, El
 * irlandés y las dos secuelas; Scorsese deja Los asesinos de la luna, El
 * irlandés, Casino, Malas Calles y Buenos Muchachos.
 *
 * `preferencias.actores` llega como IDs sueltos y `filtros.actores` como
 * objetos `{ id, nombre }`; `alguienDeLaLista` acepta las dos formas, así que
 * acá no hay que normalizar nada.
 */
function cribaCompleta(preferencias = {}) {
  return {
    tipo: preferencias.tipo,
    generos: preferencias.generos,
    idiomas: preferencias.idiomas,
    paises: preferencias.paises,
    plataformas: preferencias.plataformas,
    anio: preferencias.anio,
    complejidad: preferencias.complejidad,
    actores: preferencias.actores,
    directores: preferencias.directores,
  };
}

/**
 * Subconjunto de la criba que se puede evaluar sobre un candidato
 * "liviano", o sea con lo que /recommendations ya devuelve sin llamadas extra:
 * géneros, idioma original y año. Sirve para descartar barato antes de
 * gastar una llamada de detalle por candidato.
 *
 * 'CLASICOS' se saca a propósito: es_clasico se calcula recién en el
 * detalle, así que evaluarlo acá descartaría clásicos por error.
 *
 * **Los géneros recreados con keywords se sacan por el mismo motivo, y sin
 * ellos la criba barata los descartaría a todos.** Terror no existe en la
 * taxonomía de series de TMDb, así que ninguna serie lo lleva en `generos`:
 * dejar el 27 acá haría que "parecido a The Walking Dead, de terror" tirara
 * cada candidato antes de mirarle las keywords. Se evalúan en cribaCompleta,
 * con el detalle ya traído (ver marcarGenerosPorKeyword).
 */
function cribaLiviana(preferencias = {}) {
  const recreables = new Set(generosRecreablesEnSerie(preferencias.generos));
  const generos = preferencias.generos?.filter(
    (g) => g !== VALOR_GENERO_CLASICOS && !recreables.has(g)
  );
  return {
    generos: generos?.length ? generos : undefined,
    idiomas: preferencias.idiomas,
    anio: preferencias.anio,
  };
}

function hayPreferencias(preferencias = {}) {
  return Object.values(preferencias).some((v) => (Array.isArray(v) ? v.length > 0 : v != null));
}

/**
 * Cuántas páginas se piden aunque la criba barata ya diga que alcanza. Existe
 * porque **el corte por criba se equivoca en dos casos que no puede ver**:
 *
 * 1. **Preferencias que la criba barata no sabe evaluar.** Un "liviano" de
 *    /recommendations trae género, idioma y año, y nada más, así que con Actor,
 *    Director, plataforma, país, tipo, complejidad o Clásicos la criba deja
 *    pasar a todos, cuenta 20 y corta en la primera página, aunque la mayoría se
 *    vaya a caer después del detalle. Medido: "parecido a El Padrino con Al
 *    Pacino" traía 3 parecidos, y Brasco, que está en la página 2, terminaba
 *    apareciendo como relleno en vez de como parecido.
 *
 * 2. **Varias referencias.** Ahí el orden que pide la sección 16 es
 *    Coincidencias(t), y con una sola página casi no hay títulos compartidos, o
 *    sea que la señal que ordena la lista prácticamente no existe. Medido sobre
 *    tres referencias (El Padrino, Buenos Muchachos y Casino): con 1 página son
 *    13 títulos compartidos y con 3 son 43. Interstellar + Origen + Gravity pasa
 *    de 6 a 20.
 *
 * **Con una sola referencia y sin Preferencias no cambia nada**: sigue cortando
 * en la primera página, con el mismo costo de siempre. Ese es el caso más común
 * y el que no había que tocar.
 */
const PAGINAS_MINIMAS = 3;

/**
 * Cuántas referencias se usan para el cruce de tipo. Mismo tope y mismo motivo
 * que en el bloque de "Porque te gustaron": el costo no crece con la cantidad
 * de referencias porque las keywords definitorias de todas se juntan en un solo
 * discover, pero el detalle de las recomendaciones de cada una sí.
 */
const MAXIMO_REFERENCIAS_CRUCE = 3;

/**
 * Los campos de Preferencias que cribaLiviana() NO puede evaluar sobre un
 * candidato liviano. 'CLASICOS' entra por el mismo motivo aunque viaje dentro
 * de `generos`: es_clasico se calcula recién con el detalle.
 */
const CAMPOS_INVISIBLES_A_LA_CRIBA = ['tipo', 'paises', 'plataformas', 'complejidad', 'actores', 'directores'];

function hayPreferenciasInvisibles(preferencias = {}) {
  if (preferencias.generos?.includes(VALOR_GENERO_CLASICOS)) return true;
  // Un género recreado con keywords tampoco se puede evaluar sin el detalle.
  if (generosRecreablesEnSerie(preferencias.generos).length) return true;
  return CAMPOS_INVISIBLES_A_LA_CRIBA.some((campo) => {
    const valor = preferencias[campo];
    return Array.isArray(valor) ? valor.length > 0 : valor != null;
  });
}

function profundidadMinima(referencias, preferencias) {
  if (referencias.length > 1 || hayPreferenciasInvisibles(preferencias)) return PAGINAS_MINIMAS;
  return 1;
}

/**
 * Trae las listas de similares, yendo más profundo solo mientras haga
 * falta: sigue pidiendo páginas hasta juntar CANTIDAD_OBJETIVO candidatos que
 * pasen la criba barata, o hasta el tope.
 *
 * El piso de profundidadMinima() se respeta ANTES de mirar la criba, porque
 * en esos dos casos la criba no sabe lo que no puede ver y cortaría de más.
 */
async function traerSimilares(referencias, preferencias, clavesReferencias, todasLasPaginas = false) {
  const listas = referencias.map(() => []);
  const criba = cribaLiviana(preferencias);
  const minimo = todasLasPaginas ? PAGINAS_SIMILARES_MAXIMAS : profundidadMinima(referencias, preferencias);
  let paginasPedidas = 0;

  for (let page = 1; page <= PAGINAS_SIMILARES_MAXIMAS; page++) {
    /**
     * `allSettled` y no `all`: una referencia que TMDb ya no tiene contesta
     * 404 y con `all` se llevaba puesta la búsqueda ENTERA, que terminaba en
     * un 500. No hace falta un pedido raro para llegar ahí — alcanza con que
     * TMDb borre un título que alguien tiene en Favoritas y use el atajo de
     * "usar mis favoritas como referencia". Es el mismo criterio con el que
     * ya se tratan una spec de discover que falla y un candidato al que no
     * se le puede traer el detalle: se descarta esa parte y la búsqueda
     * sigue.
     */
    const resueltas = await Promise.allSettled(
      referencias.map((ref) => obtenerSimilares(ref.tmdb_id, ref.tipo, page))
    );
    const tandas = resueltas.map((r) => (r.status === 'fulfilled' ? r.value : []));
    const fallidas = resueltas.filter((r) => r.status === 'rejected').length;
    if (fallidas) console.warn(`${fallidas} referencias de "Parecido a" fallaron y se descartan.`);
    tandas.forEach((tanda, i) => listas[i].push(...tanda));
    paginasPedidas = page;

    // TMDb se quedó sin similares para todas las referencias.
    if (tandas.every((t) => t.length === 0)) break;

    if (page < minimo) continue;

    const candidatos = combinarSimilares(listas)
      .map(({ candidato }) => candidato)
      .filter((c) => !clavesReferencias.has(claveDe(c)));
    if (aplicarFiltros(candidatos, criba).length >= CANTIDAD_OBJETIVO) break;
  }

  return { listas, paginasPedidas };
}

/**
 * `referencias`: array de { tmdb_id, tipo } — uno o varios títulos elegidos
 * por el usuario (sección 6: "una o varias películas/series").
 * `preferencias`: el resto del formulario de Preferencias, que se aplica
 * sobre los similares (ver cribaCompleta). Opcional: sin esto, el flujo se
 * comporta exactamente como antes.
 * `filtros` / `ordenar`: como en el resto del motor.
 * `conRelleno`: si completar la lista con populares cuando los parecidos no
 * llegan a CANTIDAD_OBJETIVO (ver completarLista). Lo apaga la búsqueda con
 * prioridades, donde las divisiones ya cumplen ese papel y un título de
 * relleno (con `coincidencias: 0`) caería en la división equivocada.
 *
 * Los títulos que salieron de las listas de similares llevan
 * `coincidencias >= 1`; los que entraron para completar la lista llevan
 * `coincidencias: 0`, que es lo que le permite al frontend mostrarlos
 * aparte en vez de hacerlos pasar por parecidos.
 */
export async function buscarParecidoA(
  referencias,
  {
    preferencias = {},
    filtros = {},
    ordenar,
    conRelleno = true,
    conCruce = true,
    lote = 1,
    agregados: agregadosProvistos,
  } = {}
) {
  if (!referencias?.length) {
    throw new Error('Hace falta al menos un título de referencia para "Parecido a".');
  }

  // Ver MAXIMO_REFERENCIAS: acá y no en la ruta, porque esta función tiene
  // tres consumidores (la ruta, la Ficha y las divisiones por prioridad) y
  // el tope tiene que valer para los tres.
  if (referencias.length > MAXIMO_REFERENCIAS) {
    console.warn(
      `Se pidieron ${referencias.length} referencias en "Parecido a"; se usan las primeras ${MAXIMO_REFERENCIAS}.`
    );
    referencias = referencias.slice(0, MAXIMO_REFERENCIAS);
  }

  /**
   * Opcional: quien ya la leyó (las divisiones por prioridad corren varias
   * búsquedas por pedido) la pasa acá en vez de hacer que cada una la vuelva
   * a pedir — ver el mismo parámetro en buscar().
   */
  const agregados = agregadosProvistos ?? (await leerAgregados());
  if (!agregados) {
    throw new Error('No hay agregados calculados todavía. Corré "npm run seed" y "npm run recalcular" primero.');
  }


  /**
   * El segundo lote no vuelve a decidir la profundidad: se trae las páginas
   * que el primero no pidió, y por eso arranca de la 1 en vez de saltar a un
   * tramo nuevo. Pedir de más y deduplicar cuesta unas pocas llamadas de lista
   * (el detalle de lo repetido ya está en el caché), y a cambio no queda
   * ningún hueco: un lote que arrancara donde "debería" se saltearía las
   * páginas que el primero no llegó a mirar, que son las más parecidas de las
   * que faltan.
   */
  const ampliado = lote > 1;
  const tope = ampliado ? MAXIMO_CANDIDATOS_A_DETALLAR_AMPLIADO : MAXIMO_CANDIDATOS_A_DETALLAR;

  /**
   * Se declara acá arriba porque el cruce de tipo la usa después de armar la
   * lista, y necesita las referencias con detalle y sus listas de similares.
   */
  let cruzarParaReferencias = async () => ({ cruzados: [], afinidad: () => 0 });

  const clavesReferencias = new Set(referencias.map((r) => claveDe(r)));
  const { listas, paginasPedidas } = await traerSimilares(
    referencias,
    preferencias,
    clavesReferencias,
    ampliado
  );

  const combinados = combinarSimilares(listas).filter(
    ({ candidato }) => !clavesReferencias.has(claveDe(candidato))
  );

  const mapaCoincidencias = new Map(
    combinados.map(({ candidato, coincidencias }) => [claveDe(candidato), coincidencias])
  );
  /**
   * La posición de similitud que devuelve TMDb es el desempate que pide la
   * sección 16, y hay que conservarla a mano: completarDetalle() resuelve
   * los detalles en paralelo y devuelve los candidatos en el orden en que
   * fueron respondiendo, no en el de entrada.
   */
  const mapaPosicion = new Map(
    combinados.map(({ candidato, mejorPosicion }) => [claveDe(candidato), mejorPosicion])
  );

  /**
   * Criba barata primero: descarta con lo que /recommendations ya trajo, para no
   * pagar una llamada de detalle por candidato que igual se iba a caer.
   */
  const cribados = aplicarFiltros(
    combinados.map(({ candidato }) => candidato),
    cribaLiviana(preferencias)
  );
  const livianos = cribados.slice(0, tope);

  /**
   * Hay más para traer si quedaron páginas sin pedir o si el tope de detalle
   * recortó candidatos que ya teníamos. En el lote ampliado no se ofrece de
   * nuevo: ahí ya se pidieron todas las páginas que el tope permite.
   */
  const hayMas =
    !ampliado && (paginasPedidas < PAGINAS_SIMILARES_MAXIMAS || cribados.length > tope);

  /**
   * Los géneros que TMDb no tiene para series ya vienen resueltos en
   * `generosInferidos` desde completarDetalle, así que cribaCompleta los
   * evalúa como cualquier otro género. Lo único que no puede es cribaLiviana,
   * porque el liviano de /recommendations no trae keywords (ver más arriba).
   */
  const completos = await completarDetalle(livianos, agregados, { soloRecomendables: true });

  /**
   * El cruce necesita las referencias con detalle (para sus keywords) y las
   * recomendaciones de CADA UNA con detalle (para la frecuencia). Se pide
   * aparte y no se reusa `completos`, que es la mezcla de todas las referencias
   * recortada al tope: con varias, a cada una le tocan unas pocas de sus 20 y
   * sesgadas, y la frecuencia se va a cero sin que falle nada. Es barato porque
   * casi todo ya está en el caché de detalle.
   *
   * **La exclusión usa `completados` (definido más abajo) y no `completos`**
   * (2026-09-01): esta función se INVOCA después de armar `completados`, que ya
   * incluye el relleno de completarLista(). Con `completos` (pre-relleno), un
   * título agregado como relleno (que en la rama sin Preferencias puede ser del
   * otro tipo, ver completarLista) no quedaba excluido acá, así que cruzarDeTipo
   * podía volver a traerlo y aparecía duplicado: una vez como relleno
   * (coincidencias: 0) y otra como cruzado (coincidencias: 0, cruzado: true).
   * JS resuelve esto bien: la función es un closure sobre `completados`, y para
   * cuando se ejecuta (más abajo) esa constante ya tiene su valor final.
   */
  cruzarParaReferencias = async () => {
    const paraCruce = referencias.slice(0, MAXIMO_REFERENCIAS_CRUCE);
    const [detalleReferencias, recomendaciones] = await Promise.all([
      completarDetalle(paraCruce, agregados).catch(() => []),
      completarDetalle(paraCruce.flatMap((_, i) => listas[i] ?? []), agregados).catch(() => []),
    ]);
    /**
     * Por clave y no por índice: completarDetalle devuelve en orden de
     * respuesta, así que emparejar por posición le da a cada referencia la
     * lista de otra.
     */
    const refPorClave = new Map(detalleReferencias.map((r) => [claveDe(r), r]));
    const recoPorClave = new Map(recomendaciones.map((r) => [claveDe(r), r]));

    return cruzarDeTipo({
      entradas: paraCruce.map((ref, i) => ({
        referencia: refPorClave.get(claveDe(ref)),
        recomendaciones: (listas[i] ?? []).map((x) => recoPorClave.get(claveDe(x))).filter(Boolean),
      })),
      agregados,
      excluir: new Set([...clavesReferencias, ...completados.map(claveDe)]),
    }).catch(() => ({ cruzados: [], afinidad: () => 0 }));
  };

  const parecidos = aplicarFiltros(completos, cribaCompleta(preferencias))
    .map((c) => ({ ...c, coincidencias: mapaCoincidencias.get(claveDe(c)) ?? 0 }))
    .sort(
      (a, b) =>
        b.coincidencias - a.coincidencias ||
        (mapaPosicion.get(claveDe(a)) ?? Infinity) - (mapaPosicion.get(claveDe(b)) ?? Infinity)
    );

  const completados = conRelleno
    ? await completarLista(parecidos, { referencias, preferencias, clavesReferencias, agregados })
    : parecidos;

  /**
   * Títulos del OTRO tipo: series para quien pidió parecidos a una película y al
   * revés (ver cruceDeTipo.js). TMDb no tiene recomendaciones cruzadas, así que
   * esto es lo único que puede contestar Los Soprano a "parecido a El Padrino".
   *
   * **VAN AL FINAL Y NO DESPLAZAN NADA**: se concatenan después de los parecidos
   * Y del relleno, y salen con `coincidencias: 0`. La pantalla ya tiene dónde
   * ponerlos sin inventar una sección: es la misma en la que cae el relleno,
   * "Otros que pueden interesarte".
   *
   * **Solo con `conRelleno`**, que lo apagan las divisiones por prioridad: ahí
   * cada división es una búsqueda aparte y un título cruzado, con coincidencias
   * 0, caería en la división equivocada. Es el mismo motivo por el que el
   * relleno tampoco corre ahí.
   *
   * **Y solo en el primer lote.** El segundo trae las páginas de similares que
   * el primero no miró; el cruce no tiene páginas nuevas que ofrecer y volvería
   * a proponer los mismos, que el frontend deduplicaría igual.
   *
   * **`conCruce` lo apaga la Ficha**, que es el tercer consumidor de esta
   * función y el único que no puede mostrarlos: su lista es plana, sin
   * secciones, y va bajo el encabezado "Parecido a esto", que es una afirmación
   * que un título de otro tipo sin etiqueta no sostiene. Encima los descartaba
   * igual, porque corta en 10 y los cruzados van al final: pagaba el cálculo
   * para tirarlo (medido: 0 de 10 en seis fichas, y ~0,4 s por pedido).
   */
  const { cruzados, afinidad } = conCruce && conRelleno && !ampliado
    ? await cruzarParaReferencias()
    : { cruzados: [], afinidad: () => 0 };

  /**
   * Las Preferencias mandan también sobre los cruzados: si alguien pidió
   * parecidos a El Padrino en español, uno que no lo cumpla no tiene por qué
   * colarse solo por venir de otra rama.
   */
  const cruzadosValidos = aplicarFiltros(cruzados, cribaCompleta(preferencias));

  const filtrados = aplicarFiltros(completados, filtros);
  const ordenados = ordenarResultados(filtrados, ordenar ?? { campo: 'coincidencias', direccion: 'desc' });

  /**
   * **Los cruzados se intercalan, no se pegan al final.** Cada uno entra
   * después de todos los del mismo tipo que le ganan en afinidad, así que una
   * película que se parece más que la decimoquinta serie de la lista queda
   * arriba de ella en vez de abajo de todo. El orden de los del mismo tipo no
   * se toca (ver intercalarPorAfinidad).
   *
   * Va DESPUÉS de ordenarResultados a propósito: ese sort es por Coincidencias,
   * que los cruzados tienen en 0, así que hacerlo antes los mandaría al fondo
   * de nuevo. Si el usuario elige un orden propio desde el panel, ahí sí manda
   * el suyo y los cruzados caen donde les toque.
   */
  const resultados = ordenar
    ? ordenarResultados(aplicarFiltros([...filtrados, ...cruzadosValidos], filtros), ordenar)
    : intercalarPorAfinidad(ordenados, aplicarFiltros(cruzadosValidos, filtros), afinidad);

  return {
    resultados,
    hayMas,
    /**
     * Cuántos parecidos encontró la búsqueda, **antes** de que los saquen el
     * relleno, los Filtros y sobre todo la exclusión de "Visto" que aplica la
     * ruta. Es lo único que le permite a la pantalla distinguir "no existen"
     * de "ya los viste a todos", que son dos cosas muy distintas para decirle
     * a alguien y que desde el otro lado se ven igual: cero parecidos.
     */
    parecidosEncontrados: parecidos.length,
  };
}

/**
 * Sección 16: "Si faltan títulos para completar la recomendación, se
 * completa con populares, priorizando género compartido con las
 * referencias". Con Preferencias activas eso se generaliza a "populares
 * que cumplen las Preferencias", que es lo único coherente: completar con
 * títulos que las incumplen sería contradecir lo que el usuario pidió.
 *
 * El relleno se corta en cuanto la lista llega a CANTIDAD_OBJETIVO: es
 * para completar, no para inundar. Sin ese corte, una búsqueda con
 * Preferencias angostas devolvía 1 parecido y 80 títulos que solo
 * cumplían las preferencias, que es exactamente la impresión equivocada.
 */
async function completarLista(parecidos, { referencias, preferencias, clavesReferencias, agregados }) {
  if (parecidos.length >= CANTIDAD_OBJETIVO) return parecidos;

  const faltan = CANTIDAD_OBJETIVO - parecidos.length;
  const yaEstan = new Set(parecidos.map(claveDe));
  const excluir = (c) => !clavesReferencias.has(claveDe(c)) && !yaEstan.has(claveDe(c));

  /**
   * Con Preferencias, el relleno se pide con el motor de siempre, que ya
   * sabe resolverlas todas (incluidos Clásicos, país múltiple, etc.).
   */
  if (hayPreferencias(preferencias)) {
    const { resultados } = await buscar({ preferencias, agregados });
    return [
      ...parecidos,
      ...resultados.filter(excluir).slice(0, faltan).map((c) => ({ ...c, coincidencias: 0 })),
    ];
  }

  /**
   * Sin Preferencias, el criterio del Definitivo: populares que compartan
   * género con las referencias.
   */
  /**
   * `allSettled` por el mismo motivo que en `traerSimilares`: una referencia
   * que TMDb ya no tiene contesta 404, y con `all` se llevaba puesta la
   * búsqueda ENTERA. Ahí se arregló al encontrarlo; acá quedaba el mismo
   * `Promise.all` sin tolerancia, así que el relleno seguía tumbando el
   * pedido — y es un camino MUY alcanzable, porque `completarLista` corre
   * justamente cuando los parecidos no llegaron a 20.
   */
  const resueltas = await Promise.allSettled(
    referencias.map((ref) => obtenerDetalle(ref.tmdb_id, ref.tipo))
  );
  const detallesReferencias = resueltas.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const fallidas = resueltas.length - detallesReferencias.length;
  if (fallidas) console.warn(`${fallidas} referencias sin detalle al completar la lista; se descartan.`);
  const generosCompartidos = [...new Set(detallesReferencias.flatMap((d) => d.generos ?? []))];

  const livianos = [];
  for (const tipo of ['pelicula', 'tv']) {
    const pagina =
      tipo === 'pelicula'
        ? await discoverPeliculas({ page: 1, sortBy: 'popularity.desc', generos: generosCompartidos })
        : await discoverSeries({ page: 1, sortBy: 'popularity.desc', generos: generosCompartidos });
    for (const candidato of pagina) {
      if (excluir(candidato) && !livianos.some((l) => claveDe(l) === claveDe(candidato))) {
        livianos.push(candidato);
      }
    }
  }

  const completos = await completarDetalle(livianos.slice(0, faltan), agregados, { soloRecomendables: true });
  return [...parecidos, ...completos.map((c) => ({ ...c, coincidencias: 0 }))];
}
