/**
 * Réplica en el cliente de backend/src/logic/resultados.js. Los Filtros
 * (sección 7 del Definitivo) ahora viven solo en /resultados y se aplican
 * "sobre los resultados ya obtenidos" (sección 4): en vez de volver a
 * pedirle al backend cada vez que se toca un filtro, se trae la lista
 * completa una sola vez por búsqueda y se filtra/ordena acá, en memoria.
 * Debe mantenerse en sintonía con la lógica del backend si esa cambia.
 */
/**
 * Espejo de normalizarTramosAnio/cumpleAnio de
 * backend/src/logic/resultados.js: el campo Año acepta un objeto
 * ({ exacto } o { desde, hasta }) o un array de esos objetos, que se
 * combinan con OR. Hoy el panel de Filtros solo arma la forma de objeto,
 * pero el espejo tiene que aceptar las dos para no divergir del backend.
 */
function tramosAnio(anio) {
  if (!anio) return [];
  const tramos = Array.isArray(anio) ? anio : [anio];
  return tramos
    .map((t) => (t?.exacto != null ? { desde: t.exacto, hasta: t.exacto } : t))
    .filter((t) => t && (t.desde != null || t.hasta != null));
}

function cumpleAnio(c, anio) {
  const tramos = tramosAnio(anio);
  if (!tramos.length) return true;
  if (c.anio == null) return false;
  return tramos.some(
    (t) => (t.desde == null || c.anio >= t.desde) && (t.hasta == null || c.anio <= t.hasta)
  );
}

export function aplicarFiltrosCliente(candidatos, f = {}) {
  return candidatos.filter((c) => cumpleFiltros(c, f));
}

function alguienDeLaLista(delTitulo, elegidas) {
  const ids = new Set((delTitulo ?? []).map(Number));
  return elegidas.some((p) => ids.has(Number(p?.id ?? p)));
}

function cumpleFiltros(c, f) {
  if (f.tipo?.length && !f.tipo.includes(c.tipoContenido)) return false;

  if (f.generos?.length) {
    const pideClasicos = f.generos.includes('CLASICOS');
    const idsGenero = f.generos.filter((g) => g !== 'CLASICOS');
    /**
     * `generosInferidos` son los géneros que una SERIE cumple sin que TMDb se
     * los asigne, deducidos de sus keywords por el backend (Terror, Thriller,
     * Historia, Romance y Música no existen en la taxonomía de series de TMDb).
     * Sin esto, filtrar por Terror hacía desaparecer justamente a las series de
     * terror. Viene resuelto para toda serie, no solo para las que llegaron por
     * una búsqueda de ese género.
     */
    const suyos = [...(c.generos ?? []), ...(c.generosInferidos ?? [])];
    const matcheaGenero = idsGenero.length > 0 && suyos.some((g) => idsGenero.includes(g));
    const matcheaClasico = pideClasicos && c.es_clasico === true;
    if (!matcheaGenero && !matcheaClasico) return false;
  }

  if (!cumpleAnio(c, f.anio)) return false;

  if (f.idiomas?.length && !f.idiomas.includes(c.idioma)) return false;

  if (f.paises?.length && !(c.paisOrigen ?? []).some((p) => f.paises.includes(p))) return false;

  if (f.plataformas?.length && !(c.plataformas ?? []).some((p) => f.plataformas.includes(p))) return false;

  if (f.complejidad && c.complejidad !== f.complejidad) return false;

  /**
   * Actor/Director: el campo trae objetos { id, nombre } porque el panel
   * necesita el nombre para el chip. Ver la nota en el archivo del backend.
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
     * Duración total en minutos (el panel la pide en horas y convierte).
     * No todas las series la tienen: las que no, quedan afuera con el
     * filtro activo, igual que el resto de los filtros numéricos.
     */
    if (f.duracionTotal?.mayorA != null && (c.duracionTotal == null || c.duracionTotal <= f.duracionTotal.mayorA)) return false;
    if (f.duracionTotal?.menorA != null && (c.duracionTotal == null || c.duracionTotal >= f.duracionTotal.menorA)) return false;

    if (f.estado) {
      if (c.estado === 'Canceled') return false;
      if (f.estado === 'terminada' && c.estado !== 'Ended') return false;
      if (f.estado === 'en_emision' && c.estado === 'Ended') return false;
    }
  }

  if (f.limitesEdad?.length) {
    if (c.edad == null || !f.limitesEdad.includes(c.edad)) return false;
  }

  return true;
}

export function ordenarCliente(candidatos, { campo, direccion } = {}) {
  if (!campo) return candidatos;

  const valor = (c) => {
    switch (campo) {
      case 'puntuacion':
        return c.puntuacion;
      case 'popularidad':
        return c.popularidadScore;
      case 'coincidencias':
        return c.coincidencias;
      case 'anio':
        return c.anio;
      case 'duracion':
        return c.tipo === 'pelicula' ? c.duracion : null;
      case 'temporadas':
        return c.tipo === 'tv' ? c.temporadas : null;
      case 'episodios':
        return c.tipo === 'tv' ? c.episodios : null;
      default:
        return null;
    }
  };

  const signo = direccion === 'desc' ? -1 : 1;

  return [...candidatos].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return signo * (va - vb);
  });
}
