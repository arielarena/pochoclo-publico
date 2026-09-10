import { pool } from '../config/db.js';

/** El tope de géneros favoritos de la sección 19 ("máximo 5, con contador n/5"). */
export const MAXIMO_GENEROS_FAVORITOS = 5;

const VACIOS = { generos: [], tipos: [], anios: [], clasicos: false };

/**
 * Los gustos del usuario. Devuelve los cuatro campos vacíos si nunca guardó
 * nada, en vez de null: quien los usa (la milestone 21) los va a pasar
 * directo como preferencias, y unos campos vacíos significan exactamente
 * "sin preferencia", que es lo correcto.
 */
export async function leerGustos(usuarioId) {
  const { rows } = await pool.query(
    `SELECT generos, tipos, anios, clasicos FROM gustos_usuario WHERE usuario_id = $1`,
    [usuarioId]
  );
  if (!rows.length) return { ...VACIOS };
  return {
    generos: rows[0].generos ?? [],
    tipos: rows[0].tipos ?? [],
    anios: rows[0].anios ?? [],
    clasicos: rows[0].clasicos ?? false,
  };
}

export async function guardarGustos(usuarioId, { generos, tipos, anios, clasicos }) {
  await pool.query(
    `INSERT INTO gustos_usuario (usuario_id, generos, tipos, anios, clasicos)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (usuario_id) DO UPDATE SET
       generos = EXCLUDED.generos,
       tipos = EXCLUDED.tipos,
       anios = EXCLUDED.anios,
       clasicos = EXCLUDED.clasicos,
       actualizado_en = now()`,
    [usuarioId, generos, tipos, JSON.stringify(anios), Boolean(clasicos)]
  );
}

/**
 * La pregunta "¿hay algo cargado?" NO vive acá: la contesta
 * `tieneGustosCargados()` de opciones/personalizacion.js, que es donde está el
 * único consumidor (el bloque de Gustos Registrados de la búsqueda con
 * formulario vacío). Hubo un tiempo una `tieneGustos()` idéntica en este
 * archivo que no llamaba nadie.
 */
