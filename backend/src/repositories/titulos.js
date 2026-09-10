import { pool } from '../config/db.js';
import { claveDe } from '../utils/clave.js';

/**
 * Inserta o actualiza un título. La clave real es (tmdb_id, tipo): los IDs
 * de TMDb para películas y series son namespaces separados y pueden
 * pisarse entre sí (puede existir una película Y una serie con el mismo id).
 */
export async function upsertTitulo(t) {
  await pool.query(
    `INSERT INTO titulos (tmdb_id, tipo, titulo, anio, vote_count, vote_average, popularity, generos, keywords)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (tmdb_id, tipo) DO UPDATE SET
       titulo = EXCLUDED.titulo,
       anio = EXCLUDED.anio,
       vote_count = EXCLUDED.vote_count,
       vote_average = EXCLUDED.vote_average,
       popularity = EXCLUDED.popularity,
       generos = EXCLUDED.generos,
       keywords = EXCLUDED.keywords,
       actualizado_en = now();`,
    [
      t.tmdb_id,
      t.tipo,
      t.titulo ?? null,
      t.anio ?? null,
      t.vote_count ?? 0,
      t.vote_average ?? null,
      t.popularity ?? null,
      t.generos ?? [],
      t.keywords ?? [],
    ]
  );
}

export async function actualizarClasificacion(tmdbId, tipo, { esClasico, complejidad }) {
  await pool.query(
    `UPDATE titulos SET es_clasico = $3, complejidad = $4 WHERE tmdb_id = $1 AND tipo = $2`,
    [tmdbId, tipo, esClasico, complejidad]
  );
}

/**
 * `upsertTitulo` + `actualizarClasificacion` en una sola consulta.
 *
 * La Ficha de Título (única llamadora) las hacía en dos round-trips
 * seguidos a Neon para la misma fila — el mismo desperdicio que
 * `guardarLote` ya evita en el motor de búsqueda, aplicado acá al caso de
 * un solo título.
 */
export async function upsertTituloConClasificacion(t, { esClasico, complejidad }) {
  await pool.query(
    `INSERT INTO titulos (tmdb_id, tipo, titulo, anio, vote_count, vote_average, popularity, generos, keywords, es_clasico, complejidad)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (tmdb_id, tipo) DO UPDATE SET
       titulo = EXCLUDED.titulo,
       anio = EXCLUDED.anio,
       vote_count = EXCLUDED.vote_count,
       vote_average = EXCLUDED.vote_average,
       popularity = EXCLUDED.popularity,
       generos = EXCLUDED.generos,
       keywords = EXCLUDED.keywords,
       es_clasico = EXCLUDED.es_clasico,
       complejidad = EXCLUDED.complejidad,
       actualizado_en = now();`,
    [
      t.tmdb_id,
      t.tipo,
      t.titulo ?? null,
      t.anio ?? null,
      t.vote_count ?? 0,
      t.vote_average ?? null,
      t.popularity ?? null,
      t.generos ?? [],
      t.keywords ?? [],
      esClasico,
      complejidad,
    ]
  );
}

/**
 * Detalles cacheados y todavía frescos, para una lista de candidatos.
 * Una sola consulta para todo el lote: hacer una por candidato sería
 * cambiar 80 llamadas a TMDb por 80 idas y vueltas a la base.
 *
 * `claves`: array de { tmdb_id, tipo }. Devuelve un Map con clave
 * "tipo:tmdb_id" y el detalle crudo como valor.
 */
export async function leerDetallesFrescos(claves, horasFrescura) {
  if (!claves.length) return new Map();

  const { rows } = await pool.query(
    `SELECT tmdb_id, tipo, detalle FROM titulos
     WHERE (tmdb_id, tipo) IN (SELECT * FROM unnest($1::int[], $2::text[]))
       AND detalle IS NOT NULL
       AND detalle_actualizado_en > now() - make_interval(hours => $3::int)`,
    [claves.map((c) => c.tmdb_id), claves.map((c) => c.tipo), horasFrescura]
  );

  return new Map(rows.map((r) => [claveDe(r), r.detalle]));
}

/**
 * Guarda el detalle crudo de TMDb junto con el momento en que se trajo.
 * Se llama solo cuando el detalle se acaba de pedir de verdad: un acierto
 * de caché no reescribe nada.
 */
export async function guardarDetalle(detalle) {
  await pool.query(
    `UPDATE titulos SET detalle = $3, detalle_actualizado_en = now()
     WHERE tmdb_id = $1 AND tipo = $2`,
    [detalle.tmdb_id, detalle.tipo, detalle]
  );
}

/**
 * Guarda un lote entero de títulos (upsert + clasificación + detalle) en
 * UNA sola consulta, con `jsonb_to_recordset`. Es lo que usa
 * `completarDetalle()` para las escrituras de una búsqueda — la misma
 * técnica que `scripts/seed.js` ya usaba para el seed masivo (ver las notas de decisiones del proyecto
 * 4.9.2), aplicada acá porque en producción pesaba más que las llamadas a
 * TMDb que se estaban ahorrando.
 *
 * Medido contra 200 filas reales: las tres consultas por título en serie
 * (upsert, clasificación, detalle) tardaban ~4 s; esta única consulta, unos
 * 200 ms. La razón es la ida y vuelta a Neon (~50 ms cada una): antes eran
 * 600 idas y vueltas para 200 títulos, ahora es una.
 *
 * `filas`: cada una con el shape completo de una fila de `titulos` más
 * `detalle` (el crudo de TMDb, tal como lo guardaba `guardarDetalle`).
 */
export async function guardarLote(filas) {
  if (!filas.length) return;
  await pool.query(
    `INSERT INTO titulos (tmdb_id, tipo, titulo, anio, vote_count, vote_average, popularity, generos, keywords, es_clasico, complejidad, detalle, detalle_actualizado_en)
     SELECT tmdb_id, tipo, titulo, anio, vote_count, vote_average, popularity, generos, keywords, es_clasico, complejidad, detalle, now()
     FROM jsonb_to_recordset($1::jsonb) AS x(
       tmdb_id int, tipo text, titulo text, anio int, vote_count int, vote_average numeric,
       popularity numeric, generos int[], keywords text[], es_clasico boolean, complejidad text, detalle jsonb)
     ON CONFLICT (tmdb_id, tipo) DO UPDATE SET
       titulo = EXCLUDED.titulo,
       anio = EXCLUDED.anio,
       vote_count = EXCLUDED.vote_count,
       vote_average = EXCLUDED.vote_average,
       popularity = EXCLUDED.popularity,
       generos = EXCLUDED.generos,
       keywords = EXCLUDED.keywords,
       es_clasico = EXCLUDED.es_clasico,
       complejidad = EXCLUDED.complejidad,
       detalle = EXCLUDED.detalle,
       detalle_actualizado_en = EXCLUDED.detalle_actualizado_en,
       actualizado_en = now();`,
    [JSON.stringify(filas)]
  );
}

export async function obtenerTodos() {
  const { rows } = await pool.query(
    `SELECT tmdb_id, tipo, anio, vote_count, vote_average, popularity, generos, keywords FROM titulos`
  );
  return rows;
}

export async function contar() {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM titulos`);
  return rows[0].total;
}

/**
 * Cuántos títulos del caché lleva cada una de las keywords pedidas.
 *
 * Es el denominador de la rareza que usa el cruce de tipo (ver
 * opciones/cruceDeTipo.js): una keyword que aparece en muchos títulos no
 * distingue nada, por más que la referencia la lleve.
 *
 * **Un `count(*) FROM titulos WHERE keywords @> ARRAY[k]` por keyword, no un
 * `unnest` + filtro sobre toda la tabla** (cambiado el 2026-09-01). La forma
 * vieja desanudaba las keywords de TODAS las filas antes de filtrar, así que
 * no podía usar `idx_titulos_keywords` (el GIN de `schema.sql`) y hacía un
 * seq scan completo. Medido con `EXPLAIN ANALYZE` contra 7.632 títulos, 10
 * keywords reales: **17,6 ms** (seq scan, 72.443 keywords desanudadas, 71.288
 * descartadas) contra **1,34 ms** con `@>` (`Bitmap Index Scan` sobre el
 * GIN). Verificado que los conteos dan idénticos en las dos formas.
 *
 * La subconsulta por keyword no es más lenta que una sola agregación porque
 * son pocas (7 a 29 por referencia, ver el comentario de arriba) y cada una
 * es un lookup de índice, no un scan.
 */
export async function contarPorKeyword(keywords) {
  if (!keywords?.length) return new Map();
  const unicas = [...new Set(keywords)];
  const { rows } = await pool.query(
    `SELECT k, (SELECT count(*)::int FROM titulos WHERE keywords @> ARRAY[k]) AS n
     FROM unnest($1::text[]) AS k`,
    [unicas]
  );
  return new Map(rows.map((r) => [r.k, r.n]));
}
