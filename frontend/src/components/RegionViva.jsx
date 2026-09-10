import { useEffect, useState } from 'react';

/**
 * Una región viva que se anuncia aunque aparezca de golpe.
 *
 * EL PROBLEMA QUE RESUELVE, QUE ES LA PARTE QUE HAY QUE ENTENDER. Un lector de
 * pantalla no lee el contenido inicial de una región viva: lee sus **cambios**.
 * Para poder notar un cambio tiene que haber registrado la región antes, y eso
 * pasa cuando el elemento ya está en el árbol de accesibilidad. El patrón
 * natural en React es el contrario:
 *
 *     {error && <p role="alert">{error}</p>}
 *
 * ahí el elemento y su texto entran juntos, así que para el lector no hubo
 * ningún cambio dentro de una región que él conociera: apareció un párrafo.
 *
 * **NVDA sobre Chrome lo perdona y VoiceOver en iOS no**, y esa asimetría es
 * justo lo que hace peligroso al defecto: no lo encuentra axe-core (el ARIA
 * está bien escrito), no lo encontró la auditoría con NVDA del 2026-08-26, y
 * tampoco lo veía `lector-simulado.mjs`, porque su `MutationObserver` mira el
 * DOM y no el árbol de accesibilidad. Medido en el proyecto: 32 de las 41
 * regiones vivas estaban así, incluidos los errores de los formularios de
 * cuenta, que son los que alguien que no ve la pantalla **necesita** escuchar.
 *
 * LA SOLUCIÓN es montar el elemento vacío y poner el texto un instante después,
 * así el cambio ocurre dentro de una región que el lector ya tiene registrada.
 * Se puede seguir escribiendo el `{condición && ...}` de siempre.
 *
 * **La clase también se retrasa**, no solo el texto. Si no, una región con
 * borde y relleno (el aviso de prioridades de `/buscar`, por ejemplo) dibujaría
 * una caja vacía durante ese instante.
 *
 * @param {string} [rol='status'] 'status' es cortés y 'alert' interrumpe. Se usa
 *   `role` y no `aria-live` porque `role="status"` ya implica `polite`, y tener
 *   una sola forma de escribirlo evita que convivan las dos.
 * @param {string} [como='p'] El elemento a renderizar, para los casos que
 *   necesitan un contenedor de bloque.
 */
const RETRASO_MS = 100;

export default function RegionViva({ rol = 'status', como: Como = 'p', className, children, ...resto }) {
  const [listo, setListo] = useState(false);

  useEffect(() => {
    /**
     * Un cuadro solo no alcanza en todos los motores: hace falta que el árbol
     * de accesibilidad se haya actualizado, no solo que el DOM haya pintado.
     * 100 ms es el valor que recomienda la práctica habitual y es imperceptible
     * para quien mira la pantalla.
     */
    const t = setTimeout(() => setListo(true), RETRASO_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <Como role={rol} className={listo ? className : undefined} {...resto}>
      {listo ? children : null}
    </Como>
  );
}
