import { createHash } from 'node:crypto';

/**
 * ¿Esta contraseña ya apareció en una filtración conocida?
 *
 * Es la recomendación central del NIST (SP 800-63B): antes que cualquier
 * regla de composición, comparar la contraseña contra las que ya se filtraron.
 * El motivo es directo: un ataque real no prueba combinaciones al azar, prueba
 * listas de contraseñas que ya se usaron en otro lado. Si la tuya está en esa
 * lista, la acierta al primer intento y ningún límite de intentos lo frena.
 *
 * SE CONSULTA A HAVE I BEEN PWNED, que tiene más de 900 millones, y **NO SE
 * LE MANDA LA CONTRASEÑA**. El mecanismo se llama k-anonimato y funciona así:
 *
 *   1. Se calcula el SHA-1 de la contraseña, acá, en nuestro servidor.
 *   2. Se le mandan los PRIMEROS 5 caracteres del hash y nada más.
 *   3. Ellos devuelven los ~800 hashes que empiezan con esos 5 caracteres.
 *   4. Buscamos el nuestro en esa lista, del lado nuestro.
 *
 * O sea que ellos ven un prefijo compartido por miles de contraseñas
 * distintas, nunca la contraseña ni el hash completo, y tampoco saben de qué
 * usuario se trata. Es la razón por la que este chequeo es compatible con lo
 * que promete /privacidad.
 *
 * (El SHA-1 acá no es una decisión de seguridad nuestra: es el formato del
 * índice de HIBP y solo sirve para buscar en él. Las contraseñas de Pochoclo
 * se guardan con scrypt, que es lo que corresponde.)
 *
 * FALLA ABIERTA, Y ES LA DECISIÓN MÁS IMPORTANTE DE ESTE ARCHIVO. Si el
 * servicio está caído, lento, o sin internet, se DEJA PASAR la contraseña.
 * Nadie se puede quedar sin registrarse ni sin recuperar su cuenta porque un
 * tercero tuvo un mal día. El piso que queda en ese rato es la lista local
 * (data/contrasenasComunes.js), que no depende de nadie.
 */

const API = 'https://api.pwnedpasswords.com/range/';

/** Más que esto y el registro empieza a sentirse trabado. */
const TIEMPO_MAXIMO_MS = 2500;

/**
 * Caché en memoria de los prefijos ya consultados.
 *
 * Guarda el prefijo de 5 caracteres y el conjunto de sufijos que devolvió, no
 * contraseñas. Sirve para el caso realista de alguien que prueba dos o tres
 * variantes parecidas seguidas, y para las pruebas automatizadas, que repiten
 * las mismas.
 */
const cache = new Map();
const TOPE_CACHE = 500;

/**
 * @returns {Promise<boolean|null>} true si está filtrada, false si no,
 *   y **null** si no se pudo averiguar (que quien llama trata como "dejala
 *   pasar", pero puede distinguirlo si quiere registrarlo).
 */
export async function estaFiltrada(contrasena) {
  if (process.env.VERIFICAR_CONTRASENAS_FILTRADAS === 'false') return null;

  const hash = createHash('sha1').update(contrasena, 'utf8').digest('hex').toUpperCase();
  const prefijo = hash.slice(0, 5);
  const sufijo = hash.slice(5);

  if (cache.has(prefijo)) return cache.get(prefijo).has(sufijo);

  try {
    const respuesta = await fetch(`${API}${prefijo}`, {
      headers: {
        /**
         * Lo pide su documentación, para poder avisar si una integración se
         * porta mal en vez de bloquearla sin más.
         */
        'User-Agent': 'Pochoclo-verificacion-de-contrasenas',
        /**
         * Rellena la respuesta con hashes falsos para que el TAMAÑO tampoco
         * filtre información sobre qué prefijo se consultó.
         */
        'Add-Padding': 'true',
      },
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });

    if (!respuesta.ok) {
      console.warn(`[contrasenas] HIBP contestó ${respuesta.status}, se deja pasar.`);
      return null;
    }

    const texto = await respuesta.text();
    const sufijos = new Set();
    for (const linea of texto.split('\n')) {
      const [suf, cuenta] = linea.trim().split(':');
      /**
       * El relleno de Add-Padding viene con cuenta 0: son hashes inventados
       * para disimular el tamaño, y contarlos daría falsos positivos.
       */
      if (suf && cuenta && Number(cuenta) > 0) sufijos.add(suf.toUpperCase());
    }

    if (cache.size >= TOPE_CACHE) cache.clear();
    cache.set(prefijo, sufijos);

    return sufijos.has(sufijo);
  } catch (err) {
    console.warn(`[contrasenas] No se pudo consultar HIBP (${err.message}), se deja pasar.`);
    return null;
  }
}
