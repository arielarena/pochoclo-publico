/**
 * PASO 5, la mitad que no necesita navegador. Comprueba el mapeo dominio a
 * proveedor de `plataformas.js`.
 *
 * LOS CASOS QUE IMPORTAN SON LOS NEGATIVOS, y por eso esto existe aparte de la
 * prueba con navegador. `probar-panel.mjs` carga las cinco plataformas de
 * verdad, así que comprueba que los aciertos acierten, pero **no puede
 * comprobar que un dominio parecido no acierte**, que es donde este tipo de
 * mapeo se rompe. `netflix.com.otrositio.ar` es un dominio de cualquiera con
 * nuestro nombre adentro, y con un `includes` pelado pasaría por Netflix.
 *
 * Uso:  node probar-plataformas.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

createRequire(import.meta.url)('./plataformas.js');
const { plataformaDeHost, esProveedorConocido, PLATAFORMAS, patronesDePermiso } =
  globalThis.pochoclo.plataformas;

const CASOS = [
  // Las cinco, como las escribe el navegador de verdad.
  ['www.netflix.com', 'netflix'],
  ['netflix.com', 'netflix'],
  ['www.primevideo.com', 'prime'],
  ['www.disneyplus.com', 'disney'],
  ['www.hbomax.com', 'hbomax'],
  ['play.hbomax.com', 'hbomax'],
  // max.com contesta 301 hacia hbomax.com, pero se ataja igual.
  ['www.max.com', 'hbomax'],
  ['tv.apple.com', 'appletv'],
  ['WWW.NETFLIX.COM', 'netflix'],
  // Controles negativos, que son la razón de ser de este archivo.
  ['netflix.com.otrositio.ar', null],
  ['minetflix.com', null],
  ['netflixcom', null],
  // Apple TV es un subdominio, así que el resto de Apple queda afuera.
  ['www.apple.com', null],
  ['music.apple.com', null],
  // Prime Video vive en primevideo.com; la tienda de Amazon no es la app.
  ['www.amazon.com', null],
  ['', null],
  [undefined, null],
  [null, null],
];

let mal = 0;
for (const [host, esperado] of CASOS) {
  const plataforma = plataformaDeHost(host);
  const dio = plataforma ? plataforma.clave : null;
  const ok = dio === esperado;
  if (!ok) mal += 1;
  console.log(`${ok ? 'ok  ' : 'MAL '} ${String(host).padEnd(26)} -> ${dio}`);
}

// El número que sale hacia la API tiene que estar en la tabla y ser un número.
// El `'8'` de texto tiene que fallar. Si pasara, la comparación sería floja y
// mañana entraría cualquier cosa que se parezca a un número.
const CONOCIDOS = [
  [8, true],
  [1899, true],
  [531, false],
  ['8', false],
  [null, false],
];
for (const [id, esperado] of CONOCIDOS) {
  const ok = esProveedorConocido(id) === esperado;
  if (!ok) mal += 1;
  console.log(`${ok ? 'ok  ' : 'MAL '} proveedor ${String(id).padEnd(16)} -> ${esProveedorConocido(id)}`);
}

/**
 * Y LA OTRA MITAD DEL MISMO MAPEO, que vive en el manifest.
 *
 * Los dominios están escritos dos veces y no hay forma de evitarlo, porque el
 * manifest es un archivo de datos y no puede leer `plataformas.js`. Lo que sí
 * se puede es comprobar que digan lo mismo, porque el modo de fallo es
 * silencioso por los dos lados. Un dominio que está en el catálogo y no en el
 * manifest hace que la extensión reconozca un sitio sobre el que después no va
 * a poder pedir permiso; al revés, pide un permiso que nunca usa, que es
 * exactamente el tipo de cosa que hace que una revisión de la tienda rebote.
 */
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
const delCatalogo = [...patronesDePermiso()].sort();
const delManifest = [...(manifest.optional_host_permissions || [])].sort();
const igualitos = JSON.stringify(delCatalogo) === JSON.stringify(delManifest);
if (!igualitos) mal += 1;
console.log('---');
console.log(
  `${igualitos ? 'ok  ' : 'MAL '} los ${delCatalogo.length} patrones del manifest salen del catálogo`,
);
if (!igualitos) {
  console.log(`     catálogo: ${delCatalogo.join(' ')}`);
  console.log(`     manifest: ${delManifest.join(' ')}`);
}

/**
 * INSTALAR NO TIENE QUE PEDIR NINGÚN PERMISO SOBRE LAS PLATAFORMAS (sección 21
 * del Definitivo). Alcanza con que una de las seis se escape a
 * `host_permissions` para que Chrome muestre el cartel largo justo cuando la
 * persona está decidiendo si la instala, y nada más falla.
 */
const obligatorios = manifest.host_permissions || [];
const seEscapo = obligatorios.filter((h) => delCatalogo.includes(h));
if (seEscapo.length) mal += 1;
console.log(
  `${seEscapo.length ? 'MAL ' : 'ok  '} al instalar solo se pide ${obligatorios.join(', ')}` +
    (seEscapo.length ? `, y se escaparon ${seEscapo.join(', ')}` : ''),
);

/** `activeTab` es lo que hace que apretar el ícono no cueste ningún permiso. */
const conActiveTab = (manifest.permissions || []).includes('activeTab');
if (!conActiveTab) mal += 1;
console.log(`${conActiveTab ? 'ok  ' : 'MAL '} está activeTab, que es lo que sostiene el camino del ícono`);

console.log('---');
console.log(`${PLATAFORMAS.length} plataformas, ${CASOS.length + CONOCIDOS.length} casos`);
console.log(mal === 0 ? 'TODO BIEN' : `${mal} MAL`);
process.exitCode = mal === 0 ? 0 : 1;
