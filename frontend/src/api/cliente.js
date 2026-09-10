import { memorizarCorto } from '../utils/cacheCorta.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Caché corta para pedidos que se "precalientan" antes de que el usuario los
 * pida de verdad (ver Inicio.jsx). 30 s alcanza para el hueco entre que se
 * arma la pantalla y el usuario elige una opción; no es una caché de
 * resultados de búsqueda "en general", así que un uso normal (elegir algo a
 * los pocos segundos de entrar) siempre la aprovecha y nada se sirve viejo
 * por más de medio minuto. **Solo se usa en pedidos de lectura, opt-in por
 * llamador** (el parámetro `cacheable` de `pedir`/`pedirJson`): la mayoría de
 * los pedidos de esta app son acciones (agregar a una lista, aceptar
 * términos, guardar plataformas) y cachearlos por error sería un bug de
 * verdad, no una optimización.
 */
const CACHE_PEDIDOS_MS = 30_000;
const cachePedidos = memorizarCorto(CACHE_PEDIDOS_MS);

/**
 * Mensaje de respaldo por código, para cuando la respuesta no trae uno.
 *
 * El backend casi siempre manda su propio `error` en castellano y ese gana.
 * Esto cubre lo que contesta la infraestructura y no nuestro Express (un 502
 * del hosting, un 404 de una dirección mal armada), que antes llegaba a la
 * pantalla como "Error 502 pidiendo /buscar": un texto que nombra rutas
 * internas, no dice qué hacer, y encima está a medio traducir.
 */
const MENSAJES_POR_ESTADO = {
  400: 'Ese pedido no se entendió. Probá cambiando lo que elegiste.',
  401: 'Necesitás iniciar sesión para eso.',
  404: 'No encontramos lo que buscabas.',
  429: 'Estás haciendo demasiados pedidos seguidos. Esperá un momento y probá de nuevo.',
};

const MENSAJE_GENERICO = 'Algo falló de nuestro lado. Probá de nuevo en un momento.';
const MENSAJE_SIN_RED = 'No pudimos conectarnos con el servidor. Revisá tu conexión e intentá de nuevo.';

/**
 * Todos los errores que salen de acá llevan `estado` con el código HTTP, para
 * que la pantalla pueda distinguir "esto no existe" (404) de "esto se rompió"
 * (5xx) y mostrar una cosa u otra. `estado: 0` es el pedido que nunca llegó a
 * destino.
 */
function errorDePedido(mensaje, estado) {
  return Object.assign(new Error(mensaje), { estado });
}

/**
 * `credentials: 'include'` va en todas las llamadas porque el backend está
 * en otro origen que el frontend: sin esto el navegador no manda la cookie
 * de sesión y el backend ve a todo el mundo como anónimo (v3, milestone 18).
 */
async function pedirSinCache(path, opciones) {
  let res;
  try {
    res = await fetch(BASE_URL + path, { credentials: 'include', ...opciones });
  } catch (err) {
    /**
     * fetch solo rechaza si el pedido no llegó a destino: sin internet,
     * servidor caído, CORS mal configurado. Su mensaje nativo ("Failed to
     * fetch") está en inglés y no le dice nada a nadie, así que se reemplaza;
     * el original queda en la consola, que es donde se lo mira.
     */
    console.error('[api]', path, err);
    throw errorDePedido(MENSAJE_SIN_RED, 0);
  }

  const datos = await res.json().catch(() => null);
  if (!res.ok) {
    console.warn(`[api] ${res.status} en ${path}`);
    throw errorDePedido(datos?.error || MENSAJES_POR_ESTADO[res.status] || MENSAJE_GENERICO, res.status);
  }
  return datos;
}

/**
 * `cacheable` es opt-in y a propósito: solo lecturas idempotentes (una
 * búsqueda) tienen que pasar por acá. Nunca marcar así un pedido que cambia
 * algo (listas, gustos, plataformas, términos) — dos veces la misma escritura
 * no es lo mismo que una, y esta caché las trataría como si lo fuera.
 */
function pedir(path, opciones = {}, { cacheable = false } = {}) {
  if (!cacheable) return pedirSinCache(path, opciones);
  const clave = `${opciones.method ?? 'GET'} ${path} ${opciones.body ?? ''}`;
  return cachePedidos(clave, () => pedirSinCache(path, opciones));
}

/** Un pedido con cuerpo JSON. El método es POST salvo que se pida otro. */
function pedirJson(path, body, method = 'POST', opciones = {}) {
  return pedir(
    path,
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    opciones
  );
}

/**
 * `lote` es la tanda de páginas de discover que se pide (1 son las
 * primeras). Se manda solo cuando es mayor a 1, para que las URLs de una
 * búsqueda normal queden iguales que siempre. Las respuestas de lista
 * traen `hayMas`, que dice si el lote siguiente puede aportar algo nuevo.
 */
function armarQuery({ conSuerte = false, lote = 1, sinLimiteDeEdad = false, soloRapido = false } = {}) {
  const params = new URLSearchParams();
  if (conSuerte) params.set('conSuerte', 'true');
  if (lote > 1) params.set('lote', String(lote));
  /**
   * Apaga el límite de edad del perfil (sección 17). Solo tiene efecto con
   * sesión abierta; para un visitante sin cuenta no hay límite que apagar.
   */
  if (sinLimiteDeEdad) params.set('sinLimiteDeEdad', 'true');
  /**
   * Adelanto sin bloques personalizados (solo Populares) — lo usa
   * PaginaResultados.jsx para pintar algo mientras el pedido completo sigue
   * en camino. Ignorado por las rutas que no tienen bloques.
   */
  if (soloRapido) params.set('soloRapido', 'true');
  const texto = params.toString();
  return texto ? `?${texto}` : '';
}

/**
 * Opción 1. Con conSuerte: true devuelve { resultado } en vez de
 * { resultados, total, hayMas }.
 *
 * **`cacheable` es `!conSuerte` y no `true` a secas.** Estas cuatro rutas se
 * "precalientan" desde otra pantalla antes de que el usuario las pida de
 * verdad (ver Inicio.jsx, PaginaTipo.jsx, PaginaEstadoAnimo.jsx,
 * PaginaQuienEstaViendo.jsx), y sin la caché el precalentado no ahorraría
 * nada: serían dos llamadas de red separadas que no se enteran una de la
 * otra. Pero "Me siento con suerte" (`conSuerte: true`) tiene que sortear un
 * título DISTINTO en cada click — cachearlo devolvería el mismo título ante
 * un segundo click dentro de los 30 s, que es un bug de verdad y no una
 * optimización.
 */
export function obtenerNoSeQueVer(opciones = {}) {
  return pedir(`/opciones/no-se-que-ver${armarQuery(opciones)}`, {}, { cacheable: !opciones.conSuerte });
}

/** Opción 3. tipo: 'pelicula' | 'miniserie' | 'serie' | 'cualquier-cosa'. */
export function obtenerPorTipo(tipo, opciones = {}) {
  return pedir(`/opciones/tipo/${tipo}${armarQuery(opciones)}`, {}, { cacheable: !opciones.conSuerte });
}

/** Opción 4. clave: una de las keys de ESTADOS_ANIMO del backend. */
export function obtenerPorEstadoAnimo(clave, opciones = {}) {
  return pedir(`/opciones/estado-animo/${clave}${armarQuery(opciones)}`, {}, { cacheable: !opciones.conSuerte });
}

export function obtenerFicha(tipo, id) {
  return pedir(`/titulo/${tipo}/${id}`);
}

/**
 * Los similares de la Ficha, aparte del resto de sus datos (2026-09-01):
 * es la parte cara de la pantalla (misma lógica de "Parecido a", con cruce
 * de tipo), así que se pide después, para no demorar lo que ya se puede
 * mostrar. Ver `Ficha.jsx`.
 */
export function obtenerSimilaresFicha(tipo, id) {
  return pedir(`/titulo/${tipo}/${id}/similares`);
}

/**
 * Los géneros para el selector. `tipos` es el array del campo Tipo
 * (`['pelicula']`, `['miniserie', 'serie']`, ...); vacío o sin pasar trae la
 * unión de las dos taxonomías de TMDb.
 *
 * Acotarlo importa porque TMDb tiene dos listas de género que comparten solo 8
 * IDs: sin esto, elegir "Miniserie" y "Thriller" armaba una búsqueda que
 * devolvía cero, porque Thriller no existe para series.
 *
 * Para series la lista NO es la de TMDb: incluye los cinco géneros que el
 * motor recrea con keywords (ver GENEROS_SERIE_BUSCABLES en el backend). El
 * único que se cae al elegir Miniserie o Serie es Película de TV.
 */
export function obtenerGeneros(tipos) {
  const query = (tipos ?? []).map((t) => `tipo=${encodeURIComponent(t)}`).join('&');
  return pedir(`/generos${query ? `?${query}` : ''}`);
}

export function obtenerPaises() {
  return pedir('/paises');
}

export function obtenerIdiomas() {
  return pedir('/idiomas');
}

export function obtenerProveedores() {
  return pedir('/proveedores');
}

export function buscarPersona(q) {
  return pedir(`/buscar-persona?q=${encodeURIComponent(q)}`);
}

/** Mismo motivo que `obtenerNoSeQueVer` para el `!opciones.conSuerte`. */
export function buscar(body, opciones = {}) {
  return pedirJson(`/buscar${armarQuery(opciones)}`, body, 'POST', { cacheable: !opciones.conSuerte });
}

export function buscarTitulo(q) {
  return pedir(`/buscar-titulo?q=${encodeURIComponent(q)}`);
}

/**
 * Acá el `lote` no es una tanda de páginas de discover sino de páginas de
 * recomendaciones, y **hay uno solo**: el lote 2 trae las páginas que el
 * primero no llegó a mirar, y con eso se agotan las que permite el tope. Por
 * eso la respuesta del lote 2 vuelve con `hayMas` en false y el botón
 * desaparece.
 */
export function parecidoA(
  referencias,
  {
    preferencias,
    prioridades,
    filtros,
    ordenar,
    conSuerte = false,
    lote = 1,
    sinLimiteDeEdad = false,
  } = {}
) {
  return pedirJson(`/parecido-a${armarQuery({ conSuerte, lote, sinLimiteDeEdad })}`, {
    referencias,
    preferencias,
    prioridades,
    filtros,
    ordenar,
  });
}

/**
 * --- Listas (v3, sección 18 del Definitivo) ---
 * Todas exigen sesión: sin cookie, el backend contesta 401.
 */

/**
 * Qué está en qué lista, sin detalle de los títulos, más las plataformas
 * guardadas y los títulos de "Ver más tarde" que además están en "Visto".
 * Se pide una sola vez al abrir sesión (ver ContextoListas).
 */
export function obtenerListas() {
  return pedir('/listas');
}

/** Los títulos de una lista con el detalle completo, del último al primero. */
export function obtenerLista(lista) {
  return pedir(`/listas/${lista}`);
}

/**
 * Devuelve `{ agregado, sugerirVisto }`. `sugerirVisto` es true cuando se
 * agregó algo a Favoritas que no estaba en Visto: es la pregunta inmediata
 * de la sección 18, que decide el usuario.
 */
export function agregarALista(lista, { tmdb_id, tipo }) {
  return pedirJson(`/listas/${lista}`, { tmdb_id, tipo });
}

export function quitarDeLista(lista, { tmdb_id, tipo }) {
  return pedir(`/listas/${lista}/${tipo}/${tmdb_id}`, { method: 'DELETE' });
}

export function guardarMisPlataformas(plataformas) {
  return pedirJson('/mis-plataformas', { plataformas }, 'PUT');
}

// --- Gustos Registrados (v3, sección 19 del Definitivo) ---

export function obtenerGustos() {
  return pedir('/gustos');
}

export function guardarGustos({ generos, tipos, anios, clasicos }) {
  return pedirJson('/gustos', { generos, tipos, anios, clasicos }, 'PUT');
}

// --- Re-aceptación de los Términos (punto 9 de /terminos) ---

/**
 * `{ vigentesDesde, pendiente }`. Se puede llamar sin sesión: ahí `pendiente`
 * siempre viene en false, porque sin cuenta los Términos se aceptan por uso.
 *
 * La comparación la hace el servidor. Acá no hay ninguna fecha escrita: si la
 * hubiera, habría dos copias de la vigencia y se contradirían en silencio.
 */
export function estadoTerminos() {
  return pedir('/terminos/estado');
}

/** Sin cuerpo: la fecha la pone el reloj del servidor, no el navegador. */
export function aceptarTerminos() {
  return pedir('/terminos/aceptar', { method: 'POST' });
}
