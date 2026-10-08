/**
 * Reinicia el backend LOCAL en Windows y no vuelve hasta que /salud contesta.
 *
 *   npm run reiniciar              con --watch
 *   npm run reiniciar -- --sin-watch
 *   npm run reiniciar -- --detener  solo lo apaga
 *
 * POR QUÉ EXISTE: `pkill` desde Git Bash no mata el Node de Windows y no
 * avisa, así que la prueba siguiente corría contra el código viejo sin que
 * nada lo dijera. Esto mata por línea de comandos (incluido el proceso padre
 * de `node --watch`, que si no vuelve a levantar al hijo con el código viejo),
 * arranca de nuevo, y dice contra qué rama de Neon quedó.
 *
 * POR QUÉ ES NODE Y NO UN .ps1: la primera versión fue un script de
 * PowerShell, y Windows lo BORRABA del disco en cuanto llegaba al paso de
 * arrancar, sin ningún aviso. Matar procesos y después lanzar uno oculto con
 * la salida redirigida es el patrón que AMSI (el escaneo de Windows sobre
 * PowerShell) trata como malware. Medido el 2026-09-30: la variante que solo
 * detenía sobrevivía; las que arrancaban se borraban, con o sin leer el .env.
 * AMSI no mira lo que hace Node.
 *
 * Solo para la PC de desarrollo. En la notebook es `sudo systemctl restart
 * pochoclo`.
 */
import 'dotenv/config';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUERTO = Number(process.env.PORT || 3000);
const CARPETA_BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOG = path.join(os.tmpdir(), 'pochoclo-backend.log');
const argumentos = process.argv.slice(2);

if (process.platform !== 'win32') {
  console.log('Este script es para la PC de desarrollo. En la notebook: sudo systemctl restart pochoclo');
  process.exit(1);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Los node cuyo comando arranca src/index.js, con el padre de --watch incluido. */
function procesosDelBackend() {
  const salida = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
    ],
    { encoding: 'utf8' }
  ).trim();
  if (!salida) return [];
  const lista = [].concat(JSON.parse(salida));
  return lista.filter((p) => /src[\\/]index\.js/.test(p.CommandLine ?? '')).map((p) => p.ProcessId);
}

/** Quién escucha el puerto, por si arrancó con otro comando. */
function duenioDelPuerto() {
  const salida = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
  const ids = new Set();
  for (const linea of salida.split(/\r?\n/)) {
    const partes = linea.trim().split(/\s+/);
    if (partes[1]?.endsWith(`:${PUERTO}`) && /LISTEN/i.test(partes[3] ?? '')) ids.add(Number(partes[4]));
  }
  return [...ids];
}

/**
 * Con http y sin conexión persistente, no con fetch: fetch deja sockets vivos
 * y en Windows Node aborta con "Assertion failed ... async.c" al salir.
 */
function responde() {
  return new Promise((resolver) => {
    const pedido = http.get({ host: 'localhost', port: PUERTO, path: '/salud', agent: false, timeout: 2000 }, (r) => {
      r.resume();
      resolver(r.statusCode === 200);
    });
    pedido.on('timeout', () => pedido.destroy());
    pedido.on('error', () => resolver(false));
  });
}

// 1. Apagar.
const ids = [...new Set([...procesosDelBackend(), ...duenioDelPuerto()])].filter((id) => id && id !== process.pid);
for (const id of ids) {
  try {
    process.kill(id);
    console.log(`Detenido el proceso ${id}`);
  } catch {
    // Ya había terminado (el hijo de --watch muere con el padre).
  }
}
if (!ids.length) console.log('No había ningún backend corriendo.');

for (let i = 0; i < 20 && duenioDelPuerto().length; i++) await esperar(250);
if (duenioDelPuerto().length) {
  console.error(`El puerto ${PUERTO} sigue ocupado después de detener los procesos.`);
  process.exit(1);
}
if (argumentos.includes('--detener')) process.exit(0);

// 2. Contra qué rama de Neon va a quedar, que es lo primero que conviene saber.
const url = process.env.DATABASE_URL ?? '';
// El endpoint de cada rama sale del .env y no va escrito acá, porque junto
// con la región dice dónde está la base.
const { NEON_ENDPOINT_PRODUCCION: produccion, NEON_ENDPOINT_DESARROLLO: desarrollo } = process.env;
if (produccion && url.includes(produccion)) console.log('Base: rama PRODUCTION de Neon (cuentas reales).');
else if (desarrollo && url.includes(desarrollo)) console.log('Base: rama desarrollo de Neon.');
else console.log('Base: una rama de Neon que este script no reconoce.');

// 3. Arrancar, suelto de esta terminal.
const conWatch = !argumentos.includes('--sin-watch');
const salida = fs.openSync(LOG, 'w');
const hijo = spawn(process.execPath, conWatch ? ['--watch', 'src/index.js'] : ['src/index.js'], {
  cwd: CARPETA_BACKEND,
  detached: true,
  windowsHide: true,
  stdio: ['ignore', salida, salida],
});
hijo.unref();

// 4. No volver hasta que conteste.
for (let i = 0; i < 60; i++) {
  await esperar(500);
  if (await responde()) {
    console.log(`Backend arriba en http://localhost:${PUERTO} (proceso ${hijo.pid}${conWatch ? ', con --watch' : ''}).`);
    console.log(`Salida en ${LOG}`);
    process.exit(0);
  }
  if (hijo.exitCode !== null) break;
}

console.error('El backend no contestó /salud. Últimas líneas de la salida:');
console.error(fs.readFileSync(LOG, 'utf8').split(/\r?\n/).slice(-15).join('\n'));
process.exit(1);
