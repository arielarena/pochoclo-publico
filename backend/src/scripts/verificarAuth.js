import { getAuthTables } from 'better-auth';
import { auth } from '../auth/auth.js';
import { pool } from '../config/db.js';

/**
 * Compara las tablas que Better Auth necesita contra las que existen de
 * verdad en la base.
 *
 * Existe por un problema concreto: el generador de esquema del propio Better
 * Auth (npx @better-auth/cli generate, versión 1.7.1) omitió la columna
 * "issuer" de la tabla account, que su runtime sí usa. El resultado era un
 * 500 recién al intentar registrarse, con un mensaje de Postgres que no
 * decía nada sobre autenticación.
 *
 * La fuente autoritativa es getAuthTables(auth.options): son las tablas que
 * el runtime va a usar, no las que el generador cree que va a usar. Correr
 * esto después de cualquier cambio en auth.js (un campo nuevo de usuario, un
 * plugin) avisa antes de que falle en la cara del usuario.
 */
async function main() {
  const tablas = getAuthTables(auth.options);
  const problemas = [];

  for (const definicion of Object.values(tablas)) {
    const tabla = definicion.modelName;

    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [tabla]
    );

    if (rows.length === 0) {
      problemas.push(`Falta la tabla "${tabla}" entera. Corré: npm run migrate`);
      continue;
    }

    const enLaBase = new Set(rows.map((r) => r.column_name));

    // El id no figura en `fields`, Better Auth lo da por sentado en todas.
    const necesarias = ['id', ...Object.entries(definicion.fields).map(([campo, def]) => def.fieldName || campo)];

    const faltantes = necesarias.filter((columna) => !enLaBase.has(columna));
    if (faltantes.length > 0) {
      problemas.push(`Tabla "${tabla}": faltan las columnas ${faltantes.map((c) => `"${c}"`).join(', ')}`);
    } else {
      console.log(`ok    "${tabla}": ${necesarias.length} columnas, todas presentes`);
    }
  }

  console.log('');
  if (problemas.length === 0) {
    console.log('El esquema de autenticación coincide con lo que Better Auth espera.');
  } else {
    console.log('Hay diferencias entre el esquema y lo que Better Auth espera:');
    for (const p of problemas) console.log(`  - ${p}`);
    console.log('');
    console.log('Para regenerar el SQL de referencia:');
    console.log('  npx @better-auth/cli generate --config src/auth/auth.js --output ../auth-schema.sql');
    console.log('Ojo: revisá el resultado contra este script antes de confiar en él.');
  }

  await pool.end();
  process.exit(problemas.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Error verificando el esquema de autenticación:', err);
  process.exit(1);
});
