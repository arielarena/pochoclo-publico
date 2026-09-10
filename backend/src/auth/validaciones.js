import {
  CONTRASENAS_COMUNES,
  PALABRAS_DEL_SITIO,
  esSecuenciaORepeticion,
} from '../data/contrasenasComunes.js';
import { anioDeNacimiento, edadCumplida } from '../logic/edad.js';

/**
 * Validación de los campos de la cuenta, del lado del servidor.
 *
 * Por qué existe este archivo aparte y no está todo adentro de auth.js: las
 * mismas reglas hacen falta en DOS momentos distintos, el alta y la edición
 * del perfil, y hasta ahora solo estaban escritas para el alta. O sea que
 * `updateUser` aceptaba un nombre vacío o una fecha de nacimiento de 1300,
 * que el registro rechazaba. Con las reglas en un solo lugar, los dos
 * caminos no se pueden desincronizar.
 *
 * REGLA GENERAL DEL PROYECTO: el formulario valida lo mismo antes de enviar,
 * pero eso es JavaScript del navegador. Cualquiera abre las devtools y llama
 * al endpoint a mano. Esta es la validación que no se puede saltear, así que
 * es la que decide.
 *
 * Los mensajes van en español porque llegan al usuario tal cual: el
 * `mensajeDeError` del cliente traduce los códigos conocidos de Better Auth,
 * no los textos nuestros.
 */

/**
 * Edad mínima para tener cuenta.
 *
 * 13 sale del criterio de la AAIP para el consentimiento de menores en la
 * Ley 25.326, leído junto con el artículo 26 del Código Civil: por debajo de
 * esa edad el consentimiento lo tiene que dar quien esté a cargo, y Pochoclo
 * no tiene ningún mecanismo para pedirlo ni para verificarlo.
 *
 * Es el mismo número que publica el punto 4 de los Términos y el que valida
 * el formulario de registro (frontend/src/utils/edad.js). Si se cambia acá,
 * cambiarlo en esos dos lugares.
 *
 * Ojo con lo que esto NO significa: la app entera se sigue usando sin cuenta
 * y sin ninguna edad mínima, que es el uso por defecto (sección 1 del
 * Definitivo). Esto solo limita quién puede registrarse.
 */
export const EDAD_MINIMA_CUENTA = 13;

/**
 * Fecha de nacimiento más antigua que se acepta. No es un filtro de gente,
 * es un filtro de errores de tipeo: un año de tres dígitos o un 1080 en vez
 * de 1980. La persona viva más longeva registrada no llegó a 123 años, así
 * que 1900 deja margen de sobra.
 */
const ANIO_MINIMO_NACIMIENTO = 1900;

/** Largo máximo del nombre. Es un saludo, no una biografía. */
const LARGO_MAXIMO_NOMBRE = 60;

/**
 * Largo máximo del correo, el de la norma: 254 caracteres (RFC 5321).
 *
 * NO ES UN LÍMITE DECORATIVO. Sin él, `FORMATO_CORREO` acepta una dirección
 * de cualquier largo, porque sus partes son `[^\s@.]+`, o sea "uno o más" sin
 * techo. Medido el 2026-08-28: **un correo de 100.000 caracteres creaba la
 * cuenta y quedaba guardado en la base**, con HTTP 200 y sin ninguna queja.
 *
 * El daño no es solo el espacio: esa dirección viaja después a cada pantalla
 * que muestre el perfil, a los índices de la tabla, y a los respaldos.
 */
const LARGO_MAXIMO_CORREO = 254;

/**
 * Mismo formato de correo que valida el frontend (frontend/src/utils/correo.js).
 * Está duplicado a mano y no compartido porque son dos paquetes separados sin
 * código común; si se cambia uno, cambiar el otro.
 */
const FORMATO_CORREO = /^[^\s@.]+(\.[^\s@.]+)*@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Caracteres de control (incluidos los de dirección bidireccional de
 * Unicode, U+202A a U+202E y U+2066 a U+2069).
 *
 * No es una defensa contra XSS: de eso se ocupa React, que escapa todo lo
 * que interpola, y la app no usa dangerouslySetInnerHTML en ningún lado
 * (verificado). Es contra dos cosas más aburridas y más probables: un nombre
 * con un byte nulo que rompe consultas y logs, y las marcas de bidireccionalidad,
 * que permiten que un texto se muestre en un orden distinto al que está
 * guardado. Se sacan en silencio en vez de rechazar el alta, porque quien
 * pega un nombre con un carácter invisible no hizo nada malo.
 */
// eslint-disable-next-line no-control-regex
const CARACTERES_DE_CONTROL = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

/**
 * Limpia y valida el nombre. Devuelve `{ valor }` o `{ error }`.
 *
 * Better Auth acepta cualquier `name`, incluido el vacío, así que esta es la
 * única barrera real.
 */
export function validarNombre(crudo) {
  const nombre = String(crudo ?? '')
    .replace(CARACTERES_DE_CONTROL, '')
    .trim();

  if (!nombre) return { error: 'Escribí un nombre. Puede ser un apodo.' };
  if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    return { error: `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE} caracteres.` };
  }
  return { valor: nombre };
}

/**
 * Limpia y valida el correo. Devuelve `{ valor }` o `{ error }`.
 *
 * Es defensa en profundidad: el validador de Better Auth ya rechaza
 * "juan@gmail" y los espacios sobrantes ANTES de llegar acá (verificado el
 * 2026-08-22, contesta VALIDATION_ERROR), así que en la práctica esta rama
 * casi no se activa. Queda para que el criterio esté escrito de nuestro lado
 * y no dependa de lo que decida validar la librería en la próxima versión.
 *
 * El `toLowerCase` sí hace algo visible: guarda "Juan@Gmail.com" como
 * "juan@gmail.com", así la misma casilla no puede terminar en dos cuentas
 * distintas por una mayúscula.
 */
export function validarCorreo(crudo) {
  const correo = String(crudo ?? '')
    .replace(CARACTERES_DE_CONTROL, '')
    .trim()
    .toLowerCase();

  if (!FORMATO_CORREO.test(correo)) {
    return { error: 'Escribí un correo con la forma nombre@sitio.com.' };
  }

  /**
   * Va DESPUÉS del formato a propósito: quien escribe mal su dirección tiene
   * que leer el error de formato, que es el que le sirve. El del largo solo
   * aparece en el caso raro de una dirección bien formada y absurda.
   */
  if (correo.length > LARGO_MAXIMO_CORREO) {
    return { error: `El correo no puede pasar de ${LARGO_MAXIMO_CORREO} caracteres.` };
  }

  return { valor: correo };
}

/**
 * Valida la fecha de nacimiento y la edad mínima. Devuelve `{ valor }` (un
 * Date) o `{ error }`.
 *
 * La cuenta de la edad se hace con el reloj del SERVIDOR, que es lo que
 * hace que valga: el del navegador lo cambia el usuario desde el sistema
 * operativo en diez segundos.
 */
export function validarFechaNacimiento(cruda) {
  if (cruda === undefined || cruda === null || cruda === '') {
    return { error: 'Falta la fecha de nacimiento.' };
  }

  const fecha = new Date(cruda);
  if (Number.isNaN(fecha.getTime())) {
    return { error: 'Revisá la fecha de nacimiento.' };
  }
  if (fecha > new Date()) {
    return { error: 'La fecha de nacimiento no puede estar en el futuro.' };
  }
  /**
   * El año se lee en UTC, que es el día que la persona escribió: en local, un
   * nacimiento del 1 de enero da el año anterior y se rechazaba de más (ver la
   * nota al principio de logic/edad.js).
   */
  if (anioDeNacimiento(fecha) < ANIO_MINIMO_NACIMIENTO) {
    return { error: 'Revisá el año de nacimiento.' };
  }

  const edad = edadCumplida(fecha);
  if (edad < EDAD_MINIMA_CUENTA) {
    return {
      /**
       * Redactado para que sirva igual en el alta y en la edición del
       * perfil, que son los dos caminos que llaman acá.
       */
      error: `Hay que tener ${EDAD_MINIMA_CUENTA} años o más para tener una cuenta. Pochoclo se puede usar entero sin cuenta.`,
    };
  }

  return { valor: fecha };
}

/**
 * Valida la aceptación de los Términos. Devuelve `{ valor: true }` o
 * `{ error }`.
 *
 * Exige el booleano `true` exacto, no un valor "parecido a verdadero": si
 * llegara la cadena "false" (que en JavaScript es verdadera) o un 1, no es
 * una aceptación, es un cliente mandando cualquier cosa.
 *
 * Sobre qué prueba esto y qué no, para no confundirse: un cliente hecho a
 * mano puede mandar `true` sin que nadie haya leído nada, igual que puede
 * tildar la casilla sin leerla. Lo que la verificación del servidor
 * garantiza es que la aceptación quedó registrada de forma explícita y con
 * fecha en nuestra base, en vez de ser una suposición nuestra. Eso es lo
 * que después se puede mostrar si alguien discute haber aceptado.
 */
export function validarAceptacionTerminos(cruda) {
  if (cruda !== true) {
    return { error: 'Hay que aceptar los términos y condiciones para crear la cuenta.' };
  }
  return { valor: true };
}

/**
 * ---------------------------------------------------------------------------
 * Contraseñas
 * ---------------------------------------------------------------------------
 *
 * Las reglas siguen la SP 800-63B del NIST. Lo que esa guía pide, y dónde está
 * cada cosa:
 *
 *   - Mínimo 8 y aceptar largas          -> LARGO_MINIMO / LARGO_MAXIMO
 *   - Aceptar TODO carácter, espacios
 *     y Unicode incluidos                -> no se filtra ni se recorta nada
 *   - Comparar contra contraseñas ya
 *     filtradas                          -> auth/contrasenaFiltrada.js (HIBP)
 *   - Comparar contra comunes, de
 *     diccionario y secuencias           -> data/contrasenasComunes.js
 *   - Comparar contra palabras del
 *     contexto del servicio              -> el parámetro `contexto` de acá
 *   - No obligar a rotarla cada N meses  -> no existe esa función, a propósito
 *   - Nada de preguntas de seguridad     -> no existen
 *   - Permitir pegar                     -> no se bloquea el pegado
 *   - Limitar los intentos               -> rateLimit en auth.js
 *   - Hash costoso en memoria            -> scrypt, el de Better Auth
 *
 * LO ÚNICO EN QUE NOS APARTAMOS de la guía es que se exige mezcla de tipos de
 * carácter, cosa que el NIST desaconseja de forma explícita. Está acotado a
 * propósito: la mezcla se pide SOLO a las contraseñas cortas. Ver
 * LARGO_SIN_MEZCLA abajo.
 *
 * LO QUE SE DECIDIÓ NO HACER, para que no parezca un olvido: el NIST sugiere
 * (no obliga) normalizar el Unicode con NFKC antes de hashear, para que la
 * misma contraseña tipeada con otro teclado coincida. No se implementó porque
 * habría que aplicarlo de forma idéntica al crear la cuenta Y al entrar, y
 * cualquier diferencia entre esos dos caminos deja gente afuera de su propia
 * cuenta sin ninguna forma de darse cuenta. El beneficio es chico (afecta a
 * quien tipea con caracteres combinantes) y el modo de fallo es grave.
 */

export const LARGO_MINIMO_CONTRASENA = 8;

/**
 * Tope de largo. No es seguridad, es no dejar que alguien nos haga hashear un
 * megabyte de texto en cada intento: scrypt cuesta CPU a propósito. El NIST
 * pide aceptar al menos 64, así que 128 lo cumple de sobra.
 */
export const LARGO_MAXIMO_CONTRASENA = 128;

/**
 * A partir de este largo NO se exige mezcla de tipos de carácter.
 *
 * Es la forma de conservar lo que el proyecto ya pedía sin ir en contra de la
 * guía. El razonamiento del NIST es que obligar a mezclar produce respuestas
 * previsibles ("Password1!") mientras bloquea frases que son mucho más
 * difíciles de adivinar. Con esta exención, "cuatro gatos en el techo" pasa,
 * y una de ocho caracteres sigue teniendo que esforzarse.
 *
 * 16 es el umbral habitual para esto. Si algún día se quiere seguir la guía al
 * pie de la letra, alcanza con poner esta constante en
 * LARGO_MINIMO_CONTRASENA: la mezcla deja de pedirse nunca, y no hay que tocar
 * nada más ni acá ni en el frontend.
 */
export const LARGO_SIN_MEZCLA = 16;

/**
 * Las reglas que el formulario muestra mientras se escribe.
 *
 * `cuandoAplica` es lo que permite que la lista del frontend se acorte sola:
 * al pasar los 16 caracteres, los tres requisitos de mezcla desaparecen en vez
 * de quedar tildados a medias. La copia del cliente está en
 * frontend/src/utils/contrasena.js; si se cambia una, cambiar la otra.
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

/** Las reglas que le corresponden a un valor dado, según su largo. */
export function reglasQueAplican(valor) {
  return REGLAS_CONTRASENA.filter((regla) => regla.cuandoAplica(valor ?? ''));
}

/**
 * Normaliza para comparar contra las listas de prohibidas: minúsculas, sin
 * acentos y sin nada que no sea letra o número.
 *
 * Sin esto la lista se saltea con "P@ssw0rd" o "contraseña!". La contraseña
 * REAL no se toca: esto es solo para la comparación.
 */
function aplanar(valor) {
  const sinAcentos = valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

  return sinAcentos.replace(/[^a-z0-9]/g, '');
}

/**
 * Igual que aplanar(), pero deshaciendo además las sustituciones de "leet".
 * Sin esto, "P@ssw0rd" no coincide con "password" y se escapa de la lista,
 * que es justo la variante que alguien escribe creyendo que la disfrazó.
 *
 * SE COMPARAN LAS DOS FORMAS, no solo esta, y la razón es un error que ya
 * cometí acá: deshacer el leet puede ROMPER una coincidencia que existía. Con
 * el número 1 traducido a "i", "password1" (que está en la lista) se convierte
 * en "passwordi" y deja de encontrarse. Así que ninguna de las dos formas
 * alcanza sola.
 *
 * El signo "!" NO se traduce a "i" por lo mismo: se usa muchísimo más como
 * símbolo al final que como letra disfrazada, y traducirlo hacía que
 * "contrasena!" terminara en "contrasenai".
 */
function aplanarLeet(valor) {
  return aplanar(
    valor
      .toLowerCase()
      .replace(/[@4]/g, 'a')
      .replace(/3/g, 'e')
      .replace(/[1|]/g, 'i')
      .replace(/0/g, 'o')
      .replace(/[$5]/g, 's')
      .replace(/7/g, 't')
  );
}

/**
 * Reglas que no necesitan salir a internet. Devuelve `{ valor }` o `{ error }`.
 *
 * `contexto` son palabras que no pueden aparecer en la contraseña de ESTA
 * persona: su nombre y su correo. Es lo que pide el NIST cuando habla de
 * "palabras específicas del contexto", y es lo único de todo el chequeo que no
 * puede resolver una lista general, por definición.
 *
 * Ojo con de dónde sale ese contexto: al crear la cuenta y al cambiar la
 * contraseña desde el perfil lo tenemos. Al restablecerla con el enlace del
 * correo NO, porque en ese pedido solo viaja el token. Ahí se valida todo lo
 * demás igual.
 */
export function validarContrasena(cruda, { contexto = [] } = {}) {
  if (typeof cruda !== 'string' || cruda === '') {
    return { error: 'Falta la contraseña.' };
  }
  if (cruda.length > LARGO_MAXIMO_CONTRASENA) {
    return { error: `La contraseña no puede pasar de ${LARGO_MAXIMO_CONTRASENA} caracteres.` };
  }

  const faltan = reglasQueAplican(cruda).filter((regla) => !regla.cumple(cruda));
  if (faltan.length > 0) {
    const lista = faltan.map((r) => r.etiqueta.toLowerCase()).join('; ');
    const salida =
      cruda.length < LARGO_SIN_MEZCLA
        ? ` (o usá ${LARGO_SIN_MEZCLA} caracteres o más, y entonces no hace falta la mezcla)`
        : '';
    return { error: `La contraseña tiene que cumplir: ${lista}${salida}.` };
  }

  // Las dos formas, por lo que explica el comentario de aplanarLeet().
  const formas = [aplanar(cruda), aplanarLeet(cruda)];

  if (formas.some((forma) => CONTRASENAS_COMUNES.has(forma))) {
    return {
      error:
        'Esa contraseña es de las más usadas del mundo, así que es de las primeras que se prueban. Elegí otra.',
    };
  }

  if (esSecuenciaORepeticion(cruda)) {
    return {
      error:
        'Esa contraseña es una secuencia o una repetición, y son de las primeras que se prueban. Elegí otra.',
    };
  }

  for (const palabra of [...PALABRAS_DEL_SITIO, ...contexto]) {
    const palabraPlana = aplanar(String(palabra ?? ''));
    /**
     * Menos de 4 no se mira: un nombre como "Ana" aparecería dentro de
     * demasiadas contraseñas legítimas.
     */
    if (palabraPlana.length >= 4 && formas.some((forma) => forma.includes(palabraPlana))) {
      return {
        error:
          'La contraseña no puede contener tu nombre, tu correo ni el nombre del sitio: son las primeras palabras que alguien probaría.',
      };
    }
  }

  return { valor: cruda };
}

/**
 * Las palabras del usuario que no pueden aparecer en su contraseña.
 *
 * Del correo se toma solo lo de antes de la arroba, y se parte por los signos
 * de puntuación, así que "ana.perez@gmail.com" aporta "ana" y "perez".
 */
export function contextoDeUsuario({ nombre, correo } = {}) {
  const partes = [];
  if (nombre) partes.push(...String(nombre).split(/\s+/));
  if (correo) partes.push(...String(correo).split('@')[0].split(/[._\-+]/));
  return partes.filter(Boolean);
}
