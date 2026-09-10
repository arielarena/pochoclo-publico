/**
 * Lista local de contraseñas prohibidas.
 *
 * El NIST (SP 800-63B) pide comparar cada contraseña nueva contra una lista
 * que incluya: las filtradas en brechas conocidas, las más comunes, palabras
 * de diccionario, secuencias, y **palabras del propio contexto del servicio**.
 *
 * De esas cinco, las filtradas las cubre la consulta a Have I Been Pwned
 * (ver auth/contrasenaFiltrada.js), que tiene cientos de millones y siempre
 * va a ser mejor que cualquier lista que escribamos a mano. Esta lista existe
 * para lo que esa consulta NO puede cubrir:
 *
 *  1. LO ESPECÍFICO DE POCHOCLO. "pochoclo123" no está en ninguna brecha
 *     porque el sitio todavía no existe, y es exactamente lo que alguien
 *     probaría primero. Lo mismo con el nombre y el correo del propio
 *     usuario, que se arman en el momento (ver PALABRAS_DEL_SITIO y el
 *     contexto que pasa validarContrasena).
 *  2. EL CASO EN QUE HIBP NO CONTESTA. La consulta externa falla abierta a
 *     propósito (nadie se queda sin poder registrarse porque un tercero está
 *     caído), así que si no hubiera nada local, en ese rato no habría ningún
 *     control. Esta lista es el piso que queda siempre.
 *
 * NO ES UN DICCIONARIO NI PRETENDE SERLO. Son las que aparecen arriba de todo
 * en los recuentos de brechas, más las variantes en español que esos
 * recuentos (hechos casi siempre con datos en inglés) subestiman.
 */

/** Palabras ligadas al sitio. Cualquier contraseña que las contenga se rechaza. */
export const PALABRAS_DEL_SITIO = ['pochoclo', 'popcorn'];

/**
 * Contraseñas exactas prohibidas. Se comparan en minúsculas y sin espacios
 * alrededor, así que "Password" y "password" son la misma.
 */
export const CONTRASENAS_COMUNES = new Set([
  // Las universales de todos los recuentos de brechas.
  '123456', '1234567', '12345678', '123456789', '1234567890',
  'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd',
  'qwerty', 'qwerty123', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  'abc123', 'abcd1234', 'a1b2c3d4', '111111', '000000', '123123', '112233',
  'iloveyou', 'admin', 'administrator', 'welcome', 'letmein', 'monkey',
  'dragon', 'sunshine', 'princess', 'football', 'baseball', 'superman',
  'trustno1', 'master', 'shadow', 'michael', 'jennifer', 'jordan',
  'login', 'guest', 'test', 'test123', 'changeme', 'secret', 'default',

  // Variantes en español, que los recuentos en inglés subestiman.
  'contrasena', 'contraseña', 'contrasena1', 'contraseña1',
  'holamundo', 'hola123', 'holahola', 'tequiero', 'teamo', 'teamomucho',
  'mivida', 'micontrasena', 'micontraseña', 'usuario', 'usuario1',
  'argentina', 'boca', 'bocajuniors', 'river', 'riverplate', 'racing',
  'independiente', 'sanlorenzo', 'messi', 'messi10', 'maradona', 'diego',
  'futbol', 'futbol123', 'mama', 'papa', 'familia', 'amigos',
  'colegio', 'escuela', 'trabajo', 'invierno', 'verano', 'primavera',
]);

/**
 * ¿La contraseña es una secuencia o una repetición?
 *
 * Va aparte de la lista porque son infinitas: no se pueden enumerar todas las
 * corridas de teclado ni todos los "aaaaaaaa". El NIST las nombra
 * explícitamente ("repetitive or sequential characters").
 */
export function esSecuenciaORepeticion(valor) {
  const v = valor.toLowerCase();

  /**
   * Una corrida larga del mismo carácter, esté donde esté. Cubre "aaaaaaaa" y
   * también "aaaaaaaa1!", que es la misma contraseña con un adorno para pasar
   * el requisito de mezcla. Cinco repeticiones seguidas ya no son un patrón
   * que aparezca en una contraseña pensada.
   */
  if (/(.)\1{4,}/.test(v)) return true;

  // Secuencias ascendentes o descendentes de números o letras, de 6 o más.
  const ASCENDENTE = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const DESCENDENTE = [...ASCENDENTE].reverse().join('');
  for (const alfabeto of [ASCENDENTE, DESCENDENTE]) {
    for (let i = 0; i + 6 <= alfabeto.length; i++) {
      if (v.includes(alfabeto.slice(i, i + 6))) return true;
    }
  }

  /**
   * Corridas de teclado, que no son secuencias alfabéticas pero se tipean
   * igual de rápido.
   */
  const FILAS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];
  for (const fila of FILAS) {
    for (let i = 0; i + 5 <= fila.length; i++) {
      if (v.includes(fila.slice(i, i + 5))) return true;
    }
  }

  return false;
}
