import { VALOR_GENERO_CLASICOS } from './clasificacion.js';

/**
 * Aplica los Filtros (sección 7) sobre una lista de candidatos ya
 * normalizados y clasificados (con es_clasico/complejidad/edad/duracion/
 * temporadas/episodios/estado ya calculados). Se combinan con AND entre sí.
 *
 * `filtros` es un objeto con SOLO las claves que el usuario activó; una
 * clave ausente significa "no aplica ese filtro".
 *
 * filtros.generos: array que puede mezclar IDs numéricos de género y el
 * valor sintético VALOR_GENERO_CLASICOS (mismo mecanismo de la sección 12).
 * Acá los dos lados se combinan con OR entre sí (un candidato pasa si
 * matchea alguno de los géneros O si es clásico), igual que en Preferencias.
 */
export function aplicarFiltros(candidatos, filtros = {}) {
  return candidatos.filter((c) => cumpleFiltros(c, filtros));
}

/**
 * El campo Año (sección 6) tiene dos modalidades: un rango ("antes de" /
 * "después de" / entre dos años) o una selección de varios años y décadas
 * sueltos. Para no terminar con dos campos que significan lo mismo, `anio`
 * acepta las dos formas: un objeto ({ exacto } o { desde, hasta }) o un
 * array de esos objetos, que se combinan con OR entre sí, como cualquier
 * otro campo de Preferencias.
 *
 * Devuelve siempre una lista de tramos { desde, hasta }, con `exacto`
 * traducido a un tramo de un año.
 */
export function normalizarTramosAnio(anio) {
  if (!anio) return [];
  const tramos = Array.isArray(anio) ? anio : [anio];
  return tramos
    .map((t) => (t?.exacto != null ? { desde: t.exacto, hasta: t.exacto } : t))
    .filter((t) => t && (t.desde != null || t.hasta != null));
}

function cumpleAnio(c, anio) {
  const tramos = normalizarTramosAnio(anio);
  if (!tramos.length) return true;
  if (c.anio == null) return false;
  return tramos.some(
    (t) => (t.desde == null || c.anio >= t.desde) && (t.hasta == null || c.anio <= t.hasta)
  );
}

/**
 * OR dentro del campo, como el resto de los campos de selección múltiple:
 * el título pasa si aparece cualquiera de las personas elegidas. Acepta
 * tanto objetos { id } como IDs sueltos, para no obligar a quien llame a
 * conocer la forma exacta.
 */
function alguienDeLaLista(delTitulo, elegidas) {
  const ids = new Set((delTitulo ?? []).map(Number));
  return elegidas.some((p) => ids.has(Number(p?.id ?? p)));
}

function cumpleFiltros(c, f) {
  /**
   * "tipoContenido" es la clasificación de 3 vías (pelicula/miniserie/serie,
   * sección 11), distinta de c.tipo que es el media type crudo de TMDb
   * (pelicula/tv) usado internamente para saber qué endpoint llamar.
   */
  if (f.tipo?.length && !f.tipo.includes(c.tipoContenido)) return false;

  if (f.generos?.length) {
    const pideClasicos = f.generos.includes(VALOR_GENERO_CLASICOS);
    const idsGenero = f.generos.filter((g) => g !== VALOR_GENERO_CLASICOS);
    /**
     * `generosInferidos` son los géneros que la SERIE cumple sin que TMDb se
     * los asigne, deducidos de sus keywords (Terror, Thriller, Historia,
     * Romance y Música no existen en la taxonomía de series; ver
     * inferirGenerosDeSerie). Sin mirarlo acá, filtrar por Terror hace
     * desaparecer justamente a las series de terror.
     */
    const suyos = [...c.generos, ...(c.generosInferidos ?? [])];
    const matcheaGenero = idsGenero.length > 0 && suyos.some((g) => idsGenero.includes(g));
    const matcheaClasico = pideClasicos && c.es_clasico === true;
    if (!matcheaGenero && !matcheaClasico) return false;
  }

  if (!cumpleAnio(c, f.anio)) return false;

  if (f.idiomas?.length && !f.idiomas.includes(c.idioma)) return false;

  if (f.paises?.length && !(c.paisOrigen ?? []).some((p) => f.paises.includes(p))) return false;

  if (f.plataformas?.length && !(c.plataformas ?? []).some((p) => f.plataformas.includes(p))) return false;

  /**
   * **Ojo: la complejidad es UN valor, no una lista**, a diferencia de casi
   * todos sus vecinos de acá arriba. Pasarle un array la compara con !== y
   * no coincide nunca, o sea que descarta todo y devuelve cero sin quejarse.
   */
  if (f.complejidad && c.complejidad !== f.complejidad) return false;

  /**
   * Actor/Director como Filtro (sección 7). En v1 no existía porque
   * verificarlo exigía pedir los credits de cada candidato en cada
   * búsqueda; desde que el detalle se cachea con los IDs del reparto
   * (ver idsDeReparto en services/tmdb.js), es una comparación en memoria.
   *
   * El campo trae objetos { id, nombre } y no IDs sueltos: el panel de
   * filtros necesita el nombre para dibujar el chip, y el filtro sigue
   * vivo aunque el panel se cierre. Preferencias, en cambio, manda solo
   * IDs, porque ahí el formulario nunca se desmonta.
   */
  if (f.actores?.length && !alguienDeLaLista(c.actores, f.actores)) return false;
  if (f.directores?.length && !alguienDeLaLista(c.directores, f.directores)) return false;

  if (f.puntuacionMinima != null && (c.puntuacion == null || c.puntuacion < f.puntuacionMinima)) return false;

  if (c.tipo === 'pelicula') {
    if (f.duracion?.mayorA != null && (c.duracion == null || c.duracion <= f.duracion.mayorA)) return false;
    if (f.duracion?.menorA != null && (c.duracion == null || c.duracion >= f.duracion.menorA)) return false;
  }

  if (c.tipo === 'tv') {
    if (f.temporadas?.mayorA != null && (c.temporadas == null || c.temporadas <= f.temporadas.mayorA)) return false;
    if (f.temporadas?.menorA != null && (c.temporadas == null || c.temporadas >= f.temporadas.menorA)) return false;
    if (f.episodios?.mayorA != null && (c.episodios == null || c.episodios <= f.episodios.mayorA)) return false;
    if (f.episodios?.menorA != null && (c.episodios == null || c.episodios >= f.episodios.menorA)) return false;

    /**
     * Duración total en minutos: lo que lleva ver la serie entera. Sale de
     * cruzar la duración por episodio de TVMaze con la cantidad de
     * episodios de TMDb (ver datosDeTvmaze en motorBusqueda.js), así que no
     * todas las series lo tienen. Las que no, quedan afuera cuando el
     * filtro está activo, igual que con el resto de los filtros numéricos.
     */
    if (f.duracionTotal?.mayorA != null && (c.duracionTotal == null || c.duracionTotal <= f.duracionTotal.mayorA)) return false;
    if (f.duracionTotal?.menorA != null && (c.duracionTotal == null || c.duracionTotal >= f.duracionTotal.menorA)) return false;

    // Estado: los cancelados quedan afuera de las dos opciones (sección 7).
    if (f.estado) {
      if (c.estado === 'Canceled') return false;
      if (f.estado === 'terminada' && c.estado !== 'Ended') return false;
      if (f.estado === 'en_emision' && c.estado === 'Ended') return false;
    }
  }

  if (f.limitesEdad?.length) {
    /**
     * Selección múltiple, combinada con OR dentro del campo (mismo
     * mecanismo que Tipo o Género): el candidato pasa si su edad es
     * exactamente una de las marcadas. "Sin clasificar" queda afuera
     * cuando el filtro está activo, porque no es uno de los tres valores
     * seleccionables.
     */
    if (c.edad == null || !f.limitesEdad.includes(c.edad)) return false;
  }

  return true;
}

/**
 * Ruido mínimo para el orden "natural": el que arman solos
 * `buscarConFormularioVacio` y `buscarPorEstadoAnimo` cuando nadie pidió un
 * orden a propósito (Opciones 1, 3 y 4 con el `Ordenar` del panel en "Sin
 * ordenar"). El `Ordenar` explícito NUNCA lo pide — ver `ordenar()` abajo:
 * es lo que hace que dos visitas a "No sé qué ver" no muestren la grilla en
 * el mismo orden exacto, sin que un título mucho menos popular pueda saltar
 * al principio. `popularidadScore` vive en un rango de 0 a ~1 (ver
 * logic/formulas.js), así que este valor alcanza para barajar entre sí a los
 * títulos que ya compiten de cerca por los primeros puestos.
 */
export const JITTER_ORDEN_NATURAL = 0.12;

/**
 * Ordenar (sección 8): un solo campo, asc o desc, sin orden por defecto —
 * si `campo` no viene, se devuelve la lista tal como llegó.
 * Los candidatos sin valor para el campo elegido quedan al final,
 * independientemente de la dirección (decisión mía).
 *
 * `jitter`: opcional, ver JITTER_ORDEN_NATURAL arriba. Se sortea un
 * desplazamiento FIJO POR CANDIDATO antes de ordenar, nunca adentro del
 * comparador: `Array.prototype.sort` espera que la relación entre dos
 * elementos no cambie de una llamada a la siguiente, y un ruido que se
 * recalculara en cada comparación la rompería (el orden resultante dejaría
 * de ser confiable).
 */
export function ordenar(candidatos, { campo, direccion, jitter } = {}) {
  if (!campo) return candidatos;

  const valor = (c) => {
    switch (campo) {
      case 'puntuacion': return c.puntuacion;
      case 'popularidad': return c.popularidadScore;
      case 'coincidencias': return c.coincidencias;
      case 'anio': return c.anio;
      case 'duracion': return c.tipo === 'pelicula' ? c.duracion : null;
      case 'temporadas': return c.tipo === 'tv' ? c.temporadas : null;
      case 'episodios': return c.tipo === 'tv' ? c.episodios : null;
      default: return null;
    }
  };

  const signo = direccion === 'desc' ? -1 : 1;
  const ruido = jitter ? new Map(candidatos.map((c) => [c, (Math.random() - 0.5) * jitter])) : null;

  return [...candidatos].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // nulls al final
    if (vb == null) return -1;
    const da = ruido ? va + ruido.get(a) : va;
    const db = ruido ? vb + ruido.get(b) : vb;
    return signo * (da - db);
  });
}

/**
 * "Me siento con suerte" (sección 5): un título al azar entre los 20
 * mejores por Puntuación — tope máximo, no cantidad fija (si hay menos de
 * 20 candidatos, se sortea entre los que haya). Reordena por puntuación
 * internamente sin importar en qué orden lleguen los candidatos.
 */
export function elegirConSuerte(candidatos) {
  if (candidatos.length === 0) return null;
  const porPuntuacion = ordenar(candidatos, { campo: 'puntuacion', direccion: 'desc' });
  const top20 = porPuntuacion.slice(0, 20);
  const indice = Math.floor(Math.random() * top20.length);
  return top20[indice];
}
