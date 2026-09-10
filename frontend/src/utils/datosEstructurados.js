import { urlPoster } from './imagenes.js';
import { DOMINIO_SITIO } from '../config/sitio.js';

/**
 * Datos estructurados (schema.org Movie / TVSeries) de una ficha.
 *
 * Sin ninguna dependencia de React ni del DOM a propósito: la usan tanto
 * paginas/Ficha.jsx (para que Google, que ejecuta JavaScript, la vea) como
 * la Cloudflare Pages Function de functions/titulo/[[ruta]].js (para los
 * crawlers que NO ejecutan JavaScript, que son la mayoría de los de
 * asistentes de IA — ver las notas de decisiones del proyecto sección 4.23). Una sola función evita que
 * las dos versiones se desincronicen con el tiempo.
 *
 * `aggregateRating` solo se manda si hay `vote_count`: sin cantidad de votos
 * detrás, Google descarta el rich result igual, así que declararlo sin eso
 * es puro ruido.
 */
export function datosEstructuradosFicha(ficha, tipo, id) {
  const esSerie = ficha.tipoContenido === 'miniserie' || ficha.tipoContenido === 'serie';
  const poster = urlPoster(ficha.poster);

  const datos = {
    '@context': 'https://schema.org',
    '@type': esSerie ? 'TVSeries' : 'Movie',
    name: ficha.titulo,
    url: `https://${DOMINIO_SITIO}/titulo/${tipo}/${id}`,
  };

  if (ficha.anio) datos.datePublished = String(ficha.anio);
  if (poster) datos.image = poster;
  if (ficha.sinopsis) {
    datos.description = ficha.sinopsis;
    if (ficha.sinopsisIdioma) datos.inLanguage = ficha.sinopsisIdioma;
  }
  if (ficha.direccion?.length > 0) {
    datos.director = ficha.direccion.map((nombre) => ({ '@type': 'Person', name: nombre }));
  }
  if (ficha.reparto?.length > 0) {
    datos.actor = ficha.reparto.map((nombre) => ({ '@type': 'Person', name: nombre }));
  }
  if (typeof ficha.puntuacion === 'number' && ficha.vote_count > 0) {
    datos.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: ficha.puntuacion,
      ratingCount: ficha.vote_count,
      bestRating: 10,
      worstRating: 0,
    };
  }
  if (!esSerie && ficha.duracion) datos.duration = `PT${ficha.duracion}M`;
  if (esSerie && ficha.temporadas) datos.numberOfSeasons = ficha.temporadas;
  if (esSerie && ficha.episodios) datos.numberOfEpisodes = ficha.episodios;

  return datos;
}
