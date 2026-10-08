/**
 * LO QUE COMPARTEN LAS PRUEBAS CON NAVEGADOR, y sobre todo el rodeo que hay
 * que hacer desde que los permisos son opcionales (paso 7).
 *
 * EL PROBLEMA, dicho derecho. La extensión que se publica no tiene permiso
 * sobre netflix.com al instalarse. Lo consigue de dos maneras, y ninguna se
 * puede automatizar.
 *
 *  - `activeTab`, cuando la persona aprieta el ícono. El ícono vive en la
 *    barra del navegador, que es interfaz de Chrome y no de la página, así que
 *    el protocolo de depuración no lo puede clickear, porque sus eventos de
 *    entrada van al renderizador.
 *  - El permiso opcional, que se pide desde la pantalla de opciones y abre un
 *    cartel de Chrome. Ese cartel también es interfaz del navegador.
 *
 * Y tampoco sirve dejar el permiso escrito en el perfil antes de arrancar:
 * Chrome guarda el estado de las extensiones en `Secure Preferences`, firmado,
 * y al detectar que alguien lo tocó de afuera lo descarta.
 *
 * LA SALIDA ES CORRER LAS PRUEBAS CONTRA UNA COPIA DE LA EXTENSIÓN con los
 * permisos opcionales pasados a obligatorios. Es un manifest distinto del que
 * se publica, así que conviene saber exactamente en qué se diferencia:
 *
 *  - `optional_host_permissions` pasa entero a `host_permissions`. Nada más.
 *  - **No se agrega ningún `content_scripts`.** El panel se sigue inyectando
 *    con `chrome.scripting.executeScript` desde el service worker, que es el
 *    camino real. Lo único que cambia es de dónde sale el permiso, no cómo
 *    entra el panel.
 *
 * La copia se genera **a partir del manifest de verdad** en cada corrida, así
 * que no puede quedar vieja, porque un dominio agregado al catálogo aparece en
 * las dos listas o en ninguna. Lo que queda sin cubrir por una prueba automática
 * es el pedido de permiso en sí, que hay que mirar a mano una vez.
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const EXTENSION = 'C:/pochoclo/extension';

/**
 * EL ID SE CALCULA, no se escribe a mano. Sale del campo `key` del manifest,
 * que es la clave pública: Chrome hashea su forma binaria con sha256 y traduce
 * los primeros 16 bytes a las letras de la `a` a la `p`, un carácter por
 * nibble. Estaba copiado a mano en dos pruebas, y el día que se regenere la
 * clave las dos van a apuntar a una extensión que no existe, cada una con su
 * propio error confuso. La copia de pruebas conserva el `key`, así que su ID
 * es el mismo.
 */
export const ID = (() => {
  const manifest = JSON.parse(readFileSync(join(EXTENSION, 'manifest.json'), 'utf8'));
  const huella = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest();
  return [...huella.subarray(0, 16)]
    .map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15)))
    .join('');
})();

export function extensionParaPruebas() {
  const ruta = mkdtempSync(join(tmpdir(), 'pochoclo-extension-'));
  // Los `.mjs` son estas mismas pruebas y el `.md` es documentación, así que
  // ninguno de los dos forma parte de la extensión.
  cpSync(EXTENSION, ruta, {
    recursive: true,
    filter: (origen) => !origen.endsWith('.mjs') && !origen.endsWith('.md'),
  });

  const manifest = JSON.parse(readFileSync(join(ruta, 'manifest.json'), 'utf8'));
  manifest.host_permissions = [
    ...manifest.host_permissions,
    ...(manifest.optional_host_permissions || []),
  ];
  delete manifest.optional_host_permissions;
  writeFileSync(join(ruta, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  return { ruta, borrar: () => rmSync(ruta, { recursive: true, force: true }) };
}

export async function serviceWorker(navegador) {
  const destino = await navegador.waitForTarget((t) => t.type() === 'service_worker', {
    timeout: 20000,
  });
  return destino.worker();
}

/**
 * APAGA LA APARICIÓN AUTOMÁTICA, y devuelve en qué sitios estaba prendida.
 *
 * HAY QUE APAGARLA A PROPÓSITO EN LAS PRUEBAS, y el motivo es una consecuencia
 * directa del diseño. El interruptor de la aparición automática es el permiso
 * sobre el sitio, y la copia de pruebas los tiene todos concedidos. O sea que
 * en las pruebas la extensión arranca con el panel apareciendo solo en las
 * cinco plataformas, que es lo contrario de lo que ve alguien que la instala.
 *
 * Sin esto el panel se dibuja dos veces, una sola por cada camino, y eso ya
 * apareció midiendo, porque `--simular` mostraba dos `GET /listas` antes del
 * primer click. No rompía nada, pero era una búsqueda y un pedido de listas de más
 * escondidos adentro de una prueba que decía TODO BIEN.
 *
 * De paso, lo que devuelve es la comprobación de que la máquina de la
 * aparición automática registró el guión donde tenía que registrarlo.
 */
export async function apagarAparicionAutomatica(navegador) {
  const trabajador = await serviceWorker(navegador);
  // Se espera a que `onInstalled` termine de registrar, en vez de suponer que
  // ya pasó, porque apagarla antes de que se prenda no probaría nada.
  const sitios = await trabajador.evaluate(async () => {
    for (let intento = 0; intento < 50; intento += 1) {
      const guiones = await chrome.scripting.getRegisteredContentScripts();
      if (guiones.length) return guiones.flatMap((g) => g.matches);
      await new Promise((seguir) => setTimeout(seguir, 100));
    }
    return [];
  });
  await trabajador.evaluate(() => chrome.scripting.unregisterContentScripts());
  return sitios;
}

/**
 * Dibuja el panel en la pestaña activa, por el mismo camino que usa el click
 * en el ícono, o sea el service worker llamando a `chrome.scripting`.
 *
 * VA EN MODO DIAGNÓSTICO, y es la única diferencia con el click de verdad.
 *
 * El panel vive en un shadow root cerrado, que no se puede leer desde afuera,
 * así que para que una prueba vea lo que dibujó tiene que escribirlo en un
 * atributo del elemento anfitrión. Ese atributo está en el documento de la
 * plataforma, o sea que **lo lee también la plataforma**: el título, la
 * Puntuación y si la persona tiene sesión abierta en pochoclo.ar. Por eso el
 * panel no lo escribe nunca por su cuenta, y hay que pedírselo.
 *
 * La marca se pone en el mundo aislado del content script, al que la página no
 * llega, así que esto no es un interruptor que Netflix pueda encontrar.
 */
export async function inyectarPanel(navegador) {
  const trabajador = await serviceWorker(navegador);
  return trabajador.evaluate(() => inyectarPanel(undefined, true));
}
