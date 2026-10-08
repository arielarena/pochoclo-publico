/**
 * PASOS 4 y 5. Dibuja el panel sobre cada plataforma y comprueba dos cosas:
 * que reconozca en cuál está (paso 5) y que la CSP de esa página deje cargar
 * el póster de TMDb, por los dos caminos posibles (paso 4).
 *
 * LOS CONTROLES NEGATIVOS DE LA DETECCIÓN NO ESTÁN ACÁ, y no es un olvido.
 * Este script carga las cinco plataformas de verdad, así que solo puede
 * comprobar que los aciertos acierten. Que un dominio parecido NO acierte lo
 * comprueba `probar-plataformas.mjs`, sin navegador.
 *
 * Las cabeceras ya se leyeron con curl y dicen que la única que acota los
 * dominios de `img-src` es Apple TV. Esto lo comprueba de verdad, que no es lo
 * mismo: la CSP de la página de entrada puede no ser la de la aplicación, y
 * una cabecera `report-only` se parece mucho a una que se aplica hasta que uno
 * mira si el navegador bloqueó algo.
 *
 * Uso:
 *   CHROME=<ruta> PERFIL_PRUEBA=<carpeta> node probar-panel.mjs
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { apagarAparicionAutomatica, extensionParaPruebas, inyectarPanel } from './pruebas-comun.mjs';

const CHROME = process.env.CHROME;
if (!CHROME || !existsSync(CHROME)) throw new Error('Falta CHROME (Chrome for Testing)');
const PERFIL = process.env.PERFIL_PRUEBA;
if (!PERFIL) throw new Error('Falta PERFIL_PRUEBA');

// Con los permisos de las plataformas pasados a obligatorios, porque el ícono
// de la barra no se puede clickear desde una prueba. Ver `pruebas-comun.mjs`.
const copia = extensionParaPruebas();
// El tercer valor es la clave que el panel TIENE que reconocer en ese sitio.
const PLATAFORMAS = [
  ['Netflix', 'https://www.netflix.com/ar/', 'netflix'],
  ['Prime Video', 'https://www.primevideo.com/', 'prime'],
  ['Disney+', 'https://www.disneyplus.com/es-ar', 'disney'],
  ['HBO Max', 'https://www.hbomax.com/ar/es', 'hbomax'],
  ['Apple TV', 'https://tv.apple.com/ar', 'appletv'],
];
let mal = 0;

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

try {
  // En la copia de pruebas los permisos están concedidos, así que la aparición
  // automática arranca prendida. Se apaga para medir un solo camino por vez.
  const automatica = await apagarAparicionAutomatica(navegador);
  console.log(`Aparición automática registrada en ${automatica.length} patrones, y apagada para medir.
`);

  for (const [nombre, url, esperada] of PLATAFORMAS) {
    const pagina = await navegador.newPage();
    const violaciones = [];
    try {
      await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // Las violaciones de CSP no son errores de consola comunes, hay que
      // escuchar el evento. Distingue "se aplica" de "solo avisa".
      await pagina.evaluate(() => {
        window.__violaciones = [];
        document.addEventListener('securitypolicyviolation', (e) => {
          window.__violaciones.push({
            recurso: e.blockedURI.slice(0, 60),
            directiva: e.violatedDirective,
            // Con `report-only` la disposición es "report" y no bloquea nada.
            disposicion: e.disposition,
          });
        });
      });
      await pagina.bringToFront();

      // Se inyecta por el mismo camino que el click en el ícono, o sea un
      // mensaje al service worker, que llama a `chrome.scripting`. Desde que los permisos
      // son opcionales ya no hay ningún content script declarado en el
      // manifest, así que sin esto no aparece nada.
      await inyectarPanel(navegador);

      await pagina.waitForFunction(
        () => {
          const h = document.getElementById('pochoclo-panel');
          return h && h.dataset.resultado;
        },
        { timeout: 40000 },
      );
      const r = JSON.parse(await pagina.$eval('#pochoclo-panel', (n) => n.dataset.resultado));
      violaciones.push(...(await pagina.evaluate(() => window.__violaciones || [])));

      const detecto = r.plataforma === esperada;
      if (!detecto) mal += 1;
      // La Puntuación y el enlace a la Ficha son de la sección 21 y se
      // imprimen acá porque son por título, y que el enlace esté bien armado
      // para una película no dice nada de cómo queda para una serie.
      console.log(
        `${nombre.padEnd(12)} | detectó ${detecto ? 'ok  ' : 'MAL '} ${String(r.plataforma).padEnd(8)}` +
          ` (proveedor ${String(r.proveedor).padEnd(4)}) | póster por vía ${String(r.estrategia).padEnd(8)}` +
          ` | ${String(r.puntuacion ?? 'S/D').padEnd(4)} | ${r.titulo || r.error}`,
      );
      if (r.ficha) console.log(`             · ficha ${r.ficha}`);
      for (const v of violaciones) {
        console.log(`             · violación ${v.disposicion}: ${v.directiva} sobre ${v.recurso}`);
      }
    } catch (error) {
      mal += 1;
      console.log(`${nombre.padEnd(12)} | falló: ${error.message.slice(0, 90)}`);
    } finally {
      await pagina.close();
    }
  }
} finally {
  await navegador.close();
  copia.borrar();
}

console.log(mal === 0 ? 'TODO BIEN' : `${mal} MAL`);
process.exitCode = mal === 0 ? 0 : 1;
