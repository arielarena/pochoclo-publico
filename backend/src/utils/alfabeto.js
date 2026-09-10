/**
 * Detección de alfabeto para los títulos que devuelve TMDb.
 *
 * TMDb **no tiene noción de cadena de respaldo**: si no existe traducción al
 * idioma pedido, devuelve el título original tal cual (ver la sección 4.27 de
 * las notas de decisiones del proyecto). La cadena de `textoTraducido()` tapa casi todo, pero cuando un
 * título no tiene traducción a ningún español ni al inglés, lo que llega es su
 * nombre en su alfabeto: `东宫`, `เคว้ง`, `은수 좋은 날`.
 */

/**
 * Hay algún carácter fuera del alfabeto latino. `Common` e `Inherited` son los
 * que no pertenecen a ningún alfabeto en particular (dígitos, puntuación,
 * espacios, símbolos), así que no cuentan.
 *
 * **Va con propiedades Unicode y no con rangos escritos a mano.** Escribir los
 * rangos de escape a mano es lo primero que uno intenta y ya salió mal una vez,
 * de forma silenciosa: al generar el archivo los escapes se resolvieron a
 * caracteres literales y quedó un byte nulo adentro del código, con el que
 * `node --check` seguía pasando. Ojo también con el nombre de la propiedad:
 * `\p{Common}` pelado no es válido, va `\p{Script=Common}`.
 */
export const NO_LATINO = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

const ALGUNA_LETRA_LATINA = /\p{Script=Latin}/u;

/**
 * El texto está escrito en otro alfabeto, o sea que no hay forma de leerlo
 * desde una app en español. Son las DOS condiciones a la vez: tiene caracteres
 * de otro alfabeto **y** no tiene ninguna letra latina.
 *
 * **Las dos hacen falta, y cada una se llevaba puesto algo:**
 *
 * - Solo la primera ("tiene algún carácter raro") descarta "Saiki Kusuo no
 *   Ψ-nan", que está romanizado entero salvo una letra griega. Sobre 6740
 *   títulos del caché hay 175 con algún carácter no latino y solo **10
 *   mezclados**; nueve son ilegibles igual (lo latino es un pedazo suelto tipo
 *   "OF THE DEAD") y el décimo es Saiki.
 * - Solo la segunda ("no tiene letras latinas") descarta **"1917"** y "101%",
 *   que son todo dígitos y se leen perfecto. Los dígitos son `Common`, así que
 *   no cuentan como letra de ningún alfabeto. Apareció midiendo, no en teoría.
 */
export function sinAlfabetoLatino(texto) {
  if (!texto) return false;
  return NO_LATINO.test(texto) && !ALGUNA_LETRA_LATINA.test(texto);
}
