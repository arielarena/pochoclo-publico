import { Router } from 'express';
import { responderError } from '../utils/responder.js';
import { obtenerFicha } from '../services/tmdb.js';
import { upsertTituloConClasificacion } from '../repositories/titulos.js';
import { leerAgregados } from '../repositories/agregados.js';
import { leerPorImdb } from '../repositories/seriesTvmaze.js';
import { esClasico, complejidad } from '../logic/clasificacion.js';
import { limiteEdad } from '../logic/edad.js';
import { puntuacion } from '../logic/formulas.js';
import { tipoContenido } from '../logic/tipoContenido.js';
import { buscarParecidoA } from '../opciones/parecidoA.js';

export const fichaRouter = Router();

/** Cuántos similares muestra la Ficha (sección 10: "una lista, no un botón"). */
const SIMILARES_EN_FICHA = 10;

/**
 * Cuántos de esos diez pueden ser del otro tipo (ver cruceDeTipo.js).
 *
 * **Acá el tope hace falta y en "Parecido a" no**, y la diferencia es el
 * espacio: allá la lista tiene 26 lugares y seis cruzados son un condimento;
 * acá hay diez, y sin tope la ficha de Interstellar mostraba **seis series de
 * cuatro franquicias distintas**, desplazando a Solaris y Primer, que son
 * respuestas mejores. Con tres, la sorpresa sigue estando y la lista sigue
 * siendo lo que promete.
 */
const CRUZADOS_EN_FICHA = 3;

/**
 * Los primeros diez, con a lo sumo tres del otro tipo. **Respeta el orden**: no
 * reordena nada, solo saltea los cruzados que sobran y deja que los del mismo
 * tipo ocupen su lugar.
 */
function recortarSimilares(similares) {
  const salida = [];
  let cruzados = 0;
  for (const s of similares) {
    if (salida.length >= SIMILARES_EN_FICHA) break;
    if (s.cruzado) {
      if (cruzados >= CRUZADOS_EN_FICHA) continue;
      cruzados += 1;
    }
    salida.push(s);
  }
  return salida;
}

function validarParametros(req, res) {
  const { tipo, id } = req.params;
  if (!['pelicula', 'tv'].includes(tipo)) {
    res.status(400).json({ error: 'tipo tiene que ser "pelicula" o "tv"' });
    return null;
  }
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId)) {
    res.status(400).json({ error: 'id tiene que ser numérico' });
    return null;
  }
  return { tipo, tmdbId };
}

/**
 * Ficha de Título (sección 10). Todavía sin "Plataformas disponibles"
 * (necesita región + IDs de proveedor — se resuelve junto con "Disponible
 * en" más adelante).
 *
 * **NO incluye `similares`** (ver `/titulo/:tipo/:id/similares` más abajo):
 * son dos endpoints y no uno desde el 2026-09-01, para que el frontend
 * pueda mostrar el título apenas llega y no tener que esperar también a
 * "Parecido a esto", que es la parte cara de la pantalla (ver
 * `buscarParecidoA`, con su propio cruce película/serie).
 *
 * GET /titulo/:tipo/:id  — :tipo es "pelicula" | "tv", :id es el tmdb_id.
 */
fichaRouter.get('/titulo/:tipo/:id', async (req, res) => {
  const parametros = validarParametros(req, res);
  if (!parametros) return;
  const { tipo, tmdbId } = parametros;

  try {
    /**
     * `leerAgregados` (Neon) y `obtenerFicha` (TMDb) no dependen entre sí:
     * antes iban en fila y ahora corren juntos.
     */
    const [agregados, ficha] = await Promise.all([leerAgregados(), obtenerFicha(tmdbId, tipo)]);
    if (!agregados) {
      throw new Error('No hay agregados calculados todavía. Corré "npm run seed" y "npm run recalcular" primero.');
    }

    const clasico = esClasico(ficha, agregados.votos_totales_max_clasicos);
    const comp = complejidad(ficha);

    /**
     * Ver una ficha también cuenta como "tocar" el título (crecimiento
     * orgánico). Una sola escritura (antes eran dos: upsert + clasificación),
     * en paralelo con la duración de TVMaze, que tampoco depende de ella.
     */
    const [, porImdb] = await Promise.all([
      upsertTituloConClasificacion(ficha, { esClasico: clasico, complejidad: comp }),
      /**
       * Duración total de la serie, del espejo de TVMaze: TMDb no la tiene
       * (ver datosDeTvmaze en motorBusqueda.js). Es una consulta a nuestra
       * base, no una llamada a la API de TVMaze.
       */
      ficha.tipo === 'tv' ? leerPorImdb([ficha.imdb_id]) : Promise.resolve(new Map()),
    ]);
    const tvmaze = porImdb.get(ficha.imdb_id);
    const duracionEpisodio = tvmaze?.duracion_episodio ?? null;

    res.json({
      ...ficha,
      tipoContenido: tipoContenido(ficha),
      es_clasico: clasico,
      complejidad: comp,
      edad: limiteEdad(ficha.certificaciones),
      puntuacion: puntuacion({ votos: ficha.vote_count, promedio: Number(ficha.vote_average ?? 0), c: Number(agregados.c) }),
      duracionEpisodio,
      duracionTotal: duracionEpisodio && ficha.episodios ? duracionEpisodio * ficha.episodios : null,
    });
  } catch (err) {
    /**
     * TMDb no tiene ese id (o no con ese tipo). Es un 404 y no un error
     * nuestro: la pantalla de Ficha lo usa para mostrar el 404 de la app en
     * vez de un cartel rojo. El detalle no hace falta en el log, es un caso
     * esperable, así que va como aviso y no como error.
     */
    if (err.estado === 404) {
      console.warn(`[ficha] TMDb no tiene ${tipo}/${tmdbId}`);
      return res.status(404).json({ error: 'No encontramos ese título.' });
    }
    responderError(res, err, 'ficha');
  }
});

/**
 * Similares de la Ficha (sección 10), aparte del resto de la ficha desde el
 * 2026-09-01: misma lógica de "Parecido a" (con cruce de tipo, ver
 * `cruceDeTipo.js`), con el propio título como única referencia. El
 * frontend la pide EN PARALELO con `/titulo/:tipo/:id` y no después: las dos
 * rutas son independientes acá, así que encadenarlas del lado del cliente
 * solo agregaría espera. Un fallo acá no puede tumbar la ficha — se traga el
 * error y devuelve una lista vacía, igual que antes cuando vivía en la misma
 * respuesta.
 *
 * GET /titulo/:tipo/:id/similares
 */
fichaRouter.get('/titulo/:tipo/:id/similares', async (req, res) => {
  const parametros = validarParametros(req, res);
  if (!parametros) return;
  const { tipo, tmdbId } = parametros;

  const { resultados: similares } = await buscarParecidoA([{ tmdb_id: tmdbId, tipo }]).catch((err) => {
    console.warn('No se pudieron traer similares:', err.message);
    return { resultados: [] };
  });

  res.json({ similares: recortarSimilares(similares) });
});
