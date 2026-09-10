import { useEffect, useRef } from 'react';

/**
 * El par Rápida/Detallada de las Opciones 4 y 5 (sección 5 del Definitivo).
 *
 * Vive acá, al lado del modal que lo muestra, porque el texto tiene que decir
 * lo mismo en las dos pantallas y estaba copiado verbatim en las dos. El par
 * Simple/Detallada de la Opción 2 NO está acá: aparece una sola vez (en
 * Inicio) y describe campos concretos del formulario, así que compartirlo
 * sería inventar una abstracción para un solo consumidor.
 */
export const TITULO_RAPIDA_O_DETALLADA = '¿Cómo la buscamos?';

export const OPCIONES_RAPIDA_O_DETALLADA = [
  { valor: 'rapida', etiqueta: 'Rápida', descripcion: 'Directo a los resultados.' },
  { valor: 'detallada', etiqueta: 'Detallada', descripcion: 'Completar más preferencias antes de buscar.' },
];

/**
 * Modal para elegir entre Simple/Rápida/Detallada antes de cambiar de
 * ruta (sección 5 del Definitivo). `opciones` es [{ valor, etiqueta,
 * descripcion }]. Se cierra con Escape, click afuera, o al elegir.
 *
 * LA TRAMPA DE FOCO Y LA DEVOLUCIÓN DEL FOCO SE AGREGARON EL 2026-08-26,
 * después de la auditoría con lector de pantalla. Antes tenía bien lo
 * declarativo (`role="dialog"`, `aria-modal`, `aria-labelledby`, Escape) y le
 * faltaba lo de comportamiento, que es lo que se nota al usarlo:
 *
 *  - **Tab se iba del modal.** Medido con NVDA: apretando Tab repetidamente
 *    se recorría el pie, después la barra del navegador, después el
 *    encabezado de la página de atrás, y desde ahí se podía accionar
 *    cualquier cosa mientras el modal seguía abierto tapándolo todo.
 *    `aria-modal` acota el buffer virtual del lector, pero NO acota al Tab:
 *    eso hay que escribirlo.
 *  - **Al cerrar, el foco caía al <body>**, o sea que el lector volvía al
 *    principio del documento y se perdía el lugar donde uno estaba. Ahora
 *    vuelve al elemento que abrió el modal, que es de donde salió.
 */
export default function ModalTipoBusqueda({ titulo, opciones, onElegir, onCerrar }) {
  const dialogRef = useRef(null);
  const abridorRef = useRef(null);

  useEffect(() => {
    /**
     * Quién tenía el foco antes de abrir. Se guarda una sola vez, al montar,
     * y es a donde se lo devuelve al desmontar.
     */
    abridorRef.current = document.activeElement;

    function alTeclado(e) {
      if (e.key === 'Escape') {
        onCerrar();
        return;
      }
      if (e.key !== 'Tab') return;

      /**
       * Trampa de foco: la lista de lo que se puede enfocar se calcula en el
       * momento y no al montar, porque el contenido del modal puede cambiar.
       */
      const focusables = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables?.length) return;

      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];
      const activo = document.activeElement;

      /**
       * Al abrir, el foco está en el contenedor del diálogo, que no está en
       * esta lista: ahí Tab tiene que entrar en el primero, y Shift+Tab en el
       * último, en vez de escaparse.
       */
      if (!dialogRef.current.contains(activo) || activo === dialogRef.current) {
        e.preventDefault();
        (e.shiftKey ? ultimo : primero).focus();
        return;
      }
      if (e.shiftKey && activo === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener('keydown', alTeclado);
    dialogRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', alTeclado);
      /**
       * Solo si el que abrió sigue en el documento: al elegir una opción se
       * cambia de ruta y ese botón ya no existe, y enfocar un nodo huérfano
       * no hace nada (peor: deja el foco en el body igual).
       */
      const abridor = abridorRef.current;
      if (abridor instanceof HTMLElement && document.contains(abridor)) abridor.focus();
    };
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-noche/80 backdrop-blur-sm px-4"
      onClick={onCerrar}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-tipo-busqueda-titulo"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="panel w-full max-w-sm p-6"
      >
        <h2 id="modal-tipo-busqueda-titulo" className="titulo-seccion">
          {titulo}
        </h2>
        <div className="mt-5 flex flex-col gap-3">
          {opciones.map((op) => (
            <button
              key={op.valor}
              type="button"
              onClick={() => onElegir(op.valor)}
              className="rounded-campo border border-linea-control bg-noche px-4 py-3 text-left transition hover:border-linea-activa"
            >
              <span className="titulo-bloque block">{op.etiqueta}</span>
              {op.descripcion && <span className="mt-0.5 block text-sm text-crema/60">{op.descripcion}</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="mt-4 w-full text-center text-sm font-semibold text-crema/50 hover:text-crema/80"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
