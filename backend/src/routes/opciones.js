import { Router } from 'express';
import { responderError } from '../utils/responder.js';
import { respuestaDeBusqueda, sinLimiteDeEdad, soloRapido } from '../utils/respuestaBusqueda.js';
import { leerLote } from '../utils/lote.js';
import { leerContextoDeUsuario } from '../opciones/personalizacion.js';
import { buscarConFormularioVacio } from '../opciones/formularioVacio.js';

export const opcionesRouter = Router();

/**
 * Opción 1: "No sé qué ver". Búsqueda con formulario vacío (sección 5).
 *
 * Desde v3 son tres bloques (Gustos Registrados, Favoritas/Visto ponderado,
 * Populares) para el usuario registrado. Sin cuenta, o con las tres fuentes
 * vacías, queda solo Populares, que es lo que había antes.
 *
 * GET /opciones/no-se-que-ver?conSuerte=true&lote=N&sinLimiteDeEdad=true
 */
opcionesRouter.get('/opciones/no-se-que-ver', async (req, res) => {
  try {
    const contexto = await leerContextoDeUsuario(req.usuario);
    const busqueda = await buscarConFormularioVacio(contexto, {
      lote: leerLote(req),
      sinLimiteDeEdad: sinLimiteDeEdad(req),
      soloRapido: soloRapido(req),
    });
    res.json(respuestaDeBusqueda(req, busqueda));
  } catch (err) {
    responderError(res, err, 'opciones');
  }
});

const TIPOS_VALIDOS = ['pelicula', 'miniserie', 'serie', 'cualquier-cosa'];

/**
 * Opción 3: "Quiero película / miniserie / serie / cualquier cosa".
 * Hereda la estructura de tres bloques por ser también una búsqueda con
 * formulario vacío, con Tipo preseleccionado (sección 5).
 * GET /opciones/tipo/:tipo?conSuerte=true&lote=N&sinLimiteDeEdad=true
 */
opcionesRouter.get('/opciones/tipo/:tipo', async (req, res) => {
  const { tipo } = req.params;
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: `tipo tiene que ser uno de: ${TIPOS_VALIDOS.join(', ')}` });
  }
  try {
    const contexto = await leerContextoDeUsuario(req.usuario);
    const busqueda = await buscarConFormularioVacio(contexto, {
      preferenciasBase: tipo === 'cualquier-cosa' ? {} : { tipo: [tipo] },
      lote: leerLote(req),
      sinLimiteDeEdad: sinLimiteDeEdad(req),
      soloRapido: soloRapido(req),
    });
    res.json(respuestaDeBusqueda(req, busqueda));
  } catch (err) {
    responderError(res, err, 'opciones');
  }
});
