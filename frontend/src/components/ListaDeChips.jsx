import { useEffect, useRef } from 'react';

/**
 * La fila de chips removibles que va arriba de un campo de selección
 * múltiple. La usan SelectorLista (Género, País, Idioma, Plataformas) y
 * Autocompletado (Actor, Director, Parecido a).
 *
 * SE EXTRAJO DE LOS DOS EL 2026-08-26, y no fue por prolijidad: la auditoría
 * con lector de pantalla encontró que estaban distintos y que el de
 * Autocompletado era peor. Eran dos defectos en uno.
 *
 *  1. Se veían distinto. En SelectorLista la "x" es un círculo rojo en la
 *     esquina; en Autocompletado era una "x" gris en línea, dentro del chip.
 *     El mismo gesto en la misma pantalla se hacía de dos formas.
 *  2. La de Autocompletado no llegaba a los 24x24 de WCAG 2.5.8. La de
 *     SelectorLista sí, con un truco que ya estaba resuelto y documentado
 *     (ver el comentario del pseudo-elemento abajo). Unificando, el campo de
 *     personas hereda ese arreglo en vez de que haya que repetirlo.
 *
 * EL FOCO AL QUITAR UN CHIP ES LA PARTE QUE HAY QUE ENTENDER. Al quitar,
 * React desmonta el botón que tenía el foco, y el foco se va al <body>. Para
 * un lector de pantalla eso no es "no pasó nada": es volver al principio del
 * documento. Medido con NVDA antes de este arreglo, al quitar un chip de
 * Género se escuchaba
 *
 *     "Buscar por preferencias, Pochoclo, documento.
 *      casilla de verificación sin marcar, Ver clásicos"
 *
 * o sea el título de la página y después el primer elemento que encontró,
 * que no tiene nada que ver con lo que se acababa de hacer (y que decía
 * "Ver clásicos" incluso al quitar un género cualquiera). Por eso acá el
 * foco se mueve a mano al chip vecino, y si era el último, a donde diga
 * `alQuedarVacia`.
 *
 * @param {{clave: string, etiqueta: string}[]} chips
 * @param {(clave: string) => void} onQuitar
 * @param {() => void} [alQuedarVacia]  A dónde mandar el foco si no quedan
 *   chips. Sin esto el foco se pierde igual en el último.
 */
export default function ListaDeChips({ chips, onQuitar, alQuedarVacia }) {
  const botones = useRef(new Map());
  const focoPendiente = useRef(null);

  /**
   * Corre después de que React haya sacado el chip del DOM, que es cuando el
   * botón vecino ya existe y se lo puede enfocar. La dependencia es la lista
   * de claves y no el array, que se crea nuevo en cada render.
   */
  const claves = chips.map((c) => c.clave).join('|');
  useEffect(() => {
    if (focoPendiente.current === null) return;
    const destino = focoPendiente.current;
    focoPendiente.current = null;

    if (destino && botones.current.get(destino)) botones.current.get(destino).focus();
    else alQuedarVacia?.();
    /**
     * `alQuedarVacia` queda fuera a propósito: es una función que el padre
     * vuelve a crear en cada render, y meterla dispararía el efecto siempre.
     * eslint-disable-next-line react-hooks/exhaustive-deps
     */
  }, [claves]);

  function quitar(clave, indice) {
    /**
     * Se decide el destino ANTES de quitar, porque después el chip ya no está
     * en la lista y no se puede saber quién era su vecino.
     */
    const vecino = chips[indice + 1] ?? chips[indice - 1] ?? null;
    focoPendiente.current = vecino ? vecino.clave : '';
    botones.current.delete(clave);
    onQuitar(clave);
  }

  if (chips.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap gap-3">
      {chips.map((chip, indice) => (
        <span
          key={chip.clave}
          className="relative inline-flex items-center rounded-full bg-manteca px-4 py-1.5 text-sm font-semibold text-noche"
        >
          {chip.etiqueta}
          <button
            type="button"
            ref={(el) => {
              if (el) botones.current.set(chip.clave, el);
              else botones.current.delete(chip.clave);
            }}
            onClick={() => quitar(chip.clave, indice)}
            aria-label={`Quitar ${chip.etiqueta}`}
            /* El círculo se ve de 20px pero el área que responde al dedo es de
               24px, que es el mínimo de WCAG 2.2. Se agranda con un
               pseudo-elemento y no con el tamaño real para no engordar la "x"
               encima de un chip que mide 32px de alto: agrandarla de verdad la
               hacía competir con la etiqueta. */
            className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-terciopelo text-xs font-bold text-crema ring-2 ring-noche before:absolute before:-inset-0.5 before:content-[''] hover:bg-terciopelo-fuerte"
          >
            <span aria-hidden="true">x</span>
          </button>
        </span>
      ))}
    </div>
  );
}
