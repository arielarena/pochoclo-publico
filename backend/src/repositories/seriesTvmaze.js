import { pool } from '../config/db.js';

/**
 * Guarda un lote de shows del índice de TVMaze. Va en una sola sentencia
 * con unnest en vez de una por fila: son ~90.000 filas y hacerlo de a una
 * convertiría una importación de 3 minutos en uno de esos scripts que hay
 * que dejar corriendo y volver más tarde.
 *
 * Es un upsert por tvmaze_id, así que volver a correr el seed es la forma
 * de refrescar los datos.
 */
export async function guardarShows(shows) {
  if (!shows.length) return;

  await pool.query(
    `INSERT INTO series_tvmaze
       (tvmaze_id, imdb_id, nombre, estado, duracion_episodio, tipo, anio_inicio, anio_fin)
     SELECT * FROM unnest(
       $1::int[], $2::text[], $3::text[], $4::text[], $5::int[], $6::text[], $7::int[], $8::int[]
     )
     ON CONFLICT (tvmaze_id) DO UPDATE SET
       imdb_id = EXCLUDED.imdb_id,
       nombre = EXCLUDED.nombre,
       estado = EXCLUDED.estado,
       duracion_episodio = EXCLUDED.duracion_episodio,
       tipo = EXCLUDED.tipo,
       anio_inicio = EXCLUDED.anio_inicio,
       anio_fin = EXCLUDED.anio_fin,
       actualizado_en = now();`,
    [
      shows.map((s) => s.tvmaze_id),
      shows.map((s) => s.imdb_id),
      shows.map((s) => s.nombre),
      shows.map((s) => s.estado),
      shows.map((s) => s.duracion_episodio),
      shows.map((s) => s.tipo),
      shows.map((s) => s.anio_inicio),
      shows.map((s) => s.anio_fin),
    ]
  );
}

/**
 * Datos de TVMaze para un lote de títulos, cruzados por IMDb ID. Una sola
 * consulta para todo el lote, igual que leerDetallesFrescos(): hacer una
 * por candidato sería cambiar llamadas a una API por idas y vueltas a la
 * base, que es el problema que este espejo justamente evita.
 *
 * Devuelve un Map de imdb_id al registro. Un título que no esté en el mapa
 * simplemente no tiene equivalente en TVMaze, y eso ya es la respuesta: no
 * hace falta marcarlo ni volver a consultarlo.
 */
export async function leerPorImdb(imdbIds) {
  const unicos = [...new Set(imdbIds.filter(Boolean))];
  if (!unicos.length) return new Map();

  const { rows } = await pool.query(
    `SELECT imdb_id, tvmaze_id, nombre, estado, duracion_episodio, tipo, anio_inicio, anio_fin
     FROM series_tvmaze
     WHERE imdb_id = ANY($1::text[])`,
    [unicos]
  );

  return new Map(rows.map((r) => [r.imdb_id, r]));
}

export async function contarShows() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total, COUNT(duracion_episodio)::int AS con_duracion FROM series_tvmaze`
  );
  return rows[0];
}
