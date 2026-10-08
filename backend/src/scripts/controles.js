/**
 * La batería de control del motor, en un comando.
 *
 *   npm run controles                 corre todo y compara contra la referencia
 *   npm run controles -- --guardar    corre todo y deja esta corrida como referencia
 *   npm run controles -- --solo reirme,Comedia   solo los controles que contengan esos textos
 *
 * POR QUÉ EXISTE: después de cada cambio del motor se repetía a mano la misma
 * lista ("reirme 189, accion 200, Terror + Serie 120...", ver
 * 4.9.3 y 4.29.x) y se comparaba de memoria contra números escritos en prosa.
 *
 * NO ES APROBADO O REPROBADO. Corre contra TMDb en vivo, así que los números se
 * mueven solos de un día para el otro (sección 6). Lo que da es la
 * DIFERENCIA contra la última corrida aceptada, y marca con "!" lo que se movió
 * más de lo esperable: cantidad que cambia más de UMBRAL_CANTIDAD, o cabecera
 * que comparte menos de MINIMO_CABECERA títulos con la de antes.
 *
 * LA CABECERA SON LOS MEJORES POR PUNTUACIÓN, NO LOS PRIMEROS DE LA LISTA. Sin
 * orden pedido, `buscar()` devuelve los títulos en el orden en que contesta
 * TMDb, que cambia de una corrida a la otra: medido, la misma búsqueda con los
 * mismos 121 resultados compartía 1 de sus 10 primeros con la corrida de media
 * hora antes. Así la cabecera mide qué trae la búsqueda y no en qué orden llegó. Una marca es para mirar, no un error. Si el cambio es el buscado,
 * se acepta con --guardar y se commitea controles-referencia.json.
 *
 * Las búsquedas van en serie, igual que precalentar.js: cada una ya paraleliza
 * sus propias llamadas a TMDb, y lanzarlas juntas multiplicaría esa concurrencia.
 *
 * Usa la rama de Neon del .env (escribe caché de detalle, como cualquier
 * búsqueda). En esta máquina es desarrollo.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buscar } from '../buscador/motorBusqueda.js';
import { buscarPorEstadoAnimo } from '../opciones/estadoAnimo.js';
import { buscarParecidoA } from '../opciones/parecidoA.js';
import { buscarGustosPorGenero } from '../opciones/gustosPorGenero.js';
import { ESTADOS_ANIMO } from '../data/estadosAnimo.js';
import { leerAgregados } from '../repositories/agregados.js';
import { pool } from '../config/db.js';

const REFERENCIA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../controles-referencia.json');
const UMBRAL_CANTIDAD = 0.1;
const CABECERA = 10;
const MINIMO_CABECERA = 6;

/**
 * Los controles. Salen de las verificaciones "sin regresiones" que se
 * repetían en las notas de decisiones del proyecto. Si una sección nueva mide un caso que conviene
 * vigilar, va acá.
 */
const CONTROLES = [
  ['Populares (formulario vacío)', () => buscar({})],
  ['Comedia', () => buscar({ preferencias: { generos: [35] } })],
  ['Acción', () => buscar({ preferencias: { generos: [28] } })],
  ['Ciencia Ficción + Serie', () => buscar({ preferencias: { generos: [878], tipo: ['serie'] } })],
  ['Terror + Serie', () => buscar({ preferencias: { generos: [27], tipo: ['serie'] } })],
  ['Historia + Serie', () => buscar({ preferencias: { generos: [36], tipo: ['serie'] } })],
  // complejidad es UN valor, no una lista (4.5.1).
  ['Complejidad relajar', () => buscar({ preferencias: { complejidad: 'relajar' } })],
  ['Complejidad pensar', () => buscar({ preferencias: { complejidad: 'pensar' } })],
  ['Clásicos', () => buscar({ preferencias: { generos: ['CLASICOS'] } })],
  ...Object.keys(ESTADOS_ANIMO).map((clave) => [`Estado de ánimo: ${clave}`, () => buscarPorEstadoAnimo(clave)]),
  ['Parecido a El Padrino', () => buscarParecidoA([{ tmdb_id: 238, tipo: 'pelicula' }])],
  ['Parecido a The Walking Dead', () => buscarParecidoA([{ tmdb_id: 1402, tipo: 'tv' }])],
  // buscarGustosPorGenero no carga los agregados sola: se los pasa quien la llama (formularioVacio.js).
  ['Gustos: Acción + CF + Thriller + clásicos', async () => buscarGustosPorGenero({ generos: [28, 878, 53], clasicos: true, agregados: await leerAgregados() })],
  ['Gustos: Comedia', async () => buscarGustosPorGenero({ generos: [35], agregados: await leerAgregados() })],
];

const argumentos = process.argv.slice(2);
const GUARDAR = argumentos.includes('--guardar');
const iSolo = argumentos.indexOf('--solo');
const filtro = iSolo !== -1 ? (argumentos[iSolo + 1] ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];

function leerReferencia() {
  try {
    return JSON.parse(fs.readFileSync(REFERENCIA, 'utf8'));
  } catch {
    return { controles: {} };
  }
}

async function main() {
  const referencia = leerReferencia();
  const elegidos = filtro.length ? CONTROLES.filter(([n]) => filtro.some((f) => n.toLowerCase().includes(f))) : CONTROLES;
  if (!elegidos.length) throw new Error(`Ningún control coincide con: ${filtro.join(', ')}`);

  console.log(`Controles: ${elegidos.length}. Referencia: ${referencia.fecha ?? 'ninguna todavía'}.\n`);
  const actuales = {};
  let marcas = 0;

  for (const [nombre, correr] of elegidos) {
    const inicio = Date.now();
    let fila;
    try {
      const { resultados } = await correr();
      const clave = (r) => `${r.tipo}:${r.tmdb_id}`;
      const mejores = [...resultados].sort(
        (a, b) => (b.puntuacion ?? -1) - (a.puntuacion ?? -1) || clave(a).localeCompare(clave(b))
      );
      fila = {
        cantidad: resultados.length,
        cabecera: mejores.slice(0, CABECERA).map((r) => `${r.tipo}:${r.tmdb_id}`),
        titulos: mejores.slice(0, 5).map((r) => r.titulo),
        ms: Date.now() - inicio,
      };
    } catch (err) {
      fila = { error: err.message, ms: Date.now() - inicio };
    }
    actuales[nombre] = fila;

    const antes = referencia.controles[nombre];
    let marca = ' ';
    let comparacion = 'sin referencia';
    if (fila.error) {
      marca = '!';
      comparacion = `FALLÓ: ${fila.error}`;
    } else if (antes && !antes.error) {
      const delta = antes.cantidad ? (fila.cantidad - antes.cantidad) / antes.cantidad : fila.cantidad ? 1 : 0;
      const comunes = fila.cabecera.filter((c) => antes.cabecera.includes(c)).length;
      const cabeceraMinima = Math.min(MINIMO_CABECERA, antes.cabecera.length, fila.cabecera.length);
      if (Math.abs(delta) > UMBRAL_CANTIDAD || comunes < cabeceraMinima) marca = '!';
      const signo = delta > 0 ? '+' : '';
      comparacion = `antes ${antes.cantidad} (${signo}${Math.round(delta * 100)}%), cabecera ${comunes}/${Math.min(CABECERA, fila.cabecera.length)} en común`;
    }
    if (marca === '!') marcas += 1;

    const cantidad = fila.error ? '-' : String(fila.cantidad);
    console.log(`${marca} ${nombre.padEnd(44)} ${cantidad.padStart(4)}  ${comparacion}  [${(fila.ms / 1000).toFixed(1)} s]`);
    if (marca === '!' && !fila.error) console.log(`    arriba: ${fila.titulos.join(' | ')}`);
  }

  console.log(`\n${marcas ? `${marcas} control(es) marcados con "!" para mirar.` : 'Nada se movió más de lo esperable.'}`);

  if (GUARDAR) {
    // Se conservan los controles que no se corrieron (con --solo), así guardar una parte no borra el resto.
    const nueva = { fecha: new Date().toISOString().slice(0, 10), controles: { ...referencia.controles, ...actuales } };
    fs.writeFileSync(REFERENCIA, JSON.stringify(nueva, null, 2) + '\n');
    console.log(`Referencia guardada en ${path.basename(REFERENCIA)}. Commitearla para que la vea la próxima sesión.`);
  } else if (marcas) {
    console.log('Si el cambio es el buscado: npm run controles -- --guardar');
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
