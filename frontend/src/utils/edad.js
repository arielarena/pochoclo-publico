/**
 * Edad y franjas de la sección 17 del Definitivo.
 *
 * Estas cuentas también existen en el backend
 * (`opciones/personalizacion.js::franjasPermitidas`), y esa es la que
 * manda: el filtro de verdad se aplica del lado del servidor, con el reloj
 * del servidor. Acá se repiten solo para lo que la pantalla necesita
 * decidir sola, que es qué mostrarle al usuario sobre su propio límite. Si
 * se cambia la regla, hay que cambiarla en los dos lados.
 */

/**
 * Edad mínima para tener cuenta, publicada en el punto 4 de los Términos.
 *
 * La que manda es la del servidor (backend/src/auth/validaciones.js), que
 * cuenta con SU reloj: el del navegador lo cambia el usuario desde el
 * sistema operativo en diez segundos, así que validar solo acá no sería
 * validar nada. Esta copia existe para avisar antes de enviar el formulario,
 * que es mejor que un rechazo del servidor sin explicación.
 *
 * No confundir con un límite para usar la app: sin cuenta no hay ninguna
 * edad mínima, y ese es el uso por defecto.
 */
export const EDAD_MINIMA_CUENTA = 13;

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
 * Los getters UTC devuelven el día que la persona escribió, y es lo que ya
 * hacía `aValorDeInput()` de PaginaPerfil, que llena el campo con
 * `toISOString().slice(0, 10)`. Estas cuentas eran el único lugar que leía en
 * local, así que no coincidían con el campo que el usuario tenía delante.
 *
 * "Hoy", en cambio, SÍ va en local: es el día del calendario de quien está
 * mirando la pantalla.
 *
 * Espejo de backend/src/logic/edad.js, que es la que manda.
 */

/** Edad cumplida a día de hoy, o null si la fecha no sirve. */
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
 * sirve. Lo usan los dos formularios para el piso de año.
 */
export function anioDeNacimiento(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  return Number.isNaN(nacimiento.getTime()) ? null : nacimiento.getUTCFullYear();
}

/** La franja que le corresponde a esa edad: 'ATP', '+14' o '+17'. */
export function franjaDeEdad(edad) {
  if (edad === null) return null;
  if (edad >= 17) return '+17';
  if (edad >= 14) return '+14';
  return 'ATP';
}

/**
 * ¿Se le aplica algún límite en las búsquedas? Para 17 o más no hay
 * ninguno, así que la pantalla no tiene por qué ofrecerle apagarlo.
 */
export function tieneLimiteDeEdad(fechaNacimiento) {
  const edad = edadCumplida(fechaNacimiento);
  return edad !== null && edad < 17;
}
