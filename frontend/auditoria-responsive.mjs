/**
 * Auditoría de diseño adaptable (responsive).
 *
 * No reemplaza a `auditoria-a11y.mjs`: ese busca violaciones de WCAG en el
 * DOM, este mide GEOMETRÍA a distintos anchos de pantalla. Son dos clases de
 * defecto que no se solapan: un botón puede tener nombre accesible perfecto y
 * aun así salirse de la pantalla en un teléfono.
 *
 * Qué mide, y por qué cada cosa:
 *
 * 1. Desborde horizontal. `App.jsx` recorta con `overflow-x-clip`, así que
 *    mirar `scrollWidth` del documento NO alcanza: el desborde existe pero
 *    queda tapado (y el contenido, cortado). Por eso se miden los rectángulos
 *    de cada elemento contra el ancho del viewport.
 * 2. Contenido cortado adentro de una caja (`scrollWidth > clientWidth` en un
 *    elemento que no scrollea), que es texto o controles que no entran.
 * 3. Objetivos táctiles por debajo de 24x24 (WCAG 2.2 AA, criterio 2.5.8).
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { medir, VIEWPORTS, buscarNavegador } from './auditoria-responsive-comun.mjs';

const BASE = 'http://localhost:4173';


const RUTAS = [
  ['/', 'Inicio'],
  ['/buscar', 'Preferencias'],
  ['/tipo', 'Por tipo'],
  ['/estado-animo', 'Estado de ánimo'],
  ['/quien-esta-viendo', 'Quién está viendo'],
  ['/titulo/pelicula/238', 'Ficha de título'],
  ['/acerca-de', 'Acerca de'],
  ['/privacidad', 'Privacidad'],
  ['/terminos', 'Términos'],
  ['/accesibilidad', 'Accesibilidad'],
  ['/iniciar-sesion', 'Iniciar sesión'],
  ['/crear-cuenta', 'Crear cuenta'],
  ['/recuperar-contrasena', 'Recuperar contraseña'],
  /**
   * El 404 de la app: cualquier dirección que no coincida con una ruta real
   * cae en la pantalla de error, así que se audita como una pantalla más.
   */
  ['/una-ruta-que-no-existe', 'Error 404'],
];

const navegador = await puppeteer.launch({
  executablePath: buscarNavegador(fs),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const informe = [];

for (const vp of VIEWPORTS) {
  const page = await navegador.newPage();
  await page.setViewport({
    width: vp.ancho,
    height: vp.alto,
    deviceScaleFactor: 1,
    isMobile: vp.movil,
    hasTouch: vp.movil,
  });

  for (const [ruta, etiqueta] of RUTAS) {
    try {
      await page.goto(BASE + ruta, { waitUntil: 'networkidle2', timeout: 45000 });
      await new Promise((r) => setTimeout(r, 400));
      const m = await page.evaluate(medir);
      if (
        m.desbordes.length ||
        m.cortados.length ||
        m.inalcanzables.length ||
        m.letraChica.length ||
        m.chicos.length ||
        m.chicosConEspacio.length
      ) {
        informe.push({ viewport: vp.nombre, pantalla: etiqueta, ruta, ...m });
      }
    } catch (e) {
      informe.push({ viewport: vp.nombre, pantalla: etiqueta, ruta, error: e.message });
    }
  }
  await page.close();
}

await navegador.close();

/**
 * El encabezado y el pie están en TODAS las pantallas, así que un defecto ahí
 * aparecería 78 veces (13 rutas x 6 anchos) y taparía a los demás. Se agrupa
 * por elemento y se listan dónde apareció, que es la forma en que se lee.
 */
const agrupados = new Map();
const registrar = (tipo, clave, detalle, donde) => {
  const id = `${tipo}|${clave}`;
  if (!agrupados.has(id)) agrupados.set(id, { tipo, clave, detalle, donde: new Set() });
  agrupados.get(id).donde.add(donde);
};

for (const h of informe) {
  if (h.error) {
    registrar('ERROR', h.pantalla, h.error, h.viewport);
    continue;
  }
  for (const d of h.desbordes) {
    registrar('DESBORDE', d.que, `se pasa hasta ${d.der}px (vista ${h.anchoVista}px)`, `${h.pantalla} @ ${h.viewport}`);
  }
  for (const c of h.inalcanzables ?? []) {
    registrar(
      'INALCANZABLE',
      c.que,
      `${c.contenido}px de alto en una pantalla de ${c.pantalla}px, sin scroll propio`,
      `${h.pantalla} @ ${h.viewport}`,
    );
  }
  for (const c of h.cortados) {
    registrar('CORTADO', c.que, `${c.contenido}px de contenido en ${c.caja}px de caja`, `${h.pantalla} @ ${h.viewport}`);
  }
  for (const c of h.chicos) {
    registrar('TÁCTIL', c.que, `${c.ancho}x${c.alto} (pegado a: ${c.vecino ?? '?'})`, `${h.pantalla} @ ${h.viewport}`);
  }
  for (const c of h.letraChica ?? []) {
    registrar('ZOOM-IOS', c.que, `letra de ${c.px}px`, `${h.pantalla} @ ${h.viewport}`);
  }
  for (const c of h.chicosConEspacio ?? []) {
    registrar('CHICO', c.que, `${c.ancho}x${c.alto}`, `${h.pantalla} @ ${h.viewport}`);
  }
}

console.log(
  [
    'DESBORDE: se sale del ancho de la pantalla.',
    'INALCANZABLE: capa fija más alta que la pantalla y sin scroll propio: lo de',
    '              abajo no se puede alcanzar de ninguna forma.',
    'CORTADO:  hay más contenido del que entra en la caja y queda recortado.',
    'TÁCTIL:   objetivo menor a 24x24 Y pegado a otro: incumple WCAG 2.5.8.',
    'ZOOM-IOS: campo de texto con letra menor a 16px. Safari en iOS hace zoom al',
    '          enfocarlo y no lo deshace solo.',
    'CHICO:    objetivo menor a 24x24 pero con separación suficiente: cumple',
    '          el criterio por la excepción de espaciado, aunque en un teléfono',
    '          siga siendo incómodo de acertar.',
  ].join('\n'),
);

if (!agrupados.size) {
  console.log('Sin hallazgos de geometría en ningún ancho.');
} else {
  const orden = { ERROR: 0, DESBORDE: 1, INALCANZABLE: 2, CORTADO: 3, TÁCTIL: 4, 'ZOOM-IOS': 5, CHICO: 6 };
  const lista = [...agrupados.values()].sort((a, b) => orden[a.tipo] - orden[b.tipo]);
  for (const h of lista) {
    console.log(`\n[${h.tipo}] ${h.clave}`);
    console.log(`   ${h.detalle}`);
    const donde = [...h.donde];
    console.log(`   en ${donde.length}: ${donde.slice(0, 8).join(' | ')}${donde.length > 8 ? ' | ...' : ''}`);
  }
  console.log(`\n${lista.length} hallazgos distintos.`);
}
