/**
 * Reglas de la cuenta que tienen que ser IDÉNTICAS en el backend y en el
 * frontend.
 *
 * POR QUÉ ESTA CARPETA: hasta el 2026-09-29 cada valor de acá estaba copiado a
 * mano en los dos paquetes, con un comentario de "si se cambia uno, cambiar el
 * otro" en cada punta. Ese comentario es la forma más fácil de que dos copias
 * se contradigan en silencio. Ahora las dos puntas importan de acá.
 *
 * LA VALIDACIÓN QUE MANDA SIGUE SIENDO LA DEL SERVIDOR
 * (backend/src/auth/validaciones.js). Que el frontend use las mismas reglas es
 * comodidad, para avisar antes de enviar. Lo que el frontend no ve (la lista
 * de contraseñas comunes, la consulta a Have I Been Pwned) sigue viviendo
 * solo en el backend.
 *
 * TIENE QUE SER JAVASCRIPT PURO: lo importan Node y el navegador. Nada de
 * `node:` ni de dependencias.
 *
 * Lo importan backend/src/auth/validaciones.js, backend/src/auth/auth.js,
 * backend/src/logic/edad.js y frontend/src/utils/{correo,nombre,contrasena,edad}.js
 * más frontend/src/auth/clienteAuth.js.
 */

/**
 * Código con el que el backend marca los errores de validación que escribimos
 * nosotros, para distinguirlos de los de Better Auth. El cliente muestra tal
 * cual solo los que llegan con este código (ver mensajeDeError en
 * frontend/src/auth/clienteAuth.js).
 */
export const CODIGO_VALIDACION = 'VALIDACION_POCHOCLO';

/**
 * Edad mínima para tener cuenta. Sale del criterio de la AAIP para el
 * consentimiento de menores (ver la explicación completa en
 * backend/src/auth/validaciones.js).
 *
 * OJO: PaginaTerminos.jsx (punto 4) y PaginaPrivacidad.jsx escriben este
 * número en el texto, a propósito, porque cambiar la edad obliga a revisar
 * esas dos páginas igual. Si cambia acá, cambia allá.
 */
export const EDAD_MINIMA_CUENTA = 13;

/** Largo máximo del nombre. Es un saludo, no una biografía. */
export const LARGO_MAXIMO_NOMBRE = 60;

/**
 * Largo máximo del correo, el de la norma: 254 caracteres (RFC 5321). El
 * formato solo no alcanza, porque sus partes no tienen techo: medido el
 * 2026-08-28, un correo de 100.000 caracteres creaba la cuenta.
 */
export const LARGO_MAXIMO_CORREO = 254;

/**
 * algo@algo.algo, sin espacios, sin puntos al principio o al final de una
 * parte y sin puntos seguidos. Deliberadamente no va más allá: las expresiones
 * que implementan el RFC 5322 entero rechazan direcciones que existen.
 */
export const FORMATO_CORREO = /^[^\s@.]+(\.[^\s@.]+)*@[^\s@.]+(\.[^\s@.]+)+$/;

export const MENSAJE_CORREO_INVALIDO = 'Escribí un correo con la forma nombre@sitio.com.';

/*
 * Contraseñas. Las razones de cada número (la SP 800-63B del NIST, por qué se
 * pide mezcla solo a las cortas) están en backend/src/auth/validaciones.js.
 */
export const LARGO_MINIMO_CONTRASENA = 8;
export const LARGO_MAXIMO_CONTRASENA = 128;

/** A partir de este largo no se exige mezcla de tipos de carácter. */
export const LARGO_SIN_MEZCLA = 16;

/**
 * Los requisitos de mezcla, con la etiqueta que se muestra en pantalla. El
 * frontend los dibuja mientras se escribe; el backend los exige al guardar.
 */
export const REGLAS_CONTRASENA = [
  {
    clave: 'largo',
    etiqueta: `Al menos ${LARGO_MINIMO_CONTRASENA} caracteres`,
    cumple: (v) => v.length >= LARGO_MINIMO_CONTRASENA,
    cuandoAplica: () => true,
  },
  {
    clave: 'letra',
    etiqueta: 'Una letra',
    cumple: (v) => /\p{L}/u.test(v),
    cuandoAplica: (v) => v.length < LARGO_SIN_MEZCLA,
  },
  {
    clave: 'numero',
    etiqueta: 'Un número',
    cumple: (v) => /\p{N}/u.test(v),
    cuandoAplica: (v) => v.length < LARGO_SIN_MEZCLA,
  },
  {
    clave: 'especial',
    etiqueta: 'Un símbolo (por ejemplo . , - _ ! ? @ #)',
    cumple: (v) => /[^\p{L}\p{N}]/u.test(v),
    cuandoAplica: (v) => v.length < LARGO_SIN_MEZCLA,
  },
];

/**
 * Edad cumplida a partir de la fecha de nacimiento, o null si no hay fecha
 * válida.
 *
 * El año, el mes y el día del nacimiento se leen en UTC a propósito: la fecha
 * se guarda como medianoche UTC, y leída en hora local un nacimiento del 1 de
 * enero da el año anterior en Argentina.
 */
export function edadCumplida(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;

  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getUTCFullYear();

  /*
   * Mes y día se comparan como números, en vez de armar la fecha del cumpleaños
   * de este año: `new Date(anio, mes, dia)` con un 29 de febrero en un año no
   * bisiesto se desborda al 1 de marzo, y de paso volvería a mezclar husos.
   */
  const meses = hoy.getMonth() - nacimiento.getUTCMonth();
  if (meses < 0 || (meses === 0 && hoy.getDate() < nacimiento.getUTCDate())) edad -= 1;
  return edad;
}

/** Año de nacimiento, leído en UTC por el mismo motivo que edadCumplida. */
export function anioDeNacimiento(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  return Number.isNaN(nacimiento.getTime()) ? null : nacimiento.getUTCFullYear();
}
