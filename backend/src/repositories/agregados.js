import { pool } from '../config/db.js';

/**
 * Tabla de una sola fila (id fijo = 1). Guarda las constantes globales que
 * usan las fórmulas de Puntuación, Popularidad y Clásicos.
 */
export async function guardarAgregados({ c, popularityMax, votosTotalesMax, votosTotalesMaxClasicos }) {
  await pool.query(
    `INSERT INTO agregados_catalogo (id, c, popularity_max, votos_totales_max, votos_totales_max_clasicos, calculado_en)
     VALUES (1, $1, $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE SET
       c = EXCLUDED.c,
       popularity_max = EXCLUDED.popularity_max,
       votos_totales_max = EXCLUDED.votos_totales_max,
       votos_totales_max_clasicos = EXCLUDED.votos_totales_max_clasicos,
       calculado_en = now();`,
    [c, popularityMax, votosTotalesMax, votosTotalesMaxClasicos]
  );
}

export async function leerAgregados() {
  const { rows } = await pool.query(`SELECT * FROM agregados_catalogo WHERE id = 1`);
  return rows[0] ?? null;
}
