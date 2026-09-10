import {
  ORDEN_CASCADA,
  INDICE_EQUIVALENCIAS,
  INDICE_SIN_CALIFICAR,
  normalizarCodigo,
} from '../data/certificaciones.js';

/**
 * LA FECHA DE NACIMIENTO ES UN DÍA DE CALENDARIO, Y SE LEE EN UTC. Vale para
 * las dos funciones que siguen, y es la parte fácil de romper sin darse cuenta.
 *
 * El dato entra siempre desde un `<input type="date">`, o sea la cadena
 * "AAAA-MM-DD". `new Date("2009-08-27")` NO es la medianoche de acá: el
 * estándar manda parsear una fecha sola como medianoche UTC, que en Argentina
 * (UTC-3) son las 21:00 del 26. Así que los getters LOCALES de ese instante
 * devuelven el día ANTERIOR al que la persona escribió, y con ellos:
 *
 *   - quien cumplía años mañana figuraba con un año de más. Perdía su límite
 *     de edad un día antes de tiempo, y podía crear cuenta la víspera de
 *     cumplir los 13;
 *   - quien nació un 1 de enero daba el año anterior, así que un nacimiento el
 *     1/1/1900 se rechazaba como "año inválido" contra el piso de 1900.
 *
 * Los getters UTC devuelven el día que la persona escribió. Es además lo que
 * ya hacía el resto de la app: `aValorDeInput()` de PaginaPerfil llena el
 * campo con `toISOString().slice(0, 10)`, que es la fecha UTC. `edadCumplida`
 * era el único lugar que leía en local, así que no coincidía con el campo que
 * el propio usuario tenía delante.
 *
 * "Hoy", en cambio, SÍ va en local: el día de hoy es el del calendario de
 * quien está mirando la pantalla, no el de Greenwich.
 *
 * Espejo de frontend/src/utils/edad.js. La que manda es esta, que cuenta con
 * el reloj del servidor; si se cambia la regla, cambiarla en los dos lados.
 */

/**
 * Edad cumplida a día de hoy, o null si la fecha no sirve.
 *
 * El `!fechaNacimiento` de arriba no es redundante con el chequeo de fecha
 * inválida: `new Date(null)` NO es inválida, es el 1/1/1970, así que sin esa
 * línea un valor faltante devolvía 56 años en vez de null. Hoy los dos que
 * llaman acá ya filtran el vacío antes, pero esta función es compartida y la
 * próxima puede no hacerlo.
 */
export function edadCumplida(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;

  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getUTCFullYear();

  /**
   * Se comparan mes y día como números, en vez de armar la fecha del cumpleaños
   * de este año: `new Date(anio, mes, dia)` con un 29 de febrero en un año no
   * bisiesto se desborda al 1 de marzo, y de paso volvería a mezclar husos.
   */
  const meses = hoy.getMonth() - nacimiento.getUTCMonth();
  if (meses < 0 || (meses === 0 && hoy.getDate() < nacimiento.getUTCDate())) edad -= 1;

  return edad;
}

/**
 * El año de nacimiento tal como lo escribió la persona, o null si la fecha no
 * sirve. Existe para que el piso de año no lo lea en local (ver la nota de
 * arriba): con `getFullYear()`, todo nacimiento del 1 de enero daba el año
 * anterior.
 */
export function anioDeNacimiento(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  return Number.isNaN(nacimiento.getTime()) ? null : nacimiento.getUTCFullYear();
}

/**
 * Sección 17 del Definitivo. `certificacionesPorPais` es un mapa
 * { US: 'PG-13', AR: '13', ... } armado a partir de release_dates (película)
 * o content_ratings (serie) de TMDb — puede faltar cualquier país.
 *
 * Devuelve 'ATP' | '+14' | '+17' | null ("Sin clasificar").
 *
 * Criterio: si un país tiene un código que reconocemos, se resuelve ahí y
 * se corta la cascada. Si el código es un marcador de "nunca se clasificó"
 * (NR/UR en EEUU) o directamente no lo reconocemos, NO se asume +17: se
 * trata como si ese país no tuviera dato y se sigue probando el resto de
 * la cascada. Recién si se agota toda la cascada sin encontrar nada
 * reconocible, el resultado es "Sin clasificar". El "redondeo conservador"
 * del Definitivo aplica a casos ambiguos DENTRO de un sistema conocido
 * (ej. PG-13 → +14), no a la ausencia total de dato — asumir +17 ahí sería
 * afirmar algo que no sabemos.
 */
export function limiteEdad(certificacionesPorPais = {}) {
  for (const pais of ORDEN_CASCADA) {
    const crudo = certificacionesPorPais[pais];
    /**
     * TMDb no escribe estos códigos de una sola forma (ver comentario al
     * principio de data/certificaciones.js), así que se compara siempre la
     * forma normalizada, nunca el string tal cual viene.
     */
    const codigo = normalizarCodigo(crudo);
    if (!codigo) continue;
    if (INDICE_SIN_CALIFICAR[pais]?.has(codigo)) continue;

    const encontrado = INDICE_EQUIVALENCIAS[pais]?.get(codigo);
    if (encontrado) return encontrado;

    console.warn(`Código de certificación no reconocido para ${pais}: "${crudo}" — se sigue la cascada como si no hubiera dato ahí.`);
  }
  return null;
}
