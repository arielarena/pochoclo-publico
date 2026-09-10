import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../config/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'schema.sql');

/**
 * Corre schema.sql completo con pool.query(): node-postgres soporta varias
 * sentencias separadas por ";" en un solo query() siempre que no le pases
 * parámetros (protocolo "simple query"). Como schema.sql no tiene
 * parámetros, no hace falta partirlo en statements individuales.
 */
async function main() {
  const sql = readFileSync(schemaPath, 'utf-8');
  await pool.query(sql);
  console.log('Schema aplicado correctamente.');
  await pool.end();
}

main().catch((err) => {
  console.error('Error aplicando el schema:', err);
  process.exit(1);
});
