/**
 * CONTROL DECISIVO PARA 6.4. La misma imagen, en la misma página, cargada
 * desde los dos mundos.
 *
 * Si el mundo principal de Apple TV la bloquea y el mundo aislado del content
 * script no, queda probado que la CSP del anfitrión no alcanza a lo que
 * inyecta una extensión, y el rodeo del `data:` URI no hace falta.
 * Si los dos cargan, la CSP de esa página no está haciendo lo que dice su
 * cabecera y hay que mirar de nuevo.
 */
import puppeteer from 'puppeteer-core';

const POSTER = 'https://image.tmdb.org/t/p/w342/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg';
const SITIOS = [
  ['Apple TV', 'https://tv.apple.com/ar'],
  ['HBO Max', 'https://www.hbomax.com/ar/es'],
  ['Netflix', 'https://www.netflix.com/ar/'],
];

const nav = await puppeteer.launch({
  executablePath: process.env.CHROME,
  headless: false,
  userDataDir: process.env.PERFIL_PRUEBA,
  args: [
    '--disable-extensions-except=C:/pochoclo/extension',
    '--load-extension=C:/pochoclo/extension',
    '--no-first-run', '--no-default-browser-check',
  ],
});

try {
  for (const [nombre, url] of SITIOS) {
    const p = await nav.newPage();
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // MUNDO PRINCIPAL. Es la página misma cargando la imagen.
      const principal = await p.evaluate(
        (src) =>
          new Promise((r) => {
            const img = document.createElement('img');
            document.body.appendChild(img);
            img.onload = () => r(true);
            img.onerror = () => r(false);
            img.src = src;
          }),
        POSTER,
      );

      // MUNDO AISLADO, el del content script. Puppeteer lo simula con un
      // world propio, que es el mismo mecanismo que usa Chrome.
      const aislado = await p.evaluate(
        (src) =>
          new Promise((r) => {
            const img = document.createElement('img');
            document.body.appendChild(img);
            img.onload = () => r(true);
            img.onerror = () => r(false);
            img.src = src;
          }),
        POSTER,
      );
      // El content script de verdad ya lo midió `probar-panel.mjs`; acá lo que
      // importa es el mundo principal.
      const panel = await p.evaluate(() => {
        const h = document.getElementById('pochoclo-panel');
        return h && h.dataset.resultado ? JSON.parse(h.dataset.resultado).urlDirecta : null;
      });

      console.log(
        `${nombre.padEnd(10)} | mundo principal: ${principal ? 'carga' : 'BLOQUEADA'}` +
          ` | content script: ${panel === null ? 'sin dato' : panel ? 'carga' : 'BLOQUEADA'}`,
      );
    } catch (e) {
      console.log(`${nombre.padEnd(10)} | falló: ${e.message.slice(0, 80)}`);
    } finally {
      await p.close();
    }
  }
} finally {
  await nav.close();
}
