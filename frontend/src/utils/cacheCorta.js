/**
 * Caché en memoria de la pestaña, de vida corta, que además funde pedidos en
 * vuelo: si dos llamadas piden la misma clave mientras la primera no
 * contestó, la segunda espera esa misma promesa en vez de disparar la suya.
 * Mismo mecanismo que `backend/src/utils/cacheCorta.js` (ver 4.9.1
 * y 4.13), del lado del cliente.
 *
 * Para qué sirve: cuando una pantalla "precalienta" una búsqueda que el
 * usuario todavía no pidió (Inicio.jsx, al montar) y esa misma búsqueda se
 * termina pidiendo de verdad unos segundos después (al entrar a
 * `/resultados`), esta caché hace que la segunda llamada reciba lo que la
 * primera ya trajo en vez de repetir el pedido de red.
 *
 * Un pedido que falla se saca de la caché al instante, así que un error de
 * red no queda pegado ahí y la próxima llamada lo reintenta de verdad.
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
