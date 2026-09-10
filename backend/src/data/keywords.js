/**
 * Sección 15 del Definitivo, ampliada el 2026-08-24.
 *
 * Ojo con los nombres: tienen que coincidir EXACTO con los de TMDb, porque
 * buscarIdKeyword ya no acepta aproximaciones. 'feel-good' y 'feel-good comedy'
 * no existen allá; la que existe es 'feelgood', todo junto. Con los nombres
 * viejos esta rama resolvía a "feel good music" y buscaba música.
 *
 * **Estas keywords le ganan a los géneros** (paso 1 del Definitivo, que corre
 * antes del conteo de géneros del paso 2), así que una mal elegida no ensancha
 * el resultado: lo ensucia. Por eso las que se sumaron se eligieron midiendo el
 * catálogo real, mirando qué trae cada una arriba, y se descartaron varias que
 * parecían obvias por el nombre:
 *
 *   'christmas'  -> 1822 títulos, pero encabezados por Harry Potter e Iron Man
 *                   3: TMDb la aplica a cualquier película con una escena de
 *                   Navidad, no a las películas de Navidad.
 *   'friendship' -> 1123, encabezados por Cadena perpetua y Django.
 *   'road trip'  -> 456, con Logan primero.
 *   'philosophical' -> 148 y buena mitad, pero mete Shrek 2 y Divergente.
 *   'wholesome'  -> existe y tiene cero títulos.
 *
 * El Definitivo trae solo las tres primeras de RELAJAR y las dos de PENSAR; el
 * resto es ampliación medida.
 */
export const KEYWORDS_RELAJAR = new Set([
  'popcorn', // 3 títulos, casi simbólica, pero es la del Definitivo
  'feelgood', // 28 pel / 19 tv: Forrest Gump, Intocable, Green Book
  'lighthearted', // 148 / 83: Regreso al futuro, Monstruos S.A., El joven Sheldon
  'slice of life', // 149 / 649: el grueso del anime liviano, que no llegaba por ningún otro lado
  'parody', // 318 / 199: Shrek, Zombieland, Los Simpson, South Park
  'spoof', // 207 / 30: Scary Movie, Aterriza como puedas
  'buddy comedy', // 89 / 10: Arma fatal, Infiltrados en clase
  /**
   * Las tres de abajo salieron del repaso del 2026-08-29, midiendo contra el
   * caché completo cuántos títulos cambiarían de lado con cada candidata. Estas
   * fueron las únicas tres cuyos cambios eran todos correctos; se descartaron
   * 'musical' (mandaba Los miserables y West Side Story a relajar),
   * 'psychological drama' (mandaba Intensa-Mente y Cincuenta sombras a pensar),
   * 'philosophy', 'allegory' y 'dystopia' (mandaban Mad Max, Los Juegos del
   * Hambre y Zootopia a pensar).
   */
  'slapstick comedy', // 30 títulos. Arregla Ace Ventura, que por llevar Crimen y
  // Misterio (los dos ambivalentes) perdía 1 a 2 contra su propia Comedia.
  'sitcom', // 17 pel / 798 tv. La señal más limpia que hay para la comedia de TV
  // que no lleva más género que Comedia. Suma Bruja Escarlata y Visión.
  'superhero', // 630 / 376, y **la que más mueve: 27 títulos**. El cine y la TV
  /**
   * de superhéroes llevan Drama y Ciencia ficción, así que el conteo de géneros
   * los mandaba a "pensar": Batman Begins, Loki, The Flash, Arrow, Daredevil,
   * Supergirl, Kamen Rider. Es la misma lógica por la que Los Vengadores es
   * "relajar" desde la 4.15.4. Ojo con dos que arrastra y son discutibles: El
   * protegido y Muerte de un Superhéroe.
   */
]);

export const KEYWORDS_PENSAR = new Set([
  'nonlinear timeline', // 50 pel / 7 tv: Pulp Fiction, Memento, ¡Olvídate de mí!
  'multiple storylines', // 67 / 6: El atlas de las nubes, Las vidas posibles de Mr. Nobody
  'social commentary', // 50 / 22: Joker, Parásitos, No mires arriba, ¡Nop!
  'moral dilemma', // 57 / 9: Oppenheimer, Sicario, Westworld
  'existentialism', // 55 / 7: Ex Machina, BoJack Horseman, Ergo Proxy
  'slow burn', // 18 / 13: Blade Runner 2049, Winter's Bone, Taboo
]);

// Sección 12 del Definitivo
export const KEYWORD_CLASICO = 'classic';
