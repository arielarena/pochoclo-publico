/**
 * Despliegue automático del backend en la notebook.
 *
 *   node src/scripts/desplegar.js              lo que hace el timer cada 5 minutos
 *   node src/scripts/desplegar.js --simulacro  dice qué haría, sin tocar nada
 *
 * POR QUÉ EXISTE: un push a main publica el frontend solo (Cloudflare Pages lo
 * ve y reconstruye), pero el backend se quedaba con el código viejo hasta que
 * alguien entraba por SSH a hacer el pull. El modo de fallo era silencioso y
 * engañoso: el sitio seguía andando, con un frontend nuevo hablándole a un
 * backend viejo, y el síntoma se parecía a un caché sin limpiar. Con esto las
 * dos mitades se actualizan solas y a la par.
 *
 * QUÉ HACE, EN ORDEN:
 *  1. `git fetch`. Si origin/main es lo que ya está desplegado, termina.
 *  2. Se niega a seguir si el clon no está en main, si tiene cambios locales,
 *     o si el mantenimiento está corriendo (el pull le cambiaría los scripts a
 *     mitad de camino). Avisa una vez por commit y sale.
 *  3. Avanza con `git merge --ff-only`, nunca con un merge de verdad.
 *  4. Si cambió backend/package-lock.json (o package.json), `npm install`.
 *  5. Si cambió algo de backend/ o de comun/, reinicia pochoclo.service y
 *     espera a que /salud conteste y el servicio SIGA activo unos segundos
 *     después (un arranque que muere por una guarda contesta /salud nunca, y
 *     uno que muere enseguida se ve en el segundo chequeo).
 *     Si solo cambió el frontend o la documentación, no reinicia nada.
 *  6. Si el arranque falla, VUELVE al commit anterior, reinstala si hacía
 *     falta, reinicia, y avisa por correo. Ese commit queda anotado como
 *     rechazado y no se reintenta hasta que llegue uno nuevo.
 *
 * AVISA POR CORREO en los dos casos, éxito y fallo, a la misma casilla que la
 * vigilancia (`direccionDeAvisos()`). Un despliegue es un evento que conviene
 * ver, y son pocos por semana. El módulo de correo se importa recién al final,
 * a propósito: si el commit nuevo lo rompió, después de volver atrás se carga
 * la versión vieja, que anda.
 *
 * PERMISOS: corre con el mismo usuario que el mantenimiento. Reiniciar el
 * servicio pide root, así que hace falta UNA regla de sudo para ese comando
 * exacto y nada más.
 *
 * El estado vive en CARPETA_RESPALDOS (o backend/respaldos), junto al de la
 * vigilancia y el mantenimiento.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * DESPLIEGUE_REPO existe solo para la prueba (probarDesplegar.js), que lo
 * apunta a un clon de mentira. En la notebook no se define.
 */
const RAIZ_REPO = process.env.DESPLIEGUE_REPO
  ? path.resolve(process.env.DESPLIEGUE_REPO)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CARPETA_BACKEND = path.join(RAIZ_REPO, 'backend');
const CARPETA_ESTADO = process.env.CARPETA_RESPALDOS
  ? path.resolve(process.env.CARPETA_RESPALDOS)
  : path.join(CARPETA_BACKEND, 'respaldos');
const ESTADO = path.join(CARPETA_ESTADO, 'estado-despliegue.json');
const RAMA = 'main';
const SERVICIO = 'pochoclo.service';
const SIMULACRO = process.argv.includes('--simulacro');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (...args) => execFileSync('git', ['-C', RAIZ_REPO, ...args], { encoding: 'utf8' }).trim();
const corto = (sha) => sha.slice(0, 7);

function leerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  } catch {
    return {};
  }
}

function guardarEstado(estado) {
  fs.mkdirSync(CARPETA_ESTADO, { recursive: true });
  const temporal = `${ESTADO}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(estado, null, 2));
  fs.renameSync(temporal, ESTADO);
}

function salud() {
  const PUERTO = Number(process.env.PORT || 3000);
  return new Promise((resolver) => {
    const pedido = http.get({ host: 'localhost', port: PUERTO, path: '/salud', agent: false, timeout: 2000 }, (r) => {
      r.resume();
      resolver(r.statusCode === 200);
    });
    pedido.on('timeout', () => pedido.destroy());
    pedido.on('error', () => resolver(false));
  });
}

/** Los plazos del chequeo de arranque. La prueba los acorta. */
export const tiempos = { intentosSalud: 60, pausaMs: 1000, estabilidadMs: 10000 };

/** /salud contesta dentro de 60 s, y el servicio sigue activo 10 s después. */
async function arrancoBien() {
  let contesto = false;
  for (let i = 0; i < tiempos.intentosSalud && !contesto; i++) {
    await esperar(tiempos.pausaMs);
    contesto = await salud();
  }
  if (!contesto) return false;
  await esperar(tiempos.estabilidadMs);
  return sistema.estadoDe(SERVICIO) === 'active' && (await salud());
}

/**
 * Todo lo que toca el sistema de afuera del repo. Es un objeto y no funciones
 * sueltas para que probarDesplegar.js lo reemplace por un servidor de mentira:
 * sin eso, la vuelta atrás (lo más importante de este script) no se podría
 * ejercitar hasta el día de una falla real.
 */
export const sistema = {
  estadoDe(unidad) {
    try {
      return execFileSync('systemctl', ['is-active', unidad], { encoding: 'utf8' }).trim();
    } catch (err) {
      // is-active sale con código distinto de cero cuando no está activo; igual imprime el estado.
      return String(err.stdout ?? '').trim() || 'desconocido';
    }
  },

  reiniciar() {
    execFileSync('sudo', ['-n', '/usr/bin/systemctl', 'restart', SERVICIO], { stdio: 'inherit' });
  },

  instalarDependencias() {
    execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: CARPETA_BACKEND, stdio: 'inherit' });
  },

  diario() {
    try {
      return execFileSync('journalctl', ['-u', SERVICIO, '-n', '30', '--no-pager'], { encoding: 'utf8' });
    } catch {
      return '(no se pudo leer el diario del servicio)';
    }
  },

  async avisar(asunto, lineas) {
    try {
      const { HAY_CORREO_CONFIGURADO, direccionDeAvisos, enviarAvisoVigilancia } = await import('../auth/correo.js');
      const para = direccionDeAvisos();
      if (!HAY_CORREO_CONFIGURADO || !para) {
        console.log('Sin SMTP o sin dirección de avisos: no se manda correo.');
        return;
      }
      await enviarAvisoVigilancia({ para, asunto, texto: lineas.join('\n') });
    } catch (err) {
      console.error(`No se pudo mandar el aviso: ${err.message}`);
    }
  },
};

export async function main() {
  const estado = leerEstado();

  git('fetch', '--quiet', 'origin', RAMA);
  const actual = git('rev-parse', 'HEAD');
  const remoto = git('rev-parse', `origin/${RAMA}`);
  if (actual === remoto) return;
  if (estado.rechazado === remoto) return; // ya se intentó y se volvió atrás; espera un commit nuevo

  // Una negativa se avisa una sola vez por commit, para no mandar un correo cada 5 minutos.
  const negarse = async (motivo) => {
    console.log(`No despliego ${corto(remoto)}: ${motivo}`);
    if (SIMULACRO || estado.avisadoSinDesplegar === remoto) return;
    guardarEstado({ ...estado, avisadoSinDesplegar: remoto });
    await sistema.avisar(`Pochoclo: el commit ${corto(remoto)} no se desplegó`, [
      `Hay un commit nuevo en ${RAMA} (${corto(remoto)}) y el despliegue automático no lo aplicó.`,
      `Motivo: ${motivo}`,
      '',
      'Hay que entrar por SSH y resolverlo a mano.',
    ]);
  };

  const rama = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (rama !== RAMA) return negarse(`el clon está en la rama "${rama}" y no en ${RAMA}.`);
  if (git('status', '--porcelain', '--untracked-files=no')) {
    return negarse('el clon tiene cambios locales sin commitear, y el pull los pisaría o fallaría.');
  }
  try {
    git('merge-base', '--is-ancestor', actual, remoto);
  } catch {
    return negarse(`${RAMA} no es un avance directo del commit desplegado (¿se reescribió la historia?).`);
  }
  const mantenimiento = sistema.estadoDe('pochoclo-mantenimiento.service');
  if (mantenimiento === 'active' || mantenimiento === 'activating') {
    console.log('El mantenimiento está corriendo; el despliegue espera a la próxima vuelta.');
    return;
  }

  const cambiados = git('diff', '--name-only', actual, remoto).split('\n').filter(Boolean);
  const tocaBackend = cambiados.some((f) => f.startsWith('backend/') || f.startsWith('comun/'));
  const tocaDependencias = cambiados.some((f) => f === 'backend/package.json' || f === 'backend/package-lock.json');
  const commits = git('log', '--format=%h %s', `${actual}..${remoto}`);

  console.log(`Nuevo en ${RAMA}: ${corto(actual)} -> ${corto(remoto)}, ${cambiados.length} archivo(s).`);
  console.log(tocaBackend ? 'Toca backend/ o comun/: hay que reiniciar.' : 'No toca el backend: solo se avanza el clon.');
  if (SIMULACRO) {
    console.log(`Simulacro. Instalaría dependencias: ${tocaDependencias ? 'sí' : 'no'}.\n${commits}`);
    return;
  }

  git('merge', '--ff-only', '--quiet', remoto);
  if (!tocaBackend) {
    guardarEstado({ ...estado, desplegado: remoto, ultimaVez: new Date().toISOString() });
    return;
  }

  /**
   * Si instalar o reiniciar revienta (falta la regla de sudo, npm sin red), NO
   * se puede dejar el clon avanzado: la vuelta siguiente vería que ya está al
   * día y el backend quedaría con el código viejo para siempre, sin que nadie se
   * entere. Se vuelve atrás y se avisa, y el próximo intento lo reintenta.
   */
  try {
    if (tocaDependencias) sistema.instalarDependencias();
    sistema.reiniciar();
  } catch (err) {
    git('reset', '--hard', '--quiet', actual);
    const primeraLinea = err.message.split('\n')[0];
    return negarse(
      `falló al instalar o reiniciar (${primeraLinea}). El clon volvió a ${corto(actual)} ` +
        'y el servicio no se tocó o quedó con el código anterior.'
    );
  }

  if (await arrancoBien()) {
    guardarEstado({ ...estado, desplegado: remoto, rechazado: null, ultimaVez: new Date().toISOString() });
    console.log(`Desplegado ${corto(remoto)}.`);
    await sistema.avisar(`Pochoclo: backend desplegado (${corto(remoto)})`, [
      `El backend de la notebook quedó en ${corto(remoto)} y /salud contesta.`,
      '',
      commits,
    ]);
    return;
  }

  // El commit nuevo no arrancó: volver al anterior.
  const log = sistema.diario();
  console.error(`El backend no arrancó con ${corto(remoto)}. Vuelvo a ${corto(actual)}.`);
  git('reset', '--hard', '--quiet', actual);
  if (tocaDependencias) sistema.instalarDependencias();
  sistema.reiniciar();
  const volvio = await arrancoBien();
  guardarEstado({ ...estado, desplegado: actual, rechazado: remoto, ultimaVez: new Date().toISOString() });
  process.exitCode = 1;
  await sistema.avisar(`Pochoclo: el despliegue de ${corto(remoto)} falló y ${volvio ? 'se volvió atrás' : 'EL BACKEND NO LEVANTA'}`, [
    `El backend no arrancó con ${corto(remoto)}, así que el clon volvió a ${corto(actual)}.`,
    volvio
      ? 'Con el commit anterior arranca bien: el sitio sigue andando con el código viejo.'
      : 'CON EL COMMIT ANTERIOR TAMPOCO ARRANCA. El sitio está caído: hay que entrar por SSH.',
    `No se va a reintentar ${corto(remoto)}; el próximo commit en ${RAMA} sí se intenta.`,
    '',
    'Commits que no se aplicaron:',
    commits,
    '',
    'Últimas líneas del servicio:',
    log,
  ]);
}

// Corre solo si se lo llama directo; la prueba lo importa y llama a main() ella.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.stack ?? err.message);
    process.exitCode = 1;
  });
}
