import puppeteer from 'puppeteer-core';
import axeCore from 'axe-core';

const axeSource = axeCore.source;

/**
 * Navegador para correr la auditoría. Se prueban varias rutas conocidas en
 * vez de una sola fija: en esta máquina el headless de Edge dejó de arrancar
 * (falla incluso desde su propia línea de comandos) y con la ruta hardcodeada
 * la auditoría quedaba imposible de correr sin editar el archivo. Se puede
 * forzar una con la variable de entorno NAVEGADOR.
 */
import fs from 'node:fs';
const CANDIDATOS = [
  process.env.NAVEGADOR,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const EDGE = CANDIDATOS.find((ruta) => fs.existsSync(ruta));
if (!EDGE) {
  throw new Error(`No encontré ningún navegador para la auditoría. Probé: ${CANDIDATOS.join(', ')}`);
}
console.log(`Navegador: ${EDGE}`);
const BASE = 'http://localhost:4173';

const RUTAS = [
  ['/', 'Inicio'],
  ['/buscar', 'Preferencias (detallada)'],
  ['/tipo', 'Por tipo'],
  ['/estado-animo', 'Por estado de ánimo'],
  ['/quien-esta-viendo', '¿Quién está viendo?'],
  ['/titulo/pelicula/238', 'Ficha de título'],
  ['/acerca-de', 'Acerca de'],
  ['/privacidad', 'Privacidad'],
  ['/terminos', 'Términos y Condiciones'],
  ['/accesibilidad', 'Accesibilidad'],
  ['/iniciar-sesion', 'Iniciar sesión'],
  ['/crear-cuenta', 'Crear cuenta'],
  ['/recuperar-contrasena', 'Recuperar contraseña'],
  /**
   * Sin token en la URL muestra el estado de "ese enlace ya no sirve", que
   * es la pantalla que ve quien entra a mano o con un enlace vencido.
   */
  ['/restablecer-contrasena', 'Restablecer contraseña (enlace vencido)'],
  /**
   * El 404 de la app: cualquier dirección que no coincida con una ruta real
   * cae en la pantalla de error, así que se audita como una pantalla más.
   */
  ['/una-ruta-que-no-existe', 'Error 404'],
];

/**
 * El perfil exige sesión, así que la auditoría se crea una cuenta descartable
 * para poder verlo. Es la pantalla con más formulario de toda la app (incluye
 * el borrado de cuenta), así que dejarla afuera sería dejar afuera justo lo
 * más propenso a errores de etiquetado.
 */
const CUENTA_DE_PRUEBA = {
  nombre: 'Auditoría',
  correo: `auditoria-${Date.now()}@pochoclo.ar`,
  contrasena: 'unaClaveLarga123!',
  fechaNacimiento: '1995-06-15',
};

const navegador = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const hallazgos = new Map(); // regla -> { impacto, descripcion, apariciones: [] }

async function auditar(page, etiqueta) {
  await page.evaluate(axeSource);
  const resultado = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    });
  });

  for (const v of resultado.violations) {
    if (!hallazgos.has(v.id)) {
      hallazgos.set(v.id, { impacto: v.impact, descripcion: v.help, apariciones: [] });
    }
    hallazgos.get(v.id).apariciones.push({
      pantalla: etiqueta,
      nodos: v.nodes.length,
      ejemplo: (v.nodes[0]?.html ?? '').slice(0, 110),
    });
  }
  console.log(`  ${etiqueta}: ${resultado.violations.length} tipos de problema, ${resultado.passes.length} chequeos OK`);
}

const page = await navegador.newPage();
await page.setViewport({ width: 1280, height: 900 });

console.log('Auditando pantallas...');
for (const [ruta, etiqueta] of RUTAS) {
  await page.goto('about:blank');
  await page.goto(BASE + ruta, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1200));
  await auditar(page, etiqueta);
}

/**
 * /resultados y el panel de Filtros necesitan llegar navegando, porque
 * dependen del location.state que arma la pantalla anterior.
 */
await page.goto('about:blank');
await page.goto(BASE + '/tipo', { waitUntil: 'networkidle2' });
await page.evaluate(() => {
  /**
   * Por nombre accesible y no por texto exacto: las tarjetas de /tipo
   * llevan una descripción adentro del mismo <button>, así que un
   * === 'Película' deja de matchear en cuanto se les toca el contenido.
   */
  const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) =>
    x.textContent.trim().startsWith('Película')
  );
  b?.click();
});
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Buscar');
  b?.click();
});
await page.waitForFunction(() => document.body.innerText.includes('resultado'), { timeout: 120000 });
await auditar(page, 'Resultados');

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Filtros'));
  b?.click();
});
await new Promise((r) => setTimeout(r, 800));
await auditar(page, 'Resultados con el panel de Filtros abierto');

// El perfil, que necesita sesión: se registra una cuenta descartable.
await page.goto('about:blank');
await page.goto(BASE + '/crear-cuenta', { waitUntil: 'networkidle2' });
await page.type('#nombre', CUENTA_DE_PRUEBA.nombre);
await page.type('#correo', CUENTA_DE_PRUEBA.correo);
await page.type('#contrasena', CUENTA_DE_PRUEBA.contrasena);
await page.evaluate((fecha) => {
  const campo = document.querySelector('#fecha-nacimiento');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(campo, fecha);
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}, CUENTA_DE_PRUEBA.fechaNacimiento);
/**
 * La aceptación de los Términos es una casilla obligatoria, y el servidor la
 * exige además del cliente (ver backend/src/auth/validaciones.js).
 */
await page.click('#acepto-terminos');
await page.click('button[type="submit"]');
await new Promise((r) => setTimeout(r, 2500));

/**
 * Sin esta comprobación, un alta fallida NO rompe la auditoría: RutaPrivada
 * manda a /iniciar-sesion y las siete pantallas que necesitan sesión se
 * auditan igual, pero auditando el login siete veces y dando 0 problemas.
 * Pasó exactamente eso al agregarse la casilla de Términos, y el único
 * síntoma fue un selector que no aparecía, quince pantallas después.
 */
if (page.url().includes('/crear-cuenta')) {
  const motivo = await page.evaluate(
    () => document.querySelector('[role="alert"]')?.textContent?.trim() ?? 'sin mensaje en pantalla'
  );
  throw new Error(
    `No se pudo crear la cuenta de prueba, así que las pantallas con sesión no se pueden auditar. El formulario dice: ${motivo}`
  );
}

await page.goto(BASE + '/perfil', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 1200));
await auditar(page, 'Perfil');

/**
 * El cambio de contraseña también está detrás de un botón, y su lista de
 * requisitos aparece recién al escribir, así que hay que tipear algo.
 * `b?.click()` no servia: si el boton todavia no estaba renderizado la
 * llamada no hacia nada, en silencio, y el error recien aparecia mas abajo
 * como un selector que no existe. Se espera y se falla con el motivo real.
 */
await page.waitForFunction(
  () => [...document.querySelectorAll('button')].some((x) => x.textContent.includes('Quiero cambiarla')),
  { timeout: 15000 }
);
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Quiero cambiarla')).click();
});
/**
 * Esperar por el campo y no por un reloj: los 400 ms alcanzaban casi siempre,
 * y "casi siempre" en un script que corre 31 pantallas significa que un dia
 * se corta a la mitad sin decir por que.
 */
await page.waitForSelector('#contrasena-nueva', { timeout: 10000 });
await page.type('#contrasena-nueva', 'ab3');
await new Promise((r) => setTimeout(r, 300));
await auditar(page, 'Perfil con el cambio de contraseña y sus requisitos');

/**
 * El formulario de borrado está escondido detrás de un botón, así que hay
 * que abrirlo para que axe lo vea.
 */
await page.waitForFunction(
  () => [...document.querySelectorAll('button')].some((x) => x.textContent.includes('Quiero borrar')),
  { timeout: 15000 }
);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Quiero borrar'));
  b?.click();
});
await new Promise((r) => setTimeout(r, 500));
await auditar(page, 'Perfil con el borrado de cuenta abierto');

/**
 * Listas (v3, milestone 19). La cuenta descartable de arriba sigue logueada.
 * Se le agrega un título para poder auditar la lista con contenido, con su
 * buscador cargado, y el aviso cruzado de Ver más tarde con Visto.
 */
await page.goto(BASE + '/titulo/pelicula/238', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => document.body.innerText.includes('padrino'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  for (const etiqueta of ['Favoritas', 'Visto', 'Ver más tarde']) {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().endsWith(etiqueta));
    b?.click();
  }
});
await new Promise((r) => setTimeout(r, 2000));
// El modal de "¿la marcamos como vista?" queda abierto tras tocar Favoritas.
await auditar(page, 'Ficha con la pregunta de Favoritas a Visto');
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 400));

await page.goto(BASE + '/listas/favoritas', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => !document.body.innerText.includes('Trayendo tu lista'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await auditar(page, 'Lista con títulos');

await page.type('#buscador-agregar', 'Matrix');
await new Promise((r) => setTimeout(r, 2500));
await auditar(page, 'Lista con el buscador para agregar cargado');

await page.goto(BASE + '/listas/ver_mas_tarde', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => !document.body.innerText.includes('Trayendo tu lista'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await auditar(page, 'Ver más tarde con el aviso de ya vistos');

await page.goto(BASE + '/mis-plataformas', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => !document.body.innerText.includes('Trayendo las plataformas'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await auditar(page, 'Mis plataformas');

/**
 * Gustos Registrados (v3, milestone 20). Se audita con el desplegable de
 * géneros abierto y con el tope de 5 alcanzado, porque el aviso del tope es
 * texto que aparece solo en ese estado.
 */
await page.goto(BASE + '/mis-gustos', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => !document.body.innerText.includes('Trayendo tus gustos'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await auditar(page, 'Mis gustos');

await page.evaluate(() => {
  const seccion = [...document.querySelectorAll('#contenido section')].find(
    (s) => s.querySelector('h2')?.textContent.trim() === 'Géneros favoritos'
  );
  seccion?.querySelector('button[aria-expanded="false"]')?.click();
});
await new Promise((r) => setTimeout(r, 500));
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => {
    const seccion = [...document.querySelectorAll('#contenido section')].find(
      (s) => s.querySelector('h2')?.textContent.trim() === 'Géneros favoritos'
    );
    seccion?.querySelector('[role="group"] button[aria-pressed="false"]')?.click();
  });
  await new Promise((r) => setTimeout(r, 250));
}
await auditar(page, 'Mis gustos con el tope de géneros alcanzado');

/**
 * Los tres bloques personalizados de la busqueda con formulario vacio
 * (v3, milestone 21). La cuenta descartable ya tiene un titulo en Favoritas
 * y otro en Visto de la parte de listas, asi que aparecen los tres. Se le
 * suman gustos para que el primero tambien este.
 */
await page.evaluate(async () => {
  await fetch('http://localhost:3000/gustos', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generos: [35], tipos: [], anios: [] }),
  });
});
await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('a, button')].find((x) => /No sé qué ver/i.test(x.innerText));
  b?.click();
});
await page.waitForFunction(() => /resultado/.test(document.body.innerText), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1200));
await auditar(page, 'Resultados en tres bloques personalizados');

/**
 * El menú "+" de una tarjeta de resultados, que es el widget nuevo de esta
 * milestone y el más propenso a problemas de teclado y etiquetado.
 */
await page.goto(BASE + '/tipo', { waitUntil: 'networkidle2' });
await page.evaluate(() => {
  /**
   * Por nombre accesible y no por texto exacto: las tarjetas de /tipo
   * llevan una descripción adentro del mismo <button>, así que un
   * === 'Película' deja de matchear en cuanto se les toca el contenido.
   */
  const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) =>
    x.textContent.trim().startsWith('Película')
  );
  b?.click();
});
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Buscar');
  b?.click();
});
await page.waitForFunction(() => document.body.innerText.includes('resultado'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const b = document.querySelector('button[aria-expanded="false"][aria-label^="Agregar"]');
  b?.click();
});
await new Promise((r) => setTimeout(r, 500));
await auditar(page, 'Resultados con el menú de listas abierto');

/**
 * Priorizar preferencias (v3, milestone 22). Dos estados que solo existen con
 * prioridades marcadas: el formulario con los botones activos (que llevan el
 * numerito de orden adentro de la casilla) y la pantalla de resultados
 * partida en divisiones. Se elige un caso que sí entra en conflicto (terror
 * más una persona que casi no hizo terror) para que las divisiones aparezcan.
 */
await page.goto(BASE + '/buscar', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const grupo = document.querySelector('[aria-labelledby="seccion-genero"]');
  grupo?.querySelector('button[aria-expanded="false"]')?.click();
});
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  const grupo = document.querySelector('[aria-labelledby="seccion-genero"]');
  const b = [...grupo.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Terror');
  b?.click();
});
await page.type('#autocompletado-actor-actriz', 'Robert De Niro');
await new Promise((r) => setTimeout(r, 2500));
/**
 * Las opciones del autocompletado responden a mousedown (para que el blur
 * del input no cierre la lista antes de tiempo), así que un .click() no
 * alcanza: hay que despachar el evento que el componente escucha.
 */
await page.evaluate(() => {
  const grupo = document.querySelector('[aria-labelledby="seccion-actor-actriz"]');
  const opcion = [...grupo.querySelectorAll('button')].find((x) =>
    x.textContent.includes('Robert De Niro')
  );
  opcion?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.querySelector('[aria-label="Priorizar Género"]')?.click());
await new Promise((r) => setTimeout(r, 250));
await page.evaluate(() => document.querySelector('[aria-label="Priorizar Actor / actriz"]')?.click());
await new Promise((r) => setTimeout(r, 400));
await auditar(page, 'Preferencias con dos prioridades marcadas');

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Buscar');
  b?.click();
});
await page.waitForFunction(() => document.body.innerText.includes('resultado'), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1200));
await auditar(page, 'Resultados divididos por prioridad');

/**
 * La cuenta descartable se borra al terminar. Sin esto se acumulaba una por
 * corrida: al 2026-08-26 habia 20 cuentas en la base y `terminos-pendientes
 * --borrar` no alcanzaba a ninguna, porque ese script borra a quien NUNCA
 * acepto los Terminos y estas los aceptan (la casilla es obligatoria para
 * registrarse). Se usa la propia pantalla de borrado, que es la misma que usa
 * una persona, asi que de paso queda ejercitada.
 */
try {
  await page.goto(BASE + '/perfil', { waitUntil: 'networkidle2' });
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((x) => x.textContent.includes('Quiero borrar')),
    { timeout: 15000 }
  );
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Quiero borrar')).click();
  });
  await page.waitForSelector('#contrasena-borrado', { timeout: 10000 });
  await page.type('#contrasena-borrado', CUENTA_DE_PRUEBA.contrasena);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((x) => x.textContent.trim() === 'Borrar definitivamente')
      .click();
  });
  await new Promise((r) => setTimeout(r, 2500));
  const sigue = await page.evaluate(() => location.pathname === '/perfil');
  console.log(sigue ? 'OJO: la cuenta de prueba no se borro.' : 'Cuenta de prueba borrada.');
} catch (err) {
  // No romper la auditoria por la limpieza: los hallazgos ya estan calculados.
  console.log(`No se pudo borrar la cuenta de prueba (${err.message}).`);
}

console.log('\n================ HALLAZGOS ================');
if (hallazgos.size === 0) {
  console.log('axe-core no encontró ninguna violación en ninguna pantalla.');
} else {
  const orden = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const lista = [...hallazgos.entries()].sort((a, b) => (orden[a[1].impacto] ?? 9) - (orden[b[1].impacto] ?? 9));
  for (const [regla, info] of lista) {
    const total = info.apariciones.reduce((a, x) => a + x.nodos, 0);
    console.log(`\n[${info.impacto}] ${regla}: ${info.descripcion}`);
    console.log(`   ${total} elementos en: ${info.apariciones.map((a) => `${a.pantalla} (${a.nodos})`).join(', ')}`);
    console.log(`   ejemplo: ${info.apariciones[0].ejemplo}`);
  }
}

await navegador.close();
