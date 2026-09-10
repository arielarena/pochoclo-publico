import { pool } from '../config/db.js';
import { FECHA_TERMINOS, FECHA_TERMINOS_TEXTO } from '../config/terminos.js';

/**
 * Quién no aceptó los Términos y Condiciones vigentes.
 *
 * Responde dos preguntas distintas que conviene no mezclar:
 *
 *  1. QUIÉN NUNCA ACEPTÓ NADA. Son las cuentas creadas antes de que existiera
 *     el documento, que quedaron con `aceptoTerminos = false`. Es correcto que
 *     figuren así: no aceptaron, porque no había nada que aceptar. Antes de
 *     publicar hay que resolverlas, y como hoy son todas cuentas de prueba, lo
 *     que corresponde es borrarlas.
 *
 *  2. QUIÉN ACEPTÓ UNA VERSIÓN VIEJA. Esta todavía no le pasa a nadie, pero le
 *     va a pasar a todo el mundo la primera vez que se toque el texto de los
 *     Términos. Por eso se guarda la FECHA de aceptación y no solo un sí/no:
 *     comparada contra la fecha de la última versión del documento, dice
 *     exactamente quién quedó atrás, sin tener que guardar una copia del
 *     documento por usuario.
 *
 * QUÉ **NO** HACE: no le pide la aceptación a nadie, y ya no porque no exista
 * dónde pedirla. La pantalla existe desde el 2026-08-25 y se la muestra sola a
 * quien entra con algo pendiente (ver routes/terminos.js). Este script sigue
 * siendo la vista de administración: dice a cuántos les va a aparecer, que es
 * lo que no se puede saber mirando la app.
 *
 * LA FECHA VIGENTE SALE DE config/terminos.js, que es la misma que usa la
 * ruta. Antes estaba escrita a mano acá, y con la pantalla en juego dos copias
 * de esa fecha se contradicen en silencio: el script diría que no hay nadie
 * pendiente mientras la app le sigue pidiendo la aceptación a todo el mundo.
 *
 * Uso:
 *   npm run terminos-pendientes            (solo informa)
 *   npm run terminos-pendientes -- --borrar  (borra las que nunca aceptaron)
 */


const BORRAR = process.argv.includes('--borrar');

function formatear(fecha) {
  return fecha ? fecha.toISOString().slice(0, 10) : '-';
}

async function main() {
  const { rows: nunca } = await pool.query(
    `SELECT id, email, name, "createdAt" FROM "user"
     WHERE "aceptoTerminos" = FALSE OR "terminosAceptadosEn" IS NULL
     ORDER BY "createdAt"`
  );

  const { rows: viejas } = await pool.query(
    `SELECT email, "terminosAceptadosEn" FROM "user"
     WHERE "aceptoTerminos" = TRUE AND "terminosAceptadosEn" < $1
     ORDER BY "terminosAceptadosEn"`,
    [FECHA_TERMINOS]
  );

  const { rows: total } = await pool.query(`SELECT count(*)::int AS n FROM "user"`);

  console.log(`Cuentas en total: ${total[0].n}`);
  console.log(`Términos vigentes: versión del ${FECHA_TERMINOS_TEXTO}`);
  console.log('');

  console.log(`Nunca aceptaron: ${nunca.length}`);
  for (const u of nunca) {
    console.log(`  ${u.email}  (creada el ${formatear(u.createdAt)})`);
  }

  console.log('');
  console.log(`Aceptaron una versión anterior: ${viejas.length}`);
  for (const u of viejas) {
    console.log(`  ${u.email}  (aceptó el ${formatear(u.terminosAceptadosEn)})`);
  }

  /**
   * Las dos listas cuentan como pendiente, y mirar solo la primera era decir
   * "no hay nada pendiente" abajo de una lista de gente a la que la app le
   * está pidiendo la aceptación en este momento.
   */
  if (!nunca.length && !viejas.length) {
    console.log('');
    console.log('No hay nada pendiente.');
    await pool.end();
    return;
  }

  /**
   * Solo quedó gente que aceptó una versión anterior. Desde acá no hay nada
   * que hacer con ellas, y borrarlas sería absurdo: tienen cuenta y aceptaron
   * lo que había. La pantalla se les muestra sola al entrar.
   */
  if (!nunca.length) {
    console.log('');
    console.log('A esas cuentas la app les pide la aceptación sola al entrar (/terminos/aceptar).');
    await pool.end();
    return;
  }

  if (!BORRAR) {
    console.log('');
    console.log('Para borrar las que nunca aceptaron:');
    console.log('  npm run terminos-pendientes -- --borrar');
    console.log('Se lleva también sus sesiones, listas y gustos (ON DELETE CASCADE).');
    await pool.end();
    return;
  }

  const { rowCount } = await pool.query(
    `DELETE FROM "user" WHERE "aceptoTerminos" = FALSE OR "terminosAceptadosEn" IS NULL`
  );
  console.log('');
  console.log(`Borradas ${rowCount} cuentas, con todo lo que colgaba de ellas.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
