import { Router } from 'express';
import { leerTextoDeBusqueda } from '../utils/consulta.js';
import { responderError } from '../utils/responder.js';
import { buscarTitulo } from '../services/tmdb.js';

export const buscarTituloRouter = Router();

/**
 * Búsqueda por nombre (no discover) — para encontrar el tmdb_id de un
 * título antes de usarlo como referencia en "Parecido a", o para el
 * autocompletado en general.
 * GET /buscar-titulo?q=nombre
 */
buscarTituloRouter.get('/buscar-titulo', async (req, res) => {
  const { valor: q, error } = leerTextoDeBusqueda(req.query.q);
  if (error) return res.status(400).json({ error });
  try {
    const resultados = await buscarTitulo(q);
    res.json({ resultados: resultados.slice(0, 10) });
  } catch (err) {
    responderError(res, err, 'buscarTitulo');
  }
});
