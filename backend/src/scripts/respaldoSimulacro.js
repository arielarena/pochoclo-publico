import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../config/db.js';

/**
 * El simulacro de restauración.
 *
 * POR QUÉ EXISTE: un respaldo que nunca se restauró no es un respaldo, es una
 * suposición. Este script la convierte en un hecho, y lo hace solo, así que se
 * puede repetir cada vez que cambie el esquema (que es justo cuando un respaldo
 * viejo deja de servir sin que nadie se entere).
 *
 * QUÉ PRUEBA, EN ORDEN:
 *   1. Crea una cuenta de verdad por la API, con listas, plataformas y gustos.
 *   2. Toma un respaldo.
 *   3. **Borra todo**, y comprueba que de verdad no quedó nada.
 *   4. Restaura.
 *   5. Compara fila por fila con una huella de antes y después.
 *   6. **Entra con esa cuenta**, que es la prueba que ninguna comparación de
 *      filas puede dar: que el hash de la contraseña sobrevivió al viaje y la
 *      persona puede volver a usar su cuenta.
 *
 * El paso 6 es el que más veces salva: una restauración puede dejar todas las
 * filas en su lugar y aun así dejar a la gente afuera, si algo se perdió en la
 * serialización de una columna que no se mira.
 *
 * **SE NIEGA A CORRER SI LA BASE TIENE CUENTAS QUE NO SON SUYAS**, porque el
 * paso 3 borra todo. En producción no se corre: se corre contra una copia.
 *
 * Necesita el backend andando en el puerto de siempre.
 *
 * Uso: npm run respaldo-simulacro
 */

const API = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
/**
 * Better Auth rechaza los pedidos sin Origin (MISSING_OR_NULL_ORIGIN), que es
 * justo lo que protege contra CSRF. Un script no es un navegador, asi que hay
 * que mandarlo a mano, y tiene que ser uno de los de URL_FRONTEND o el propio
 * Better Auth lo descarta. Ver 4.16.
 */
const ORIGEN = (process.env.URL_FRONTEND ?? 'http://localhost:5173').split(',')[0].trim();
const CABECERAS = { 'Content-Type': 'application/json', Origin: ORIGEN };
const CUENTA = {
  name: 'Simulacro',
  email: `respaldo-${Date.now()}@pochoclo.ar`,
  password: 'unaClaveLarga123!',
  fechaNacimiento: '1990-03-12',
};

let pasos = 0;
let fallos = 0;
const paso = (t) => console.log(`\n${++pasos}. ${t}`);
const ok = (bien, t) => {
  if (!bien) fallos++;
  console.log(`   [${bien ? 'OK ' : 'MAL'}] ${t}`);
};

function correrRespaldo(args) {
  const r = spawnSync(process.execPath, ['src/scripts/respaldo.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`respaldo.js falló: ${r.stderr || r.stdout}`);
  return r.stdout;
}

/**
 * Una huella del contenido de las tablas de gente. Se ordena por la fila
 * entera serializada, no por una columna: los ids son aleatorios y el orden en
 * que Postgres devuelve las filas no está garantizado, así que comparar sin
 * ordenar daría diferencias falsas.
 */
async function huella() {
  const tablas = ['user', 'account', 'session', 'verification', 'items_lista', 'plataformas_usuario', 'gustos_usuario'];
  const partes = {};
  for (const t of tablas) {
    const { rows } = await pool.query(`SELECT * FROM "${t}"`);
    const textos = rows.map((r) => JSON.stringify(r, Object.keys(r).sort())).sort();
    partes[t] = {
      filas: rows.length,
      hash: crypto.createHash('sha256').update(textos.join('|')).digest('hex').slice(0, 16),
    };
  }
  return partes;
}

async function main() {
  paso('Compruebo que la base esté libre para el simulacro');
  {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM "user" WHERE email NOT LIKE 'respaldo-%'`);
    if (rows[0].n > 0) {
      throw new Error(
        `Hay ${rows[0].n} cuentas que no son de este simulacro y el paso 3 borra todo. ` +
          'Corré esto contra una copia, nunca contra producción.'
      );
    }
    ok(true, 'No hay cuentas ajenas');
  }

  paso('Creo una cuenta con listas, plataformas y gustos');
  let galleta = '';
  {
    const alta = await fetch(`${API}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: CABECERAS,
      body: JSON.stringify({ ...CUENTA, aceptoTerminos: true }),
    });
    if (!alta.ok) throw new Error(`No se pudo crear la cuenta: ${alta.status} ${await alta.text()}`);
    galleta = (alta.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    ok(Boolean(galleta), 'Cuenta creada y sesión abierta');

    const pedir = (ruta, metodo, cuerpo) =>
      fetch(API + ruta, {
        method: metodo,
        headers: { ...CABECERAS, Cookie: galleta },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });

    await pedir('/terminos/aceptar', 'POST');
    for (const [lista, id] of [
      ['favoritas', 238],
      ['favoritas', 278],
      ['visto', 680],
      ['ver_mas_tarde', 155],
    ]) {
      const r = await pedir(`/listas/${lista}`, 'POST', { tipo: 'pelicula', tmdb_id: id });
      if (!r.ok) throw new Error(`No se pudo agregar a ${lista}: ${r.status} ${await r.text()}`);
    }
    await pedir('/mis-plataformas', 'PUT', { plataformas: [8, 119, 337] });
    await pedir('/gustos', 'PUT', {
      generos: [35, 18, 878],
      tipos: ['pelicula'],
      anios: [{ desde: 1980, hasta: 1989 }, { exacto: 1994 }],
    });

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM items_lista');
    ok(rows[0].n === 4, `Quedaron ${rows[0].n} ítems de lista, 3 plataformas y 1 fila de gustos`);
  }

  paso('Tomo el respaldo');
  const antes = await huella();
  const salida = correrRespaldo([]);
  const archivo = salida.match(/Respaldo creado: (.+)/)?.[1]?.trim();
  ok(Boolean(archivo) && fs.existsSync(path.resolve(process.cwd(), archivo)), `Archivo: ${archivo}`);
  const ruta = path.resolve(process.cwd(), archivo);
  ok(
    correrRespaldo(['--verificar', ruta]).includes('El archivo está sano'),
    'El archivo se abre y los conteos coinciden con lo que declara'
  );

  paso('BORRO TODO (que es lo que se está simulando)');
  {
    /**
     * En orden inverso al de las claves foráneas. `user` con ON DELETE CASCADE
     * se lleva session, account y los tres de listas, pero se borran explícito
     * para que el simulacro no dependa de que el cascade esté bien puesto.
     */
    for (const t of ['items_lista', 'plataformas_usuario', 'gustos_usuario', 'session', 'account', 'verification', 'user']) {
      await pool.query(`DELETE FROM "${t}"`);
    }
    const vacia = await huella();
    const total = Object.values(vacia).reduce((a, b) => a + b.filas, 0);
    ok(total === 0, `La base quedó en ${total} filas`);
  }

  paso('Restauro');
  {
    const salidaR = correrRespaldo(['--restaurar', ruta]);
    ok(salidaR.includes('Restaurado desde'), 'La restauración terminó sin error');
  }

  paso('Comparo fila por fila contra la huella de antes');
  {
    const despues = await huella();
    for (const t of Object.keys(antes)) {
      const igual = antes[t].hash === despues[t].hash && antes[t].filas === despues[t].filas;
      ok(igual, `${t}: ${despues[t].filas} filas, huella ${igual ? 'idéntica' : 'DISTINTA'}`);
    }
  }

  paso('Entro con la cuenta restaurada (la prueba que las filas no pueden dar)');
  {
    const r = await fetch(`${API}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: CABECERAS,
      body: JSON.stringify({ email: CUENTA.email, password: CUENTA.password }),
    });
    ok(r.ok, `El login contesta ${r.status}: el hash de la contraseña sobrevivió`);
    const nueva = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    const listas = await fetch(`${API}/listas`, { headers: { ...CABECERAS, Cookie: nueva } });
    const cuerpo = listas.ok ? await listas.json() : null;
    const favoritas = cuerpo?.listas?.favoritas?.length ?? 0;
    ok(favoritas === 2, `Sus Favoritas siguen teniendo ${favoritas} títulos`);
  }

  paso('Limpio la cuenta del simulacro');
  {
    await pool.query(`DELETE FROM "user" WHERE email LIKE 'respaldo-%'`);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM "user"');
    ok(rows[0].n === 0, 'Base limpia');
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(fallos === 0 ? 'SIMULACRO SUPERADO: el respaldo se puede restaurar.' : `${fallos} comprobaciones fallaron.`);
  if (fallos) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('\nSIMULACRO FALLIDO:', e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
