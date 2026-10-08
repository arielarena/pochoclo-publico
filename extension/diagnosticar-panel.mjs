/**
 * Diagnóstico de una sola plataforma, con todo lo que dice la consola.
 *
 * Usa la copia de pruebas y apaga la aparición automática, igual que las otras,
 * así el panel entra por el camino del ícono y una sola vez.
 */
import puppeteer from 'puppeteer-core';
import { apagarAparicionAutomatica, extensionParaPruebas, inyectarPanel } from './pruebas-comun.mjs';
const URL = process.env.SITIO || 'https://www.netflix.com/ar/';
const copia = extensionParaPruebas();
const nav = await puppeteer.launch({
  executablePath: process.env.CHROME, headless: false, userDataDir: process.env.PERFIL_PRUEBA,
  args: [`--disable-extensions-except=${copia.ruta}`,`--load-extension=${copia.ruta}`,'--no-first-run','--no-default-browser-check'],
});
await apagarAparicionAutomatica(nav);
const p = await nav.newPage();
p.on('console', (m) => console.log('[consola]', m.type(), m.text().slice(0, 200)));
p.on('pageerror', (e) => console.log('[error de pagina]', e.message.slice(0, 200)));
await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.bringToFront();
await inyectarPanel(nav);
await new Promise((r) => setTimeout(r, 15000));
console.log('host presente:', await p.evaluate(() => Boolean(document.getElementById('pochoclo-panel'))));
console.log('dataset:', await p.evaluate(() => {
  const h = document.getElementById('pochoclo-panel');
  return h ? h.dataset.resultado || '(vacio)' : '(no hay host)';
}));
const sw = nav.targets().find((t) => t.type() === 'service_worker');
console.log('service worker vivo:', Boolean(sw));
await nav.close();
copia.borrar();
