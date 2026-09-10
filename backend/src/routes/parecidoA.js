import { Router } from 'express';
import { responderError } from '../utils/responder.js';
import { buscarParecidoA } from '../opciones/parecidoA.js';
import { respuestaDeBusqueda, sinLimiteDeEdad } from '../utils/respuestaBusqueda.js';
import { leerLote } from '../utils/lote.js';
import { conLimiteDeEdad, excluirVistos, leerContextoDeUsuario } from '../opciones/personalizacion.js';
import { buscarConDivisiones } from '../opciones/prioridades.js';

export const parecidoARouter = Router();

/**
 * Parecido a (sección 16). Body: { referencias: [{ tmdb_id, tipo }, ...],
 * preferencias?, filtros?, ordenar?, prioridades? }. `?conSuerte=true`
 * devuelve un único título al azar entre los 20 mejores en vez de la lista
 * completa.
 *
 * `?lote=2` trae el resto de las páginas de recomendaciones que el primer
 * pedido no llegó a mirar (ver buscarParecidoA). Es un solo lote extra: con
 * el segundo ya se pidieron todas las páginas que permite el tope, así que
 * ahí `hayMas` vuelve en false.
 *
 * `preferencias` es el resto del formulario de la Opción 2, que se aplica
 * sobre los similares (ver opciones/parecidoA.js). Sin ese campo, la ruta
 * se comporta igual que antes.
 *
 * `prioridades` (sección 6) divide los resultados cuando dos o más
 * categorías priorizadas entran en conflicto. Acá "Parecido a" es una
 * categoría más: priorizarla junto con otra permite que una división se
 * quede con los similares y la otra se salga de ellos.
 * POST /parecido-a
 */
parecidoARouter.post('/parecido-a', async (req, res) => {
  const { referencias, preferencias, filtros, ordenar, prioridades } = req.body ?? {};
  if (!Array.isArray(referencias) || referencias.length === 0) {
    return res.status(400).json({ error: 'referencias tiene que ser un array con al menos { tmdb_id, tipo }' });
  }
  try {
    const contexto = await leerContextoDeUsuario(req.usuario);
    const filtrosConEdad = conLimiteDeEdad(filtros, contexto, {
      sinLimiteDeEdad: sinLimiteDeEdad(req),
    });

    const divisiones = await buscarConDivisiones({
      referencias,
      preferencias,
      filtros: filtrosConEdad,
      ordenar,
      prioridades,
      depurar: (lista) => excluirVistos(lista, contexto),
    });

    /**
     * Las divisiones por prioridad no paginan: cada una es una búsqueda
     * aparte y "traer más" sobre un conjunto ya dividido no tiene un
     * significado claro.
     */
    if (divisiones) {
      return res.json(respuestaDeBusqueda(req, { ...divisiones, hayMas: undefined }));
    }

    const { resultados, hayMas, parecidosEncontrados } = await buscarParecidoA(referencias, {
      preferencias,
      filtros: filtrosConEdad,
      ordenar,
      lote: leerLote(req),
    });
    res.json(
      respuestaDeBusqueda(req, {
        resultados: excluirVistos(resultados, contexto),
        hayMas,
        parecidosEncontrados,
      })
    );
  } catch (err) {
    responderError(res, err, 'parecidoA');
  }
});
