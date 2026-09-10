import { esCrawler } from '../_utils/bots.js';
import { ReemplazarTexto, ReemplazarAtributo, EliminarElemento, AgregarAlHead } from '../_utils/reescritura.js';
import { datosEstructuradosFicha } from '../../src/utils/datosEstructurados.js';
import { urlPoster, urlBackdrop } from '../../src/utils/imagenes.js';
import { recortar } from '../../src/utils/texto.js';
import { DOMINIO_SITIO } from '../../src/config/sitio.js';

/**
 * Reescribe el <title>, el Open Graph, las Twitter Cards y agrega el JSON-LD
 * de la ficha para crawlers sin JavaScript (la mayoría de los de redes
 * sociales y de asistentes de IA — ver 4.23 y el comentario de
 * useMetadatos.js). Hoy, compartir o citar la ficha de una película siempre
 * muestra la tarjeta genérica de la marca; esto la reemplaza por la del
 * título puntual, SOLO para quien no ejecuta JavaScript.
 *
 * UN VISITANTE HUMANO NO PASA POR ACÁ: `esCrawler()` corta antes de pedirle
 * nada al backend, así que esta función no le agrega ni un milisegundo a
 * ninguna carga real. Y SI EL BACKEND NO CONTESTA A TIEMPO (está en una
 * notebook detrás de un túnel, no en un datacenter), el bot recibe el shell
 * genérico de siempre — nunca un error, nunca peor que el estado actual. El
 * timeout es corto porque nadie está esperando esta respuesta con una
 * pantalla de carga: es un fetch de bot, no de persona.
 *
 * REQUIERE la variable de entorno API_URL en el proyecto de Cloudflare
 * Pages (Settings → Environment variables). Es DISTINTA de VITE_API_URL:
 * esa se hornea en el bundle al compilar, esta la lee la Function en cada
 * pedido. Sin ella, la función no hace nada (mismo passthrough que hoy).
 */
const TIMEOUT_MS = 2500;

export async function onRequestGet(context) {
  const { request, params, env } = context;
  const activo = env.ASSETS.fetch(request);

  if (!esCrawler(request)) return activo;

  const [tipo, id] = params.ruta ?? [];
  if ((tipo !== 'pelicula' && tipo !== 'tv') || !/^\d+$/.test(id ?? '')) return activo;

  const apiUrl = env.API_URL;
  if (!apiUrl) return activo;

  let ficha;
  try {
    const controlador = new AbortController();
    const corte = setTimeout(() => controlador.abort(), TIMEOUT_MS);
    const respuesta = await fetch(`${apiUrl}/titulo/${tipo}/${id}`, { signal: controlador.signal });
    clearTimeout(corte);
    if (!respuesta.ok) return activo;
    ficha = await respuesta.json();
  } catch {
    return activo;
  }

  const base = await activo;
  if (!base.ok) return base;

  const titulo = `${ficha.titulo}${ficha.anio ? ` (${ficha.anio})` : ''} | Pochoclo`;
  const descripcion = descripcionFicha(ficha);
  const canonica = `https://${DOMINIO_SITIO}/titulo/${tipo}/${id}`;
  const imagen = urlBackdrop(ficha.backdrop) || urlPoster(ficha.poster, 'w500') || `https://${DOMINIO_SITIO}/og.png`;
  /**
   * El breakout de "</script>" es la única amenaza real de un JSON-LD
   * embebido a mano: si una sinopsis de TMDb lo contuviera, cerraría el
   * bloque antes de tiempo. < no se interpreta como etiqueta.
   */
  const jsonLd = JSON.stringify(datosEstructuradosFicha(ficha, tipo, id)).replace(/</g, '\\u003c');

  return new HTMLRewriter()
    .on('title', new ReemplazarTexto(titulo))
    .on('meta[name="description"]', new ReemplazarAtributo('content', descripcion))
    .on('meta[property="og:title"]', new ReemplazarAtributo('content', titulo))
    .on('meta[property="og:description"]', new ReemplazarAtributo('content', descripcion))
    .on('meta[property="og:url"]', new ReemplazarAtributo('content', canonica))
    .on('meta[property="og:image"]', new ReemplazarAtributo('content', imagen))
    /**
     * Sin width/height: son los de og.png (1200x630) y no valen para un
     * póster o un backdrop, que tienen otra proporción. Mejor omitirlos que
     * declarar una medida que no es la real.
     */
    .on('meta[property="og:image:width"]', new EliminarElemento())
    .on('meta[property="og:image:height"]', new EliminarElemento())
    .on('meta[property="og:image:alt"]', new ReemplazarAtributo('content', titulo))
    .on('meta[name="twitter:title"]', new ReemplazarAtributo('content', titulo))
    .on('meta[name="twitter:description"]', new ReemplazarAtributo('content', descripcion))
    .on('meta[name="twitter:image"]', new ReemplazarAtributo('content', imagen))
    .on('meta[name="twitter:image:alt"]', new ReemplazarAtributo('content', titulo))
    .on(
      'head',
      new AgregarAlHead(
        `<link rel="canonical" href="${canonica}"><script type="application/ld+json">${jsonLd}</script>`
      )
    )
    .transform(base);
}

/** Mismo criterio que Ficha.jsx: solo se usa la sinopsis si está en español. */
function descripcionFicha(ficha) {
  const base =
    ficha.sinopsisIdioma === 'es' && ficha.sinopsis
      ? ficha.sinopsis
      : 'Sinopsis, puntuación, dónde verla y títulos parecidos, en Pochoclo.';
  return recortar(base, 200);
}
