/**
 * Corre `tareas` (array de funciones que devuelven una Promise) con hasta
 * `limite` en vuelo a la vez, con la misma forma de salida que
 * `Promise.allSettled` (un array de `{status, value}` / `{status, reason}`,
 * en el mismo orden que `tareas`), para que una tarea fallida no tire abajo
 * el resto — mismo criterio que ya usa el Definitivo para las llamadas en
 * paralelo de Favoritas/Visto.
 *
 * **Es un pool de verdad y no tandas fijas** (cambiado el 2026-09-02). La
 * versión anterior esperaba a que TODA una tanda de `limite` tareas
 * terminara antes de arrancar la siguiente — así que la tarea más lenta de
 * la tanda frenaba a las `limite` de la tanda siguiente, aunque estuvieran
 * listas para arrancar. Medido contra TMDb real el mismo día: de 100
 * pedidos de detalle en paralelo, el 70% contesta en menos de 800 ms, pero
 * una cola de ~10 tarda entre 2 y 3,6 s — con tandas fijas, esa cola le
 * hacía perder ese tiempo entero a la tanda siguiente aunque casi todos sus
 * lugares estuvieran libres. Acá, en cuanto una tarea libera su lugar, el
 * siguiente arranca sin esperar a sus compañeras de tanda.
 */
export async function conLimite(tareas, limite) {
  const resultados = new Array(tareas.length);
  let siguiente = 0;

  async function trabajador() {
    while (siguiente < tareas.length) {
      const indice = siguiente++;
      try {
        resultados[indice] = { status: 'fulfilled', value: await tareas[indice]() };
      } catch (reason) {
        resultados[indice] = { status: 'rejected', reason };
      }
    }
  }

  const trabajadores = Array.from({ length: Math.min(limite, tareas.length) }, trabajador);
  await Promise.all(trabajadores);
  return resultados;
}
