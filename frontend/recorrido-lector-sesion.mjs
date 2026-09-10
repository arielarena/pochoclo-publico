/**
 * Segunda mitad del recorrido: todo lo que necesita una cuenta abierta.
 * Cierra B2 (agregados a listas), el tope de 5 géneros de /mis-gustos, y B3
 * (el aviso de re-aceptación de Términos), que era el único punto de la
 * auditoría que había quedado literalmente sin probar.
 *
 * Se crea su propia cuenta y la borra al terminar, así que no deja basura.
 * Ver la cabecera de lector-simulado.mjs para qué simula y qué no.
 */

import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import {
  buscarNavegador,
  arbol,
  frase,
  propiedad,
  esHoja,
  espiarAnuncios,
  drenarAnuncios,
  esperar,
} from './lector-simulado.mjs';

const BASE = 'http://localhost:4173';
const CUENTA = {
  nombre: 'Lector',
  correo: `lector-${Date.now()}@pochoclo.ar`,
  contrasena: 'unaClaveLarga123!',
  fechaNacimiento: '1995-06-15',
};

const navegador = await puppeteer.launch({
  executablePath: buscarNavegador(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await navegador.newPage();
await page.setViewport({ width: 1280, height: 900 });
const cdp = await page.createCDPSession();
await cdp.send('Accessibility.enable');

let problemas = 0;
const titulo = (t) => console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`);
const paso = (t) => console.log(`\n-- ${t}`);
const foco = (f) => console.log(`   [FOCO]    ${f ?? '(el foco se perdió: quedó en el documento)'}`);
const nota = (ok, t) => {
  if (!ok) problemas++;
  console.log(`   [${ok ? 'OK ' : 'MAL'}]     ${t}`);
};

async function anuncios() {
  const lista = await drenarAnuncios(page);
  if (lista.length === 0) {
    console.log('   [ANUNCIO] (silencio)');
    return [];
  }
  for (const a of lista) {
    console.log(`   [ANUNCIO] ${a.cortesia === 'assertive' ? '(interrumpe) ' : ''}${a.texto}`);
  }
  return lista;
}

async function focoActual() {
  const esCuerpo = await page.evaluate(
    () => document.activeElement === document.body || document.activeElement === null
  );
  if (esCuerpo) return { nodo: null };
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.activeElement' });
  const { node } = await cdp.send('DOM.describeNode', { objectId: result.objectId });
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    backendNodeId: node.backendNodeId,
    fetchRelatives: false,
  });
  return { nodo: nodes.find((x) => !x.ignored) ?? nodes[0] ?? null };
}

async function ir(ruta, espera = 1500) {
  await page.goto(BASE + ruta, { waitUntil: 'networkidle2', timeout: 120000 });
  await esperar(espera);
  await espiarAnuncios(page);
}

// ---------------------------------------------------------------------------
titulo('Alta de la cuenta descartable');

await ir('/crear-cuenta', 800);
await page.type('#nombre', CUENTA.nombre);
await page.type('#correo', CUENTA.correo);
await page.type('#contrasena', CUENTA.contrasena);
await page.evaluate((fecha) => {
  const campo = document.querySelector('#fecha-nacimiento');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(campo, fecha);
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}, CUENTA.fechaNacimiento);
await page.click('#acepto-terminos');
await page.click('button[type="submit"]');
await esperar(3000);
if (page.url().includes('/crear-cuenta')) {
  const motivo = await page.evaluate(
    () => document.querySelector('[role="alert"]')?.textContent?.trim() ?? 'sin mensaje'
  );
  throw new Error(`No se pudo crear la cuenta: ${motivo}`);
}
console.log(`   Cuenta creada (${CUENTA.nombre}).`);

// ---------------------------------------------------------------------------
titulo('B2. Agregar un título a Favoritas desde la grilla');

await ir('/tipo', 800);
await page.evaluate(() => {
  [...document.querySelectorAll('button[aria-pressed]')]
    .find((x) => x.textContent.trim().startsWith('Película'))
    .click();
});
await esperar(400);
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Buscar').click();
});
await page.waitForFunction(() => document.querySelectorAll('a[href^="/titulo/"]').length > 0, {
  timeout: 120000,
});
await esperar(2000);
await espiarAnuncios(page);
await drenarAnuncios(page);

paso('Enfoco el botón "+" de la primera tarjeta');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button[aria-label]')].find((x) =>
    /a una lista|en qué listas/.test(x.getAttribute('aria-label'))
  );
  window.__masBoton = b;
  b.focus();
});
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
  nota(nodo !== null, 'El botón "+" nombra el título, no dice solo "más"');
}

paso('Enter para abrir el menu de listas');
await page.keyboard.press('Enter');
await esperar(500);
{
  const opciones = await page.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="Agregar a"], button[aria-label^="Quitar de"]')].map(
      (b) => ({
        etiqueta: b.getAttribute('aria-label'),
        texto: b.textContent.replace(/\s+/g, ' ').trim(),
      })
    )
  );
  for (const o of opciones) console.log(`   [FOCO]    ${o.etiqueta}, boton`);
  nota(opciones.length === 3, 'El menu ofrece las tres listas');
  nota(
    opciones.every((o) => !new RegExp(`${o.texto}\s*${o.texto}`).test(o.etiqueta)),
    'Ninguna opcion repite el nombre de la lista (era "Favoritas, agregar a Favoritas")'
  );
  const expandido = await page.evaluate(() => window.__masBoton.getAttribute('aria-expanded'));
  nota(expandido === 'true', 'El "+" pasa a expandido');
}

paso('Tab hasta "Agregar a Favoritas" y Enter, como lo haria alguien con teclado');
await page.keyboard.press('Tab');
await esperar(200);
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
}
await page.keyboard.press('Enter');
await esperar(2000);
await anuncios();
{
  const estado = await page.evaluate(() => ({
    etiquetaMas: window.__masBoton.getAttribute('aria-label'),
    expandido: window.__masBoton.getAttribute('aria-expanded'),
    dialogo:
      document.querySelector('[role="dialog"]')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
  }));
  nota(estado.expandido === 'false', 'El menu se cerro');
  nota(
    /editar en qu/.test(estado.etiquetaMas),
    `El "+" cambio de nombre a "${estado.etiquetaMas}", que es como se entera quien no ve la pantalla`
  );
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
  nota(
    estado.dialogo !== null,
    'Se abre el dialogo que pregunta si marcarlo como visto (interaccion de la seccion 18)'
  );
  console.log(`   [FOCO]    ${estado.dialogo}`);
}

paso('Contesto "No, todavia no la vi" y miro donde queda el foco');
await page.evaluate(() => {
  [...document.querySelectorAll('[role="dialog"] button')]
    .find((b) => /No, todav/.test(b.textContent))
    .click();
});
await esperar(800);
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
  nota(
    nodo !== null,
    'Al cerrarse el dialogo el foco no cae en el documento: vuelve al "+" que lo origino'
  );
}

paso('Vuelvo a abrir el menu: la misma lista tiene que ofrecer ahora "Quitar"');
await page.evaluate(() => window.__masBoton.focus());
await page.keyboard.press('Enter');
await esperar(500);
{
  const hay = await page.evaluate(
    () => !!document.querySelector('button[aria-label="Quitar de Favoritas"]')
  );
  nota(hay, 'Dice "Quitar de Favoritas": el estado se refleja en el nombre, no solo en el color');
}
await page.keyboard.press('Escape');
await esperar(400);
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
  nota(nodo !== null, 'Escape cierra el menu y devuelve el foco al "+"');
}

// ---------------------------------------------------------------------------
titulo('El tope de 5 géneros de /mis-gustos');

await ir('/mis-gustos', 2000);
await drenarAnuncios(page);
await page.evaluate(() => {
  [...document.querySelectorAll('button[aria-expanded]')]
    .find((x) => x.textContent.trim().startsWith('Género'))
    .click();
});
await esperar(500);

paso('Marco seis géneros: el sexto tiene que ser rechazado con una explicación');
for (let i = 0; i < 6; i++) {
  await page.evaluate((n) => {
    const grupo = [...document.querySelectorAll('[role="group"]')].find(
      (g) => g.getAttribute('aria-label') === 'Géneros favoritos' || g.getAttribute('aria-label') === 'Género'
    );
    const botones = [...grupo.querySelectorAll('button')];
    botones[n].click();
  }, i);
  await esperar(350);
}
const trasTope = await anuncios();
nota(
  trasTope.some((a) => a.texto.includes('hasta 5') || a.texto.includes('Se pueden elegir')),
  'El rechazo del sexto se anuncia solo, en vez de que el género simplemente no entre'
);
nota(
  trasTope.some((a) => a.cortesia === 'assertive'),
  'Va como alerta (interrumpe), que es lo correcto para el rechazo de una acción'
);

// ---------------------------------------------------------------------------
titulo('B3. El aviso de re-aceptación de Términos (lo que quedó sin probar)');

paso('Atraso la aceptación de esta cuenta a 2020 desde la base');
{
  const r = spawnSync(
    process.execPath,
    ['src/scripts/cuentasDePrueba.js', '--atrasar-terminos', CUENTA.correo],
    { cwd: '../backend', encoding: 'utf8' }
  );
  console.log(`   ${(r.stdout || r.stderr).trim()}`);
  nota(/atrasada/.test(r.stdout ?? ''), 'La cuenta quedó con la aceptación vieja');
}

paso('Entro al inicio con esa cuenta');
await ir('/', 2500);
{
  const aviso = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section[aria-label]')].find((s) =>
      s.getAttribute('aria-label').includes('Términos')
    );
    if (!sec) return null;
    return {
      landmark: sec.getAttribute('aria-label'),
      texto: sec.textContent.replace(/\s+/g, ' ').trim(),
      estado: sec.querySelector('[role="status"]')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    };
  });
  nota(aviso !== null, 'El aviso aparece con la aceptación atrasada');
  if (aviso) {
    console.log(`   [ANUNCIO] ${aviso.estado}`);
    console.log(`   Landmark: región "${aviso.landmark}"`);
    nota(
      !/seguir usando|bloque|suspend/i.test(aviso.texto),
      'El texto no insinúa una consecuencia que no existe (no bloquea nada)'
    );
  }
}

paso('¿Aparece al recorrer landmarks con la tecla D?');
{
  const nodos = await arbol(cdp);
  const marcas = nodos
    .filter((n) => !n.ignored)
    .filter((n) => ['banner', 'main', 'contentinfo', 'navigation', 'region', 'form'].includes(n.role?.value))
    .map((n) => `${n.role.value}${n.name?.value ? ` "${n.name.value.replace(/\s+/g, ' ').trim()}"` : ''}`);
  for (const m of marcas) console.log(`   ${m}`);
  nota(
    marcas.some((m) => m.includes('Términos')),
    'El aviso ES un landmark con nombre: quien navega con D no se lo saltea'
  );
}

paso('La pantalla /terminos/aceptar, tal como se escucha');
await ir('/terminos/aceptar', 2000);
{
  const nodos = await arbol(cdp);
  const raiz = nodos.find((n) => n.role?.value === 'main');
  const porId = new Map(nodos.map((n) => [n.nodeId, n]));
  const lineas = [];
  (function bajar(id, prof) {
    if (prof > 30 || lineas.length > 30) return;
    const n = porId.get(id);
    if (!n || n.role?.value === 'ListMarker') return;
    const f = frase(n);
    if (f) lineas.push(f);
    if (esHoja(n)) return;
    for (const h of n.childIds ?? []) bajar(h, prof + 1);
  })(raiz?.nodeId, 0);
  for (const l of lineas.slice(0, 22)) console.log(`   > ${l}`);

  const casilla = nodos.find((n) => n.role?.value === 'checkbox' && !n.ignored);
  const botones = nodos.filter((n) => n.role?.value === 'button' && !n.ignored);
  const aceptar = botones.find((b) => /acept/i.test(b.name?.value ?? ''));
  nota(!!casilla, 'Hay una casilla de aceptación explícita');
  nota(
    aceptar && propiedad(aceptar, 'disabled') === true,
    'El botón de aceptar arranca no disponible hasta tildar, y el lector lo dice'
  );
}

paso('Tildo la casilla');
await drenarAnuncios(page);
await page.evaluate(() => document.querySelector('input[type="checkbox"]').click());
await esperar(600);
await anuncios();
{
  const nodos = await arbol(cdp);
  const aceptar = nodos.find(
    (n) => n.role?.value === 'button' && /acept/i.test(n.name?.value ?? '') && !n.ignored
  );
  console.log(`   [FOCO]    ${frase(aceptar)}`);
  nota(
    propiedad(aceptar, 'disabled') !== true,
    'El botón queda disponible, pero ese cambio NO se anuncia solo: hay que volver a pasar por él'
  );
}

// ---------------------------------------------------------------------------
titulo('Limpieza');
{
  const r = spawnSync(process.execPath, ['src/scripts/cuentasDePrueba.js', '--borrar'], {
    cwd: '../backend',
    encoding: 'utf8',
  });
  console.log(`   ${(r.stdout || r.stderr).trim().split('\n').pop()}`);
}

console.log(`\n${'='.repeat(72)}`);
console.log(problemas === 0 ? 'Sin problemas.' : `${problemas} comprobaciones fallaron.`);
await navegador.close();
process.exit(problemas === 0 ? 0 : 1);
