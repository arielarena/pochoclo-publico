/**
 * Requisitos de la contraseña.
 *
 * Espejo de backend/src/auth/validaciones.js. Está duplicado a mano y no
 * compartido porque son dos paquetes separados sin código común, igual que
 * pasa con el formato de correo y con el cálculo de la edad. Si se cambia una
 * lista, cambiar la otra.
 *
 * LA QUE MANDA ES LA DEL SERVIDOR. Esta existe para dos cosas que el servidor
 * no puede hacer: mostrar los requisitos mientras se escribe, e impedir que el
 * formulario se envíe si no se cumplen. Si alguien llama a la API a mano o
 * borra atributos del HTML, el servidor rechaza igual.
 *
 * QUÉ SE VERIFICA SOLO EN EL SERVIDOR, y por qué:
 *
 *  - Que la contraseña no esté en una FILTRACIÓN conocida. Se consulta a Have
 *    I Been Pwned, y esa consulta tiene que salir de nuestro servidor: hacerla
 *    desde el navegador del usuario sería mandarle datos de su contraseña a un
 *    tercero desde su propia máquina, que es justo lo que /privacidad promete
 *    que no pasa.
 *  - Que no sea una de las MÁS COMUNES ni contenga el nombre del usuario. La
 *    lista vive en el backend y duplicarla acá serían cientos de líneas
 *    repetidas para adelantar un aviso que llega igual al enviar.
 *
 * O sea: lo que se ve en vivo son el largo y la mezcla; lo demás se responde
 * al enviar, con el mensaje que devuelve el servidor.
 */

export const LARGO_MINIMO_CONTRASENA = 8;
export const LARGO_MAXIMO_CONTRASENA = 128;

/**
 * A partir de este largo no se exige mezcla de tipos de carácter.
 *
 * El NIST desaconseja obligar a mezclar, porque produce respuestas previsibles
 * ("Password1!") y bloquea frases que son mucho más difíciles de adivinar.
 * Esta exención conserva la exigencia donde sirve (contraseñas cortas) y la
 * saca donde estorba.
 */
export const LARGO_SIN_MEZCLA = 16;

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
 * Estado de cada regla para un valor dado. Solo devuelve las reglas que
 * APLICAN a ese valor, así la lista de la pantalla se acorta sola al pasar los
 * 16 caracteres en vez de dejar tres requisitos sin tildar que ya no importan.
 *
 * Devuelve `{ cumpleTodo, reglas: [{ clave, etiqueta, ok }], sinMezcla }`.
 */
export function evaluarContrasena(valor) {
  const texto = valor ?? '';
  const reglas = REGLAS_CONTRASENA.filter((r) => r.cuandoAplica(texto)).map((regla) => ({
    clave: regla.clave,
    etiqueta: regla.etiqueta,
    ok: regla.cumple(texto),
  }));
  return {
    cumpleTodo: texto.length <= LARGO_MAXIMO_CONTRASENA && reglas.every((r) => r.ok),
    reglas,
    // Para que la pantalla pueda explicar por qué desaparecieron requisitos.
    sinMezcla: texto.length >= LARGO_SIN_MEZCLA,
  };
}

/**
 * Mensaje para cuando se intenta enviar igual. Devuelve null si está bien.
 *
 * Nombra todo lo que falta de una vez y no solo lo primero, con el mismo
 * criterio que el servidor: enterarse de a un problema por vez obliga a probar
 * varias veces.
 */
export function problemaDeContrasena(valor) {
  const texto = valor ?? '';
  if (texto.length > LARGO_MAXIMO_CONTRASENA) {
    return `La contraseña no puede pasar de ${LARGO_MAXIMO_CONTRASENA} caracteres.`;
  }
  const faltan = REGLAS_CONTRASENA.filter((r) => r.cuandoAplica(texto) && !r.cumple(texto));
  if (!faltan.length) return null;

  const lista = faltan.map((r) => r.etiqueta.toLowerCase()).join('; ');
  const salida =
    texto.length < LARGO_SIN_MEZCLA
      ? ` (o usá ${LARGO_SIN_MEZCLA} caracteres o más, y entonces no hace falta la mezcla)`
      : '';
  return `La contraseña tiene que cumplir: ${lista}${salida}.`;
}
