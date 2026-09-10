/**
 * Segunda mitad de la auditoría de diseño adaptable: los estados que solo
 * existen DESPUÉS de una interacción.
 *
 * `auditoria-responsive.mjs` recorre las pantallas en su estado inicial, que
 * es donde menos cosas hay en pantalla. Los defectos de geometría viven al
 * revés: aparecen con la grilla llena, el panel de filtros abierto, el modal
 * arriba, el desplegable desplegado y los chips cargados. Es el mismo motivo
 * por el que la auditoría de accesibilidad se le escapaban cuatro defectos
 * (ver las notas de decisiones del proyecto, sección 6).
 *
 * Comparte los criterios de medición con la otra: desborde horizontal
 * (midiendo rectángulos, porque `App.jsx` recorta con `overflow-x-clip` y el
 * scrollWidth del documento no lo delata), contenido cortado en flujo, y
 * objetivos táctiles por debajo de 24x24 (WCAG 2.2, criterio 2.5.8).
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { medir, VIEWPORTS, buscarNavegador } from './auditoria-responsive-comun.mjs';

const BASE = 'http://localhost:4173';

/**
 * Una sola cuenta descartable para toda la corrida (ver el uso de haySesion
 * más abajo). El correo se genera al vuelo porque el registro rechaza uno
 * repetido, y así se puede correr la auditoría varias veces seguidas.
 */
const CUENTA = {
  nombre: 'Responsive',
  contrasena: 'unaClaveLarga123!',
  fechaNacimiento: '1995-06-15',
};
let nCuenta = 0;
const correoNuevo = () => `responsive-${Date.now()}-${nCuenta++}@pochoclo.ar`;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Clickea el primer botón/enlace cuyo texto empiece con `texto`. */
async function clickPorTexto(page, texto, selector = 'button, a') {
  const ok = await page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) =>
        (e.textContent ?? '').trim().startsWith(t),
      );
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    texto,
  );
  if (!ok) throw new Error(`No encontré "${texto}"`);
  await esperar(300);
}

/**
 * Cada escenario deja la página en el estado a medir. Devuelven cuando ese
 * estado ya está en pantalla.
 */
const ESCENARIOS = [
  {
    nombre: 'Inicio con modal Simple/Detallada',
    async preparar(page) {
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
      await clickPorTexto(page, 'Con preferencias');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    },
  },
  {
    nombre: 'Estado de ánimo con tarjeta elegida y modal',
    async preparar(page) {
      await page.goto(`${BASE}/estado-animo`, { waitUntil: 'networkidle2' });
      await clickPorTexto(page, 'Que me vuelen', 'button[aria-pressed]');
      await clickPorTexto(page, 'Continuar');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    },
  },
  {
    nombre: 'Preferencias con desplegable de Género abierto',
    async preparar(page) {
      await page.goto(`${BASE}/buscar`, { waitUntil: 'networkidle2' });
      await esperar(1200); // carga de géneros/países/idiomas/proveedores
      /**
       * El botón dice '<etiqueta>Mostrar' (la etiqueta y el toggle comparten
       * el mismo <button>), así que se busca por el final y no por el principio.
       */
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((e) =>
          (e.textContent ?? '').trim().endsWith('Mostrar'),
        );
        if (!b) throw new Error('No encontré ningún desplegable');
        b.click();
      });
      await esperar(400);
    },
  },
  {
    nombre: 'Preferencias con chips cargados y prioridades',
    async preparar(page) {
      await page.goto(`${BASE}/buscar`, { waitUntil: 'networkidle2' });
      await esperar(1200);
      /**
       * Elegir varias opciones de las listas visibles para que aparezcan los
       * chips, que es lo que ensancha la fila.
       */
      await page.evaluate(() => {
        const botones = [...document.querySelectorAll('button[aria-pressed="false"]')];
        for (const b of botones.slice(0, 8)) b.click();
      });
      await esperar(400);
    },
  },
  {
    nombre: 'Preferencias con autocompletado desplegado',
    async preparar(page) {
      await page.goto(`${BASE}/buscar`, { waitUntil: 'networkidle2' });
      await esperar(1200);
      const campo = await page.$('input[type="search"], input[role="combobox"]');
      if (!campo) throw new Error('No encontré el campo de autocompletado');
      await campo.type('padrino');
      await esperar(2500); // debounce de 350ms + ida y vuelta a TMDb
    },
  },
  {
    nombre: 'Resultados (grilla llena)',
    async preparar(page) {
      await page.goto(`${BASE}/tipo`, { waitUntil: 'networkidle2' });
      await clickPorTexto(page, 'Película', 'button[aria-pressed]');
      await clickPorTexto(page, 'Buscar');
      await page.waitForSelector('a[href^="/titulo/"]', { timeout: 60000 });
      await esperar(1000);
    },
  },
  {
    nombre: 'Resultados con panel de Filtros abierto',
    async preparar(page) {
      await page.goto(`${BASE}/tipo`, { waitUntil: 'networkidle2' });
      await clickPorTexto(page, 'Película', 'button[aria-pressed]');
      await clickPorTexto(page, 'Buscar');
      await page.waitForSelector('a[href^="/titulo/"]', { timeout: 60000 });
      await clickPorTexto(page, 'Filtros');
      await esperar(600);
    },
  },
  {
    nombre: 'Ficha de título cargada',
    async preparar(page) {
      await page.goto(`${BASE}/titulo/pelicula/238`, { waitUntil: 'networkidle2' });
      await page.waitForFunction(
        () => !document.body.textContent.includes('Cargando la ficha'),
        { timeout: 60000 },
      );
      await esperar(1200);
    },
  },
];

// ------------------------------------------------------ pantallas con sesión
const CON_SESION = [
  ['/perfil', 'Perfil'],
  ['/listas/favoritas', 'Lista de Favoritas'],
  ['/mis-plataformas', 'Mis plataformas'],
  ['/mis-gustos', 'Mis gustos'],
];

async function crearCuenta(page) {
  await page.goto(`${BASE}/crear-cuenta`, { waitUntil: 'networkidle2' });
  await page.type('#nombre', CUENTA.nombre);
  await page.type('#correo', correoNuevo());
  await page.type('#contrasena', CUENTA.contrasena);
  const repetir = await page.$('#repetir-contrasena, #contrasena2, #confirmar');
  if (repetir) await repetir.type(CUENTA.contrasena);
  await page.type('#fecha-nacimiento', '15/06/1995');
  const casilla = await page.$('input.casilla');
  if (casilla) await casilla.click();
  await clickPorTexto(page, 'Crear cuenta', 'button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.includes('crear-cuenta'), { timeout: 30000 });
}

// ---------------------------------------------------------------------------
const navegador = await puppeteer.launch({
  executablePath: buscarNavegador(fs),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const informe = [];
let haySesion = false;

for (const vp of VIEWPORTS) {
  const page = await navegador.newPage();
  await page.setViewport({
    width: vp.ancho,
    height: vp.alto,
    deviceScaleFactor: 1,
    isMobile: vp.movil,
    hasTouch: vp.movil,
  });

  for (const esc of ESCENARIOS) {
    try {
      await esc.preparar(page);
      const m = await page.evaluate(medir);
      if (
        m.desbordes.length ||
        m.cortados.length ||
        m.inalcanzables.length ||
        m.letraChica.length ||
        m.chicos.length ||
        m.chicosConEspacio.length
      ) {
        informe.push({ viewport: vp.nombre, pantalla: esc.nombre, ...m });
      }
    } catch (e) {
      informe.push({ viewport: vp.nombre, pantalla: esc.nombre, error: e.message });
    }
  }

  try {
    /**
     * La cuenta se crea UNA sola vez, no una por ancho. Las dos razones:
     * la cookie de sesión vive en el navegador y todas las pestañas la
     * comparten, así que con una alcanza; y el límite de intentos de
     * `auth.js` corta a los 3 registros por minuto desde la misma IP, así
     * que registrarse ocho veces seguidas hacía fallar a las últimas cinco
     * con un 429 que en el informe aparecía como un timeout sin explicación.
     */
    if (!haySesion) {
      await crearCuenta(page);
      haySesion = true;
    }
    for (const [ruta, etiqueta] of CON_SESION) {
      await page.goto(BASE + ruta, { waitUntil: 'networkidle2', timeout: 45000 });
      await esperar(1500);
      const m = await page.evaluate(medir);
      if (
        m.desbordes.length ||
        m.cortados.length ||
        m.inalcanzables.length ||
        m.letraChica.length ||
        m.chicos.length ||
        m.chicosConEspacio.length
      ) {
        informe.push({ viewport: vp.nombre, pantalla: etiqueta, ...m });
      }
    }
  } catch (e) {
    informe.push({ viewport: vp.nombre, pantalla: 'Pantallas con sesión', error: e.message });
  }

  await page.close();
}

await navegador.close();

/**
 * Las cuentas descartables se borran al terminar. Sin esto se acumulaba una por
 * corrida: al 2026-08-26 habia 12 en la base, todas de aca. Se delega en el
 * script del backend porque es el que tiene la conexion, y de paso barre las
 * que hayan quedado de corridas anteriores y de las otras auditorias.
 */
{
  const r = spawnSync(process.execPath, ['src/scripts/cuentasDePrueba.js', '--borrar'], {
    cwd: '../backend',
    encoding: 'utf8',
  });
  const lineas = (r.stdout || r.stderr || '').trim().split(/\r?\n/);
  console.log('');
  console.log(`Limpieza de cuentas: ${lineas[lineas.length - 1] || 'sin salida'}`);
}

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
  console.log('Sin hallazgos de geometría en ningún estado.');
} else {
  const orden = { ERROR: 0, DESBORDE: 1, INALCANZABLE: 2, CORTADO: 3, TÁCTIL: 4, 'ZOOM-IOS': 5, CHICO: 6 };
  const lista = [...agrupados.values()].sort((a, b) => orden[a.tipo] - orden[b.tipo]);
  for (const h of lista) {
    console.log(`\n[${h.tipo}] ${h.clave}`);
    console.log(`   ${h.detalle}`);
    const donde = [...h.donde];
    console.log(`   en ${donde.length}: ${donde.slice(0, 6).join(' | ')}${donde.length > 6 ? ' | ...' : ''}`);
  }
  console.log(`\n${lista.length} hallazgos distintos.`);
}
