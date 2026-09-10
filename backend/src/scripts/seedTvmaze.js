import 'dotenv/config';
import { obtenerPaginaDeShows, normalizarShow } from '../services/tvmaze.js';
import { guardarShows, contarShows } from '../repositories/seriesTvmaze.js';
import { pool } from '../config/db.js';

/**
 * Tope de seguridad: al escribir esto el índice terminaba alrededor de la
 * página 375, pero crece con el tiempo. Esto solo está para que un cambio
 * inesperado del lado de TVMaze (por ejemplo, que deje de devolver 404 al
 * final) no deje el script girando para siempre.
 */
const PAGINA_MAXIMA = 2000;

async function main() {
  console.log('Importando el índice de series de TVMaze. Tarda unos minutos: su API');
  console.log('permite ~20 llamadas cada 10 segundos y el script las respeta.\n');

  const arranque = Date.now();
  let guardados = 0;
  let sinImdb = 0;
  let page = 0;

  for (; page < PAGINA_MAXIMA; page++) {
    const pagina = await obtenerPaginaDeShows(page);
    // TVMaze responde 404 cuando se acabaron las páginas.
    if (pagina === null) break;

    const normalizados = [];
    for (const show of pagina) {
      const fila = normalizarShow(show);
      if (fila) normalizados.push(fila);
      else sinImdb++;
    }

    await guardarShows(normalizados);
    guardados += normalizados.length;

    if (page % 25 === 0) {
      const minutos = ((Date.now() - arranque) / 60000).toFixed(1);
      console.log(`  página ${page}: ${guardados} series guardadas (${minutos} min)`);
    }
  }

  const { total, con_duracion } = await contarShows();
  const minutos = ((Date.now() - arranque) / 60000).toFixed(1);

  console.log(`\nListo en ${minutos} minutos.`);
  console.log(`  páginas recorridas: ${page}`);
  console.log(`  series en la base: ${total} (${con_duracion} con duración por episodio)`);
  console.log(`  descartadas por no tener IMDb ID: ${sinImdb}`);
  console.log('\nVolver a correr este script es la forma de refrescar los datos: es un');
  console.log('upsert, así que no duplica nada.');

  await pool.end();
}

main().catch(async (err) => {
  console.error('Error importando de TVMaze:', err);
  await pool.end();
  process.exit(1);
});
