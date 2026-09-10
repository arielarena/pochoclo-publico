import { Router } from 'express';
import { leerTextoDeBusqueda } from '../utils/consulta.js';
import { responderError } from '../utils/responder.js';
import { buscarPersona } from '../services/tmdb.js';

export const buscarPersonaRouter = Router();

/**
 * Autocompletado para Actor/actriz y Director/a-productor/a (sección 6).
 * Un solo endpoint para los dos campos: la respuesta trae
 * `departamentoConocido` (ej. "Acting", "Directing") para que el frontend
 * distinga, en vez de tener dos rutas separadas para lo mismo.
 * GET /buscar-persona?q=nombre
 */
buscarPersonaRouter.get('/buscar-persona', async (req, res) => {
  const { valor: q, error } = leerTextoDeBusqueda(req.query.q);
  if (error) return res.status(400).json({ error });
  try {
    const resultados = await buscarPersona(q);
    res.json({ resultados: resultados.slice(0, 10) });
  } catch (err) {
    responderError(res, err, 'buscarPersona');
  }
});
