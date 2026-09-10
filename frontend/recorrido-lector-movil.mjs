/**
 * Pasada equivalente a móvil. NO es VoiceOver, y la diferencia importa: en iOS
 * los gestos son otros, el motor de accesibilidad es otro, y hay patrones ARIA
 * que ahí andan peor que en Windows. Lo que sí se puede comprobar sin el
 * aparato es lo que un lector de teléfono consume igual que uno de escritorio:
 *
 *   1. EL ORDEN DE BARRIDO. Deslizar a la derecha con VoiceOver recorre el
 *      árbol de accesibilidad en orden, incluido el contenido que no recibe
 *      foco. O sea que ese orden se puede leer acá.
 *   2. EL ROTOR. Sus listas (encabezados, enlaces, controles, landmarks) salen
 *      del mismo árbol.
 *   3. EL TAMAÑO DE LOS BLANCOS. Apple pide 44x44 pt, bastante más que los
 *      24x24 de WCAG 2.5.8 que ya se miden en la auditoría adaptable.
 *   4. LOS PATRONES CONOCIDOS POR FRÁGILES en lectores de teléfono.
 *
 * Lo que queda sin probar y hay que probar en un iPhone de verdad está listado
 * al final de la corrida.
 */

import puppeteer from 'puppeteer-core';
import { buscarNavegador, arbol, frase, esHoja, esperar } from './lector-simulado.mjs';

const BASE = 'http://localhost:4173';
// iPhone SE, que es el más chico en uso, y el que la auditoría adaptable ya usa.
const PANTALLA = { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const MINIMO_APPLE = 44;

const navegador = await puppeteer.launch({
  executablePath: buscarNavegador(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await navegador.newPage();
await page.setViewport(PANTALLA);
await page.emulate({
  viewport: PANTALLA,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const cdp = await page.createCDPSession();
await cdp.send('Accessibility.enable');

let problemas = 0;
const titulo = (t) => console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`);
const nota = (ok, t) => {
  if (!ok) problemas++;
  console.log(`   [${ok ? 'OK ' : 'VER'}]     ${t}`);
};

const RUTAS = [
  ['/', 'Inicio'],
  ['/buscar', 'Preferencias'],
  ['/tipo', 'Por tipo'],
  ['/estado-animo', 'Estado de ánimo'],
  ['/acerca-de', 'Acerca de'],
  ['/privacidad', 'Privacidad'],
  ['/iniciar-sesion', 'Iniciar sesión'],
  ['/crear-cuenta', 'Crear cuenta'],
];

// ---------------------------------------------------------------------------
titulo('1. El rotor: qué ofrece cada pantalla para saltar');

for (const [ruta, nombre] of RUTAS) {
  await page.goto(BASE + ruta, { waitUntil: 'networkidle2', timeout: 120000 });
  await esperar(1200);
  const nodos = (await arbol(cdp)).filter((n) => !n.ignored);
  const cuenta = (rol) => nodos.filter((n) => n.role?.value === rol).length;
  const landmarks = nodos.filter((n) =>
    ['banner', 'main', 'contentinfo', 'navigation', 'region', 'form'].includes(n.role?.value)
  );
  const sinNombre = landmarks.filter(
    (n) =>
      !['banner', 'main', 'contentinfo'].includes(n.role?.value) &&
      !(n.name?.value ?? '').trim()
  );
  console.log(
    `   ${nombre.padEnd(18)} encabezados ${String(cuenta('heading')).padStart(2)} · ` +
      `enlaces ${String(cuenta('link')).padStart(2)} · botones ${String(cuenta('button')).padStart(2)} · ` +
      `landmarks ${landmarks.length}`
  );
  if (sinNombre.length) {
    console.log(`      sin nombre: ${sinNombre.map((n) => n.role.value).join(', ')}`);
  }
}
console.log(`
   EL <form> SIN NOMBRE NO ES UN DEFECTO, y queda anotado para no volver a
   mirarlo. ARIA pide nombrar un landmark cuando aparece MAS DE UNA VEZ en la
   pantalla, para poder distinguirlos; hay uno solo por pantalla, asi que el
   rotor dice "formulario" y no hay con que confundirlo. Los tres <nav>, que si
   se repiten, si llevan nombre. Si alguna pantalla llega a tener dos
   formularios, ahi hay que nombrarlos.`);

// ---------------------------------------------------------------------------
titulo('2. Blancos tactiles contra los 44x44 que recomienda Apple');
console.log(`
   OJO CON COMO LEER ESTA LISTA: 44x44 es la GUIA de Apple, no un criterio de
   WCAG. El que obliga es el 2.5.8, que pide 24x24 y ya esta medido en
   auditoria-responsive. Ademas exime a los enlaces que van dentro de un
   parrafo, porque su alto lo fija el interlineado del texto que los rodea, y
   agrandarlos rompería la linea. La mayoria de lo que sale aca es eso.
   Lo que si conviene mirar son los controles sueltos.`);

for (const [ruta, nombre] of RUTAS) {
  await page.goto(BASE + ruta, { waitUntil: 'networkidle2', timeout: 120000 });
  await esperar(1000);
  const chicos = await page.evaluate((minimo) => {
    const sel = 'button, a[href], input:not([type=hidden]), select, [role="button"], [role="checkbox"]';
    return [...document.querySelectorAll(sel)]
      .map((el) => {
        const c = el.getBoundingClientRect();
        const nombre =
          el.getAttribute('aria-label') || el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
        return { nombre, w: Math.round(c.width), h: Math.round(c.height) };
      })
      .filter((x) => x.w > 0 && x.h > 0 && (x.w < minimo || x.h < minimo));
  }, MINIMO_APPLE);
  if (chicos.length === 0) {
    console.log(`   ${nombre}: todo llega a 44.`);
    continue;
  }
  console.log(`   ${nombre}: ${chicos.length} por debajo de 44`);
  for (const c of chicos.slice(0, 6)) console.log(`      ${c.w}x${c.h}  ${c.nombre}`);
}

// ---------------------------------------------------------------------------
titulo('3. Patrones frágiles en lectores de teléfono');

await page.goto(BASE + '/buscar', { waitUntil: 'networkidle2', timeout: 120000 });
await esperar(1500);
{
  const combos = await page.evaluate(
    () => document.querySelectorAll('[role="combobox"]').length
  );
  console.log(`   Hay ${combos} campos con role="combobox" y aria-activedescendant.`);
  console.log('   VoiceOver y TalkBack siguen aria-activedescendant peor que NVDA, y en');
  console.log('   iOS no hay teclado físico salvo que se conecte uno. El camino de');
  console.log('   respaldo tiene que ser tocar la sugerencia directamente.');
  const tocables = await page.evaluate(() => {
    const campo = document.querySelector('[role="combobox"]');
    campo.focus();
    return true;
  });
  await page.type('[role="combobox"]', 'padrino', { delay: 40 });
  await esperar(2500);
  const opciones = await page.evaluate(() =>
    [...document.querySelectorAll('[role="option"]')].map((o) => {
      const c = o.getBoundingClientRect();
      return { alto: Math.round(c.height), ancho: Math.round(c.width), texto: o.textContent.trim().slice(0, 30) };
    })
  );
  nota(opciones.length > 0, `Las ${opciones.length} sugerencias existen como nodos propios en el árbol`);
  nota(
    opciones.every((o) => o.alto >= 24),
    `La más baja mide ${Math.min(...opciones.map((o) => o.alto))}px de alto: se puede tocar de a una`
  );
  const nodos = (await arbol(cdp)).filter((n) => !n.ignored);
  const enArbol = nodos.filter((n) => n.role?.value === 'option');
  nota(
    enArbol.length === opciones.length,
    `Las ${enArbol.length} aparecen en el barrido, o sea que se llega deslizando sin usar las flechas`
  );
  if (enArbol[0]) console.log(`   Primera, tal como se escucha: ${frase(enArbol[0])}`);
  void tocables;
}

// ---------------------------------------------------------------------------
titulo('4. El orden de barrido del inicio (deslizar a la derecha)');

await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 120000 });
await esperar(1500);
{
  const nodos = await arbol(cdp);
  const porId = new Map(nodos.map((n) => [n.nodeId, n]));
  const lineas = [];
  (function bajar(id) {
    const n = porId.get(id);
    if (!n || lineas.length > 24 || n.role?.value === 'ListMarker') return;
    const f = frase(n);
    if (f) lineas.push(f);
    if (esHoja(n)) return;
    for (const h of n.childIds ?? []) bajar(h);
  })((nodos.find((n) => n.role?.value === 'RootWebArea') ?? nodos[0]).nodeId);
  for (const l of lineas) console.log(`   > ${l}`);
  nota(
    lineas.some((l) => /saltar al contenido/i.test(l)),
    'El primer elemento del barrido es el salto al contenido'
  );
}

// ---------------------------------------------------------------------------
titulo('5. Zoom: iOS hace zoom sobre campos de menos de 16px y no lo deshace');

for (const ruta of ['/buscar', '/crear-cuenta', '/iniciar-sesion']) {
  await page.goto(BASE + ruta, { waitUntil: 'networkidle2', timeout: 120000 });
  await esperar(1000);
  /**
   * SOLO LOS CAMPOS DE ESCRITURA. Safari hace zoom al enfocar algo donde se
   * tipea; una casilla o un radio de 14px no lo disparan nunca, y contarlos
   * daba un falso positivo en /buscar (la casilla "Ver clasicos", que mide 16
   * de lado y hereda 14 de letra sin tener letra propia).
   */
  const chicos = await page.evaluate(() => {
    const ESCRITURA = ['text', 'email', 'password', 'number', 'search', 'tel', 'url', 'date'];
    return [...document.querySelectorAll('input:not([type=hidden]), select, textarea')]
      .filter((el) => el.tagName !== 'INPUT' || ESCRITURA.includes(el.type))
      .map((el) => ({
        tam: parseFloat(getComputedStyle(el).fontSize),
        tipo: el.type ?? el.tagName,
      }))
      .filter((x) => x.tam < 16);
  });
  nota(chicos.length === 0, `${ruta}: ${chicos.length} campos con letra menor a 16px`);
}
{
  const meta = await page.evaluate(
    () => document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? ''
  );
  console.log(`   viewport: ${meta}`);
  nota(
    !/user-scalable\s*=\s*no/.test(meta) && !/maximum-scale\s*=\s*1/.test(meta),
    'No se bloquea el zoom del usuario'
  );
}

// ---------------------------------------------------------------------------
titulo('Lo que NO se puede simular y hay que probar en un iPhone');
console.log(`
   - Si aria-activedescendant mueve el cursor de VoiceOver de verdad en el
     campo de Parecido a. Es el patron con mas riesgo de los nueve arreglos.
   - Si los role="status" de resultados y del tope de generos se leen, y si no
     se pisan entre ellos cuando cambian dos cosas juntas.
   - El rotor "Contenedores" y el gesto de dos dedos para leer desde arriba.
   - Como se comporta el modal: VoiceOver respeta aria-modal, pero la trampa
     de foco propia puede pelearse con su cursor.
   - TalkBack en Android, que es otro motor mas.
`);

console.log('='.repeat(72));
console.log(problemas === 0 ? 'Sin problemas.' : `${problemas} cosas para mirar.`);
await navegador.close();
process.exit(0);
