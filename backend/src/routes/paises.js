import { Router } from 'express';
import { PAISES_TMDB } from '../data/paises.js';
import { cachearUnaHora } from '../utils/cacheNavegador.js';

export const paisesRouter = Router();

/**
 * Lista de países (código ISO 3166-1 + nombre en español) para el
 * selector de Preferencias/Filtros. Datos locales y estáticos.
 * GET /paises
 */
paisesRouter.get('/paises', (req, res) => {
  const paises = Object.entries(PAISES_TMDB)
    .map(([codigo, nombre]) => ({ codigo, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  cachearUnaHora(res);
  res.json({ paises });
});
