import { useRef, useState } from 'react';
import ListaDeChips from './ListaDeChips.jsx';

/**
 * Selector de opciones como lista vertical, en vez de una fila de palabras
 * sueltas para tocar. Pensado para reemplazar los grupos de Chips de
 * PaginaBuscar/PaginaTipo cuando hay varias opciones para elegir.
 *
 * - multiple=false: selección única (tocar una opción activa esa y
 *   desactiva cualquier otra; tocar la ya activa la desactiva).
 * - multiple=true: selección múltiple. Lo elegido se muestra además como
 *   chips arriba de la lista (mismo look que antes), cada uno con una "x"
 *   en la esquina superior derecha para sacarlo.
 * - desplegable=true: la lista vive detrás de un botón toggle (para
 *   listas largas, ej. País/Idioma). Elegir una opción NO cierra la
 *   lista, así se puede seguir marcando más de una seguidas.
 * - opciones con oculto:true no se muestran como fila en la lista, pero
 *   sí participan del cálculo de chips/etiquetas (ej. "Clásicos", que
 *   solo se marca desde afuera vía el checkbox "Ver clásicos", nunca
 *   como fila propia dentro de Género).
 *
 * DOS COSAS QUE SALIERON DE LA AUDITORÍA CON LECTOR DE PANTALLA (2026-08-26):
 *
 *  - Los chips se movieron a ListaDeChips, compartido con Autocompletado.
 *    Ahí está explicado el arreglo del foco al quitar uno, que era el que
 *    hacía que se escuchara "Ver clásicos" al sacar un género cualquiera.
 *  - El contenedor de la lista lleva `recorta-foco`. Tiene `overflow-y-auto`,
 *    y eso recortaba el recuadro amarillo del foco de la opción enfocada:
 *    quedaba visible solo el lado de abajo. Ver la regla en index.css.
 */
export default function SelectorLista({
  etiqueta,
  opciones, // [{ valor, etiqueta, icono?, oculto? }]
  seleccionados, // array de valores actualmente elegidos
  onCambiar, // (nuevosSeleccionados) => void
  multiple = true,
  desplegable = false,
}) {
  const [abierto, setAbierto] = useState(!desplegable);
  const toggleRef = useRef(null);
  const primeraOpcionRef = useRef(null);

  function alternarValor(valor) {
    if (multiple) {
      const yaEsta = seleccionados.includes(valor);
      onCambiar(yaEsta ? seleccionados.filter((v) => v !== valor) : [...seleccionados, valor]);
    } else {
      onCambiar(seleccionados.includes(valor) ? [] : [valor]);
    }
  }

  function quitar(valor) {
    onCambiar(seleccionados.filter((v) => v !== valor));
  }

  const opcionesPorValor = new Map(opciones.map((o) => [o.valor, o]));
  const opcionesVisibles = opciones.filter((o) => !o.oculto);

  return (
    <div>
      {multiple && (
        <ListaDeChips
          chips={seleccionados.map((valor) => ({
            clave: valor,
            etiqueta: opcionesPorValor.get(valor)?.etiqueta ?? valor,
          }))}
          onQuitar={quitar}
          /* Al quitar el último chip el foco iría al <body>. Se lo manda al
             control desde el que se sigue eligiendo: el desplegable si lo
             hay, y si no la primera opción de la lista. */
          alQuedarVacia={() => (toggleRef.current ?? primeraOpcionRef.current)?.focus()}
        />
      )}

      {desplegable && (
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="rounded-campo mb-2 flex w-full items-center justify-between border border-linea-control bg-noche px-4 py-2.5 text-left text-sm font-semibold text-crema/80 transition hover:border-linea-activa"
        >
          <span>
            {etiqueta}
            {seleccionados.length > 0 ? ` (${seleccionados.length})` : ''}
          </span>
          <span aria-hidden="true" className="text-xs text-crema/50">
            {abierto ? 'Ocultar' : 'Mostrar'}
          </span>
        </button>
      )}

      {abierto && (
        <div
          role="group"
          aria-label={etiqueta}
          className="barra-desplazamiento rounded-campo recorta-foco flex max-h-64 flex-col divide-y divide-linea overflow-y-auto border border-linea-control"
        >
          {opcionesVisibles.map((op, i) => {
            const activo = seleccionados.includes(op.valor);
            return (
              <button
                ref={i === 0 ? primeraOpcionRef : undefined}
                type="button"
                key={op.valor}
                onClick={() => alternarValor(op.valor)}
                aria-pressed={activo}
                className={`flex items-center gap-2 px-4 py-2.5 text-left text-sm transition ${
                  activo ? 'bg-manteca/20 font-semibold text-manteca' : 'text-crema/80 hover:bg-crema/5'
                }`}
              >
                {op.icono}
                {op.etiqueta}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
