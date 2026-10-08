/**
 * Prueba de desplegar.js, sin la notebook.
 *
 *   node src/scripts/probarDesplegar.js
 *
 * Arma en una carpeta temporal un "GitHub" (repo bare), el clon de la notebook
 * y una copia de trabajo desde la que se "pushea". El backend de mentira es un
 * servidor de 10 líneas que contesta /salud, o que revienta al arrancar en los
 * commits rotos. `sistema` (reiniciar, estado del servicio, correo) se
 * reemplaza por versiones de mentira, así que no toca systemd, ni sudo, ni
 * manda correos, ni lee el .env de verdad.
 *
 * Lo que importa comprobar es la vuelta atrás: es lo único del script que en la
 * vida real no se ejercita hasta el día de una falla.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pochoclo-despliegue-'));
const ORIGEN = path.join(base, 'origen.git');
const CLON = path.join(base, 'notebook');
const TRABAJO = path.join(base, 'trabajo');
const PUERTO = 3917;

// Antes de importar el script: estas variables las lee al cargarse o al correr.
process.env.DESPLIEGUE_REPO = CLON;
process.env.CARPETA_RESPALDOS = path.join(base, 'estado');
process.env.PORT = String(PUERTO);

const g = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
// Reintenta si el puerto sigue tomado por el servidor anterior, que tarda un instante en soltarlo.
const SERVIDOR_BUENO = (version) =>
  `const s = require('http').createServer((q, r) => r.end(${JSON.stringify(version)}));\n` +
  `s.on('error', () => setTimeout(() => s.listen(${PUERTO}), 100));\ns.listen(${PUERTO});\n`;
const SERVIDOR_ROTO = "throw new Error('arranque roto a propósito');\n";

function commit(archivos, mensaje) {
  for (const [ruta, contenido] of Object.entries(archivos)) {
    fs.mkdirSync(path.dirname(path.join(TRABAJO, ruta)), { recursive: true });
    fs.writeFileSync(path.join(TRABAJO, ruta), contenido);
  }
  g(TRABAJO, 'add', '-A');
  g(TRABAJO, '-c', 'user.name=Prueba', '-c', 'user.email=prueba@ejemplo.com', 'commit', '-q', '-m', mensaje);
  g(TRABAJO, 'push', '-q', 'origin', 'main');
  return g(TRABAJO, 'rev-parse', 'HEAD');
}

// --- El repo de mentira -------------------------------------------------------
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', ORIGEN]);
execFileSync('git', ['clone', '-q', ORIGEN, TRABAJO]);
g(TRABAJO, 'checkout', '-q', '-b', 'main');
const inicial = commit({ 'backend/src/index.js': SERVIDOR_BUENO('v1'), 'docs/a.md': 'uno\n' }, 'inicial');
execFileSync('git', ['clone', '-q', ORIGEN, CLON]);

// --- El sistema de mentira ----------------------------------------------------
const { main, sistema, tiempos } = await import('./desplegar.js');
tiempos.intentosSalud = 20;
tiempos.pausaMs = 150;
tiempos.estabilidadMs = 500;

let servidor = null;
let reinicios = 0;
let mantenimiento = 'inactive';
let reiniciarFalla = false;
const correos = [];

function arrancar() {
  const proceso = spawn(process.execPath, [path.join(CLON, 'backend/src/index.js')], { stdio: 'ignore' });
  // Solo se marca caído si el que terminó es el actual: el viejo termina DESPUÉS de arrancar el nuevo.
  proceso.on('exit', () => {
    if (servidor === proceso) servidor = null;
  });
  servidor = proceso;
}
sistema.reiniciar = () => {
  if (reiniciarFalla) throw new Error('sudo: a password is required');
  reinicios += 1;
  if (servidor) servidor.kill();
  arrancar();
};
sistema.estadoDe = (unidad) =>
  unidad === 'pochoclo-mantenimiento.service' ? mantenimiento : servidor ? 'active' : 'failed';
sistema.instalarDependencias = () => {};
sistema.diario = () => '(diario de mentira)';
sistema.avisar = async (asunto) => correos.push(asunto);

arrancar();

// --- Los casos ----------------------------------------------------------------
let mal = 0;
function revisar(bien, texto) {
  if (!bien) mal += 1;
  console.log(`${bien ? 'ok  ' : 'MAL '} ${texto}`);
}
const head = () => g(CLON, 'rev-parse', 'HEAD');
async function vuelta() {
  const [reiniciosAntes, correosAntes] = [reinicios, correos.length];
  await main();
  await new Promise((r) => setTimeout(r, 200));
  return { reinicios: reinicios - reiniciosAntes, correos: correos.slice(correosAntes) };
}
const version = async () => {
  try {
    return await (await fetch(`http://localhost:${PUERTO}/salud`)).text();
  } catch {
    return 'caído';
  }
};

try {
  await new Promise((r) => setTimeout(r, 500));

  let v = await vuelta();
  revisar(v.reinicios === 0 && v.correos.length === 0 && head() === inicial, 'sin commits nuevos no hace nada');

  const soloDocs = commit({ 'docs/a.md': 'dos\n' }, 'solo documentación');
  v = await vuelta();
  revisar(head() === soloDocs && v.reinicios === 0 && v.correos.length === 0, 'un commit que no toca el backend avanza el clon sin reiniciar');

  const bueno = commit({ 'backend/src/index.js': SERVIDOR_BUENO('v2') }, 'backend bueno');
  v = await vuelta();
  revisar(head() === bueno && v.reinicios === 1, 'un commit de backend bueno se aplica y reinicia');
  revisar((await version()) === 'v2', 'y el servidor corre el código nuevo');
  revisar(v.correos.some((c) => c.includes('desplegado')), 'y avisa que se desplegó');

  const roto = commit({ 'backend/src/index.js': SERVIDOR_ROTO }, 'backend roto');
  v = await vuelta();
  revisar(head() === bueno, 'un commit que no arranca: el clon vuelve al anterior');
  revisar((await version()) === 'v2', 'y el servidor vuelve a correr el código anterior');
  revisar(v.correos.some((c) => c.includes('falló') && c.includes('se volvió atrás')), 'y avisa que falló y que volvió');

  v = await vuelta();
  revisar(v.reinicios === 0 && v.correos.length === 0 && head() === bueno, 'el commit rechazado no se reintenta cada 5 minutos');

  const arreglo = commit({ 'backend/src/index.js': SERVIDOR_BUENO('v3') }, 'arreglo');
  v = await vuelta();
  revisar(head() === arreglo && (await version()) === 'v3', 'el commit siguiente al roto se despliega (trae el roto y su arreglo)');

  // Comunes: también cuentan como backend.
  const comun = commit({ 'comun/cuenta.js': 'export const X = 1;\n' }, 'toca comun');
  v = await vuelta();
  revisar(head() === comun && v.reinicios === 1, 'un cambio en comun/ también reinicia');

  mantenimiento = 'activating';
  const conMantenimiento = commit({ 'backend/src/index.js': SERVIDOR_BUENO('v4') }, 'durante el mantenimiento');
  v = await vuelta();
  revisar(head() === comun && v.reinicios === 0 && v.correos.length === 0, 'con el mantenimiento corriendo, espera sin avisar');
  mantenimiento = 'inactive';
  v = await vuelta();
  revisar(head() === conMantenimiento && (await version()) === 'v4', 'y cuando termina, despliega');

  reiniciarFalla = true;
  commit({ 'backend/src/index.js': SERVIDOR_BUENO('v5') }, 'sin permiso para reiniciar');
  v = await vuelta();
  revisar(head() === conMantenimiento, 'si reiniciar revienta (sin sudo), el clon vuelve atrás en vez de quedar adelantado');
  revisar(v.correos.some((c) => c.includes('no se desplegó')), 'y avisa');
  v = await vuelta();
  revisar(v.correos.length === 0, 'el mismo aviso no se repite en la vuelta siguiente');
  reiniciarFalla = false;
  v = await vuelta();
  revisar((await version()) === 'v5', 'con el permiso arreglado, lo reintenta y despliega');

  fs.writeFileSync(path.join(CLON, 'backend/src/index.js'), SERVIDOR_BUENO('tocado a mano'));
  commit({ 'backend/src/index.js': SERVIDOR_BUENO('v6') }, 'con el clon sucio');
  v = await vuelta();
  revisar(v.reinicios === 0 && v.correos.some((c) => c.includes('no se desplegó')), 'con cambios locales en el clon no pisa nada y avisa');
} finally {
  if (servidor) servidor.kill();
  await new Promise((r) => setTimeout(r, 300));
  fs.rmSync(base, { recursive: true, force: true });
}

console.log(mal ? `\n${mal} MAL` : '\nTODO BIEN');
process.exit(mal ? 1 : 0);
