import BorderGlow from './efectos/BorderGlow.jsx';

/**
 * Botón de "Me siento con suerte" (sección 5 del Definitivo), envuelto en
 * BorderGlow para que se note como una acción especial/festiva frente al
 * botón principal de "Buscar". Un solo componente para las cuatro
 * ocurrencias (Preferencias, Tipo, Estado de ánimo, ¿Quién está viendo?).
 *
 * Los tres ajustes de acá salieron de mirar el efecto funcionando y no de
 * los valores por defecto de reactbits, que están pensados para cards
 * grandes:
 *
 *  - `proximidadMinima`: sin esto el brillo se apagaba con el mouse en el
 *    centro del botón, o sea justo antes del click (ver BorderGlow).
 *  - `edgeSensitivity` más bajo: en 44px de alto, el umbral original dejaba
 *    casi toda la superficie por debajo del mínimo para encender nada.
 *  - `animated`: un barrido de luz al aparecer. Es lo que hace que el efecto
 *    se note sin tener que descubrirlo pasando el mouse por encima, que en
 *    una pantalla táctil no pasa nunca.
 */
export default function BotonSuerte({ onClick, disabled = false, texto = 'Me siento con suerte' }) {
  return (
    <BorderGlow
      className="w-full max-w-xs"
      borderRadius={999}
      glowRadius={22}
      edgeSensitivity={10}
      proximidadMinima={0.85}
      animated
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        /* No usa `boton-secundario` a propósito: esa clase dibuja un borde
           propio y acá el borde lo pone el BorderGlow que lo envuelve, así que
           quedarían dos. Las medidas y la tipografía sí son las mismas, para
           que alinee con el botón principal que tiene al lado. */
        className="inline-flex w-full items-center justify-center rounded-full border border-transparent px-5 py-2 text-center font-display text-sm font-semibold text-crema transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        {texto}
      </button>
    </BorderGlow>
  );
}
