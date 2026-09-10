/**
 * HSTS (HTTP Strict Transport Security).
 *
 * QUÉ HACE, en una frase: le dice al navegador "para este dominio, durante
 * los próximos N segundos, nunca uses HTTP; andá directo a HTTPS, y si el
 * certificado está mal, no dejes al usuario seguir igual".
 *
 * QUÉ **NO** HACE: no hace que el sitio sea HTTPS. Eso lo da el certificado
 * TLS, que lo pone el hosting. HSTS es una instrucción para el navegador, no
 * una función del servidor.
 *
 * EL PROBLEMA QUE RESUELVE es el PRIMER pedido. Si alguien escribe
 * "api.pochoclo.ar" sin el https:// adelante, el navegador prueba HTTP, y ese
 * pedido viaja en texto plano. Redirigir de HTTP a HTTPS no alcanza: en una
 * red hostil el atacante intercepta ANTES de que el redirect llegue y sirve
 * una copia del sitio por HTTP. Con HSTS ya recibido, el navegador ni
 * siquiera manda ese pedido en claro.
 *
 * SOLO PROTEGE DESPUÉS DE LA PRIMERA VISITA EXITOSA POR HTTPS, porque el
 * navegador tiene que haber recibido esta cabecera alguna vez. Ese hueco lo
 * tapa la lista de precarga (ver PRELOAD abajo).
 *
 * ES UN COMPROMISO DIFÍCIL DE DESHACER, y de ahí sale todo el diseño de este
 * archivo. Si se manda un max-age largo y un día se vence el certificado, el
 * sitio queda INACCESIBLE: el navegador se niega a entrar y el usuario no
 * puede saltear el aviso, y esa negativa dura lo que diga el max-age que ya
 * recibió. Por eso:
 *
 *   - arranca APAGADO (sin HSTS_MAX_AGE no se manda nada),
 *   - la escalera recomendada es 3600 (una hora) -> 86400 (un día) ->
 *     31536000 (un año), confirmando en cada paso que todo anda,
 *   - includeSubDomains y preload son opt-in aparte, porque cada uno amplía
 *     el compromiso.
 *
 * DÓNDE IMPORTA MÁS, y esto conviene tenerlo claro: esta cabecera protege el
 * dominio de la API. El dominio donde el usuario ESCRIBE la dirección es el
 * del frontend (pochoclo.ar), y ese lo sirve el hosting, no este Express, así
 * que su HSTS se configura allá. Un includeSubDomains en pochoclo.ar cubre de
 * paso a api.pochoclo.ar.
 */

const MAX_AGE = Number(process.env.HSTS_MAX_AGE || 0);
const INCLUIR_SUBDOMINIOS = process.env.HSTS_INCLUIR_SUBDOMINIOS === 'true';
const PRECARGA = process.env.HSTS_PRECARGA === 'true';

/** Lo que exige la lista de precarga de los navegadores. */
const MAX_AGE_MINIMO_PRECARGA = 31536000; // un año

if (PRECARGA && (!INCLUIR_SUBDOMINIOS || MAX_AGE < MAX_AGE_MINIMO_PRECARGA)) {
  /**
   * Un `preload` que no cumple los requisitos no es medio válido: la lista lo
   * rechaza, así que la directiva no hace nada y da una falsa sensación de
   * estar protegido. Mejor cortar el arranque que publicar eso.
   */
  throw new Error(
    'HSTS_PRECARGA pide HSTS_INCLUIR_SUBDOMINIOS=true y HSTS_MAX_AGE de al menos 31536000 (un año). Ver .env.example.'
  );
}

const VALOR = [
  `max-age=${MAX_AGE}`,
  INCLUIR_SUBDOMINIOS ? 'includeSubDomains' : null,
  PRECARGA ? 'preload' : null,
]
  .filter(Boolean)
  .join('; ');

/**
 * Middleware. No hace nada si HSTS está apagado o si el pedido no llegó por
 * HTTPS.
 *
 * Lo del HTTPS no es un detalle: los navegadores IGNORAN esta cabecera cuando
 * viene por HTTP, justamente para que un atacante que interceptó una conexión
 * en claro no pueda dejar clavado un HSTS falso. Mandarla igual sería ruido.
 *
 * `req.secure` respeta el `trust proxy` que configura index.js, así que
 * detrás de un proxy lee X-Forwarded-Proto. Si PROXIES_CONFIABLES quedara mal
 * puesto en producción, esto no se manda nunca y HSTS no protege: es otra
 * razón para revisar ese número al publicar.
 */
export function hsts(req, res, siguiente) {
  if (MAX_AGE > 0 && req.secure) {
    res.set('Strict-Transport-Security', VALOR);
  }
  siguiente();
}

/** Para el mensaje de arranque, así queda claro si está activo o no. */
export const HSTS_ACTIVO = MAX_AGE > 0;
export const HSTS_DESCRIPCION = HSTS_ACTIVO ? VALOR : 'apagado (HSTS_MAX_AGE sin definir)';
