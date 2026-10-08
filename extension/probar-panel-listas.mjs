/**
 * PASO 6. Comprueba los botones de las tres listas del panel, y sobre todo
 * comprueba que sean usables sin mouse y sin ver la pantalla.
 *
 * HAY QUE MEDIRLO CON CDP Y NO CON `page.$` NI CON axe-core, y el motivo es
 * el shadow root CERRADO. Nada de lo que corre adentro de la página lo puede
 * abrir, así que `document.querySelector` no ve un solo nodo del panel, el
 * selector `>>>` de puppeteer devuelve cero (comprobado el 2026-09-12) y
 * axe-core, que solo entra a los shadow roots abiertos, tampoco.
 *
 * Lo que sí entra es el protocolo del navegador, y por dos puertas distintas.
 * `DOM.getDocument` con `pierce` devuelve el árbol con los shadow roots
 * adentro, y `Accessibility.getFullAXTree` devuelve **lo mismo que Chrome le
 * entrega a un lector de pantalla**, que es la única forma de comprobar de
 * verdad lo que se anuncia. Es el mismo camino que usa `lector-simulado.mjs`
 * en el sitio.
 *
 * Uso:
 *   CHROME=<ruta> PERFIL_PRUEBA=<carpeta> node probar-panel-listas.mjs [--entrar] [--listas]
 *
 * `--entrar` abre pochoclo.ar y espera a que inicies sesión antes de medir.
 * Conservando la carpeta del perfil, la sesión queda para las corridas
 * siguientes y el panel pasa a mostrar los tres botones en vez de la
 * invitación a entrar.
 *
 * `--listas` ESCRIBE EN TUS LISTAS DE VERDAD, y por eso está apagado por
 * omisión. Agrega el título a Favoritas, contesta "Ahora no" a la pregunta de
 * Visto (así no toca esa lista, que es la que cambia las recomendaciones) y lo
 * vuelve a sacar, comprobando que el estado quede como estaba. Contra la API
 * publicada, o sea contra tu cuenta.
 *
 * `--simular` CONTESTA LAS RUTAS DE LISTAS DESDE ACÁ, sin cuenta y sin
 * escribirle nada a nadie, y es lo que permite medir los tres botones en una
 * corrida automática. Vale la pena entender qué prueba y qué no. Prueba el
 * panel entero de punta a punta (el mensaje al service worker, el estado de
 * cada botón, el foco, lo que se anuncia y la pregunta de Visto) contra el
 * service worker de verdad; lo único que no prueba es que el backend conteste
 * lo que decimos que contesta, y eso ya está fijado por las rutas de
 * `backend/src/routes/listas.js`.
 *
 * La intercepción va enganchada AL SERVICE WORKER y no a la pestaña, porque
 * los pedidos a la API salen de ahí y no de la página (sección 6.1 del
 * análisis).
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import {
  apagarAparicionAutomatica,
  extensionParaPruebas,
  ID,
  inyectarPanel,
  serviceWorker,
} from './pruebas-comun.mjs';

const CHROME = process.env.CHROME;
if (!CHROME || !existsSync(CHROME)) throw new Error('Falta CHROME (Chrome for Testing)');
const PERFIL = process.env.PERFIL_PRUEBA;
if (!PERFIL) throw new Error('Falta PERFIL_PRUEBA');

// Con los permisos de las plataformas pasados a obligatorios, porque el ícono
// de la barra no se puede clickear desde una prueba. Ver `pruebas-comun.mjs`.
const copia = extensionParaPruebas();
// Fijado con el campo `key` del manifest, así no depende de la ruta del disco.

const ENTRAR = process.argv.includes('--entrar');
const TOCAR_LISTAS = process.argv.includes('--listas');
const SIMULAR = process.argv.includes('--simular');
const SITIO =
  process.argv.find((a) => a.startsWith('--sitio='))?.slice(8) || 'https://www.netflix.com/ar/';

let mal = 0;
const revisar = (ok, texto) => {
  if (!ok) mal += 1;
  console.log(`${ok ? 'ok  ' : 'MAL '} ${texto}`);
};

// ---------------------------------------------------------------------------
// Herramientas de CDP, que son lo único que atraviesa el shadow root cerrado.
// ---------------------------------------------------------------------------

const descendientes = (nodo) => [
  ...(nodo.children || []),
  ...(nodo.shadowRoots || []),
  ...(nodo.contentDocument ? [nodo.contentDocument] : []),
];

/**
 * Los nodos DEL PANEL, shadow root cerrado adentro.
 *
 * ARRANCA EN EL ANFITRIÓN Y NO EN EL DOCUMENTO, y la primera versión no lo
 * hacía. Midiendo desde la raíz, la comprobación de los blancos de 24x24
 * contaba los 31 botones de Netflix junto con los nuestros, o sea que decía
 * "ok" sobre el trabajo de otro.
 */
async function nodosDelPanel(cdp) {
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  let anfitrion = null;
  (function buscar(nodo) {
    if (atributos(nodo).id === 'pochoclo-panel') anfitrion = nodo;
    if (!anfitrion) for (const hijo of descendientes(nodo)) buscar(hijo);
  })(root);
  if (!anfitrion) return [];

  const todos = [];
  (function caminar(nodo) {
    todos.push(nodo);
    for (const hijo of descendientes(nodo)) caminar(hijo);
  })(anfitrion);
  return todos;
}

/** Los atributos de CDP vienen como una lista plana de nombre, valor, nombre... */
function atributos(nodo) {
  const salida = {};
  const lista = nodo.attributes || [];
  for (let i = 0; i < lista.length; i += 2) salida[lista[i]] = lista[i + 1];
  return salida;
}

const conAtributo = (nodos, nombre) => nodos.filter((n) => atributos(n)[nombre] !== undefined);

async function caja(cdp, nodeId) {
  try {
    const { model } = await cdp.send('DOM.getBoxModel', { nodeId });
    const [x1, y1, , , x3, y3] = model.border;
    return { x: x1, y: y1, ancho: x3 - x1, alto: y3 - y1 };
  } catch {
    return null;
  }
}

/**
 * ¿ESTE NODO TIENE EL FOCO?
 *
 * NO SE PUEDE BUSCAR "EL NODO ENFOCADO" EN EL ÁRBOL COMPLETO, y la primera
 * versión de esto lo intentaba. Chrome cuelga la marca `focused` del nodo raíz
 * del documento, así que la búsqueda siempre devolvía el título de la página
 * ("Netflix: Ve series online...") pasara lo que pasara. Es la misma trampa que
 * documenta `lector-simulado.mjs` en el sitio.
 *
 * Y `document.activeElement` tampoco sirve, porque con un shadow root el
 * navegador lo redirige al anfitrión, así que contesta el `div` del panel y
 * nunca el botón de adentro. La salida es preguntar por el nodo concreto que
 * uno espera, con `getPartialAXTree`.
 */
async function estaEnfocado(cdp, nodo) {
  if (!nodo) return false;
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    backendNodeId: nodo.backendNodeId,
  });
  const suyo = nodes.find((n) => n.backendDOMNodeId === nodo.backendNodeId);
  return Boolean(
    (suyo?.properties || []).some((p) => p.name === 'focused' && p.value?.value === true),
  );
}

/** Un click de verdad sobre un nodo que el mouse no podría apuntar a ciegas. */
async function clickear(cdp, nodeId) {
  const { object } = await cdp.send('DOM.resolveNode', { nodeId });
  await cdp.send('Runtime.callFunctionOn', {
    objectId: object.objectId,
    functionDeclaration: 'function () { this.click(); }',
  });
}

/**
 * El árbol de accesibilidad del panel, transcripto como lo diría un lector.
 * Se corta en los nodos cuyo nombre ya es todo su contenido (botones,
 * enlaces), por el mismo motivo que `lector-simulado.mjs` en el sitio. Sin ese
 * corte cada texto aparece tres veces y la transcripción deja de servir para
 * juzgar si se entiende.
 */
const HOJAS = new Set(['button', 'link', 'heading', 'StaticText']);

async function transcribir(cdp) {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const porId = new Map(nodes.map((n) => [n.nodeId, n]));
  const raiz = nodes.find(
    (n) => n.role?.value === 'region' && n.name?.value === 'Pochoclo',
  );
  if (!raiz) return { lineas: [], nodos: [], enfocado: null };

  const lineas = [];
  const planos = [];
  (function bajar(nodo, nivel) {
    const rol = nodo.role?.value || '?';
    const nombre = nodo.name?.value || '';

    const props = Object.fromEntries(
      (nodo.properties || []).map((p) => [p.name, p.value?.value]),
    );
    const extras = [];
    if (props.pressed !== undefined) extras.push(`marcado=${props.pressed}`);
    if (props.disabled) extras.push('deshabilitado');
    if (props.live) extras.push(`vivo=${props.live}`);
    if (props.focused) extras.push('CON FOCO');

    if (!nodo.ignored && rol !== 'generic' && rol !== 'none') {
      lineas.push(`${'  '.repeat(nivel)}${rol}${nombre ? ` "${nombre}"` : ''}${extras.length ? ` [${extras.join(', ')}]` : ''}`);
      planos.push({ rol, nombre, ...props });
    }
    if (!nodo.ignored && HOJAS.has(rol)) return;
    /**
     * UN NODO IGNORADO NO SE IMPRIME PERO SÍ SE RECORRE, y la primera versión
     * de esto abandonaba ahí. Chrome marca `ignored` a casi todos los `div` de
     * maquetado, así que cortar dejaba la transcripción en dos líneas y tres
     * comprobaciones daban MAL sin que al panel le faltara nada.
     */
    const invisible = nodo.ignored || rol === 'generic' || rol === 'none';
    for (const id of nodo.childIds || []) {
      const hijo = porId.get(id);
      if (hijo) bajar(hijo, invisible ? nivel : nivel + 1);
    }
  })(raiz, 0);

  const enfocado = nodes.find((n) =>
    (n.properties || []).some((p) => p.name === 'focused' && p.value?.value === true),
  );
  return { lineas, nodos: planos, enfocado: enfocado?.name?.value ?? null };
}

// ---------------------------------------------------------------------------

const navegador = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  userDataDir: PERFIL,
  args: [
    `--disable-extensions-except=${copia.ruta}`,
    `--load-extension=${copia.ruta}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

/**
 * Las respuestas de mentira, con la forma exacta de `routes/listas.js`.
 * `sugerirVisto` en true es lo que devuelve el backend al agregar a Favoritas
 * algo que no está en Visto, o sea el caso que dispara la pregunta.
 */
function respuestaSimulada(metodo, ruta) {
  if (ruta === '/listas') {
    return { listas: { favoritas: [], visto: [], ver_mas_tarde: [] }, vistosEnVerMasTarde: [], plataformas: [] };
  }
  if (metodo === 'DELETE') return { quitado: true };
  return { agregado: true, sugerirVisto: ruta === '/listas/favoritas' };
}

async function simularListas(navegador) {
  const destino = await navegador.waitForTarget((t) => t.type() === 'service_worker', {
    timeout: 20000,
  });
  const sesion = await destino.createCDPSession();
  const pedidos = [];
  sesion.on('Fetch.requestPaused', async ({ requestId, request }) => {
    const ruta = new URL(request.url).pathname;
    pedidos.push(`${request.method} ${ruta}`);
    const cuerpo = JSON.stringify(respuestaSimulada(request.method, ruta));
    await sesion.send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'content-type', value: 'application/json' }],
      body: Buffer.from(cuerpo).toString('base64'),
    });
  });
  await sesion.send('Fetch.enable', {
    patterns: [{ urlPattern: 'https://api.pochoclo.ar/listas*' }],
  });
  return pedidos;
}

try {
  const pedidosSimulados = SIMULAR ? await simularListas(navegador) : null;

  if (ENTRAR) {
    const sitio = await navegador.newPage();
    await sitio.goto('https://pochoclo.ar/iniciar-sesion', { waitUntil: 'domcontentloaded' });
    console.log('Iniciá sesión en la ventana que se abrió. Espero hasta 3 minutos.');
    await sitio.waitForFunction(() => !location.pathname.startsWith('/iniciar-sesion'), {
      timeout: 180000,
      polling: 1000,
    });
    console.log('Sesión iniciada.\n');
    await sitio.close();
  }

  /**
   * EL SERVICE WORKER VIEJO SE QUEDA PEGADO EN UN PERFIL REUSADO, y hay que
   * atajarlo acá porque el síntoma no se parece a la causa.
   *
   * Chrome conserva el service worker registrado en la carpeta del perfil, así
   * que después de agregarle una ruta nueva a `RUTAS` puede seguir corriendo la
   * versión anterior. Ahí `RUTAS[clave]` da `undefined`, el oyente devuelve
   * `false` y nadie contesta, y Chrome informa **"The message port closed
   * before a response was received"**, que suena a un problema del mensaje y no
   * a un archivo viejo. Lo delator es que las rutas de antes siguen andando y
   * solo fallan las nuevas. Ya pasó dos veces en este proyecto.
   */
  const revisor = await navegador.newPage();
  await revisor.goto(`chrome-extension://${ID}/opciones.html`, { waitUntil: 'domcontentloaded' });
  const sonda = await revisor.evaluate(
    () =>
      new Promise((res) => {
        chrome.runtime.sendMessage({ tipo: 'estado-listas', clave: null }, (r) =>
          res(chrome.runtime.lastError ? { lastError: chrome.runtime.lastError.message } : r),
        );
      }),
  );
  await revisor.close();
  if (sonda?.lastError) {
    console.error(
      `El service worker no conoce la ruta "estado-listas" (${sonda.lastError}).
` +
        `Casi seguro quedó registrada una versión vieja en el perfil. Borrá ${PERFIL} y volvé a correr.`,
    );
    process.exitCode = 1;
    await navegador.close();
    process.exit(1);
  }

  /**
   * La aparición automática de la sección 21, que en la copia de pruebas
   * arranca prendida porque los permisos están concedidos. Se comprueba que se
   * haya registrado y se apaga, para que el panel entre por un solo camino.
   */
  const automatica = await apagarAparicionAutomatica(navegador);
  revisar(
    automatica.length > 0,
    `la aparición automática registra el guión donde tiene permiso (${automatica.length} patrones)`,
  );
  console.log(`Se registró en: ${automatica.join(', ') || '(nada)'}
`);

  const pagina = await navegador.newPage();
  await pagina.goto(SITIO, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await pagina.bringToFront();
  // Por el mismo camino que el click en el ícono. Desde el paso 7 no hay
  // ningún `content_scripts` en el manifest, así que el panel no entra solo.
  await inyectarPanel(navegador);
  await pagina.waitForFunction(
    () => {
      const h = document.getElementById('pochoclo-panel');
      return h && h.dataset.resultado;
    },
    { timeout: 45000 },
  );

  const resultado = JSON.parse(
    await pagina.$eval('#pochoclo-panel', (n) => n.dataset.resultado),
  );
  console.log(`Plataforma ${resultado.plataforma}, sesión ${resultado.sesion}, título "${resultado.titulo}"\n`);

  if (SIMULAR) {
    console.log(`Pedidos al dibujarse el panel: ${pedidosSimulados.join(', ') || '(ninguno)'}
`);
  }

  const cdp = await pagina.createCDPSession();
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
  await cdp.send('Runtime.enable');

  // --- Lo que se anuncia -----------------------------------------------------
  const { lineas, nodos } = await transcribir(cdp);
  console.log('LO QUE ESCUCHA UN LECTOR DE PANTALLA');
  for (const l of lineas) console.log('  ' + l);
  console.log('');

  revisar(lineas.length > 0, 'el panel es un landmark llamado "Pochoclo"');
  revisar(
    nodos.some((n) => n.rol === 'button' && n.nombre === 'Cerrar el panel de Pochoclo'),
    'el botón de cerrar dice qué cierra',
  );
  revisar(
    nodos.some((n) => n.live === 'polite'),
    'hay una región viva cortés para los avisos',
  );
  revisar(
    !nodos.some((n) => n.rol === 'heading'),
    'no mete ningún encabezado en el esquema de la página anfitriona',
  );

  // --- Lo que la sección 21 pide que muestre el panel ------------------------
  console.log('SECCIÓN 21');

  // El rol de un `role="img"` llega como "image" en el árbol de Chrome.
  const medalla = nodos.find((n) => /^image$|^img$/.test(n.rol) && /^Puntuación/.test(n.nombre));
  revisar(
    Boolean(medalla),
    `la Puntuación se anuncia entera${medalla ? ' ("' + medalla.nombre + '")' : ''}`,
  );
  revisar(
    nodos.some((n) => n.rol === 'link' && /Ver la ficha/.test(n.nombre) && /pesta.a nueva/i.test(n.nombre)),
    'el enlace a la Ficha dice a dónde va y que abre una pestaña nueva',
  );
  revisar(
    nodos.some((n) => n.rol === 'button' && /Otro t.tulo/.test(n.nombre)),
    'hay un botón para pedir otro título',
  );
  revisar(
    lineas.some((l) => /seg.n TMDb/.test(l)),
    'dice de dónde sale el dato de disponibilidad',
  );

  /**
   * EL LOGO DE TMDb SE MIDE CONTRA LA MARCA PROPIA, que es la condición de su
   * licencia y la única de las tres que se puede comprobar sola. Que sea el
   * archivo oficial y que no esté deformado lo garantiza el `viewBox`, que no
   * se toca; que quede menos prominente depende del alto que le demos acá y es
   * lo que se puede romper sin querer al mover el CSS.
   */
  const nodosMarca = await nodosDelPanel(cdp);
  const logo = nodosMarca.find((n) => (atributos(n).class || '').split(' ').includes('tmdb'));
  const marca = nodosMarca.find((n) => (atributos(n).class || '').split(' ').includes('marca'));
  const cajaLogo = logo ? await caja(cdp, logo.nodeId) : null;
  const cajaMarca = marca ? await caja(cdp, marca.nodeId) : null;
  revisar(Boolean(cajaLogo), 'el logo de TMDb está dibujado');
  if (cajaLogo && cajaMarca) {
    revisar(
      cajaLogo.alto < cajaMarca.alto,
      `y queda menos prominente que la marca propia (${Math.round(cajaLogo.alto)}px contra ${Math.round(cajaMarca.alto)}px de alto)`,
    );
  }
  /**
   * El logo va con `aria-hidden`, así que NO tiene que aparecer como una imagen
   * más en el árbol. La atribución para quien no ve la pantalla ya está en la
   * línea de arriba, y anunciar las dos cosas sería leer "TMDb" dos veces
   * seguidas. Se mira solo entre los nodos con rol de imagen, porque la línea de
   * texto también dice TMDb y es la que tiene que decirlo.
   */
  revisar(
    !nodos.some((n) => /^image$|^img$/.test(n.rol) && /TMDB|Movie Database/i.test(n.nombre || '')),
    'y no se anuncia aparte, porque la línea de arriba ya nombra a TMDb',
  );
  console.log('');

  const conSesion = resultado.sesion === true;
  if (SIMULAR) {
    revisar(conSesion, 'con las rutas simuladas el panel se comporta como con sesión');
  }
  const ETIQUETAS = ['Favoritas', 'Visto', 'Ver más tarde'];
  if (conSesion) {
    for (const etiqueta of ETIQUETAS) {
      const b = nodos.find((n) => n.rol === 'button' && n.nombre === etiqueta);
      revisar(Boolean(b), `hay un botón "${etiqueta}"`);
      revisar(b && b.pressed !== undefined, `"${etiqueta}" anuncia si está marcado`);
    }
  } else {
    revisar(
      nodos.some((n) => n.rol === 'link' && /Entrá a Pochoclo/.test(n.nombre)),
      'sin sesión ofrece entrar, en vez de botones que no andarían',
    );
    revisar(
      nodos.some((n) => n.rol === 'link' && /pesta.a nueva/i.test(n.nombre)),
      'y avisa que el enlace abre una pestaña nueva',
    );
    console.log('     (sin sesión no se pueden medir los tres botones. Corré con --entrar.)');
  }

  // --- Tamaño de los blancos y ancho contra la ventana -----------------------
  console.log('\nGEOMETRÍA');
  const MEDIDAS = [
    ['normal', 1280, 800],
    // 320 px de ancho es lo que pide el criterio 1.4.10, y en escritorio se
    // llega con el zoom al 400% sobre una ventana de 1280.
    ['reflujo 1.4.10', 320, 800],
  ];

  for (const [nombre, ancho, alto] of MEDIDAS) {
    await pagina.setViewport({ width: ancho, height: alto });
    // Un cuadro para que el layout se acomode al viewport nuevo.
    await pagina.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    const nodos = await nodosDelPanel(cdp);
    const panel = nodos.find((n) => (atributos(n).class || '').split(' ').includes('panel'));
    const cajaPanel = panel ? await caja(cdp, panel.nodeId) : null;

    if (cajaPanel) {
      const dentro = cajaPanel.x >= 0 && cajaPanel.x + cajaPanel.ancho <= ancho + 0.5;
      revisar(dentro, `${nombre} a ${ancho}px, el panel entra en la pantalla (${Math.round(cajaPanel.x)} a ${Math.round(cajaPanel.x + cajaPanel.ancho)})`);
    } else {
      revisar(false, `${nombre} a ${ancho}px, no encontré el panel`);
    }

    const botones = nodos.filter((n) => n.nodeName === 'BUTTON');
    let chicos = [];
    for (const b of botones) {
      const c = await caja(cdp, b.nodeId);
      if (c && (c.ancho < 24 || c.alto < 24)) {
        chicos.push(`${atributos(b)['aria-label'] || atributos(b)['data-lista'] || '?'} ${Math.round(c.ancho)}x${Math.round(c.alto)}`);
      }
    }
    revisar(
      chicos.length === 0,
      `${nombre} a ${ancho}px, los ${botones.length} botones llegan a 24x24 (criterio 2.5.8)${chicos.length ? ', salvo ' + chicos.join(', ') : ''}`,
    );
  }
  await pagina.setViewport({ width: 1280, height: 800 });

  // --- Escape y el foco ------------------------------------------------------
  console.log('\nTECLADO');
  if (conSesion && (TOCAR_LISTAS || SIMULAR)) {
    console.log(
      SIMULAR
        ? '  (rutas simuladas, no se escribe nada en ninguna cuenta)'
        : '  (--listas está prendido, esto ESCRIBE en tus listas de verdad)',
    );
    const antes = await nodosDelPanel(cdp);
    const favoritas = conAtributo(antes, 'data-lista').find((n) => atributos(n)['data-lista'] === 'favoritas');
    const marcadoAntes = atributos(favoritas)['aria-pressed'] === 'true';

    await clickear(cdp, favoritas.nodeId);
    await new Promise((r) => setTimeout(r, 2500));

    const t1 = await transcribir(cdp);
    const fav1 = t1.nodos.find((n) => n.nombre === 'Favoritas');
    revisar(fav1 && fav1.pressed === (marcadoAntes ? 'false' : 'true'), 'al tocarlo cambia el estado marcado');
    revisar(
      t1.nodos.some((n) => n.live === 'polite' && n.nombre) ||
        t1.lineas.some((l) => /Agregado a Favoritas|Quitado de Favoritas/.test(l)),
      'el cambio se anuncia en la región viva',
    );

    const preguntaVisible = t1.lineas.some((l) => /Ya viste/.test(l));
    if (preguntaVisible) {
      const conPregunta = await nodosDelPanel(cdp);
      const grupo = conAtributo(conPregunta, 'data-grupo')[0];
      revisar(await estaEnfocado(cdp, grupo), 'el foco se va a la pregunta, que se lee entera');

      const no = conAtributo(conPregunta, 'data-no')[0];
      await clickear(cdp, no.nodeId);
      await new Promise((r) => setTimeout(r, 400));

      const t2 = await transcribir(cdp);
      const despuesDeCerrar = await nodosDelPanel(cdp);
      const favoritas2 = conAtributo(despuesDeCerrar, 'data-lista').find(
        (n) => atributos(n)['data-lista'] === 'favoritas',
      );
      revisar(
        await estaEnfocado(cdp, favoritas2),
        'al cerrar la pregunta el foco vuelve a Favoritas y no al body',
      );
      revisar(!t2.lineas.some((l) => /Ya viste/.test(l)), 'y la pregunta desaparece');

      // Sacar de Favoritas con la pregunta abierta tiene que cerrarla. Antes
      // quedaba a la vista, y contestar "Sí" marcaba Visto con Favoritas vacía.
      const favoritaDe = async () =>
        conAtributo(await nodosDelPanel(cdp), 'data-lista').find(
          (n) => atributos(n)['data-lista'] === 'favoritas',
        );
      await clickear(cdp, (await favoritaDe()).nodeId); // quitar
      await new Promise((r) => setTimeout(r, 2500));
      await clickear(cdp, (await favoritaDe()).nodeId); // volver a agregar
      await new Promise((r) => setTimeout(r, 2500));
      const t4 = await transcribir(cdp);
      if (t4.lineas.some((l) => /Ya viste/.test(l))) {
        await clickear(cdp, (await favoritaDe()).nodeId); // quitar con la pregunta abierta
        await new Promise((r) => setTimeout(r, 2500));
        const t5 = await transcribir(cdp);
        const fav5 = t5.nodos.find((n) => n.nombre === 'Favoritas');
        revisar(
          fav5 && fav5.pressed === 'false' && !t5.lineas.some((l) => /Ya viste/.test(l)),
          'al sacar de Favoritas con la pregunta abierta, la pregunta se cierra',
        );
      } else {
        console.log('     (al volver a agregar no reapareció la pregunta, no se pudo probar el cierre.)');
      }
    } else {
      console.log('     (no apareció la pregunta de Visto. Pasa si el título ya estaba en Favoritas o en Visto.)');
    }

    // Dejar la lista como estaba.
    const despues = await nodosDelPanel(cdp);
    const fav2 = conAtributo(despues, 'data-lista').find((n) => atributos(n)['data-lista'] === 'favoritas');
    if ((atributos(fav2)['aria-pressed'] === 'true') !== marcadoAntes) {
      await clickear(cdp, fav2.nodeId);
      await new Promise((r) => setTimeout(r, 2500));
      const t3 = await transcribir(cdp);
      const fav3 = t3.nodos.find((n) => n.nombre === 'Favoritas');
      revisar(fav3 && fav3.pressed === String(marcadoAntes), 'la lista queda como estaba antes de la prueba');
    }
  } else if (conSesion) {
    console.log('  (--listas y --simular apagados, así que no se tocó ninguna lista.)');
  }

  if (SIMULAR) {
    console.log('  Pedidos que salieron hacia /listas: ' + pedidosSimulados.join(', '));
  }

  /**
   * EL BOTÓN DE PEDIR OTRO TÍTULO, que redibuja el panel entero.
   *
   * NO SE COMPRUEBA QUE EL TÍTULO CAMBIE, y no es pereza. El que sale lo sortea
   * el servidor entre los veinte mejores, así que repetirse es un
   * resultado legítimo y una prueba que lo exija va a fallar sola cada tanto.
   * Lo que sí tiene que pasar siempre es que el foco no se pierda, porque el
   * botón que se apretó se fue del DOM al redibujar, y que el título nuevo se
   * anuncie, porque quien no ve la pantalla no tiene otra forma de enterarse.
   */
  const nodosOtro = await nodosDelPanel(cdp);
  const botonOtro = conAtributo(nodosOtro, 'data-otro')[0];
  if (botonOtro) {
    const antes = JSON.parse(await pagina.$eval('#pochoclo-panel', (n) => n.dataset.resultado));
    // Se borra la marca para poder esperar a que la escriba el dibujo nuevo, en
    // vez de adivinar cuánto tarda la búsqueda.
    await pagina.$eval('#pochoclo-panel', (n) => delete n.dataset.resultado);
    await clickear(cdp, botonOtro.nodeId);
    await pagina.waitForFunction(
      () => {
        const h = document.getElementById('pochoclo-panel');
        return h && h.dataset.resultado;
      },
      { timeout: 45000 },
    );

    const despues = JSON.parse(await pagina.$eval('#pochoclo-panel', (n) => n.dataset.resultado));
    console.log(`  "${antes.titulo}" -> "${despues.titulo}"`);
    revisar(Boolean(despues.titulo), 'pedir otro título trae otro título');

    const conOtro = await nodosDelPanel(cdp);
    const botonOtro2 = conAtributo(conOtro, 'data-otro')[0];
    revisar(
      botonOtro2 && (await estaEnfocado(cdp, botonOtro2)),
      'y el foco se queda en el botón, que se redibujó',
    );
    const t4 = await transcribir(cdp);
    revisar(
      t4.lineas.some((l) => l.includes(despues.titulo)),
      'y el título nuevo se anuncia en la región viva',
    );
  }

  // El control positivo primero, y con el panel redibujado después, porque
  // cierra el panel de verdad.
  const nodosFoco = await nodosDelPanel(cdp);
  const paraEnfocar = conAtributo(nodosFoco, 'data-cerrar')[0];
  const { object: obj } = await cdp.send('DOM.resolveNode', { nodeId: paraEnfocar.nodeId });
  await cdp.send('Runtime.callFunctionOn', {
    objectId: obj.objectId,
    functionDeclaration: 'function () { this.focus(); }',
  });
  await pagina.keyboard.press('Escape');
  const cerroConEscape = await pagina.evaluate(() => !document.getElementById('pochoclo-panel'));
  revisar(cerroConEscape, 'Escape con el foco adentro cierra el panel');

  // Y ahora el control negativo, con el panel de vuelta.
  await pagina.reload({ waitUntil: 'domcontentloaded' });
  await inyectarPanel(navegador);
  await pagina.waitForFunction(
    () => {
      const h = document.getElementById('pochoclo-panel');
      return h && h.dataset.resultado;
    },
    { timeout: 45000 },
  );
  await pagina.keyboard.press('Tab');
  await pagina.keyboard.press('Escape');
  const sigueAbierto = await pagina.evaluate(() => Boolean(document.getElementById('pochoclo-panel')));
  console.log(`  Escape con el foco fuera del panel: ${sigueAbierto ? 'no lo cierra' : 'lo cierra'}`);
  revisar(sigueAbierto, 'Escape con el foco afuera NO se lo roba a la plataforma');

  const nodosCerrar = await nodosDelPanel(cdp);
  const cerrar = conAtributo(nodosCerrar, 'data-cerrar')[0];
  if (cerrar) {
    await clickear(cdp, cerrar.nodeId);
    await new Promise((r) => setTimeout(r, 200));
    const cerrado = await pagina.evaluate(() => !document.getElementById('pochoclo-panel'));
    revisar(cerrado, 'el botón de cerrar saca el panel de la página');
  }

  // ==========================================================================
  // CERRADO QUEDA CERRADO EN ESA PESTAÑA (2026-10-07)
  //
  // Lo encontró Ariel a mano: con la aparición automática prendida, cerrar el
  // panel y entrar a netflix.com/account lo volvía a abrir, porque esa es una
  // carga entera de la página. Se mide con el guión registrado de verdad y no
  // con `inyectarPanel`, que es el camino del ícono y a propósito no respeta la
  // marca. Y con un control positivo en una pestaña nueva, porque sin él "no
  // apareció" también lo daría un guión que no corre.
  // ==========================================================================
  console.log('\nCERRADO EN LA PESTAÑA');
  const marcaPuesta = () =>
    pagina.evaluate(() => sessionStorage.getItem('pochoclo-cerrado') === '1');
  revisar(await marcaPuesta(), 'cerrarlo lo anota en la pestaña');

  const trabajadorAuto = await serviceWorker(navegador);
  await trabajadorAuto.evaluate(() => sincronizarAparicionAutomatica());
  await pagina.reload({ waitUntil: 'domcontentloaded' });
  const otra = await navegador.newPage();
  await otra.goto(SITIO, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const aparecioEnOtra = await otra
    .waitForSelector('#pochoclo-panel', { timeout: 30000 })
    .then(() => true, () => false);
  revisar(aparecioEnOtra, 'en una pestaña nueva la aparición automática lo muestra (control)');
  const reaparecio = await pagina.evaluate(() => Boolean(document.getElementById('pochoclo-panel')));
  revisar(!reaparecio, 'y en la que se cerró, recargar no lo vuelve a abrir');
  await otra.close();
  await trabajadorAuto.evaluate(() => chrome.scripting.unregisterContentScripts());

  await pagina.bringToFront();
  await inyectarPanel(navegador);
  const abrioConIcono = await pagina
    .waitForFunction(
      () => {
        const h = document.getElementById('pochoclo-panel');
        return h && h.dataset.resultado;
      },
      { timeout: 45000 },
    )
    .then(() => true, () => false);
  revisar(abrioConIcono, 'el ícono lo abre igual, porque es un pedido explícito');
  revisar(!(await marcaPuesta()), 'y borra la marca, así que lo automático vuelve a valer');

  // ==========================================================================
  // CLICKS DE VERDAD, CON UNA PÁGINA QUE LOS CORTA
  //
  // Es el defecto que encontró Ariel a mano el 2026-09-27 y que esta prueba no
  // podía ver. En netflix.com/browse, con sesión de Netflix, la página deja
  // pasar `pointerdown` y `pointerup` pero corta el `click` antes de que llegue
  // al panel, así que los cinco controles quedaban de adorno y sin un solo
  // aviso. Acá no hay sesión de Netflix, así que el corte se reproduce a mano,
  // con el mismo efecto medido allá: un oyente en la captura de `document` que
  // frena la propagación y anula la acción.
  //
  // EL CLICK TIENE QUE SER DEL MOUSE DEL PROTOCOLO Y NO `click()`. El resto de
  // esta prueba clickea con `click()`, que es un evento sintético (`isTrusted`
  // en false), y el panel deja pasar esos por su camino de siempre a propósito.
  // `pagina.mouse` y `pagina.keyboard` generan eventos que Chrome marca como de
  // la persona, que son los únicos que el panel ataja en `window`.
  // ==========================================================================
  console.log('\nCLICKS CON LA PÁGINA CORTÁNDOLOS');

  await pagina.reload({ waitUntil: 'domcontentloaded' });
  await pagina.evaluate(() => {
    document.addEventListener(
      'click',
      (e) => {
        e.stopPropagation();
        e.preventDefault();
      },
      true,
    );
    // Cuenta los clicks que llegan a la burbuja de `window`, o sea los que la
    // página llegó a ver enteros. Sirve de control para el corte de arriba.
    window.__burbujas = 0;
    window.addEventListener('click', () => (window.__burbujas += 1));
  });
  await inyectarPanel(navegador);
  await pagina.waitForFunction(
    () => {
      const h = document.getElementById('pochoclo-panel');
      return h && h.dataset.resultado;
    },
    { timeout: 45000 },
  );

  /** El centro de un nodo del panel, en coordenadas de la ventana. */
  async function centro(nodo) {
    const { model } = await cdp.send('DOM.getBoxModel', { nodeId: nodo.nodeId });
    const q = model.border;
    return { x: (q[0] + q[4]) / 2, y: (q[1] + q[5]) / 2 };
  }
  const resultadoActual = () =>
    pagina.$eval('#pochoclo-panel', (h) => h.dataset.resultado || null);
  const esperarDibujo = () =>
    pagina
      .waitForFunction(() => document.getElementById('pochoclo-panel')?.dataset.resultado, {
        timeout: 45000,
      })
      .then(() => true)
      .catch(() => false);

  // El control: un click de verdad sobre la página, fuera del panel, no llega
  // a la burbuja. Sin esto, todo lo que sigue podría estar pasando porque el
  // corte no corta.
  await pagina.mouse.click(40, 700);
  revisar(
    (await pagina.evaluate(() => window.__burbujas)) === 0,
    'el corte de la página funciona (control, fuera del panel)',
  );

  await pagina.$eval('#pochoclo-panel', (h) => delete h.dataset.resultado);
  const c1 = await centro(conAtributo(await nodosDelPanel(cdp), 'data-otro')[0]);
  await pagina.mouse.click(c1.x, c1.y);
  revisar(await esperarDibujo(), 'con el mouse, "Otro título" trae otro título igual');

  await pagina.$eval('#pochoclo-panel', (h) => delete h.dataset.resultado);
  const otroTeclado = conAtributo(await nodosDelPanel(cdp), 'data-otro')[0];
  await cdp.send('DOM.focus', { nodeId: otroTeclado.nodeId });
  await pagina.keyboard.press('Enter');
  revisar(await esperarDibujo(), 'con el teclado, Enter sobre "Otro título" también');

  const antesDePestanias = (await navegador.pages()).length;
  const c2 = await centro(conAtributo(await nodosDelPanel(cdp), 'data-ficha')[0]);
  await pagina.mouse.click(c2.x, c2.y);
  let nueva = null;
  for (let intento = 0; intento < 20 && !nueva; intento += 1) {
    const pestanias = await navegador.pages();
    if (pestanias.length > antesDePestanias) nueva = pestanias[pestanias.length - 1];
    else await new Promise((r) => setTimeout(r, 250));
  }
  revisar(
    Boolean(nueva) && nueva.url().startsWith('https://pochoclo.ar/titulo/'),
    'y "Ver la ficha" abre la Ficha',
  );
  if (nueva) await nueva.close();
  await pagina.bringToFront();

  revisar(
    (await pagina.evaluate(() => window.__burbujas)) === 0,
    'y la página no se entera de ninguno de esos clicks',
  );

  const c3 = await centro(conAtributo(await nodosDelPanel(cdp), 'data-cerrar')[0]);
  await pagina.mouse.click(c3.x, c3.y);
  await new Promise((r) => setTimeout(r, 300));
  revisar(
    await pagina.evaluate(() => !document.getElementById('pochoclo-panel')),
    'y la cruz cierra el panel',
  );

  // ==========================================================================
  // SEGURIDAD
  //
  // Dos preguntas distintas y las dos se miden acá: qué puede LEER la
  // plataforma de lo que hace el panel, y qué le puede PEDIR al service
  // worker quien logre mandarle un mensaje.
  // ==========================================================================
  console.log('\nSEGURIDAD');

  await pagina.reload({ waitUntil: 'domcontentloaded' });
  /**
   * A PROPÓSITO SIN MODO DIAGNÓSTICO, o sea por el mismo camino exacto que el
   * click en el ícono de una extensión instalada. El resto de esta prueba
   * inyecta con diagnóstico, que es lo que le permite leer adentro del shadow
   * root cerrado; acá lo que se mide es justamente qué queda a la vista cuando
   * nadie lo pidió.
   */
  const trabajador = await serviceWorker(navegador);
  await trabajador.evaluate(() => inyectarPanel());

  let dibujado = false;
  for (let intento = 0; intento < 60 && !dibujado; intento += 1) {
    dibujado = conAtributo(await nodosDelPanel(cdp), 'data-otro').length > 0;
    if (!dibujado) await new Promise((r) => setTimeout(r, 500));
  }
  revisar(dibujado, 'sin modo diagnóstico el panel se dibuja igual');

  const loQueVeLaPagina = await pagina.evaluate(() => {
    const h = document.getElementById('pochoclo-panel');
    if (!h) return null;
    return { atributos: { ...h.dataset }, shadowAbierto: Boolean(h.shadowRoot) };
  });
  revisar(
    loQueVeLaPagina && Object.keys(loQueVeLaPagina.atributos).length === 0,
    'y el panel no deja ningún atributo con datos en el DOM de la plataforma',
  );
  revisar(
    loQueVeLaPagina && loQueVeLaPagina.shadowAbierto === false,
    'el shadow root sigue cerrado, así que la página no lo puede recorrer',
  );

  /**
   * LAS CERRADURAS DEL SERVICE WORKER, llamadas directamente en su contexto.
   *
   * No se pueden ejercitar por mensaje, porque un contexto no recibe sus
   * propios `sendMessage` y nada de afuera llega a `onMessage`. Lo que se está
   * midiendo igual es lo que importa, o sea que la comprobación viva adentro
   * de cada función y no en quien la llama.
   */
  const guardias = await trabajador.evaluate(async () => ({
    posterAjeno: await posterEnDataUri('https://ejemplo.invalido/x.png'),
    posterParecido: await posterEnDataUri('https://image.tmdb.org.otrositio.ar/t/p/w92/x.jpg'),
    posterConArroba: await posterEnDataUri('https://image.tmdb.org@otrositio.ar/x.jpg'),
    posterPropio: await posterEnDataUri('https://image.tmdb.org/t/p/w92/noexiste.jpg'),
    // EL CONTROL POSITIVO SALE DE UN PÓSTER DE VERDAD Y NO DE UNA RUTA ESCRITA
    // A MANO, que envejece el día que TMDb recicle ese archivo. Cuesta un
    // pedido a /buscar, que es el precio de comprobar que la lista blanca deja
    // pasar la única dirección para la que existe.
    posterReal: await (async () => {
      const t = await unTitulo(8);
      const ruta = t.resultado && t.resultado.poster;
      return ruta ? await posterEnDataUri(`https://image.tmdb.org/t/p/w92${ruta}`) : { dataUri: null };
    })(),
    nuestraApi: await posterEnDataUri('https://api.pochoclo.ar/listas'),
    proveedorAjeno: await unTitulo(531),
    listaAjena: await alternarLista({ lista: 'gustos', clave: { tmdb_id: 1, tipo: 'tv' } }),
    claveDeTexto: await alternarLista({
      lista: 'favoritas',
      clave: { tmdb_id: "1 OR 1=1; DROP TABLE items_lista--", tipo: 'tv' },
    }),
    tipoInventado: await alternarLista({ lista: 'favoritas', clave: { tmdb_id: 1, tipo: '../../gustos' } }),
  }));

  for (const [caso, texto] of [
    ['posterAjeno', 'el descargador de pósters rechaza cualquier otro origen'],
    ['posterParecido', 'y un dominio que empieza igual (image.tmdb.org.otrositio.ar)'],
    ['posterConArroba', 'y el rodeo del arroba (image.tmdb.org@otrositio.ar)'],
    ['nuestraApi', 'y nuestra propia API, que es a la que la extensión tiene permiso'],
  ]) {
    revisar(
      guardias[caso].dataUri === null && /origen no permitido/.test(guardias[caso].error || ''),
      texto,
    );
  }
  revisar(
    /^data:image\//.test(guardias.posterReal.dataUri || ''),
    'y a image.tmdb.org sí llega, o sea que la lista blanca no bloquea lo único que necesita',
  );
  /**
   * LO QUE SE COMPRUEBA ACÁ ES QUE NO SE DIBUJE NADA, y no con qué palabras
   * falla. Esta aserción pedía `HTTP 404` y es imposible de cumplir, porque las
   * respuestas 404 de image.tmdb.org llegan **sin** `Access-Control-Allow-Origin`
   * (medido el 2026-09-15), que las 200 sí traen, así que el `fetch` del
   * service worker lo corta el CORS antes de que nadie pueda mirar el estado y
   * el error que vuelve es el de red. Los dos caminos terminan igual y es lo
   * que importa, que es que no salga un `data:` con una página de error adentro.
   */
  revisar(guardias.posterPropio.dataUri === null, 'y un póster que no existe no se dibuja');

  revisar(
    guardias.proveedorAjeno.resultado === null &&
      /proveedor desconocido/.test(guardias.proveedorAjeno.error || ''),
    'no se le puede pedir una búsqueda de un proveedor fuera del catálogo',
  );
  revisar(
    guardias.listaAjena.ok === false && /lista desconocida/.test(guardias.listaAjena.error || ''),
    'ni escribir en una lista que no es una de las tres',
  );
  revisar(
    guardias.claveDeTexto.ok === false && guardias.claveDeTexto.error === 'clave inválida',
    'el identificador tiene que ser un entero, así que no hay texto que viaje a la ruta',
  );
  revisar(
    guardias.tipoInventado.ok === false && guardias.tipoInventado.error === 'clave inválida',
    'y el tipo sale de dos valores fijos, así que no se puede torcer la dirección',
  );
} finally {
  await navegador.close();
  copia.borrar();
}

console.log('\n' + (mal === 0 ? 'TODO BIEN' : `${mal} MAL`));
process.exitCode = mal === 0 ? 0 : 1;
