/**
 * ARMA EL `.zip` QUE SE SUBE A LA CHROME WEB STORE (2026-10-07).
 *
 *   node extension/empaquetar.mjs             el de siempre, con el `key` del manifest
 *   node extension/empaquetar.mjs --sin-key   el primero, el que crea el ítem
 *   node extension/empaquetar.mjs --salida=C:/otra/carpeta
 *
 * Por omisión deja el paquete en `C:\Users\<usuario>\.pochoclo\paquetes`, al
 * lado de la clave privada y fuera del repo, así no hay forma de commitearlo.
 *
 * EL PAQUETE NO ES LA CARPETA ENTERA. Acá viven también las pruebas (`*.mjs`),
 * `extension/README.md` y la ficha de la tienda, que lleva notas internas y el
 * borrador de `/privacidad`. Nada de eso lo usa la extensión, y todo lo que va
 * en el `.zip` lo puede bajar y leer cualquiera desde la tienda. La lista de lo
 * que va estaba escrita a mano en la sección 1 de la ficha, y ahora es
 * `PAQUETE`, acá abajo.
 *
 * Y NO ALCANZA CON TENER LA LISTA, porque una lista se queda vieja sin avisar.
 * Por eso hay dos controles que cortan el armado:
 *
 *  - Todo archivo de la carpeta tiene que estar clasificado, o en `PAQUETE` o
 *    entre lo que no va (`.mjs` y `.md`). Un archivo nuevo obliga a decidir.
 *  - Todo lo que el paquete nombra tiene que estar en el paquete. Se mira lo
 *    que declara el manifest, los `src` y `href` de `opciones.html` y los
 *    nombres de archivo entre comillas simples o dobles de los `.js`, que es
 *    como se escriben `importScripts` y `ARCHIVOS_DEL_PANEL`. Las menciones en
 *    los comentarios van entre backticks y no cuentan.
 *
 * EL `key` Y EL ORDEN DE LAS SUBIDAS, que es lo de la sección 1 de la ficha. El
 * primer `.zip` va sin `key` (`--sin-key`) y crea el ítem. La clave pública que
 * muestra el panel se pega en el manifest, y de ahí en adelante cada `.zip`
 * lleva esa. Armar uno normal con la clave de desarrollo corta con un error,
 * porque es el único caso en que el paquete seguro está mal.
 *
 * EL `.zip` LO ESCRIBE ESTE MISMO ARCHIVO, con `node:zlib` y sin dependencias.
 * Así no depende de que la máquina tenga `zip`, ni del `Compress-Archive` de
 * Windows PowerShell, cuyas versiones viejas guardan las rutas con barra
 * invertida.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const EXTENSION = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(EXTENSION);

/** Lo que va en el paquete. Un archivo nuevo de la extensión se suma acá. */
const PAQUETE = [
  'manifest.json',
  'service-worker.js',
  'panel.js',
  'plataformas.js',
  'opciones.html',
  'opciones.js',
  'opciones.css',
  'tmdb.svg',
];
/** Carpetas que van enteras, con la extensión de archivo que admiten. */
const CARPETAS = { iconos: /\.png$/ };
/** Lo que vive en la carpeta y no va: las pruebas y la documentación. */
const FUERA = /\.(mjs|md)$/;

/**
 * El ID de la clave de desarrollo del 2026-09-12. Está escrito a propósito,
 * porque lo que se busca acá es reconocer la vieja, no calcular la vigente.
 */
const ID_DESARROLLO = 'lofbgknpmifloakfiimnkkmainpmokba';

const SIN_KEY = process.argv.includes('--sin-key');
const SALIDA = resolve(
  process.argv.find((a) => a.startsWith('--salida='))?.slice(9) ||
    join(homedir(), '.pochoclo', 'paquetes'),
);

const problemas = [];
const leer = (ruta) => readFileSync(join(EXTENSION, ruta));

/** El mismo cálculo que `pruebas-comun.mjs`, el de Chrome: sha256 de la clave, letras de la a a la p. */
function idDeClave(clave) {
  const huella = createHash('sha256').update(Buffer.from(clave, 'base64')).digest();
  return [...huella.subarray(0, 16)]
    .map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15)))
    .join('');
}

// ---------------------------------------------------------------------------
// 1. Qué hay en la carpeta, y que todo esté clasificado.
// ---------------------------------------------------------------------------

const enElPaquete = new Set();
for (const entrada of readdirSync(EXTENSION, { withFileTypes: true })) {
  const nombre = entrada.name;
  if (entrada.isDirectory()) {
    const admitidos = CARPETAS[nombre];
    if (!admitidos) {
      problemas.push(`carpeta sin clasificar: ${nombre}/ (sumala a CARPETAS o sacala de extension/)`);
      continue;
    }
    for (const interno of readdirSync(join(EXTENSION, nombre))) {
      if (admitidos.test(interno)) enElPaquete.add(`${nombre}/${interno}`);
      else problemas.push(`archivo inesperado en ${nombre}/: ${interno}`);
    }
  } else if (PAQUETE.includes(nombre)) {
    enElPaquete.add(nombre);
  } else if (!FUERA.test(nombre)) {
    problemas.push(`archivo sin clasificar: ${nombre} (sumalo a PAQUETE, o es algo que no va)`);
  }
}
for (const nombre of PAQUETE) {
  if (!enElPaquete.has(nombre)) problemas.push(`falta en la carpeta: ${nombre}`);
}

// ---------------------------------------------------------------------------
// 2. Que todo lo que el paquete nombra esté en el paquete.
// ---------------------------------------------------------------------------

let manifest = null;
try {
  manifest = JSON.parse(leer('manifest.json').toString('utf8'));
} catch (error) {
  problemas.push(`manifest.json no se puede leer: ${error.message}`);
}

const nombrados = []; // [desde, archivo]
if (manifest) {
  const desdeManifest = [
    manifest.background?.service_worker,
    manifest.options_ui?.page,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
  ].filter(Boolean);
  for (const archivo of desdeManifest) nombrados.push(['manifest.json', archivo]);
}

const esLocal = (ruta) => !/^[a-z]+:/i.test(ruta) && !ruta.startsWith('#') && !ruta.startsWith('/');
for (const archivo of enElPaquete) {
  if (archivo.endsWith('.html')) {
    const texto = leer(archivo).toString('utf8');
    for (const [, ruta] of texto.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
      if (esLocal(ruta)) nombrados.push([archivo, ruta]);
    }
  } else if (archivo.endsWith('.js')) {
    const texto = leer(archivo).toString('utf8');
    for (const [, ruta] of texto.matchAll(/["']([\w./-]+\.(?:js|css|html|svg|png|json))["']/g)) {
      nombrados.push([archivo, ruta]);
    }
  }
}
for (const [desde, ruta] of nombrados) {
  const limpia = ruta.replace(/^\.\//, '');
  if (!enElPaquete.has(limpia)) problemas.push(`${desde} nombra ${ruta}, que no está en el paquete`);
}

// ---------------------------------------------------------------------------
// 3. La versión y el `key`.
// ---------------------------------------------------------------------------

let id = null;
if (manifest) {
  // Hasta cuatro números separados por puntos, ninguno mayor a 65535 ni con ceros adelante.
  const partes = String(manifest.version || '').split('.');
  const versionValida =
    partes.length >= 1 &&
    partes.length <= 4 &&
    partes.every((p) => /^(0|[1-9]\d*)$/.test(p) && Number(p) <= 65535);
  if (!versionValida) problemas.push(`la versión "${manifest.version}" no es una que Chrome acepte`);

  if (!SIN_KEY && manifest.key) {
    id = idDeClave(manifest.key);
    if (id === ID_DESARROLLO) {
      problemas.push(
        'el manifest todavía tiene la clave de desarrollo. Para crear el ítem usá --sin-key, ' +
          'y después pegá en el `key` la clave pública que muestra el panel (ficha, sección 1).',
      );
    }
  }
}

if (relative(REPO, SALIDA) === '' || !relative(REPO, SALIDA).startsWith('..')) {
  problemas.push(`la salida (${SALIDA}) cae adentro del repo. Elegí una carpeta de afuera.`);
}

if (problemas.length) {
  console.error('No se armó el paquete:\n');
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 4. El `.zip`.
// ---------------------------------------------------------------------------

/** Fecha y hora en el formato de MS-DOS, que es el que guarda un `.zip`. */
function fechaDos(fecha) {
  return {
    hora: (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1),
    dia: ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate(),
  };
}

function armarZip(archivos) {
  const locales = [];
  const central = [];
  let desplazamiento = 0;

  for (const { nombre, datos, fecha } of archivos) {
    const nombreBytes = Buffer.from(nombre, 'utf8');
    const comprimidos = deflateRawSync(datos, { level: 9 });
    const { hora, dia } = fechaDos(fecha);
    const crc = crc32(datos);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria para extraer
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimidos.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locales.push(local, nombreBytes, comprimidos);

    const entrada = Buffer.alloc(46);
    entrada.writeUInt32LE(0x02014b50, 0);
    entrada.writeUInt16LE(20, 4); // hecho por
    entrada.writeUInt16LE(20, 6);
    entrada.writeUInt16LE(0x0800, 8);
    entrada.writeUInt16LE(8, 10);
    entrada.writeUInt16LE(hora, 12);
    entrada.writeUInt16LE(dia, 14);
    entrada.writeUInt32LE(crc, 16);
    entrada.writeUInt32LE(comprimidos.length, 20);
    entrada.writeUInt32LE(datos.length, 24);
    entrada.writeUInt16LE(nombreBytes.length, 28);
    // Comentario, disco, atributos internos y externos en cero.
    entrada.writeUInt32LE(desplazamiento, 42);
    central.push(entrada, nombreBytes);

    desplazamiento += local.length + nombreBytes.length + comprimidos.length;
  }

  const tamanoCentral = central.reduce((total, b) => total + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(tamanoCentral, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, ...central, fin]);
}

const archivos = [...enElPaquete].sort().map((nombre) => {
  let datos = leer(nombre);
  if (nombre === 'manifest.json' && SIN_KEY) {
    const sinClave = { ...manifest };
    delete sinClave.key;
    datos = Buffer.from(JSON.stringify(sinClave, null, 2) + '\n', 'utf8');
  }
  return { nombre, datos, fecha: statSync(join(EXTENSION, nombre)).mtime };
});

mkdirSync(SALIDA, { recursive: true });
const destino = join(SALIDA, `pochoclo-extension-${manifest.version}${SIN_KEY ? '-sin-key' : ''}.zip`);
const zip = armarZip(archivos);
writeFileSync(destino, zip);

console.log(`Paquete de la versión ${manifest.version}, ${archivos.length} archivos:\n`);
for (const { nombre, datos } of archivos) {
  console.log(`  ${nombre.padEnd(22)} ${(datos.length / 1024).toFixed(1).padStart(7)} kB`);
}
console.log(`\n${destino} (${(zip.length / 1024).toFixed(1)} kB)`);
if (SIN_KEY) {
  console.log('\nSin `key`. Es el que crea el ítem. Después, la clave pública del panel va al manifest.');
} else if (id) {
  console.log(`\nID que corresponde al \`key\`: ${id}. Tiene que ser el mismo que muestra el panel de la tienda.`);
} else {
  console.log('\nEl manifest no tiene `key`, así que Chrome va a calcular el ID a partir de la ruta.');
}
