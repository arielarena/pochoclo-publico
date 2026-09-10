import { defineConfig, loadEnv } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Content Security Policy, inyectada en el HTML del build de producción.
 *
 * QUÉ ES: una lista blanca de dónde puede cargar cosas la página. Su valor
 * real es que convierte un XSS en algo inerte: si alguien lograra inyectar un
 * script, sin CSP ese script puede llamar a donde quiera; con esto, el
 * navegador se niega a ejecutarlo porque no viene de un origen declarado.
 *
 * POR QUÉ QUEDÓ ESTRICTA, sin `unsafe-inline` ni `unsafe-eval`, que es lo que
 * la hace valer: el HTML que construye Vite no tiene ni un script ni un estilo
 * inline (es un `<script type="module" src>` y un `<link rel="stylesheet">`),
 * y los dos SVG que estaban incrustados como `data:` URI se sacaron a
 * public/img/ justamente para no tener que permitir ese esquema. Los estilos
 * que React pone con `style={{...}}` no la afectan, porque los escribe como
 * propiedades del elemento y no como atributos del HTML.
 *
 * VA POR `meta` Y NO POR CABECERA, y eso tiene una consecuencia concreta:
 * `frame-ancestors` (lo que impide que otro sitio meta a Pochoclo en un
 * iframe) NO funciona por meta, los navegadores la ignoran ahí. Esa directiva
 * se declara aparte, como cabecera, en `frontend/public/_headers`
 * (`X-Content-Type-Options` la manda Cloudflare Pages solo, y
 * `Permissions-Policy` también vive en ese mismo archivo). Pasar la política
 * ENTERA a cabecera además de la meta sigue pendiente: pediría generar
 * `_headers` en el build, porque la política incluye `urlApi`, que es
 * dinámica.
 *
 * La ventaja de la meta es que funciona en CUALQUIER hosting sin configurar
 * nada, así que la protección existe desde el primer despliegue en vez de
 * depender de acordarse de un archivo de configuración.
 *
 * SOLO EN PRODUCCIÓN (`apply: 'build'`). El servidor de desarrollo de Vite sí
 * inyecta estilos inline para el recambio en caliente, así que con esta
 * política puesta `npm run dev` se rompería entero.
 */
function cspDeProduccion(urlApi) {
  const politica = [
    // Todo lo que no esté nombrado abajo: solo desde nuestro propio origen.
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    // Las fuentes son locales, no de Google (ver src/fuentes.css).
    "font-src 'self'",
    // Los pósters y fondos los sirve TMDb directo al navegador.
    "img-src 'self' https://image.tmdb.org",
    // El único servidor al que la página le habla es nuestro backend.
    `connect-src 'self' ${urlApi}`,
    /**
     * No hay iframes ni objetos incrustados: declararlo cierra vectores
     * viejos que los navegadores siguen soportando.
     */
    "object-src 'none'",
    "frame-src 'none'",
    /**
     * Impide que una inyección cambie la base de las URLs relativas, que es
     * una forma de hacer que los scripts propios se carguen desde otro lado.
     */
    "base-uri 'self'",
    // Ningún formulario puede enviarse a un servidor ajeno.
    "form-action 'self'",
  ].join('; ');

  return {
    name: 'pochoclo-csp',
    apply: 'build',
    transformIndexHtml(html) {
      /**
       * Se inserta a mano justo DESPUÉS del <meta charset>, y las dos
       * posiciones importan:
       *
       *  - Tiene que ir ANTES del <script> y de los <link>, porque una CSP
       *    declarada por meta solo rige lo que se parsea después de ella. Si
       *    quedara al final del head no cubriría nada de lo que de verdad se
       *    carga.
       *  - Pero DESPUÉS del charset, porque el HTML exige que la declaración
       *    de codificación entre en los primeros 1024 bytes. Poniéndola
       *    delante, la CSP empuja al charset; hoy entra igual, pero si la
       *    política crece (un dominio más) el margen se achica sin que nada
       *    avise.
       */
      const metas =
        `\n    <meta http-equiv="Content-Security-Policy" content="${politica}">` +
        /**
         * Cuánto de nuestra dirección viaja al salir del sitio. Con esto, al
         * ir a TMDb o a Mercado Pago se manda solo el dominio y no la página
         * exacta desde la que se fue.
         */
        `\n    <meta name="referrer" content="strict-origin-when-cross-origin">`;

      return html.replace(/(<meta\s+charset=["'][^"']+["']\s*\/?>)/i, `$1${metas}`);
    },
  };
}

/**
 * Saca los comentarios de todo lo que se sirve al navegador.
 *
 * QUÉ PROBLEMA RESUELVE. Este proyecto documenta sus decisiones en el propio
 * archivo, y en un .js o un .jsx eso es gratis: al empaquetar, el compilador
 * los borra (los comentarios de JSX ni siquiera llegan a existir en el DOM).
 * Pero `index.html` y lo que vive en `public/` se copian TAL CUAL, así que sus
 * comentarios viajan enteros a cada visitante. Y ahí adentro hay rutas de
 * archivos del repo (src/config/sitio.js, vite.config.js, src/index.css),
 * qué está duplicado a mano y dónde, y por qué tal
 * protección quedó como quedó. Nada de eso es una credencial, pero es un mapa
 * del proyecto regalado a cualquiera que apriete "ver código fuente", y del
 * otro lado de la pantalla no le sirve a nadie.
 *
 * LOS COMENTARIOS NO SE PIERDEN: se sacan de la SALIDA, no de la fuente. Los
 * archivos del repo quedan igual de comentados que siempre, que es de donde
 * los lee quien trabaja acá. Lo único que cambia es lo que se publica.
 *
 * SOLO EN PRODUCCIÓN (`apply: 'build'`), por el mismo motivo que la CSP: en
 * desarrollo conviene ver el HTML tal como está escrito.
 *
 * DOS ARCHIVOS DE public/ QUEDAN AFUERA A PROPÓSITO:
 *
 *  - `_headers` y `_redirects` los CONSUME Cloudflare Pages y no los sirve
 *    (verificado: pedirlos devuelve index.html por el SPA fallback), así que
 *    sus comentarios no están expuestos y ahí valen tanto como en el resto
 *    del repo.
 *  - `llms.txt` no tiene comentarios: sus `#` son títulos de Markdown, o sea
 *    contenido publicado a propósito. Filtrarlos lo rompería.
 */
function sinComentariosEnLaSalida() {
  /**
   * Un comentario de HTML/XML, CON su sangría y su salto de línea final.
   *
   * Los tres pedazos importan y ninguno sobra:
   *
   *  - `*?` es lo que hace que cada comentario termine en su PROPIO cierre y
   *    no en el del último del archivo.
   *  - El salto de atrás se admite con \r opcional adelante: este archivo
   *    está guardado con finales de línea de Windows, y sin eso quedaba el
   *    \r suelto y con él, un renglón vacío.
   *  - La sangría y el salto de atrás se comen para que el comentario se
   *    lleve su renglón entero. Sin eso queda una línea con cuatro espacios
   *    donde estaba, que no filtra nada pero ensucia la salida.
   */
  const COMENTARIO = /[ \t]*<!--[\s\S]*?-->[ \t]*(?:\r?\n)?/g;

  /**
   * Un comentario que separaba dos bloques deja, al irse, las líneas en
   * blanco de sus dos lados pegadas. Esto las junta en una sola.
   */
  const limpiar = (texto) => texto.replace(COMENTARIO, '').replace(/(?:\r?\n){3,}/g, '\n\n');

  let carpetaSalida;

  return {
    name: 'pochoclo-sin-comentarios',
    apply: 'build',
    /**
     * Después de la CSP y de lo que inyecte Vite, para que no quede ningún
     * comentario agregado por otro complemento.
     */
    enforce: 'post',

    configResolved(config) {
      carpetaSalida = path.resolve(config.root, config.build.outDir);
    },

    transformIndexHtml(html) {
      return limpiar(html);
    },

    /**
     * `transformIndexHtml` solo ve el HTML. Lo que Vite copia de `public/` no
     * pasa por ningún transform, así que hay que reescribirlo ya copiado.
     * `closeBundle` es el último gancho del build, o sea el único momento en
     * el que esos archivos seguro existen dentro de dist/.
     */
    closeBundle() {
      // Los dos SVG de public/img llevan comentarios largos; el sitemap, uno.
      for (const relativo of ['img/flecha-select.svg', 'img/grano.svg', 'sitemap.xml']) {
        const archivo = path.join(carpetaSalida, relativo);
        if (!fs.existsSync(archivo)) continue;
        fs.writeFileSync(archivo, limpiar(fs.readFileSync(archivo, 'utf8')), 'utf8');
      }

      // robots.txt no es XML: sus comentarios son líneas que empiezan con #.
      const robots = path.join(carpetaSalida, 'robots.txt');
      if (fs.existsSync(robots)) {
        const limpio = fs
          .readFileSync(robots, 'utf8')
          .split(/\r?\n/)
          .filter((linea) => !linea.trimStart().startsWith('#'))
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trimStart();
        fs.writeFileSync(robots, limpio, 'utf8');
      }
    },
  };
}

/**
 * La dirección del backend, comprobada antes de compilar.
 *
 * POR QUÉ HAY QUE CORTAR EL BUILD Y NO ALCANZA CON UN VALOR POR OMISIÓN: el
 * mismo `|| 'http://localhost:3000'` está escrito en api/cliente.js, en
 * auth/clienteAuth.js y acá abajo. Si la variable falta al compilar, el
 * paquete sale apuntando a localhost Y LA CSP TAMBIÉN LO DECLARA, así que no
 * falla nada de forma visible: el build pasa, el despliegue pasa, y la app
 * simplemente no habla con ningún servidor en la máquina de cada visitante.
 * Es un modo de fallo sin ningún aviso, y ya pasó una vez.
 *
 * En desarrollo no molesta: frontend/.env ya trae la variable, y `loadEnv` la
 * lee, así que `npm run build` + `npm run preview` y las auditorías siguen
 * funcionando igual que antes.
 *
 * Se permite http SOLO contra localhost, que es como corren las auditorías
 * (vite preview en 4173 contra el backend en 3000).
 */
function comprobarUrlApi(urlApi, definida) {
  if (!definida) {
    throw new Error(
      'Falta VITE_API_URL. Sin ella el build sale apuntando a http://localhost:3000 ' +
        'y la app no habla con ningún servidor. Definila en frontend/.env o en las ' +
        'variables del hosting (ver frontend/.env.example).'
    );
  }

  let host;
  try {
    host = new URL(urlApi).hostname;
  } catch {
    throw new Error(`VITE_API_URL no es una dirección válida: "${urlApi}"`);
  }

  const esLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (urlApi.startsWith('http://') && !esLocal) {
    throw new Error(
      `VITE_API_URL apunta a "${urlApi}", que es http contra un host que no es localhost. ` +
        'La cookie de sesión sale sin Secure y el tráfico viaja en claro. Usá https.'
    );
  }
}

export default defineConfig(({ command, mode }) => {
  /**
   * La dirección del backend sale de la misma variable que usa la app, así
   * que la CSP no puede quedar apuntando a un servidor distinto del real.
   */
  const env = loadEnv(mode, process.cwd(), '');
  const urlApi = env.VITE_API_URL || 'http://localhost:3000';

  /**
   * Solo al compilar: el servidor de desarrollo tiene que poder arrancar
   * aunque falte el .env, porque es el momento en que uno se entera de que
   * falta y lo escribe.
   */
  if (command === 'build') comprobarUrlApi(urlApi, Boolean(env.VITE_API_URL));

  return {
    plugins: [react(), tailwindcss(), cspDeProduccion(urlApi), sinComentariosEnLaSalida()],
    server: {
      port: 5173,
    },
  };
});
