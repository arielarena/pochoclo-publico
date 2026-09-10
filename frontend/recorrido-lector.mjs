/**
 * Rehace los recorridos A y B de la auditoría manual sobre los arreglos
 * del 2026-08-26, usando el árbol de accesibilidad real de Chrome en vez de un
 * lector de pantalla. Ver la cabecera de lector-simulado.mjs para qué cubre y
 * qué no.
 *
 * Imprime, para cada paso, tres cosas:
 *   [FOCO]    lo que diría el lector al recibir el foco ese elemento
 *   [ANUNCIO] lo que dice una región viva (role=status, aria-live)
 *   [NOTA]    una comprobación estructural, con su veredicto
 *
 * Uso: con el backend en 3000 y `npm run preview` en 4173,
 *      node recorrido-lector.mjs
 */

import puppeteer from 'puppeteer-core';
import {
  buscarNavegador,
  arbol,
  frase,
  nodoEnfocado,
  propiedad,
  espiarAnuncios,
  drenarAnuncios,
  transcripcionExploracion,
  esperar,
} from './lector-simulado.mjs';

const BASE = 'http://localhost:4173';
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

async function anuncios(etiqueta = '') {
  const lista = await drenarAnuncios(page);
  if (lista.length === 0) {
    console.log(`   [ANUNCIO] (silencio)${etiqueta ? ' ' + etiqueta : ''}`);
    return [];
  }
  for (const a of lista) {
    console.log(`   [ANUNCIO] ${a.cortesia === 'assertive' ? '(interrumpe) ' : ''}${a.texto}`);
  }
  return lista;
}

/**
 * El foco hay que pedirlo por el nodo concreto: en headless el arbol completo
 * reporta `focused` en la raiz del documento y no en el elemento, asi que
 * buscarlo ahi devuelve siempre "documento".
 */
async function focoActual() {
  /**
   * Todo por la MISMA sesion de CDP: un objectId sacado con page.evaluateHandle
   * pertenece a la sesion de puppeteer y esta no lo conoce.
   */
  const esCuerpo = await page.evaluate(
    () => document.activeElement === document.body || document.activeElement === null
  );
  if (esCuerpo) return { nodo: null, texto: null };
  const { result } = await cdp.send('Runtime.evaluate', {
    expression: 'document.activeElement',
  });
  const { node } = await cdp.send('DOM.describeNode', { objectId: result.objectId });
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    backendNodeId: node.backendNodeId,
    fetchRelatives: false,
  });
  const n = nodes.find((x) => !x.ignored) ?? nodes[0] ?? null;
  return { nodo: n, texto: n ? frase(n) : null };
}

async function ir(ruta, espera = 1500) {
  await page.goto(BASE + ruta, { waitUntil: 'networkidle2', timeout: 120000 });
  await esperar(espera);
  await espiarAnuncios(page);
}

// ---------------------------------------------------------------------------
titulo('A1. Autocompletado: el campo "Parecido a" de /buscar');

await ir('/buscar');

paso('Escribo "padrino" en Parecido a y espero el debounce de 350 ms');
await page.click('#autocompletado-parecido-a');
await page.type('#autocompletado-parecido-a', 'padrino', { delay: 40 });
await esperar(2500);
await anuncios();

{
  const est = await page.evaluate(() => {
    const campo = document.querySelector('#autocompletado-parecido-a');
    const lista = document.querySelector('[role="listbox"]');
    return {
      rol: campo.getAttribute('role'),
      expandido: campo.getAttribute('aria-expanded'),
      controla: campo.getAttribute('aria-controls'),
      idLista: lista?.id ?? null,
      opciones: document.querySelectorAll('[role="option"]').length,
      activo: campo.getAttribute('aria-activedescendant'),
    };
  });
  nota(est.rol === 'combobox' && est.expandido === 'true', `Se anuncia como cuadro combinado expandido`);
  nota(est.controla && est.controla === est.idLista, `aria-controls apunta al listbox (${est.controla})`);
  nota(est.opciones > 0, `Hay ${est.opciones} opciones con role=option`);
  nota(est.activo === null, 'Todavía no hay ninguna opción activa, que es lo correcto antes de tocar las flechas');
}

paso('Flecha abajo (la tecla que la auditoría reportó como muerta)');
await page.keyboard.press('ArrowDown');
await esperar(250);
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
  const activo = await page.evaluate(() => {
    const campo = document.querySelector('#autocompletado-parecido-a');
    const id = campo.getAttribute('aria-activedescendant');
    const op = id ? document.getElementById(id) : null;
    return { id, texto: op?.textContent?.trim() ?? null, seleccionado: op?.getAttribute('aria-selected') };
  });
  nota(!!activo.id, `La flecha mueve la opción activa: ${activo.id}`);
  nota(activo.seleccionado === 'true', `El lector lee: "${activo.texto}, opción, seleccionado"`);
  nota(
    (await page.evaluate(() => document.activeElement.id)) === 'autocompletado-parecido-a',
    'El foco real no se movió del campo, que es lo que pide el patrón combobox'
  );
}

paso('Tres flechas abajo más y una arriba, para ver que recorre de verdad');
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('ArrowDown');
  await esperar(120);
}
await page.keyboard.press('ArrowUp');
await esperar(200);
{
  const t = await page.evaluate(() => {
    const id = document.querySelector('#autocompletado-parecido-a').getAttribute('aria-activedescendant');
    const op = document.getElementById(id);
    const todas = [...document.querySelectorAll('[role="option"]')];
    return { texto: op?.textContent?.trim(), posicion: todas.indexOf(op) + 1, total: todas.length };
  });
  console.log(`   [FOCO]    ${t.texto}, opción, seleccionado, ${t.posicion} de ${t.total}`);
  nota(t.posicion === 3, `Cuatro flechas abajo y una arriba dejan en la 3.a (quedo en la ${t.posicion})`);
}

paso('Fin y luego Inicio');
await page.keyboard.press('End');
await esperar(150);
const enFin = await page.evaluate(() => {
  const todas = [...document.querySelectorAll('[role="option"]')];
  const id = document.querySelector('#autocompletado-parecido-a').getAttribute('aria-activedescendant');
  return todas.indexOf(document.getElementById(id)) + 1;
});
await page.keyboard.press('Home');
await esperar(150);
const enInicio = await page.evaluate(() => {
  const todas = [...document.querySelectorAll('[role="option"]')];
  const id = document.querySelector('#autocompletado-parecido-a').getAttribute('aria-activedescendant');
  return todas.indexOf(document.getElementById(id)) + 1;
});
nota(enFin > 1 && enInicio === 1, `Fin va a la ${enFin} e Inicio vuelve a la ${enInicio}`);

paso('Enter para elegir la opción activa');
const elegida = await page.evaluate(() => {
  const id = document.querySelector('#autocompletado-parecido-a').getAttribute('aria-activedescendant');
  return document.getElementById(id)?.textContent?.trim();
});
await page.keyboard.press('Enter');
await esperar(600);
await anuncios();
{
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="Quitar"]')].map((b) => b.getAttribute('aria-label'))
  );
  nota(chips.length === 1, `Quedó un chip: ${chips[0]}`);
  nota(
    chips[0].startsWith('Quitar ') && chips[0].length > 'Quitar '.length + 3,
    `El boton de quitar nombra el titulo, no dice "x" (opcion elegida: ${elegida})`
  );
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
}

paso('Escape con la lista abierta');
await page.click('#autocompletado-parecido-a');
await page.type('#autocompletado-parecido-a', 'matrix', { delay: 40 });
await esperar(2200);
await page.keyboard.press('Escape');
await esperar(250);
nota(
  (await page.evaluate(() => document.querySelector('#autocompletado-parecido-a').getAttribute('aria-expanded'))) === 'false',
  'Escape contrae el cuadro combinado'
);
await anuncios();

paso('Quito el chip con Enter, que es donde se perdía el foco');
await page.evaluate(() => document.querySelector('#autocompletado-parecido-a').value && (document.querySelector('#autocompletado-parecido-a').value = ''));
await page.click('button[aria-label^="Quitar"]');
await esperar(400);
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
  nota(
    nodo !== null && frase(nodo) !== null,
    'Al quedar sin chips el foco no cae en el documento'
  );
}

paso('Aviso de "No encontramos a ...": escribo algo inexistente en Actor y salgo');
await page.click('#autocompletado-actor-actriz');
await page.type('#autocompletado-actor-actriz', 'asdfasdfqwer', { delay: 30 });
await esperar(2500);
await drenarAnuncios(page);
await page.keyboard.press('Tab');
await esperar(500);
const avisoFallido = await anuncios();
nota(
  avisoFallido.some((a) => a.texto.includes('No encontramos')),
  'El aviso de intento fallido se anuncia solo, sin tener que ir a buscarlo'
);

// ---------------------------------------------------------------------------
titulo('A2. SelectorLista: el campo "Género" y el caso raro de "Ver clásicos"');

await ir('/buscar');

paso('Abro el desplegable de Genero, que es donde vive el grupo de opciones');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button[aria-expanded]')].find((x) =>
    x.textContent.trim().startsWith('Genero') || x.textContent.trim().startsWith('Género')
  );
  window.__toggleGenero = b;
  b.click();
});
await esperar(400);
{
  await page.evaluate(() => window.__toggleGenero.focus());
  const { nodo: nToggle } = await focoActual();
  foco(nToggle ? frase(nToggle) : null);
  const b = await page.evaluate(() => ({
    expandido: window.__toggleGenero.getAttribute('aria-expanded'),
    controla: window.__toggleGenero.getAttribute('aria-controls'),
  }));
  nota(b.expandido === 'true', 'El boton de Mostrar/Ocultar anuncia su estado');
  nota(!b.controla, 'NO tiene aria-controls: el lector no puede saltar a lo que abre (era una sospecha de la auditoria)');
}

paso('Marco Comedia en la lista de Genero');
await page.evaluate(() => {
  const grupo = [...document.querySelectorAll('[role="group"]')].find(
    (g) => g.getAttribute('aria-label') === 'Género'
  );
  const boton = [...grupo.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Comedia');
  boton.focus();
});
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
}
await page.keyboard.press('Enter');
await esperar(400);
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
  nota(
    nodo && propiedad(nodo, 'pressed') === 'true',
    'Al marcarla, el mismo botón pasa a "presionado" y eso se anuncia solo'
  );
}
await anuncios('(el chip aparece arriba)');

paso('Tildo "Ver clásicos", que agrega un chip que NO existe como fila');
await page.evaluate(() => {
  const et = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === 'Ver clásicos');
  et.querySelector('input').click();
});
await esperar(400);
{
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="Quitar"]')].map((b) => b.getAttribute('aria-label'))
  );
  nota(chips.includes('Quitar Clásicos'), `Chips presentes: ${chips.join(' / ')}`);
}

paso('Quito el chip "Clásicos" desde el chip, no desde la casilla');
await page.evaluate(() =>
  document.querySelector('button[aria-label="Quitar Clásicos"]').focus()
);
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
}
await page.keyboard.press('Enter');
await esperar(400);
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
  nota(
    nodo !== null,
    'El foco no se pierde: éste era el defecto que hacía escuchar "documento... Ver clásicos"'
  );
  const marcada = await page.evaluate(() => {
    const et = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === 'Ver clásicos');
    return et.querySelector('input').checked;
  });
  nota(marcada === false, 'La casilla "Ver clásicos" se destildó sola');
}

paso('Quito el último chip (Comedia): no queda ninguno');
await page.evaluate(() => document.querySelector('button[aria-label="Quitar Comedia"]').focus());
await page.keyboard.press('Enter');
await esperar(400);
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
  nota(nodo !== null, 'Con la lista de chips vacía el foco va a un control usable, no al documento');
}

paso('El tope de 5 géneros de /mis-gustos no se puede probar sin sesión: se hace más abajo');

// ---------------------------------------------------------------------------
titulo('A3. ModalTipoBusqueda: trampa de foco y devolución');

await ir('/');

paso('Entro a "Con preferencias" con el teclado');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    x.textContent.includes('Con preferencias')
  );
  b.focus();
  window.__abridor = b;
});
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
}
await page.keyboard.press('Enter');
await esperar(500);
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
  nota(nodo !== null, 'Al abrirse, el foco entra al diálogo');
}

paso('Ocho Tab seguidos: ¿se sale del modal?');
const dentro = [];
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Tab');
  await esperar(90);
  dentro.push(
    await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return dlg ? dlg.contains(document.activeElement) : false;
    })
  );
}
nota(dentro.every(Boolean), `Los 8 Tab quedaron dentro del diálogo (${dentro.filter(Boolean).length}/8)`);

paso('Cuatro Shift+Tab, que es por donde se escapaba para atrás');
const atras = [];
for (let i = 0; i < 4; i++) {
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  await esperar(90);
  atras.push(
    await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement))
  );
}
nota(atras.every(Boolean), `Los 4 Shift+Tab quedaron dentro (${atras.filter(Boolean).length}/4)`);

paso('Escape: ¿dónde queda el foco?');
await page.keyboard.press('Escape');
await esperar(400);
{
  const { nodo } = await focoActual();
  foco(nodo ? frase(nodo) : null);
  const volvio = await page.evaluate(() => document.activeElement === window.__abridor);
  nota(volvio, 'El foco vuelve exactamente al botón que abrió el modal');
}

// ---------------------------------------------------------------------------
titulo('B1. La pantalla de resultados: el hallazgo más grave de la auditoría');

paso('Búsqueda por tipo Película (es la más rápida de las cinco opciones)');
await ir('/tipo', 800);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) =>
    x.textContent.trim().startsWith('Película')
  );
  b.click();
});
await esperar(400);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Buscar');
  b.click();
});
/**
 * La espia se pone apenas cambia la ruta y ANTES de que lleguen los datos, que
 * es la unica forma de capturar el anuncio de llegada.
 */
await page.waitForFunction(() => location.pathname === '/resultados', { timeout: 30000 });
await espiarAnuncios(page);
await page.waitForFunction(() => document.querySelectorAll('a[href^="/titulo/"]').length > 0, {
  timeout: 120000,
});
await esperar(1500);
paso('Llegan los resultados: esto es lo que se escucha sin haber tocado nada');
await anuncios();

const total = await page.evaluate(() => document.querySelectorAll('a[href^="/titulo/"]').length);
console.log(`   Llegaron ${total} resultados.`);

paso('Región viva: ¿existe y qué dice ahora mismo?');
{
  const vivas = await page.evaluate(() =>
    [...document.querySelectorAll('[role="status"], [aria-live]')].map((e) => ({
      rol: e.getAttribute('role'),
      vivo: e.getAttribute('aria-live'),
      texto: e.textContent.replace(/\s+/g, ' ').trim(),
      oculta: e.className.includes('solo-lector'),
    }))
  );
  for (const v of vivas) console.log(`   [ANUNCIO] (estado actual) ${v.texto}`);
  nota(vivas.length > 0, `Hay ${vivas.length} región(es) viva(s) en la pantalla de resultados`);
  nota(
    vivas.some((v) => /\d/.test(v.texto)),
    'El texto incluye el número de resultados'
  );
}

paso('Abro Filtros y pongo Puntuación mínima en 9');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Filtros'));
  b.click();
});
await esperar(600);
await drenarAnuncios(page);
await page.evaluate(() => {
  const campos = [...document.querySelectorAll('input[type="number"]')];
  const campo = campos.find((c) => (c.labels?.[0]?.textContent ?? '').includes('Puntuación')) ?? campos[0];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(campo, '9');
  campo.dispatchEvent(new Event('input', { bubbles: true }));
});
await esperar(1400);
const trasFiltro = await anuncios();
nota(trasFiltro.length > 0, 'Filtrar anuncia el cambio, que era el silencio más grave');

paso('Cambio el orden');
await drenarAnuncios(page);
await page.evaluate(() => {
  const sel = document.querySelector('select');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, sel.options[sel.selectedIndex === 0 ? 1 : 0].value);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await esperar(1400);
const trasOrden = await anuncios();
nota(
  trasOrden.length > 0,
  'Reordenar también anuncia, aunque el número de resultados no cambie (por eso el anuncio nombra el orden)'
);

// ---------------------------------------------------------------------------
titulo('B4. Los botones de Priorizar y su renumeración');

await ir('/buscar');
await page.evaluate(() => {
  [...document.querySelectorAll('button[aria-expanded]')]
    .find((x) => x.textContent.trim().startsWith('Género'))
    .click();
});
await esperar(400);
await page.evaluate(() => {
  const grupo = [...document.querySelectorAll('[role="group"]')].find(
    (g) => g.getAttribute('aria-label') === 'Género'
  );
  [...grupo.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Comedia').click();
});
await esperar(300);
await page.type('#autocompletado-parecido-a', 'padrino', { delay: 30 });
await esperar(2400);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await esperar(600);

paso('Marco dos prioridades y leo sus nombres accesibles');
const leerPrioridades = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="checkbox"]')]
      .filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('Priorizar'))
      .map((b) => ({ etiqueta: b.getAttribute('aria-label'), marcado: b.getAttribute('aria-checked') }))
  );
/**
 * Hay que esperar el re-render entre cada click: leer aria-checked en el mismo
 * evaluate devuelve el valor viejo.
 */
for (const i of [0, 1]) {
  await page.evaluate((n) => {
    [...document.querySelectorAll('[role="checkbox"]')]
      .filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('Priorizar'))[n]
      .click();
  }, i);
  await esperar(400);
}
const prioridades = await leerPrioridades();
for (const p of prioridades.filter((p) => p.marcado === 'true')) {
  console.log(`   [FOCO]    ${p.etiqueta}, casilla, marcada`);
}
nota(
  prioridades.filter((p) => p.marcado === 'true').length === 2,
  'Las prioridades marcadas llevan la categoria y el numero en el nombre'
);
for (const p of prioridades.filter((p) => p.marcado !== 'true').slice(0, 2)) {
  console.log(`   [FOCO]    ${p.etiqueta}, casilla, sin marcar`);
}

paso('Desmarco la PRIMERA: la otra tiene que renumerarse de 2 a 1');
await page.evaluate(() => {
  [...document.querySelectorAll('[role="checkbox"]')]
    .filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('Priorizar'))
    .find((b) => b.getAttribute('aria-checked') === 'true')
    .click();
});
await esperar(500);
const despues = (await leerPrioridades()).filter((p) => p.marcado === 'true');
for (const p of despues) console.log(`   [FOCO]    ${p.etiqueta}, casilla, marcada`);
nota(
  despues.length === 1 && despues[0].etiqueta.endsWith('prioridad 1'),
  'La que quedaba se renumero sola a 1'
);
console.log('   [NOTA]    El cambio ocurre en el NOMBRE de un elemento que no tiene el foco,');
console.log('             asi que ningun lector lo anuncia. Es lo que la auditoria preveia.');

// ---------------------------------------------------------------------------
titulo('Recorrido C: la estructura de encabezados de las pantallas públicas');

for (const [ruta, nombre] of [
  ['/', 'Inicio'],
  ['/buscar', 'Preferencias'],
  ['/acerca-de', 'Acerca de'],
  ['/privacidad', 'Privacidad'],
  ['/accesibilidad', 'Accesibilidad'],
]) {
  await ir(ruta, 900);
  const nodos = await arbol(cdp);
  const enc = nodos
    .filter((n) => n.role?.value === 'heading' && !n.ignored)
    .map((n) => {
      const nivel = propiedad(n, 'level');
      return `${'  '.repeat(Math.max(0, nivel - 1))}h${nivel} ${(n.name?.value ?? '').replace(/\s+/g, ' ').trim()}`;
    });
  console.log(`\n-- ${nombre} (${ruta}): ${enc.length} encabezados`);
  for (const e of enc.slice(0, 14)) console.log(`   ${e}`);
  const niveles = nodos
    .filter((n) => n.role?.value === 'heading' && !n.ignored)
    .map((n) => propiedad(n, 'level'));
  const salta = niveles.some((n, i) => i > 0 && n - niveles[i - 1] > 1);
  nota(niveles[0] === 1 && !salta, `Arranca en h1 y no saltea niveles`);
}

paso('Los landmarks del inicio, que es lo que recorre la tecla D');
await ir('/', 900);
{
  const nodos = await arbol(cdp);
  const marcas = nodos
    .filter((n) =>
      ['banner', 'main', 'contentinfo', 'navigation', 'region', 'form', 'search'].includes(
        n.role?.value
      )
    )
    .filter((n) => !n.ignored)
    .map((n) => `${n.role.value}${n.name?.value ? ` "${n.name.value.replace(/\s+/g, ' ').trim()}"` : ''}`);
  for (const m of marcas) console.log(`   ${m}`);
  nota(
    marcas.some((m) => m.startsWith('main')) && marcas.some((m) => m.startsWith('banner')),
    `${marcas.length} landmarks`
  );
}

paso('Primeras 12 líneas del modo exploración del inicio, tal como se escuchan');
{
  const nodos = await arbol(cdp);
  for (const l of transcripcionExploracion(nodos).slice(0, 12)) console.log(`   > ${l}`);
}

console.log(`\n${'='.repeat(72)}`);
console.log(problemas === 0 ? 'Sin problemas.' : `${problemas} comprobaciones fallaron.`);
await navegador.close();
process.exit(problemas === 0 ? 0 : 1);
