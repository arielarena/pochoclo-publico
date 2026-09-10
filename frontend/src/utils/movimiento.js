/**
 * Si el usuario pidió menos movimiento en su sistema operativo.
 *
 * El CSS ya respeta `prefers-reduced-motion` con una media query, pero los dos
 * efectos de `components/efectos/` animan desde JavaScript (un shader WebGL en
 * un bucle de requestAnimationFrame, y un barrido de luz por interpolación),
 * y a esos una media query de CSS no los toca. Había que consultarlo a mano.
 *
 * Devuelve false si no hay `window` (por si alguna vez se renderiza del lado
 * del servidor) o si el navegador no entiende la consulta: ante la duda, el
 * comportamiento de siempre.
 */
export function prefiereMenosMovimiento() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Si el dispositivo se maneja con el dedo y no con un mouse.
 *
 * Mismo criterio que ya usa `index.css` para agrandar los botones de
 * `CampoNumero` (`pointer-coarse:`), acá para el motivo contrario: `LightRays`
 * es un shader de WebGL a pantalla completa en un bucle continuo, y en una GPU
 * de teléfono ese costo por cuadro pesa mucho más que en una notebook. No hay
 * ninguna señal de "es un teléfono" confiable, pero "el puntero principal es
 * grueso" es una aproximación razonable y no depende de adivinar el ancho de
 * pantalla (una tablet con mouse no cae acá; un teléfono chico sí).
 */
export function tienePunteroGrueso() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}
