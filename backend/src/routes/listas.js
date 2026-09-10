import { Router } from 'express';
import { responderError } from '../utils/responder.js';
import { claveDe } from '../utils/clave.js';
import { exigirSesion } from '../auth/sesion.js';
import { completarDetalle } from '../buscador/motorBusqueda.js';
import { obtenerProveedoresDisponibles } from '../services/tmdb.js';
import { leerAgregados } from '../repositories/agregados.js';
import {
  LISTAS,
  esListaValida,
  leerPertenencias,
  leerLista,
  agregarAItem,
  quitarItem,
  estaEnLista,
  leerVistosEnVerMasTarde,
  leerPlataformas,
  guardarPlataformas,
  MAXIMO_POR_LISTA,
} from '../repositories/listas.js';

export const listasRouter = Router();

/** Ver el comentario de PUT /mis-plataformas. */
const MAXIMO_PLATAFORMAS = 200;

/**
 * Todas las rutas de acá exigen sesión: una lista sin dueño no significa
 * nada. `cargarSesion` ya corrió global en index.js.
 */
listasRouter.use('/listas', exigirSesion);
listasRouter.use('/mis-plataformas', exigirSesion);

function leerClave(origen) {
  const tmdbId = Number(origen.tmdb_id ?? origen.tmdbId);
  const tipo = origen.tipo;
  if (!Number.isInteger(tmdbId)) return { error: 'tmdb_id tiene que ser numérico' };
  if (!['pelicula', 'tv'].includes(tipo)) return { error: 'tipo tiene que ser "pelicula" o "tv"' };
  return { clave: { tmdb_id: tmdbId, tipo } };
}

/**
 * GET /listas
 * Qué está en qué lista, sin detalle de los títulos. El frontend lo pide
 * una vez al abrir sesión y con eso todos los botones "+" saben su estado
 * sin una llamada por tarjeta.
 *
 * Incluye `vistosEnVerMasTarde` para la regla de la sección 18 (los de Ver
 * más tarde que ya se vieron ofrecen eliminarse), y las plataformas, que
 * son el otro conjunto que la UI necesita saber de entrada.
 */
listasRouter.get('/listas', async (req, res) => {
  try {
    const [pertenencias, vistosEnVerMasTarde, plataformas] = await Promise.all([
      leerPertenencias(req.usuario.id),
      leerVistosEnVerMasTarde(req.usuario.id),
      leerPlataformas(req.usuario.id),
    ]);
    res.json({ listas: pertenencias, vistosEnVerMasTarde, plataformas });
  } catch (err) {
    responderError(res, err, 'listas');
  }
});

/**
 * GET /listas/:lista
 * Los títulos de una lista, con el detalle completo, del más recién
 * agregado al más viejo.
 *
 * El detalle sale de `completarDetalle`, el mismo del motor de búsqueda:
 * lee el caché de la base en una sola consulta y solo le pide a TMDb lo que
 * falte. Por eso no hace falta guardar título ni póster en `items_lista`.
 */
listasRouter.get('/listas/:lista', async (req, res) => {
  const { lista } = req.params;
  if (!esListaValida(lista)) {
    return res.status(400).json({ error: `lista tiene que ser una de: ${LISTAS.join(', ')}` });
  }

  try {
    const filas = await leerLista(req.usuario.id, lista);
    if (!filas.length) return res.json({ resultados: [], total: 0 });

    const agregados = await leerAgregados();
    if (!agregados) {
      throw new Error('No hay agregados calculados todavía. Corré "npm run seed" y "npm run recalcular" primero.');
    }

    /**
     * Sin `soloRecomendables`, y es a propósito: acá no se recomienda nada,
     * se muestra lo que el usuario guardó. Si alguien puso en Favoritas algo
     * sin póster, con pocos votos o un talk show, es suyo y tiene que seguir
     * viéndolo; hacerlo desaparecer de su propia lista sería un bug.
     */
    const completos = await completarDetalle(filas, agregados);

    /**
     * completarDetalle resuelve los detalles en paralelo, así que devuelve
     * los títulos en el orden en que fueron respondiendo. Acá el orden
     * importa (es "lo último que agregaste primero"), así que se
     * restaura, igual que hace Parecido a con el orden de similitud.
     */
    const posicion = new Map(filas.map((f, i) => [claveDe(f), i]));
    completos.sort(
      (a, b) => posicion.get(claveDe(a)) - posicion.get(claveDe(b))
    );

    res.json({ resultados: completos, total: completos.length });
  } catch (err) {
    responderError(res, err, 'listas');
  }
});

/**
 * POST /listas/:lista   body: { tmdb_id, tipo }
 *
 * Devuelve `sugerirVisto: true` cuando se agregó algo a Favoritas que no
 * estaba en Visto. Es la pregunta inmediata de la sección 18; la decide el
 * usuario, así que acá solo se avisa, no se agrega nada por las dudas.
 */
listasRouter.post('/listas/:lista', async (req, res) => {
  const { lista } = req.params;
  if (!esListaValida(lista)) {
    return res.status(400).json({ error: `lista tiene que ser una de: ${LISTAS.join(', ')}` });
  }

  const { clave, error } = leerClave(req.body ?? {});
  if (error) return res.status(400).json({ error });

  try {
    const resultado = await agregarAItem(req.usuario.id, lista, clave);

    /**
     * La lista está llena (ver MAXIMO_POR_LISTA). Se contesta con un error y
     * no con `agregado: false`, que es lo que devuelve un repetido: ahí no
     * pasa nada porque el título YA está, y acá no pasa nada porque no entra,
     * que desde la pantalla son dos cosas muy distintas. Sin el error, el "+"
     * se quedaría sin marcar y nada explicaría por qué.
     */
    if (resultado === 'lleno') {
      return res.status(409).json({
        error: `Esa lista llegó al máximo de ${MAXIMO_POR_LISTA} títulos. Sacá alguno para agregar otro.`,
      });
    }

    const agregado = resultado === 'agregado';
    const sugerirVisto =
      lista === 'favoritas' && agregado && !(await estaEnLista(req.usuario.id, 'visto', clave));

    res.json({ agregado, sugerirVisto });
  } catch (err) {
    responderError(res, err, 'listas');
  }
});

/** DELETE /listas/:lista/:tipo/:tmdbId */
listasRouter.delete('/listas/:lista/:tipo/:tmdbId', async (req, res) => {
  const { lista, tipo, tmdbId } = req.params;
  if (!esListaValida(lista)) {
    return res.status(400).json({ error: `lista tiene que ser una de: ${LISTAS.join(', ')}` });
  }

  const { clave, error } = leerClave({ tmdb_id: tmdbId, tipo });
  if (error) return res.status(400).json({ error });

  try {
    const quitado = await quitarItem(req.usuario.id, lista, clave);
    res.json({ quitado });
  } catch (err) {
    responderError(res, err, 'listas');
  }
});

/** GET /mis-plataformas */
listasRouter.get('/mis-plataformas', async (req, res) => {
  try {
    res.json({ plataformas: await leerPlataformas(req.usuario.id) });
  } catch (err) {
    responderError(res, err, 'listas');
  }
});

/** PUT /mis-plataformas   body: { plataformas: [id, ...] } */
listasRouter.put('/mis-plataformas', async (req, res) => {
  const crudas = req.body?.plataformas;
  if (!Array.isArray(crudas)) {
    return res.status(400).json({ error: 'plataformas tiene que ser un array de IDs' });
  }

  /**
   * Tope de cantidad (2026-09-08). No lo había: con el cuerpo limitado a
   * 64 kB entran unos diez mil IDs, y cada uno es una fila insertada acá y
   * después un valor en el `with_watch_providers` que se le manda a TMDb. La
   * región tiene sesenta proveedores, así que el margen sobra de todos modos.
   */
  if (crudas.length > MAXIMO_PLATAFORMAS) {
    return res.status(400).json({ error: `Se pueden elegir hasta ${MAXIMO_PLATAFORMAS} plataformas` });
  }

  const ids = [...new Set(crudas.map(Number))].filter(Number.isInteger);
  if (ids.length !== new Set(crudas.map(Number)).size) {
    return res.status(400).json({ error: 'todos los IDs de plataforma tienen que ser numéricos' });
  }

  /**
   * Que los IDs sean proveedores QUE EXISTEN (2026-09-08). Hasta acá se
   * comprobaba que fueran números y nada más, así que `[-1, 0, 999999999]` se
   * guardaba con un 200. Es el mismo chequeo que `PUT /gustos` ya le hace a
   * los géneros contra GENEROS_TMDB, que acá faltaba porque la lista de
   * proveedores no es una constante nuestra: sale de TMDb.
   *
   * FALLA ABIERTA, igual que la consulta a Have I Been Pwned y por el mismo
   * motivo: si TMDb no contesta y el caché está frío, se guarda lo que vino
   * en vez de dejar a alguien sin poder elegir sus plataformas. Un ID
   * inventado es inerte (TMDb lo ignora en `with_watch_providers`), así que
   * el costo de dejar pasar es mucho menor que el de bloquear.
   *
   * En la práctica no cuesta una llamada: `obtenerProveedoresDisponibles`
   * está memoizada en proceso con TTL.
   */
  try {
    const disponibles = new Set((await obtenerProveedoresDisponibles()).map((p) => p.id));
    const desconocidos = ids.filter((id) => !disponibles.has(id));
    if (desconocidos.length) {
      return res.status(400).json({
        error: `Estas plataformas no existen: ${desconocidos.slice(0, 5).join(', ')}`,
      });
    }
  } catch (err) {
    console.warn(`[listas] No se pudo validar las plataformas contra TMDb (${err.message}), se guardan igual.`);
  }

  try {
    await guardarPlataformas(req.usuario.id, ids);
    res.json({ plataformas: ids });
  } catch (err) {
    responderError(res, err, 'listas');
  }
});
