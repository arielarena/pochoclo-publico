import { buscar } from '../buscador/motorBusqueda.js';
import { buscarParecidoA } from './parecidoA.js';
import { leerAgregados } from '../repositories/agregados.js';
import { aplicarFiltros, ordenar as ordenarResultados } from '../logic/resultados.js';
import { claveDe } from '../utils/clave.js';

/**
 * Priorizar preferencias (sección 6 del Definitivo).
 *
 * La regla, en una línea: **ante prioridades en conflicto, los resultados se
 * dividen, y cada división ignora únicamente las otras prioridades**. Todo lo
 * que el usuario pidió sin priorizar (y todos los Filtros) sigue aplicando en
 * las dos divisiones.
 *
 * Cómo se implementa, que es más simple de lo que parece. Son dos etapas, y
 * la primera es la que casi siempre alcanza:
 *
 *  1. **La búsqueda de siempre, con todas las Preferencias.** Si devuelve lo
 *     suficiente, las prioridades no están en conflicto y no hay nada que
 *     dividir: se responde esa lista, sin divisiones y sin haber gastado una
 *     sola llamada de más. Marcar "Priorizar" no tiene por qué cambiar nada
 *     cuando lo que el usuario pidió sí existe.
 *  2. Recién si aquello vino flaco (ver UMBRAL_CONFLICTO), se hace **una
 *     corrida por prioridad**, con las Preferencias completas menos las
 *     OTRAS prioridades. Cada corrida es una búsqueda normal: no hay ningún
 *     mecanismo nuevo en el motor. Después se juntan todos los candidatos en
 *     un conjunto deduplicado, a cada uno se le pregunta **cuáles
 *     prioridades cumple** (con `aplicarFiltros` y una sola clave por vez —
 *     los campos de Preferencias son un subconjunto de los de Filtros, el
 *     mismo truco que usa "Parecido a" para combinarse con ellas), y se
 *     agrupan por el conjunto exacto de prioridades cumplidas.
 *
 * De ahí sale sola la otra mitad de la sección: *"Si existen combinaciones
 * que satisfacen varias prioridades a la vez, esas se muestran primero. Si
 * no, el orden queda determinado por el orden de selección de prioridad"* es
 * exactamente ordenar los grupos por cantidad de prioridades cumplidas y
 * desempatar por el orden en que el usuario las eligió.
 *
 * Ojo con dos cosas que la sección aclara y que están respetadas acá:
 *
 *  - **"Ver clásicos" no tiene botón propio**: viaja dentro de
 *    `preferencias.generos`, así que priorizar Género lo arrastra y quitar
 *    Género de una división lo quita también.
 *  - **Una sola prioridad no hace nada.** No hay con qué entrar en
 *    conflicto, y "todo lo demás sigue aplicando", así que la búsqueda es la
 *    de siempre. Por eso `buscarConDivisiones` devuelve null con menos de
 *    dos y el llamador sigue por el camino normal.
 */

/**
 * Las categorías de Preferencias que pueden priorizarse, con el nombre que
 * ve el usuario. La clave es la del campo dentro de `preferencias`, salvo
 * `parecidoA`, que no es un campo sino las referencias de la búsqueda.
 */
export const CATEGORIAS_PRIORIZABLES = {
  tipo: 'Tipo',
  parecidoA: 'Parecido a',
  plataformas: 'Disponible en',
  generos: 'Género',
  actores: 'Actor/actriz',
  directores: 'Director/a',
  paises: 'País de origen',
  idiomas: 'Idioma original',
  anio: 'Año',
  complejidad: 'Complejidad',
};

/**
 * Tope de prioridades simultáneas.
 *
 * Cada prioridad suma una búsqueda entera cuando hay conflicto (ver arriba):
 * el peor caso son N+1 corridas, y aunque las N van en paralelo, cada una son
 * sus propias llamadas a /discover y sus propios detalles. Sin tope,
 * priorizar las diez categorías serían once búsquedas completas de una
 * sentada. Cuatro cubre cualquier uso realista (el ejemplo del Definitivo son
 * dos) y deja el peor caso en cinco corridas.
 *
 * El formulario no deja marcar más, así que este recorte no debería llegar a
 * activarse nunca; está por si el pedido llega igual. Ojo con qué pasa cuando
 * se activa: la prioridad recortada **no se pierde, se degrada a Preferencia
 * común**, o sea que sigue filtrando en todas las divisiones en vez de tener
 * una propia.
 */
export const MAXIMO_PRIORIDADES = 4;

/**
 * Cuándo se considera que las prioridades están en conflicto.
 *
 * La sección habla de dividir "ante prioridades conflictivas", y el ejemplo
 * que da es el caso extremo: *no hay títulos que cumplan los dos*. Pero
 * cortar solo en cero dejaría afuera el caso incómodo de verdad, que es
 * cuando sí hay pero son tres: ahí el usuario igual necesita ver las
 * alternativas de cada lado.
 *
 * Veinte es el mismo número que usa el resto de la app para "una
 * recomendación completa" (el top de "Me siento con suerte", el objetivo de
 * relleno de "Parecido a").
 */
const UMBRAL_CONFLICTO = 20;

function tieneValor(valor) {
  if (Array.isArray(valor)) return valor.length > 0;
  return valor != null && valor !== '';
}

function formatearLista(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, y ${items[items.length - 1]}`;
}

/**
 * Se queda con las prioridades que existen, no están repetidas, y tienen algo
 * cargado en su campo. Priorizar una categoría vacía no significa nada: no
 * hay nada que hacer valer ni con qué entrar en conflicto.
 */
export function normalizarPrioridades(prioridades, preferencias = {}, referencias = []) {
  if (!Array.isArray(prioridades)) return [];
  const vistas = new Set();
  return prioridades
    .filter((categoria) => {
      if (!(categoria in CATEGORIAS_PRIORIZABLES) || vistas.has(categoria)) return false;
      vistas.add(categoria);
      return categoria === 'parecidoA' ? referencias.length > 0 : tieneValor(preferencias[categoria]);
    })
    .slice(0, MAXIMO_PRIORIDADES);
}

/**
 * Las Preferencias sin las categorías indicadas. `parecidoA` no se saca acá
 * porque no vive en `preferencias`: se resuelve dejando de usar las
 * referencias en esa división (ver ejecutarVariante).
 */
function preferenciasSin(preferencias = {}, categorias = []) {
  const copia = { ...preferencias };
  for (const categoria of categorias) {
    if (categoria !== 'parecidoA') delete copia[categoria];
  }
  return copia;
}

/**
 * ¿Este candidato cumple esta prioridad?
 *
 * Para todas las categorías menos una, es `aplicarFiltros` con una sola
 * clave. `parecidoA` es la excepción: "ser parecido a las referencias" no es
 * un campo del candidato, se sabe por haber salido de una lista de similares,
 * que es justo lo que cuenta `coincidencias`.
 */
export function cumplePrioridad(candidato, categoria, preferencias = {}) {
  if (categoria === 'parecidoA') return (candidato.coincidencias ?? 0) > 0;
  return aplicarFiltros([candidato], { [categoria]: preferencias[categoria] }).length === 1;
}

function tituloDeDivision(cumplidas, activas) {
  if (cumplidas.length === activas.length) return 'Cumplen todas tus prioridades';
  return `Cumplen ${formatearLista(cumplidas.map((c) => CATEGORIAS_PRIORIZABLES[c]))}`;
}

function descripcionDeDivision(cumplidas, activas) {
  const afuera = activas.filter((a) => !cumplidas.includes(a));
  if (!afuera.length) return undefined;
  return `Dejan afuera ${formatearLista(
    afuera.map((c) => CATEGORIAS_PRIORIZABLES[c])
  )}. El resto de lo que pediste sigue aplicando.`;
}

/**
 * Ordena las divisiones como pide la sección: primero las que cumplen más
 * prioridades a la vez, y entre las que empatan, por el orden en que el
 * usuario eligió las prioridades (que es el orden de `activas`, y por eso
 * `cumplidas` lo conserva).
 */
function compararDivisiones(a, b, activas) {
  if (a.cumplidas.length !== b.cumplidas.length) return b.cumplidas.length - a.cumplidas.length;
  for (let i = 0; i < a.cumplidas.length; i++) {
    const diferencia = activas.indexOf(a.cumplidas[i]) - activas.indexOf(b.cumplidas[i]);
    if (diferencia) return diferencia;
  }
  return 0;
}

/**
 * Corre una división: la búsqueda de siempre, con las Preferencias completas
 * menos las prioridades que esta división ignora.
 *
 * Con referencias cargadas el flujo es "Parecido a" en vez de discover, salvo
 * que justamente `parecidoA` sea una de las prioridades ignoradas, que es lo
 * que hace que la división de otra categoría pueda salirse de los similares.
 * El relleno de "Parecido a" se apaga: acá las divisiones ya cumplen ese
 * papel, y sumarle títulos con `coincidencias: 0` los haría caer en el grupo
 * equivocado.
 */
async function ejecutarVariante({ ignoradas }, { referencias, preferencias, lote, agregados }) {
  const preferenciasVariante = preferenciasSin(preferencias, ignoradas);

  if (referencias.length > 0 && !ignoradas.includes('parecidoA')) {
    const { resultados } = await buscarParecidoA(referencias, {
      preferencias: preferenciasVariante,
      conRelleno: false,
      agregados,
    });
    return { resultados, hayMas: false };
  }

  return buscar({ preferencias: preferenciasVariante, lote, agregados });
}

/**
 * `prioridades`: array de claves de CATEGORIAS_PRIORIZABLES, en el orden en
 * que el usuario las eligió.
 * `depurar`: función opcional que se aplica sobre la lista de candidatos
 * antes de agruparla (la usan las rutas para descontar los títulos en
 * "Visto", sección 5).
 *
 * Devuelve `{ resultados, bloques, hayMas }` con la misma forma que la
 * búsqueda con formulario vacío (lista plana, cada título marcado con su
 * `bloque`, más el índice de bloques): así `PaginaResultados` las muestra en
 * secciones sin UI nueva, y los filtros y el orden del cliente siguen
 * trabajando sobre una lista plana. Cuando no hay conflicto, `bloques` viene
 * vacío y la pantalla muestra la lista de siempre.
 *
 * Devuelve **null** cuando no hay nada que priorizar (menos de dos
 * prioridades con contenido), para que el llamador siga por el camino de
 * siempre.
 */
export async function buscarConDivisiones({
  referencias = [],
  preferencias = {},
  filtros = {},
  ordenar,
  prioridades,
  lote = 1,
  depurar = (resultados) => resultados,
} = {}) {
  const activas = normalizarPrioridades(prioridades, preferencias, referencias);
  if (activas.length < 2) return null;

  /**
   * Se lee UNA vez acá y se pasa a cada corrida (hasta activas.length + 1):
   * sin esto, cada `buscar()`/`buscarParecidoA()` volvía a pedirle a Neon la
   * misma fila que casi no cambia (se recalcula una vez por semana).
   */
  const agregados = await leerAgregados();
  const contexto = { referencias, preferencias, lote, agregados };
  const ordenInterno = ordenar ?? { campo: 'popularidad', direccion: 'desc' };
  const visibles = (lista) => depurar(aplicarFiltros(lista, filtros));

  /**
   * Etapa 1: la búsqueda que respeta TODAS las prioridades a la vez. Si
   * alcanza, no hay conflicto y no hay nada que dividir.
   */
  const combinada = await ejecutarVariante({ ignoradas: [] }, contexto);
  const cumplenTodo = visibles(combinada.resultados);

  if (cumplenTodo.length >= UMBRAL_CONFLICTO) {
    return {
      resultados: ordenarResultados(cumplenTodo, ordenInterno),
      bloques: [],
      hayMas: combinada.hayMas,
    };
  }

  // Etapa 2: una corrida por prioridad, ignorando solo las otras.
  const corridas = [
    combinada,
    ...(await Promise.all(
      activas.map((categoria) =>
        ejecutarVariante({ ignoradas: activas.filter((otra) => otra !== categoria) }, contexto)
      )
    )),
  ];

  /**
   * Un solo conjunto, sin repetidos. Cuando el mismo título aparece en varias
   * corridas nos quedamos con la versión que traiga `coincidencias`: es la
   * única que sabe si es parecido a las referencias, y de eso depende que la
   * prioridad "Parecido a" se le cuente.
   */
  const conjunto = new Map();
  for (const { resultados } of corridas) {
    for (const candidato of resultados) {
      const clave = claveDe(candidato);
      const previo = conjunto.get(clave);
      if (!previo || (candidato.coincidencias ?? 0) > (previo.coincidencias ?? 0)) {
        conjunto.set(clave, candidato);
      }
    }
  }

  const candidatos = visibles([...conjunto.values()]);

  const grupos = new Map();
  for (const candidato of candidatos) {
    const cumplidas = activas.filter((categoria) => cumplePrioridad(candidato, categoria, preferencias));
    /**
     * Un candidato que no cumple ninguna prioridad no tiene división donde
     * ir. No debería pasar (cada corrida garantiza la suya), pero los datos
     * pueden moverse entre el discover y el detalle.
     */
    if (!cumplidas.length) continue;
    const clave = cumplidas.join('+');
    if (!grupos.has(clave)) grupos.set(clave, { clave, cumplidas, resultados: [] });
    grupos.get(clave).resultados.push(candidato);
  }

  /**
   * Dentro de cada división, el orden de siempre. La lista viene de varias
   * corridas mezcladas, así que el orden natural de discover ya se perdió y
   * hay que reponer uno explícito.
   */
  const divisiones = [...grupos.values()]
    .sort((a, b) => compararDivisiones(a, b, activas))
    .map((division) => ({
      ...division,
      titulo: tituloDeDivision(division.cumplidas, activas),
      descripcion: descripcionDeDivision(division.cumplidas, activas),
      resultados: ordenarResultados(division.resultados, ordenInterno),
    }));

  return {
    resultados: divisiones.flatMap((d) => d.resultados.map((r) => ({ ...r, bloque: d.clave }))),
    bloques: divisiones.map(({ clave, titulo, descripcion }) => ({ clave, titulo, descripcion })),
    hayMas: corridas.some((c) => c.hayMas),
  };
}
