import { pool } from '../config/db.js';

/**
 * Las cuentas que dejan las auditorías, y cómo sacarlas.
 *
 * POR QUÉ EXISTE, ADEMÁS DE `terminos-pendientes`. Ese script borra a quien
 * **nunca** aceptó los Términos, que era el estado de las cuentas viejas. Las
 * que deja `auditoria-a11y.mjs` sí los aceptan (tiene que tildar la casilla
 * para poder registrarse), así que no las alcanza: al 2026-08-26 había 20
 * cuentas y `--borrar` no llegaba a ninguna. Este script las identifica por lo
 * único que de verdad las distingue, que es el prefijo con el que las crea la
 * auditoría, y no por "las que no aceptaron", que las mezclaba con cuentas
 * reales que podrían estar en el mismo estado por otro motivo.
 *
 * EL PREFIJO ES LA ÚNICA CONDICIÓN, a propósito. Se evaluó borrar por fecha de
 * creación o por dominio del correo y las dos alcanzan cuentas de gente: una
 * persona puede registrarse el mismo día que corre una auditoría, y
 * `@pochoclo.ar` va a ser una dirección legítima en cuanto exista el dominio.
 *
 * `--borrar` no está por omisión: informar es seguro y borrar no.
 *
 * Uso:
 *   node src/scripts/cuentasDePrueba.js
 *   node src/scripts/cuentasDePrueba.js --borrar
 *   node src/scripts/cuentasDePrueba.js --atrasar-terminos <correo>
 */

/**
 * Un prefijo por auditoria. `responsive-` lo usa
 * auditoria-responsive-estados.mjs, que tambien deja una cuenta por corrida.
 */
const PREFIJOS = ['auditoria-', 'lector-', 'responsive-'];

const BORRAR = process.argv.includes('--borrar');
const iAtrasar = process.argv.indexOf('--atrasar-terminos');

function patron() {
  return PREFIJOS.map((p) => `${p}%`);
}

async function main() {
  if (iAtrasar !== -1) {
    /**
     * Para poder probar el aviso de re-aceptación hace falta una cuenta con la
     * aceptación vieja. La fecha es anterior a cualquier versión del documento.
     */
    const correo = process.argv[iAtrasar + 1];
    if (!correo) throw new Error('Falta el correo después de --atrasar-terminos');
    const { rowCount } = await pool.query(
      `UPDATE "user" SET "terminosAceptadosEn" = '2020-01-01T00:00:00Z' WHERE email = $1`,
      [correo]
    );
    console.log(rowCount === 1 ? 'Aceptación atrasada.' : 'No encontré esa cuenta.');
    return;
  }

  const { rows } = await pool.query(
    `SELECT id, name, "createdAt", "aceptoTerminos"
       FROM "user"
      WHERE email LIKE ANY($1::text[])
      ORDER BY "createdAt"`,
    [patron()]
  );
  const { rows: totales } = await pool.query('SELECT count(*)::int AS n FROM "user"');

  console.log(`Cuentas en total: ${totales[0].n}`);
  console.log(`De auditoría (prefijos ${PREFIJOS.join(', ')}): ${rows.length}`);
  for (const r of rows) {
    console.log(`  ${r.createdAt.toISOString().slice(0, 10)}  ${r.name}  terminos=${r.aceptoTerminos}`);
  }

  if (!BORRAR) {
    console.log('\nPara sacarlas: node src/scripts/cuentasDePrueba.js --borrar');
    return;
  }
  if (rows.length === 0) return;

  /**
   * Las tablas de sesión, listas y gustos apuntan a "user" con ON DELETE
   * CASCADE, así que borrar la fila se lleva todo lo suyo. Ver 4.16.
   */
  const { rowCount } = await pool.query(`DELETE FROM "user" WHERE email LIKE ANY($1::text[])`, [
    patron(),
  ]);
  console.log(`\nBorradas ${rowCount}.`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
