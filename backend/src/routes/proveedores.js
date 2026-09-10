import { Router } from 'express';
import { responderError } from '../utils/responder.js';
import { obtenerProveedoresDisponibles } from '../services/tmdb.js';
import { cachearUnaHora } from '../utils/cacheNavegador.js';

export const proveedoresRouter = Router();

/**
 * Lista de plataformas disponibles (región fija: Argentina — ver nota en
 * tmdb.js), para armar el selector de "Disponible en".
 * GET /proveedores
 */
proveedoresRouter.get('/proveedores', async (req, res) => {
  try {
    const proveedores = await obtenerProveedoresDisponibles();
    cachearUnaHora(res);
    res.json({ proveedores });
  } catch (err) {
    responderError(res, err, 'proveedores');
  }
});
