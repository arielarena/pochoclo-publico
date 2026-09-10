import { Router } from 'express';
import { IDIOMAS_TMDB } from '../data/idiomas.js';
import { cachearUnaHora } from '../utils/cacheNavegador.js';

export const idiomasRouter = Router();

/**
 * Lista de idiomas (código ISO 639-1 + nombre en español) para el
 * selector de Preferencias/Filtros. Datos locales y estáticos.
 * GET /idiomas
 */
idiomasRouter.get('/idiomas', (req, res) => {
  const idiomas = Object.entries(IDIOMAS_TMDB)
    .map(([codigo, nombre]) => ({ codigo, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  cachearUnaHora(res);
  res.json({ idiomas });
});
