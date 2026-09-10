/**
 * Lee `?lote=N` de un request. Un lote es una tanda de páginas de
 * /discover (ver PAGINAS_POR_LOTE en buscador/motorBusqueda.js), no una
 * página de resultados: el frontend los va pidiendo de a uno para
 * acumular candidatos sin repetir los que ya tiene.
 *
 * Cualquier valor inválido cae en 1, que es el comportamiento de siempre
 * para quien no mande nada.
 */
export function leerLote(req) {
  const valor = Number(req.query.lote);
  if (!Number.isInteger(valor) || valor < 1) return 1;
  return valor;
}
