import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL en el .env (ver .env.example)');
}

/**
 * Neon exige SSL. Si en algún momento corrés esto contra un Postgres local
 * (ej. para testear), desactivamos el SSL automáticamente detectando
 * "localhost" en el connection string.
 */
const esLocal = process.env.DATABASE_URL.includes('localhost');

/**
 * El `sslmode` se saca de la cadena de conexión a propósito, y el SSL se
 * decide acá abajo en JavaScript.
 *
 * El motivo es un aviso que `pg` empezó a tirar en cada arranque: los modos
 * 'prefer', 'require' y 'verify-ca' hoy se tratan como alias de
 * 'verify-full', pero en pg 9 van a pasar a la semántica de libpq, donde
 * 'require' cifra pero NO valida el certificado. O sea que una cadena con
 * `sslmode=require` va a significar dos cosas distintas según la versión, y
 * la de mañana es la insegura. Dejarlo escrito en JavaScript hace que la
 * decisión no dependa de qué versión de pg esté instalada.
 *
 * Se verifica el certificado (`rejectUnauthorized: true`), que es más
 * estricto que el `false` que había antes. Está comprobado contra la base
 * real: Neon presenta un certificado de una autoridad pública y la conexión
 * entra igual. Con `false` se cifraba pero se aceptaba cualquier certificado,
 * o sea que no protegía de un intermediario.
 */
function cadenaSinSslmode(url) {
  const u = new URL(url);
  u.searchParams.delete('sslmode');
  return u.toString();
}

/**
 * EL TIEMPO MÁXIMO PARA CONSEGUIR UNA CONEXIÓN, que antes no se declaraba.
 *
 * El valor por omisión de `pg` es 0, que quiere decir **esperar para siempre**.
 * Con la base suspendida o caída eso no da un error: deja el pedido colgado, y
 * del lado del usuario es una pantalla cargando sin fin, que es peor que un
 * mensaje de error. Es la misma clase de fallo silencioso que el
 * `VITE_API_URL` con valor por omisión (ver 4.24).
 *
 * 10 segundos sale de una medición contra el proyecto real (2026-08-26): con
 * el cómputo suspendido, conectar tardó **2,3 segundos** contra 0,6 en
 * caliente. O sea que el arranque en frío entra cómodo y lo que se corta de
 * verdad es una base que no está contestando.
 *
 * `max` se declara en 10, que es el valor por omisión de `pg`, pero escrito
 * para que quede explícito. Hasta el 2026-09-01 este número importaba más:
 * las escrituras del motor iban de a una por título (`CONCURRENCIA_ESCRITURA`,
 * atada a este `max`), y subir uno sin el otro solo generaba espera. Desde
 * que las escrituras de un lote van en una sola consulta
 * (`guardarLote()`, ver `repositories/titulos.js`), esa relación ya no
 * existe: acá no queda ninguna sección del motor cuya concurrencia dependa
 * de este número.
 */
export const pool = new Pool({
  connectionString: esLocal ? process.env.DATABASE_URL : cadenaSinSslmode(process.env.DATABASE_URL),
  ssl: esLocal ? false : { rejectUnauthorized: true },
  max: 10,
  connectionTimeoutMillis: 10_000,
});
