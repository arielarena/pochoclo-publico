/**
 * LA EXTENSIÓN TAL COMO SE INSTALA, sin ningún permiso sobre las plataformas.
 *
 * Es la única de las tres pruebas que carga el manifest de verdad y no la
 * copia con los permisos pasados a obligatorios, así que es la que puede
 * contestar la pregunta del paso 7: recién instalada, ¿la extensión puede
 * meterse en Netflix? Comprueba tres cosas que tienen que ser ciertas las tres
 * a la vez, porque si falla una sola el resto no significa nada.
 *
 *   1. El único permiso concedido es api.pochoclo.ar.
 *   2. No hay ningún guión registrado, o sea que la aparición automática está
 *      apagada, que es lo que pide la sección 21.
 *   3. Entrando a Netflix no aparece ningún panel.
 *
 * Y comprueba de paso lo que pasa al apretar el ícono donde el panel no puede
 * entrar, que es la pestaña nueva del navegador. Ahí el aviso del ícono tiene
 * que estar en castellano y no llevar nada del texto crudo de Chrome.
 *
 * Y de paso corre el experimento del paso 1 contra la API publicada, llamando a
 * `correrExperimento` en el service worker. Los dos pedidos son de lectura. Se
 * corre desde acá y no desde una pantalla porque el diagnóstico salió de la de
 * opciones el 2026-09-25 (el motivo está en `opciones.js`), así que este archivo
 * es el único lugar donde se corre sin que nadie lo pida a mano.
 *
 * LO QUE NO PUEDE COMPROBAR, y hay que mirar a mano una vez. Que apretando el
 * ícono aparezca el panel, y que tildando una plataforma en las opciones Chrome
 * pida el permiso y el panel pase a aparecer solo. Las dos cosas pasan por
 * interfaz del navegador (el ícono de la barra y el cartel del permiso), que no
 * es parte de la página y por lo tanto no se puede clickear desde el protocolo
 * de depuración.
 *
 * HACE FALTA CHROME FOR TESTING Y NO SIRVE EL CHROME DE TODOS LOS DÍAS.
 * Medido el 2026-09-12 con Chrome 152: `--load-extension` ya no carga nada en
 * el canal estable, ni siquiera sumándole `--enable-unsafe-extension-debugging`.
 * Chrome lo cerró hace varias versiones para que nadie inyecte extensiones a
 * la fuerza en el navegador de otro. El de pruebas se baja así, en una carpeta
 * de descarte y sin tocar el repo:
 *
 *   node node_modules/@puppeteer/browsers/lib/main-cli.js install chrome@stable --path <carpeta>
 *
 * Uso:
 *   CHROME=<ruta> PERFIL_PRUEBA=<carpeta> node probar-extension.mjs [--entrar]
 *
 * Con `--entrar` abre pochoclo.ar y espera a que inicies sesión a mano antes
 * de medir, que es la única forma de contestar la pregunta 1 de verdad. Si el
 * perfil se conserva entre corridas, la sesión queda y no hay que repetirlo.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { EXTENSION, ID, serviceWorker } from './pruebas-comun.mjs';

const CHROME = process.env.CHROME;
if (!CHROME || !existsSync(CHROME)) {
  throw new Error('Falta CHROME apuntando a un Chrome for Testing. Ver el comentario de arriba.');
}
const PERFIL = process.env.PERFIL_PRUEBA;
if (!PERFIL) throw new Error('Falta PERFIL_PRUEBA con la carpeta del perfil');

// ACÁ SE CARGA LA EXTENSIÓN DE VERDAD y no la copia con los permisos pasados a
// obligatorios que usan las otras dos pruebas. El experimento solo habla con
// api.pochoclo.ar, que es el único permiso que quedó en el manifest, así que
// este archivo comprueba de paso que ese permiso alcance.
const ENTRAR = process.argv.includes('--entrar');

let mal = 0;
function revisar(bien, texto) {
  if (!bien) mal += 1;
  console.log(`${bien ? 'ok  ' : 'MAL '} ${texto}`);
}

const navegador = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  userDataDir: PERFIL,
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

const urlOpciones = `chrome-extension://${ID}/opciones.html`;
const pestaniasDeOpciones = async () =>
  (await navegador.pages()).filter((p) => p.url().startsWith(urlOpciones));

try {
  /**
   * AL INSTALAR SE ABRE LA PANTALLA DE OPCIONES, UNA SOLA VEZ.
   *
   * Es la única interrupción de toda la extensión y existe porque instalar no
   * producía ninguna señal: quedaba ahí y nada decía que el panel sale
   * apretando el ícono. Se comprueba acá arriba porque tiene que pasar al
   * arrancar, antes de que esta prueba abra ninguna pestaña propia.
   */
  await new Promise((seguir) => setTimeout(seguir, 2000));
  const alInstalar = await pestaniasDeOpciones();
  revisar(
    alInstalar.length === 1,
    `al instalar se abre la pantalla de opciones, una sola vez (${alInstalar.length})`,
  );
  // Se la manda a otro lado para que lo de abajo mida sobre una sola pestaña de
  // opciones. CERRARLA NO SIRVE: recién instalada es la única pestaña de la
  // ventana, así que cerrarla cierra la ventana y lo siguiente falla con
  // "Failed to open a new tab", que no se parece en nada a la causa.
  for (const pestania of alInstalar) await pestania.goto('about:blank');

  if (ENTRAR) {
    const sitio = await navegador.newPage();
    await sitio.goto('https://pochoclo.ar/iniciar-sesion', { waitUntil: 'domcontentloaded' });
    console.log('Iniciá sesión en la ventana que se abrió. Espero hasta 3 minutos.');
    await sitio.waitForFunction(
      () => !location.pathname.startsWith('/iniciar-sesion'),
      { timeout: 180000, polling: 1000 },
    );
    console.log('Sesión iniciada.');
  }

  const opciones = await navegador.newPage();
  await opciones.goto(`chrome-extension://${ID}/opciones.html`, { waitUntil: 'domcontentloaded' });

  // --- Los permisos, tal como quedan al instalar -----------------------------
  const casillas = await opciones.evaluate(() =>
    [...document.querySelectorAll('.plataformas input')].map((c) => c.checked),
  );
  revisar(casillas.length === 5, `la pantalla de opciones ofrece las 5 plataformas (${casillas.length})`);
  revisar(
    casillas.every((marcada) => !marcada),
    'y ninguna viene con la aparición automática prendida',
  );

  const trabajador = await serviceWorker(navegador);

  /**
   * EL EXPERIMENTO DEL PASO 1, llamando a la función derecho en el service
   * worker. Es el mismo camino que usa alguien desde su consola, así que de paso
   * comprueba que ese camino siga existiendo ahora que no hay ninguna pantalla
   * que lo dibuje.
   *
   * LA PREGUNTA 1 NO SE PUEDE AFIRMAR ACÁ. Que la sesión llegue depende de si
   * iniciaste sesión en este perfil, o sea de `--entrar`, así que se imprime y no
   * se juzga. La 2 sí, porque contestar no depende de nada nuestro más que del
   * único permiso que quedó en el manifest.
   */
  const experimento = await trabajador.evaluate(() => correrExperimento());
  const { sesion, busqueda } = experimento;
  console.log(
    `\n1. ¿Llega la sesión?      ${
      !sesion.ok
        ? `el pedido ni salió (${sesion.error})`
        : sesion.hayUsuario
          ? `sí, ${sesion.correo}`
          : 'no, contesta sin usuario'
    } · HTTP ${sesion.estado ?? '-'} · ${sesion.ms} ms`,
  );
  console.log(
    `2. ¿Contesta la búsqueda? ${
      busqueda.ok ? busqueda.titulo || '(sin resultado)' : `no (${busqueda.error})`
    } · HTTP ${busqueda.estado ?? '-'} · ${busqueda.ms} ms`,
  );
  console.log(`   (ID de esta extensión: ${experimento.idExtension})\n`);
  revisar(
    busqueda.ok && busqueda.estado === 200 && Boolean(busqueda.titulo),
    'la búsqueda contesta con el permiso sobre api.pochoclo.ar y nada más',
  );

  const permisos = await trabajador.evaluate(() => chrome.permissions.getAll());
  revisar(
    JSON.stringify(permisos.origins) === JSON.stringify(['https://api.pochoclo.ar/*']),
    `el único sitio con permiso es el nuestro (${(permisos.origins || []).join(', ')})`,
  );
  const guiones = await trabajador.evaluate(() => chrome.scripting.getRegisteredContentScripts());
  revisar(guiones.length === 0, 'no hay ningún guión registrado, así que nada entra solo');

  /**
   * LA ENTRADA A LA PREFERENCIA DESDE EL PANEL.
   *
   * POR QUÉ SE MIDE ACÁ Y NO EN LA PRUEBA DEL PANEL. Esta es la única de las
   * cuatro que carga el manifest de verdad, o sea con los permisos de las
   * plataformas sin conceder, que es el estado de quien acaba de instalar. En
   * la copia con los permisos pasados a obligatorios la aparición automática
   * está prendida en las cinco, así que el camino de PRENDERLA, que es el que
   * importa, no existe ahí.
   *
   * Lo que no se puede medir sigue siendo lo mismo de siempre, o sea el cartel
   * de Chrome, y por eso prender termina en esta pantalla y no en el panel.
   */
  const estados = await trabajador.evaluate(async () => {
    const claves = globalThis.pochoclo.plataformas.PLATAFORMAS.map((p) => p.clave);
    const salida = {};
    for (const clave of claves) salida[clave] = await estadoAparicion(clave);
    salida.inventada = await estadoAparicion('plataforma-que-no-existe');
    return salida;
  });
  revisar(
    ['netflix', 'prime', 'disney', 'hbomax', 'appletv'].every(
      (c) => estados[c] && estados[c].prendida === false,
    ),
    'recién instalada, la aparición automática está apagada en las cinco',
  );
  revisar(
    /plataforma desconocida/.test(estados.inventada.error || ''),
    'y no se le puede preguntar por una plataforma que no está en el catálogo',
  );

  for (const [clave, nombre] of [
    ['hbomax', 'HBO Max'],
    ['appletv', 'Apple TV'],
  ]) {
    const antes = (await pestaniasDeOpciones()).length;
    await trabajador.evaluate((c) => abrirOpciones(c), clave);
    await new Promise((seguir) => setTimeout(seguir, 1500));
    const despues = await pestaniasDeOpciones();
    revisar(
      despues.length === antes,
      `el enlace del panel para ${nombre} no abre una pestaña más (${antes} -> ${despues.length})`,
    );
    const donde = await despues[0].evaluate(() => ({
      destacadas: [...document.querySelectorAll('.plataformas li.destacada span')].map(
        (n) => n.textContent,
      ),
      enfocada: document.activeElement.closest('li')?.querySelector('span')?.textContent || null,
    }));
    const esperado = `Aparecer automáticamente al entrar a ${nombre}`;
    revisar(
      JSON.stringify(donde.destacadas) === JSON.stringify([esperado]),
      `y deja resaltada la casilla de ${nombre}, y solo esa`,
    );
    revisar(donde.enfocada === esperado, `y le pone el foco, así el próximo paso es el correcto`);
  }

  /**
   * LA MARCA SE LEE UNA SOLA VEZ. De dónde venís pasa una vez, así que recargar
   * la pantalla no puede volver a señalar algo que nadie pidió.
   */
  const paraRecargar = (await pestaniasDeOpciones())[0];
  await paraRecargar.reload({ waitUntil: 'domcontentloaded' });
  await new Promise((seguir) => setTimeout(seguir, 1000));
  revisar(
    (await paraRecargar.evaluate(() => document.querySelectorAll('.plataformas li.destacada').length)) === 0,
    'y recargar esa pantalla no vuelve a resaltar nada',
  );

  /**
   * HASTA DÓNDE SE PUEDE MEDIR EL PEDIDO DE PERMISO, que es más lejos de lo que
   * parecía.
   *
   * El cartel de Chrome no se puede clickear desde acá, pero lo que hay que
   * saber antes de que lo vea una persona es si `chrome.permissions.request`
   * ACEPTA el gesto, y eso sí se distingue. Si lo rechazara (el caso clásico es
   * "must be called during a user gesture") la promesa se resolvería enseguida
   * y la pantalla escribiría el error en su región viva. Que a los dos segundos
   * la región siga vacía, la casilla siga tildada y el permiso siga sin
   * concederse quiere decir exactamente una cosa, que Chrome está preguntando.
   *
   * Medido el 2026-09-13: la región queda vacía y no hay ningún error de
   * consola, o sea que el gesto de la casilla vale. Lo que falta contestar a
   * mano es qué pasa al apretar "Permitir".
   */
  const erroresOpciones = [];
  opciones.on('pageerror', (error) => erroresOpciones.push(error.message));
  opciones.on('console', (m) => {
    if (m.type() === 'error') erroresOpciones.push(m.text());
  });
  await opciones.click('.plataformas input');
  await new Promise((seguir) => setTimeout(seguir, 2000));
  const avisoTrasPedir = await opciones.$eval('[data-aviso]', (n) => n.textContent);
  revisar(
    avisoTrasPedir === '' && erroresOpciones.length === 0,
    `tildar una plataforma abre el cartel de Chrome en vez de fallar${
      avisoTrasPedir ? ` (dijo "${avisoTrasPedir}")` : ''
    }${erroresOpciones.length ? ` (errores: ${erroresOpciones.join(' · ')})` : ''}`,
  );
  const trasPedir = await trabajador.evaluate(() => chrome.permissions.getAll());
  revisar(
    (trasPedir.origins || []).length === 1,
    'y sin que nadie conteste el cartel, no se concede nada',
  );
  console.log('     (falta hacer a mano lo de apretar "Permitir" y ver que aparezca solo.)');

  /**
   * EL CONTROL QUE VALE MÁS QUE TODOS LOS DE ARRIBA, porque mide el efecto y no
   * la configuración. Entrar a Netflix sin haber apretado nada tiene que dejar
   * la página exactamente como estaba.
   */
  const netflix = await navegador.newPage();
  await netflix.goto('https://www.netflix.com/ar/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((seguir) => setTimeout(seguir, 3000));
  const hayPanel = await netflix.evaluate(() => Boolean(document.getElementById('pochoclo-panel')));
  revisar(!hayPanel, 'entrando a Netflix recién instalada, la extensión no dibuja nada');

  /**
   * APRETAR EL ÍCONO DONDE EL PANEL NO PUEDE ENTRAR.
   *
   * La pestaña nueva de Chrome es el caso más probable de todos, porque muestra
   * el buscador de Google y se parece a un sitio cualquiera. Ahí Chrome contesta
   * "Cannot access a chrome:// URL", y hasta el 2026-09-25 ese texto salía crudo
   * al globito del ícono.
   *
   * SE MIDE EL GLOBITO Y NO EL CAMINO DEL CLICK, que sigue siendo lo único que
   * no se puede automatizar. Lo que se ejercita es exactamente lo que hace el
   * oyente, o sea inyectar y avisar con lo que devolvió.
   */
  const pestaniaNueva = await navegador.newPage();
  // `goto` a una dirección `chrome://` puede rechazar desde el protocolo de
  // depuración, y la pestaña queda igual, que es lo único que hace falta.
  await pestaniaNueva
    .goto('chrome://new-tab-page/', { waitUntil: 'domcontentloaded' })
    .catch(() => {});
  await new Promise((seguir) => setTimeout(seguir, 700));

  const avisado = await trabajador.evaluate(async () => {
    const [p] = await chrome.tabs.query({ active: true, currentWindow: true });
    const r = await inyectarPanel(p.id);
    await avisarFalloDeInyeccion(p.id, r.error);
    return {
      crudo: r.error,
      globito: await chrome.action.getTitle({ tabId: p.id }),
      insignia: await chrome.action.getBadgeText({ tabId: p.id }),
    };
  });
  revisar(
    /chrome:\/\//.test(avisado.crudo || ''),
    `en la pestaña nueva Chrome se niega a inyectar (${avisado.crudo})`,
  );
  revisar(
    avisado.insignia === '!' && /^No podés usar Pochoclo/.test(avisado.globito),
    `y el globito del ícono lo dice en castellano ("${avisado.globito}")`,
  );
  revisar(
    !/Cannot|Error|chrome:\/\//.test(avisado.globito),
    'y no le muestra nada del texto crudo de Chrome',
  );

  // El aviso informa de un intento y no de un estado, así que a los ocho
  // segundos tiene que devolver el globito del manifest. Dejarlo en cadena
  // vacía, que es lo que hacía antes, deja esta pestaña sin globito.
  await new Promise((seguir) => setTimeout(seguir, 8500));
  const despuesDelAviso = await trabajador.evaluate(async () => {
    const [p] = await chrome.tabs.query({ active: true, currentWindow: true });
    return {
      globito: await chrome.action.getTitle({ tabId: p.id }),
      global: await chrome.action.getTitle({}),
      insignia: await chrome.action.getBadgeText({ tabId: p.id }),
    };
  });
  revisar(
    despuesDelAviso.insignia === '' &&
      despuesDelAviso.globito === despuesDelAviso.global,
    `y al borrarse vuelve el globito de siempre ("${despuesDelAviso.globito}")`,
  );
} finally {
  await navegador.close();
}

console.log('\n' + (mal === 0 ? 'TODO BIEN' : `${mal} MAL`));
process.exitCode = mal === 0 ? 0 : 1;
