import { esCrawler } from './bots.js';
import { ReemplazarTexto, ReemplazarHtml, ReemplazarAtributo, AgregarAlHead, escaparHtml } from './reescritura.js';
import { METADATOS, TITULO_POR_OMISION, DESCRIPCION_POR_OMISION } from '../../src/config/metadatos.js';
import { DOMINIO_SITIO } from '../../src/config/sitio.js';

/**
 * Título, descripción, canónica y un resumen de texto real para crawlers sin
 * JavaScript en las 9 rutas públicas del sitemap. Reusa config/metadatos.js,
 * la misma tabla que usa useMetadatos.js del lado del cliente: una sola
 * fuente para los dos públicos (Google, que ejecuta JS, y el resto de los
 * crawlers, que no).
 *
 * LLAMADA POR NUEVE ARCHIVOS DE UNA LÍNEA (uno por ruta exacta: index.js,
 * buscar.js, etc.), y no por un catch-all en la raíz. Es a propósito: un
 * catch-all en `functions/[[ruta]].js` interceptaría TAMBIÉN cada pedido de
 * `/assets/*`, `/fuentes/*` y demás archivos estáticos, pasando cada uno por
 * una Function antes de servirse — nada se rompería (esCrawler() corta
 * igual para un visitante humano), pero es una capa de más sobre el tráfico
 * más pesado del sitio sin ningún beneficio. Con rutas exactas, esos pedidos
 * ni se enteran de que esto existe.
 */
const RUTA_A_CLAVE = {
  '/': 'inicio',
  '/buscar': 'buscar',
  '/tipo': 'tipo',
  '/estado-animo': 'estadoAnimo',
  '/quien-esta-viendo': 'quienEstaViendo',
  '/acerca-de': 'acercaDe',
  '/privacidad': 'privacidad',
  '/terminos': 'terminos',
  '/accesibilidad': 'accesibilidad',
};

export async function onRequestGetRutaPublica(context) {
  const { request } = context;
  /**
   * Se dispara ya: si termina sin usarse (visitante humano), no se perdió
   * nada esperándolo.
   */
  const activo = context.env.ASSETS.fetch(request);

  if (!esCrawler(request)) return activo;

  const { pathname } = new URL(request.url);
  const clave = RUTA_A_CLAVE[pathname];
  if (!clave) return activo;

  const base = await activo;
  if (!base.ok) return base;

  const datos = METADATOS[clave] ?? {};
  const titulo = datos.titulo || TITULO_POR_OMISION;
  const descripcion = datos.descripcion || DESCRIPCION_POR_OMISION;
  const canonica = `https://${DOMINIO_SITIO}${pathname}`;
  /**
   * Sin esto, un crawler sin JS ve <div id="root"></div> vacío: nada de lo
   * que la pantalla real dice. El h1 saca el "| Pochoclo" final, que tiene
   * sentido en la pestaña del navegador y no como título de contenido.
   */
  const resumen = `<h1>${escaparHtml(titulo.replace(/\s*\|\s*Pochoclo$/, ''))}</h1><p>${escaparHtml(descripcion)}</p>`;

  return new HTMLRewriter()
    .on('title', new ReemplazarTexto(titulo))
    .on('meta[name="description"]', new ReemplazarAtributo('content', descripcion))
    .on('meta[property="og:title"]', new ReemplazarAtributo('content', titulo))
    .on('meta[property="og:description"]', new ReemplazarAtributo('content', descripcion))
    .on('meta[property="og:url"]', new ReemplazarAtributo('content', canonica))
    .on('meta[name="twitter:title"]', new ReemplazarAtributo('content', titulo))
    .on('meta[name="twitter:description"]', new ReemplazarAtributo('content', descripcion))
    .on('head', new AgregarAlHead(`<link rel="canonical" href="${canonica}">`))
    .on('#root', new ReemplazarHtml(resumen))
    .transform(base);
}
