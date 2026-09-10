import { Router } from 'express';
import { responderError } from '../utils/responder.js';
import { buscarPorEstadoAnimo } from '../opciones/estadoAnimo.js';
import { respuestaDeBusqueda, sinLimiteDeEdad } from '../utils/respuestaBusqueda.js';
import { ESTADOS_ANIMO } from '../data/estadosAnimo.js';
import { leerLote } from '../utils/lote.js';
import { conLimiteDeEdad, excluirVistos, leerContextoDeUsuario } from '../opciones/personalizacion.js';

export const estadoAnimoRouter = Router();

/**
 * Opción 4: "¿Estado de ánimo?" (sección 5).
 * GET /opciones/estado-animo/:clave?conSuerte=true&lote=N
 * :clave es una de las keys de ESTADOS_ANIMO (reirme, suspenso, llorar,
 * enamorarme, volarMiMente, pasarElTiempo, inspirador, accion, velocidad,
 * reflexionar, asustarme).
 *
 * Desde v3, con sesión abierta: se descuentan los títulos en "Visto"
 * (sección 5) y se aplica el límite de edad del perfil (sección 17), que se
 * puede apagar con `?sinLimiteDeEdad=true`.
 */
estadoAnimoRouter.get('/opciones/estado-animo/:clave', async (req, res) => {
  const { clave } = req.params;
  if (!ESTADOS_ANIMO[clave]) {
    return res.status(400).json({ error: `clave tiene que ser una de: ${Object.keys(ESTADOS_ANIMO).join(', ')}` });
  }
  try {
    const contexto = await leerContextoDeUsuario(req.usuario);
    const { resultados, hayMas } = await buscarPorEstadoAnimo(clave, {
      filtros: conLimiteDeEdad({}, contexto, { sinLimiteDeEdad: sinLimiteDeEdad(req) }),
      lote: leerLote(req),
    });
    res.json(respuestaDeBusqueda(req, { resultados: excluirVistos(resultados, contexto), hayMas }));
  } catch (err) {
    responderError(res, err, 'estadoAnimo');
  }
});
