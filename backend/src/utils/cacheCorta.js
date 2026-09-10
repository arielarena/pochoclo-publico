/**
 * Caché en memoria del proceso, de vida corta, que además funde pedidos en
 * vuelo: si dos llamadas piden la misma clave mientras la primera todavía no
 * contestó, la segunda espera la MISMA promesa en vez de disparar su propio
 * pedido. Pensado para llamadas a APIs externas que no tienen por qué
 * repetirse dos veces en la misma ráfaga.
 *
 * El caso que lo motivó: `buscarConDivisiones` (prioridades, ver las notas de decisiones del proyecto
 * 4.20) corre hasta 5 búsquedas casi idénticas en paralelo (difieren en una
 * sola categoría descartada), así que la mayoría piden las mismas
 * especificaciones de `/discover` y el mismo detalle de los mismos
 * candidatos a los pocos milisegundos. Sin esto, cada corrida las vuelve a
 * pedir por su cuenta.
 *
 * No reemplaza ningún caché existente (el de Neon en `titulos.detalle` sigue
 * siendo la fuente de verdad, con una ventana de horas): esto es nada más
 * que un puente para lo que pasa DENTRO de una misma ráfaga de pedidos, antes
 * de que la primera corrida llegue a escribir en la base.
 *
 * Un pedido que falla se saca del caché al instante (no tiene sentido
 * memorizar un error), así que un 429 o un timeout no queda pegado ahí.
 */
export function memorizarCorto(duracionMs) {
  const cache = new Map();

  return function envolver(clave, tarea) {
    const entrada = cache.get(clave);
    if (entrada && entrada.expira > Date.now()) return entrada.promesa;

    const promesa = tarea().catch((err) => {
      cache.delete(clave);
      throw err;
    });
    cache.set(clave, { expira: Date.now() + duracionMs, promesa });
    return promesa;
  };
}

/**
 * `JSON.stringify` de un objeto con las claves ordenadas, para que dos
 * llamadores que arman el mismo pedido lógico con las propiedades en otro
 * orden (dos especificaciones de discover equivalentes, construidas por
 * código distinto) caigan en la misma entrada de caché. Solo ordena el
 * primer nivel: los parámetros de discover y detalle son planos.
 */
export function claveEstable(objeto) {
  const ordenado = {};
  for (const clave of Object.keys(objeto).sort()) ordenado[clave] = objeto[clave];
  return JSON.stringify(ordenado);
}
