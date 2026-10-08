/**
 * El click de verdad sobre el ícono de la extensión, con la extensión REAL.
 *
 * QUÉ COMPRUEBA QUE LAS OTRAS NO PUEDEN: las demás pruebas inyectan el panel
 * llamando al service worker, contra una copia del manifest con los permisos
 * pasados a obligatorios. Así el permiso sale de `host_permissions` y nunca de
 * `activeTab`, que es justo lo que usa el camino normal (apretar el ícono sin
 * haber concedido nada). Esto lo cubre, con el manifest tal cual se publica.
 *
 * CÓMO: `Extensions.triggerAction` del protocolo de depuración, que el
 * `puppeteer-core` de la raíz expone como `extension.triggerAction(pagina)`.
 * Pide Chrome for Testing lanzado con `pipe: true` y `enableExtensions: true`
 * (ver extension/README.md, "El ícono sí se puede apretar desde una prueba").
 *
 * Uso, desde extension/:
 *   CHROME=<chrome for testing> node probar-icono.mjs
 *
 * Usa un perfil nuevo en cada corrida, a propósito: un perfil reusado se queda
 * con el service worker viejo y da fallos que no se parecen a la causa.
 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXTENSION, ID } from './pruebas-comun.mjs';

const CHROME = process.env.CHROME;
if (!CHROME || !existsSync(CHROME)) {
  throw new Error('Falta CHROME apuntando a un Chrome for Testing (ver extension/README.md).');
}

let mal = 0;
function revisar(bien, texto) {
  if (!bien) mal += 1;
  console.log(`${bien ? 'ok  ' : 'MAL '} ${texto}`);
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const perfil = mkdtempSync(path.join(os.tmpdir(), 'pochoclo-icono-'));
const navegador = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  pipe: true,
  enableExtensions: true,
  userDataDir: perfil,
  args: ['--no-first-run', '--no-default-browser-check'],
});

/** Si el anfitrión del panel aparece en la página dentro del plazo. */
async function aparecePanel(pagina, ms = 10000) {
  try {
    await pagina.waitForSelector('#pochoclo-panel', { timeout: ms });
    return true;
  } catch {
    return false;
  }
}

/** El texto de la insignia del ícono en la pestaña activa, leído desde el service worker. */
async function insigniaActiva() {
  const destino = await navegador.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().startsWith(`chrome-extension://${ID}/`),
    { timeout: 10000 },
  );
  const trabajador = await destino.worker();
  return trabajador.evaluate(async () => {
    const [pestania] = await chrome.tabs.query({ active: true, currentWindow: true });
    return pestania ? chrome.action.getBadgeText({ tabId: pestania.id }) : null;
  });
}

try {
  const id = await navegador.installExtension(EXTENSION);
  revisar(id === ID, `se instala la extensión real con el ID fijado por el key (${id})`);
  const extension = (await navegador.extensions()).get(id);
  revisar(Boolean(extension), 'puppeteer la ve como extensión instalada');

  // Una pestaña propia, así las pruebas no dependen de la de opciones que se abre al instalar.
  const pagina = await navegador.newPage();

  // --- Un sitio cualquiera, sin ningún permiso concedido -----------------------
  await pagina.goto('https://example.com/', { waitUntil: 'domcontentloaded' });
  await esperar(1500);
  revisar(!(await pagina.$('#pochoclo-panel')), 'recién instalada, entrar a un sitio no dibuja nada');
  await pagina.bringToFront();
  await extension.triggerAction(pagina);
  revisar(await aparecePanel(pagina), 'apretar el ícono dibuja el panel en un sitio cualquiera (activeTab)');

  // --- Una plataforma del catálogo, también sin permiso concedido --------------
  await pagina.goto('https://www.netflix.com/ar/', { waitUntil: 'domcontentloaded' });
  await esperar(2000);
  revisar(!(await pagina.$('#pochoclo-panel')), 'en Netflix, sin la aparición automática, no aparece solo');
  await pagina.bringToFront();
  await extension.triggerAction(pagina);
  revisar(await aparecePanel(pagina), 'apretar el ícono en Netflix dibuja el panel');

  // --- Donde Chrome no deja inyectar: el aviso de la insignia (8.5 del análisis)
  await pagina.goto('chrome://version', { waitUntil: 'domcontentloaded' });
  await pagina.bringToFront();
  await extension.triggerAction(pagina);
  let insignia = '';
  for (let i = 0; i < 20 && insignia !== '!'; i++) {
    await esperar(250);
    insignia = await insigniaActiva();
  }
  revisar(insignia === '!', `en una página de Chrome el click no es mudo: la insignia marca "!" (${JSON.stringify(insignia)})`);
} finally {
  await navegador.close();
  rmSync(perfil, { recursive: true, force: true });
}

console.log(mal ? `\n${mal} MAL` : '\nTODO BIEN');
process.exit(mal ? 1 : 0);
