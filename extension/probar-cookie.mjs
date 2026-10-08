/**
 * LA PREGUNTA 1 DEL EXPERIMENTO, CONTESTADA SIN NECESIDAD DE UNA CUENTA.
 *
 * La duda de la sección 7 del análisis es si Chrome le adjunta al service
 * worker de una extensión (con `host_permissions`) una cookie `SameSite=Lax`
 * de api.pochoclo.ar. No hace falta una sesión de verdad para medirlo: se
 * planta una cookie de prueba con los MISMOS atributos que la de sesión y se
 * mira si viaja.
 *
 * `httpOnly` es la única diferencia y no cambia nada acá: solo le prohíbe a
 * JavaScript LEER la cookie, no cambia cuándo el navegador la MANDA. Por eso
 * una cookie puesta con `document.cookie` sirve de sonda.
 *
 * Lo que se mira no es la respuesta del servidor sino lo que Chrome dijo que
 * mandó, con `Network.requestWillBeSentExtraInfo` por CDP, que además informa
 * el MOTIVO cuando decide excluir una cookie.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME;
if (!CHROME || !existsSync(CHROME)) throw new Error('Falta CHROME (Chrome for Testing)');
const PERFIL = process.env.PERFIL_PRUEBA;
if (!PERFIL) throw new Error('Falta PERFIL_PRUEBA');

const EXTENSION = 'C:/pochoclo/extension';
const API = 'https://api.pochoclo.ar';
const COOKIE = 'prueba_v4';

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

/**
 * Devuelve qué hizo Chrome con la cookie de prueba en el pedido a `url`.
 *
 * HAY QUE CORRELACIONAR DOS EVENTOS Y NO ALCANZA CON UNO SOLO.
 * `requestWillBeSentExtraInfo` trae las cookies pero no la dirección, y
 * `requestWillBeSent` trae la dirección pero no las cookies. Sin cruzarlos por
 * `requestId` se termina midiendo el pedido equivocado, que es justo lo que
 * pasó la primera vez: el control dio `DomainMismatch` porque había agarrado
 * un pedido de la propia página a pochoclo.ar, donde una cookie de
 * api.pochoclo.ar efectivamente no corresponde.
 */
function espiar(cdp, url) {
  return new Promise((resolve) => {
    const direcciones = new Map();
    const cookies = new Map();

    const resolverSiHayPar = (id) => {
      if (!direcciones.has(id) || !cookies.has(id)) return;
      if (direcciones.get(id) !== url) return;
      cdp.off('Network.requestWillBeSent', verDireccion);
      cdp.off('Network.requestWillBeSentExtraInfo', verCookies);
      clearTimeout(reloj);
      const asociadas = cookies.get(id);
      const nuestra = asociadas.find((c) => c.cookie && c.cookie.name === COOKIE);
      if (!nuestra) {
        resolve({ enviada: false, motivos: ['la cookie ni figura en el pedido'] });
        return;
      }
      resolve({
        enviada: !nuestra.blockedReasons || nuestra.blockedReasons.length === 0,
        motivos: nuestra.blockedReasons || [],
      });
    };

    const verDireccion = (e) => {
      direcciones.set(e.requestId, e.request.url);
      resolverSiHayPar(e.requestId);
    };
    const verCookies = (e) => {
      cookies.set(e.requestId, e.associatedCookies || []);
      resolverSiHayPar(e.requestId);
    };

    cdp.on('Network.requestWillBeSent', verDireccion);
    cdp.on('Network.requestWillBeSentExtraInfo', verCookies);
    const reloj = setTimeout(() => {
      cdp.off('Network.requestWillBeSent', verDireccion);
      cdp.off('Network.requestWillBeSentExtraInfo', verCookies);
      resolve({ enviada: false, motivos: ['no vi ese pedido'] });
    }, 20000);
  });
}

try {
  // 1. Plantar la cookie, con los atributos de la de sesión de Better Auth.
  const sitio = await navegador.newPage();
  await sitio.goto(`${API}/salud`, { waitUntil: 'domcontentloaded' });
  await sitio.evaluate((nombre) => {
    document.cookie = `${nombre}=1; Path=/; Secure; SameSite=Lax; Max-Age=600`;
  }, COOKIE);
  const plantada = await sitio.evaluate(() => document.cookie);
  console.log('cookie plantada en api.pochoclo.ar:', plantada || '(ninguna)');
  if (!plantada.includes(COOKIE)) throw new Error('No se pudo plantar la cookie de prueba');

  // 2. CONTROL POSITIVO. Desde una pestaña de pochoclo.ar, que es same-site.
  const web = await navegador.newPage();
  await web.goto('https://pochoclo.ar/', { waitUntil: 'domcontentloaded' });
  const cdpWeb = await web.createCDPSession();
  await cdpWeb.send('Network.enable');
  const desdeLaWeb = espiar(cdpWeb, `${API}/salud`);
  await web.evaluate((api) => fetch(`${api}/salud`, { credentials: 'include' }), API);
  console.log('\nCONTROL desde una pestaña de pochoclo.ar:', JSON.stringify(await desdeLaWeb));

  // 3. LA MEDICIÓN. El mismo pedido, desde el service worker de la extensión.
  const objetivo = await navegador.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().includes('service-worker.js'),
    { timeout: 20000 },
  );
  const cdpSw = await objetivo.createCDPSession();
  await cdpSw.send('Network.enable');
  const worker = await objetivo.worker();
  const desdeLaExtension = espiar(cdpSw, `${API}/salud`);
  await worker.evaluate((api) => fetch(`${api}/salud`, { credentials: 'include' }), API);
  console.log('MEDICIÓN desde el service worker:  ', JSON.stringify(await desdeLaExtension));
} finally {
  await navegador.close();
}
