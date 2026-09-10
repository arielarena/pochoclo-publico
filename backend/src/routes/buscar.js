import { Router } from 'express';
import { responderError } from '../utils/responder.js';
import { buscar } from '../buscador/motorBusqueda.js';
import { respuestaDeBusqueda, sinLimiteDeEdad } from '../utils/respuestaBusqueda.js';
import { leerLote } from '../utils/lote.js';
import { conLimiteDeEdad, excluirVistos, leerContextoDeUsuario } from '../opciones/personalizacion.js';
import { buscarConDivisiones } from '../opciones/prioridades.js';

export const buscarRouter = Router();

/**
 * POST /buscar?conSuerte=true&lote=N&sinLimiteDeEdad=true
 * Body: { preferencias: {...}, filtros: {...}, ordenar: {...}, prioridades: [...] }
 * Ver src/buscador/motorBusqueda.js para la forma exacta de cada uno.
 * `?conSuerte=true` devuelve un único título al azar entre los 20 mejores
 * (según Puntuación) en vez de la lista completa, mismo mecanismo que
 * /opciones/* y /parecido-a (sección 5 del Definitivo: "Me siento con
 * suerte" también está disponible en la Opción 2).
 *
 * Desde v3, con sesión abierta: se descuentan los títulos que estén en
 * "Visto" (sección 5) y se aplica el límite de edad del perfil (sección
 * 17), que se puede apagar con `?sinLimiteDeEdad=true`.
 *
 * `prioridades` (sección 6) es el orden en que el usuario marcó "Priorizar"
 * en cada categoría. Con dos o más, la respuesta suma `bloques` y cada
 * resultado viaja marcado con el suyo: son las divisiones por prioridad en
 * conflicto (ver opciones/prioridades.js). Con menos de dos no hay nada que
 * dividir y la ruta responde como siempre.
 */
buscarRouter.post('/buscar', async (req, res) => {
  try {
    const contexto = await leerContextoDeUsuario(req.usuario);
    const cuerpo = req.body ?? {};
    const filtrosConEdad = conLimiteDeEdad(cuerpo.filtros, contexto, {
      sinLimiteDeEdad: sinLimiteDeEdad(req),
    });

    const divisiones = await buscarConDivisiones({
      preferencias: cuerpo.preferencias,
      filtros: filtrosConEdad,
      ordenar: cuerpo.ordenar,
      prioridades: cuerpo.prioridades,
      lote: leerLote(req),
      depurar: (resultados) => excluirVistos(resultados, contexto),
    });

    if (divisiones) {
      return res.json(respuestaDeBusqueda(req, divisiones));
    }

    const { resultados, hayMas } = await buscar({
      ...cuerpo,
      filtros: filtrosConEdad,
      lote: leerLote(req),
    });

    res.json(respuestaDeBusqueda(req, { resultados: excluirVistos(resultados, contexto), hayMas }));
  } catch (err) {
    responderError(res, err, 'buscar');
  }
});
