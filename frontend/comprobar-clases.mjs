/**
 * Busca clases del sistema de diseño que no existen.
 *
 * POR QUÉ HACE FALTA: una clase mal escrita no genera CSS y Tailwind no se
 * queja, así que el build pasa limpio y el elemento pierde TODO su estilo sin
 * que nada avise (regla 3 del sistema de diseño, en src/index.css). Esto es la
 * red de seguridad que el compilador no tiene.
 *
 * QUÉ MIRA: cada palabra de cada cadena de los .js y .jsx de src/ que empiece
 * con un prefijo del sistema (boton-, panel, campo, pagina-, titulo-...), y la
 * cruza contra los @utility declarados en src/index.css. Los prefijos
 * variantes de Tailwind (sm:, hover:, !) se sacan antes de comparar.
 *
 * DOS FORMAS DE USARLO:
 *  - Solo, con `node comprobar-clases.mjs` (o `npm run clases`), que imprime
 *    el resultado.
 *  - Dentro del build, como complemento de Vite (ver vite.config.js). Ahí
 *    corta la compilación, y como Cloudflare Pages compila en cada push, una
 *    clase inexistente no puede llegar a publicarse.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Los prefijos de las familias del sistema. Si se agrega un @utility con un
 * prefijo nuevo, hay que sumarlo acá o sus errores de tipeo pasan de largo.
 */
const PREFIJOS = [
  'boton-', 'panel', 'campo', 'pagina-', 'franja-', 'titulo-', 'tarjeta',
  'bajada', 'mensaje-', 'texto-ayuda', 'etiqueta-', 'brillo-', 'insignia',
  'resplandor', 'pie-pochoclo',
];

// Una palabra que podría ser una clase: minúsculas, dígitos y guiones.
const PALABRA_CLASE = /^[a-z][a-z0-9-]*$/;

/** Las clases válidas, leídas de los @utility de index.css. */
function clasesDeclaradas(css) {
  const exactas = new Set();
  const funcionales = []; // [prefijo, Set de sufijos válidos]

  for (const [, nombre, cuerpo] of css.matchAll(/@utility\s+([a-z0-9-]+(?:-\*)?)\s*\{([\s\S]*?)\n\}/g)) {
    if (!nombre.endsWith('-*')) {
      exactas.add(nombre);
      continue;
    }
    // `max-width: --value(--contenedor-*)` acepta los nombres de esos tokens.
    const prefijo = nombre.slice(0, -1);
    const sufijos = new Set();
    for (const [, familia] of cuerpo.matchAll(/--value\(--([a-z0-9-]+)-\*\)/g)) {
      for (const [, sufijo] of css.matchAll(new RegExp(`--${familia}-([a-z0-9-]+)\\s*:`, 'g'))) sufijos.add(sufijo);
    }
    funcionales.push([prefijo, sufijos]);
  }
  return { exactas, funcionales };
}

function archivosFuente(carpeta) {
  const salida = [];
  for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivosFuente(ruta));
    else if (/\.(jsx?|mjs)$/.test(entrada.name)) salida.push(ruta);
  }
  return salida;
}

/**
 * Las palabras de todas las cadenas del archivo: comillas simples, dobles y
 * plantillas (sin las partes ${...}). Es más amplio que mirar solo
 * `className=`, a propósito: las clases también viajan en constantes como
 * CLASES_GRILLA y en ternarios.
 */
function palabrasEnCadenas(codigo) {
  const palabras = [];
  const cadenas = codigo.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g);
  for (const m of cadenas) {
    const texto = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ');
    for (const palabra of texto.split(/\s+/)) if (palabra) palabras.push(palabra);
  }
  return palabras;
}

/**
 * Devuelve la lista de problemas ({ archivo, clase }) y cuántas clases del
 * sistema se encontraron en uso.
 */
export function comprobarClases(raizFrontend) {
  const css = fs.readFileSync(path.join(raizFrontend, 'src/index.css'), 'utf8');
  const { exactas, funcionales } = clasesDeclaradas(css);
  const esValida = (clase) =>
    exactas.has(clase) || funcionales.some(([prefijo, sufijos]) => clase.startsWith(prefijo) && sufijos.has(clase.slice(prefijo.length)));

  const problemas = [];
  const enUso = new Set();
  for (const archivo of archivosFuente(path.join(raizFrontend, 'src'))) {
    for (const palabra of palabrasEnCadenas(fs.readFileSync(archivo, 'utf8'))) {
      const clase = palabra.split(':').pop().replace(/^!/, '');
      if (!PALABRA_CLASE.test(clase) || !PREFIJOS.some((p) => clase.startsWith(p))) continue;
      if (esValida(clase)) enUso.add(clase);
      else problemas.push({ archivo: path.relative(raizFrontend, archivo), clase });
    }
  }
  return { problemas, enUso };
}

/** El complemento de Vite: corta el build si hay alguna clase inexistente. */
export function clasesDelSistema() {
  let raiz;
  return {
    name: 'pochoclo-clases-del-sistema',
    apply: 'build',
    configResolved(config) {
      raiz = config.root;
    },
    buildStart() {
      const { problemas } = comprobarClases(raiz);
      if (problemas.length) {
        const lista = problemas.map((p) => `  ${p.clase}  (${p.archivo})`).join('\n');
        throw new Error(
          `Clases del sistema de diseño que no existen en src/index.css:\n${lista}\n` +
            'Una clase inexistente no genera CSS y el elemento pierde todo su estilo en silencio.'
        );
      }
    },
  };
}

// Uso directo desde la línea de comandos.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problemas, enUso } = comprobarClases(path.dirname(fileURLToPath(import.meta.url)));
  if (problemas.length) {
    console.log(`MAL: ${problemas.length} clase(s) del sistema que no existen.`);
    for (const p of problemas) console.log(`  ${p.clase}  (${p.archivo})`);
    process.exit(1);
  }
  console.log(`BIEN: ${enUso.size} clases del sistema en uso, todas declaradas.`);
}
