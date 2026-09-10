import { Router } from 'express';
import { GENEROS_TMDB, GENEROS_PELICULA, GENEROS_SERIE_BUSCABLES } from '../data/genres.js';
import { cachearUnaHora } from '../utils/cacheNavegador.js';

export const generosRouter = Router();

/**
 * Lista de géneros (id + nombre en español) para armar el selector de
 * Preferencias/Filtros. Datos locales y estáticos — sin llamada a TMDb.
 *
 * GET /generos
 * GET /generos?tipo=miniserie&tipo=serie
 *
 * El `tipo` acota la lista a los géneros que se pueden buscar en esa
 * taxonomía, y es lo que evita un modo de fallo silencioso: TMDb tiene dos
 * listas de género que comparten solo 8 IDs, así que elegir "Miniserie" y
 * "Thriller" pedía a /discover/tv un género que ahí no existe y devolvía cero
 * sin decir nada.
 *
 * **Para series NO es la lista de TMDb sino GENEROS_SERIE_BUSCABLES**, que
 * suma los cinco que el motor recrea con keywords (Terror, Thriller, Historia,
 * Romance y Música). Esconderlos era peor que el problema que resolvía: quien
 * quiere una serie de terror marca Terror, se le deselecciona, y no le queda
 * ninguna salida. El único que sigue desapareciendo es Película de TV, que es
 * un formato y no un tema.
 *
 * Sin `tipo` devuelve la unión de las dos, que es el comportamiento de
 * siempre y el que corresponde cuando el usuario todavía no eligió tipo.
 */
generosRouter.get('/generos', (req, res) => {
  const pedidos = [].concat(req.query.tipo ?? []).filter(Boolean);

  let validos = null;
  if (pedidos.length) {
    validos = new Set();
    for (const t of pedidos) {
      const lista = t === 'pelicula' ? GENEROS_PELICULA : GENEROS_SERIE_BUSCABLES;
      for (const id of lista) validos.add(id);
    }
  }

  const generos = Object.entries(GENEROS_TMDB)
    .map(([id, nombre]) => ({ id: Number(id), nombre }))
    .filter(({ id }) => !validos || validos.has(id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  cachearUnaHora(res);
  res.json({ generos });
});
