import { useId } from 'react';

/**
 * La tarjeta grande de elección de las pantallas de flujo: /tipo,
 * /estado-animo y /quien-esta-viendo.
 *
 * Es el patrón que reemplazó al Option Wheel (ver 4.3 de las notas de decisiones del proyecto), y estaba
 * escrito tres veces: idéntico entre /tipo y /quien-esta-viendo, y con la sola
 * diferencia de no llevar icono en /estado-animo.
 *
 * EL ESTADO ACTIVO LO RESUELVE ENTERAMENTE `tarjeta-opcion` a partir de
 * aria-pressed (ver index.css), así que acá no hay ningún ternario de clases
 * ni ningún degradé inline: lo que se ve y lo que anuncia el lector de
 * pantalla salen del mismo atributo y no se pueden desincronizar.
 *
 * @param {boolean} activo      Si es la opción elegida.
 * @param {() => void} onElegir
 * @param {string} etiqueta     El nombre de la opción.
 * @param {string} [pista]      Qué va a buscar, en una línea.
 * @param {React.ReactNode} [icono] El contenido del <svg> (paths, circles...),
 *   sin el <svg> en sí: son formas simples que heredan currentColor y no suman
 *   un pedido de red. Va con aria-hidden porque la etiqueta ya dice lo mismo.
 * @param {string} [className]  Medidas propias de cada pantalla.
 * @param {string} [claseEtiqueta]
 * @param {string} [clasePista]
 */
export default function TarjetaOpcion({
  activo,
  onElegir,
  etiqueta,
  pista,
  icono,
  className = '',
  claseEtiqueta = 'font-display text-2xl font-bold',
  clasePista = '',
}) {
  const idPista = useId();

  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={activo}
      /* La pista va como DESCRIPCIÓN y no como parte del nombre.
         Sin esto, el nombre accesible del botón era la etiqueta y la pista
         pegadas, y NVDA las leía de corrido: "Serie Para engancharse varias
         temporadas, sin pulsar". Lo encontró la auditoría del 2026-08-26.
         Con aria-describedby, primero se anuncia "Serie, botón, sin pulsar"
         (que es lo que hace falta para elegir) y la descripción va después,
         que además es la que el lector deja saltear. */
      aria-describedby={pista ? idPista : undefined}
      className={`tarjeta-opcion group ${className}`}
    >
      {/* Un resplandor que aparece al pasar el mouse, solo en las tarjetas en
          reposo: en la activa competiría con el gradiente. */}
      {!activo && (
        <span
          aria-hidden="true"
          className="brillo-tarjeta pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      )}
      {icono && (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`relative h-9 w-9 ${activo ? '' : 'text-manteca'}`}
        >
          {icono}
        </svg>
      )}
      <span className={`relative ${claseEtiqueta}`}>{etiqueta}</span>
      {pista && (
        <span id={idPista} className={`tarjeta-opcion-pista relative ${clasePista}`}>
          {pista}
        </span>
      )}
    </button>
  );
}
