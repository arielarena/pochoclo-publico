import { pool } from '../config/db.js';

/** Las tres listas de la sección 18. El orden es el que se muestra en la UI. */
export const LISTAS = ['favoritas', 'visto', 'ver_mas_tarde'];

export function esListaValida(lista) {
  return LISTAS.includes(lista);
}

/**
 * Todas las pertenencias del usuario, sin detalle de los títulos: solo
 * qué está en qué lista.
 *
 * Es una sola consulta para las tres listas, y el frontend la pide una vez
 * al abrir sesión. Con eso cada botón "+" sabe al instante en qué listas
 * está su título, sin una llamada por tarjeta. Son pocos bytes por ítem,
 * así que incluso una lista de cientos de títulos entra sin problema.
 */
export async function leerPertenencias(usuarioId) {
  const { rows } = await pool.query(
    `SELECT lista, tmdb_id, tipo FROM items_lista WHERE usuario_id = $1`,
    [usuarioId]
  );

  const porLista = Object.fromEntries(LISTAS.map((l) => [l, []]));
  for (const fila of rows) {
    porLista[fila.lista].push({ tmdb_id: fila.tmdb_id, tipo: fila.tipo });
  }
  return porLista;
}

/**
 * Los ítems de una lista, del más recientemente agregado al más viejo (o,
 * con `aleatorio`, en un orden al azar).
 * Devuelve solo las claves; el detalle lo resuelve la ruta con
 * completarDetalle(), que ya sabe usar el caché.
 *
 * `limite` existe para la fórmula de gustos resultantes de la sección 16,
 * que usa las últimas 15 de Favoritas y las últimas 10 de Visto.
 *
 * `aleatorio` es la excepción a "las últimas": la usa el bloque "Porque te
 * gustaron" (ver `gustosResultantes` en `opciones/formularioVacio.js`) para
 * que alguien con más de 15 favoritas no vea siempre las recomendaciones
 * ancladas a las mismas 15 más recientes. `ORDER BY RANDOM()` ordena sobre
 * las filas YA filtradas por usuario y lista (unas pocas decenas como mucho,
 * nunca el catálogo), así que el costo es el de ordenar esa lista chica, no
 * el de un escaneo grande.
 */
export async function leerLista(usuarioId, lista, { limite = null, aleatorio = false } = {}) {
  const orden = aleatorio ? 'RANDOM()' : 'agregado_en DESC';
  const { rows } = await pool.query(
    `SELECT tmdb_id, tipo, agregado_en FROM items_lista
     WHERE usuario_id = $1 AND lista = $2
     ORDER BY ${orden}
     ${limite ? 'LIMIT $3' : ''}`,
    limite ? [usuarioId, lista, limite] : [usuarioId, lista]
  );
  return rows;
}

/**
 * Agrega un título a una lista. Es idempotente: agregar dos veces lo mismo
 * no duplica ni falla, y tampoco reordena (el DO NOTHING deja el
 * agregado_en original, así que volver a tocar "+" sobre algo que ya estaba
 * no lo sube al principio de la lista).
 *
 * Devuelve true si se agregó de verdad, false si ya estaba.
 */
/**
 * Cuántos títulos entran en una lista (2026-09-08).
 *
 * NO LO HABÍA, y lo que lo vuelve algo más que un número de cordura es que
 * `GET /listas/:lista` llama a `completarDetalle` sobre TODAS las filas, sin
 * `limite`: una lista de N títulos es un pedido de detalle por cada uno de los
 * que no estén en el caché de Neon. O sea que la lista no solo ocupa filas,
 * también define cuánto trabajo dispara cada vez que se abre.
 *
 * Y NO SE VALIDA QUE EL `tmdb_id` EXISTA, a propósito: eso costaría una
 * llamada a TMDb por cada "+" que alguien toca, y las listas son justamente
 * el lugar donde el proyecto decidió no filtrar nada de lo que el usuario
 * guardó (ver el comentario de `soloRecomendables` en la ruta). El tope es la
 * palanca correcta para acotar el daño; la validación de existencia no lo es.
 *
 * 1000 por lista está muy por encima de cualquier uso real —una persona que
 * marcó mil películas como vistas ya es un caso extremo— y deja el peor caso
 * en un orden manejable.
 */
export const MAXIMO_POR_LISTA = 1000;

/**
 * Devuelve `'agregado'`, `'repetido'` o `'lleno'`.
 *
 * LOS TRES CASOS SE RESUELVEN EN UNA SOLA CONSULTA, y el motivo es que
 * contar antes e insertar después es una carrera: dos pedidos simultáneos
 * cuentan 999 los dos y terminan insertando 1001. Con el `WHERE` adentro del
 * propio INSERT, el conteo y la inserción son la misma operación.
 *
 * Por eso tampoco alcanza con devolver un booleano: `rowCount === 0` puede
 * significar "ya estaba" o "no entra más", y son dos respuestas distintas
 * para el usuario (una es un no-op silencioso, la otra tiene que explicarse).
 */
export async function agregarAItem(usuarioId, lista, { tmdb_id, tipo }) {
  const { rowCount } = await pool.query(
    `INSERT INTO items_lista (usuario_id, lista, tmdb_id, tipo)
     SELECT $1, $2, $3, $4
      WHERE (SELECT count(*) FROM items_lista WHERE usuario_id = $1 AND lista = $2) < $5
     ON CONFLICT (usuario_id, lista, tmdb_id, tipo) DO NOTHING`,
    [usuarioId, lista, tmdb_id, tipo, MAXIMO_POR_LISTA]
  );
  if (rowCount > 0) return 'agregado';

  /**
   * No se insertó nada. Falta saber por cuál de los dos motivos, y recién acá
   * conviene preguntarlo: es una consulta de más solo en el camino que ya
   * falló, no en el normal.
   */
  return (await estaEnLista(usuarioId, lista, { tmdb_id, tipo })) ? 'repetido' : 'lleno';
}

export async function quitarItem(usuarioId, lista, { tmdb_id, tipo }) {
  const { rowCount } = await pool.query(
    `DELETE FROM items_lista
     WHERE usuario_id = $1 AND lista = $2 AND tmdb_id = $3 AND tipo = $4`,
    [usuarioId, lista, tmdb_id, tipo]
  );
  return rowCount > 0;
}

export async function estaEnLista(usuarioId, lista, { tmdb_id, tipo }) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM items_lista
     WHERE usuario_id = $1 AND lista = $2 AND tmdb_id = $3 AND tipo = $4`,
    [usuarioId, lista, tmdb_id, tipo]
  );
  return rowCount > 0;
}

/**
 * Los títulos de "Ver más tarde" que además están en "Visto".
 *
 * Es la consulta que necesita la regla de la sección 18: al entrar a "Ver
 * más tarde", los que ya se vieron ofrecen eliminarse de ahí. La sección es
 * explícita en que no es una eliminación forzada, así que esto solo informa
 * cuáles son; borrarlos lo decide el usuario.
 */
export async function leerVistosEnVerMasTarde(usuarioId) {
  const { rows } = await pool.query(
    `SELECT v.tmdb_id, v.tipo FROM items_lista v
     WHERE v.usuario_id = $1 AND v.lista = 'ver_mas_tarde'
       AND EXISTS (
         SELECT 1 FROM items_lista w
         WHERE w.usuario_id = v.usuario_id AND w.lista = 'visto'
           AND w.tmdb_id = v.tmdb_id AND w.tipo = v.tipo
       )`,
    [usuarioId]
  );
  return rows;
}

// --- Mis plataformas (sección 18, último párrafo) ---

export async function leerPlataformas(usuarioId) {
  const { rows } = await pool.query(
    `SELECT proveedor_id FROM plataformas_usuario WHERE usuario_id = $1 ORDER BY agregado_en`,
    [usuarioId]
  );
  return rows.map((f) => f.proveedor_id);
}

export async function guardarPlataformas(usuarioId, proveedorIds) {
  /**
   * Se reemplaza el conjunto entero en vez de agregar/quitar de a uno: el
   * selector de la UI trabaja sobre la lista completa, así que mandarla
   * entera evita tener que calcular el diff en dos lados.
   */
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query('DELETE FROM plataformas_usuario WHERE usuario_id = $1', [usuarioId]);
    if (proveedorIds.length) {
      await cliente.query(
        `INSERT INTO plataformas_usuario (usuario_id, proveedor_id)
         SELECT $1, * FROM unnest($2::int[])`,
        [usuarioId, proveedorIds]
      );
    }
    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}
