import { buscar } from '../buscador/motorBusqueda.js';
import { elegirConSuerte } from '../logic/resultados.js';
import { pool } from '../config/db.js';

function mostrar(titulo, resultados) {
  console.log(`\n=== ${titulo} (${resultados.length} resultados) ===`);
  for (const r of resultados.slice(0, 10)) {
    const clasico = r.es_clasico ? ' 🎬 Clásico' : '';
    const comp = r.complejidad ? ` [${r.complejidad}]` : '';
    console.log(`- [${r.tipoContenido}] ${r.titulo} (${r.anio}) — Puntuación: ${r.puntuacion ?? 'N/D'}${clasico}${comp}`);
  }
}

async function main() {
  console.log('Probando el motor de búsqueda con datos reales de TMDb. Puede tardar un rato...\n');

  const { resultados: populares } = await buscar({ ordenar: { campo: 'popularidad', direccion: 'desc' } });
  mostrar('Opción 1: No sé qué ver (Populares)', populares);

  const { resultados: comedias } = await buscar({ preferencias: { generos: [35] }, ordenar: { campo: 'puntuacion', direccion: 'desc' } });
  mostrar('Comedias, ordenadas por puntuación', comedias);

  /**
   * Segundo lote: candidatos nuevos, sin repetir los del primero (es lo que
   * hace el botón "Traer más resultados" de /resultados).
   */
  const { resultados: masComedias, hayMas } = await buscar({ preferencias: { generos: [35] }, ordenar: { campo: 'puntuacion', direccion: 'desc' }, lote: 2 });
  const yaEstaban = new Set(comedias.map((c) => `${c.tipo}:${c.tmdb_id}`));
  const nuevos = masComedias.filter((c) => !yaEstaban.has(`${c.tipo}:${c.tmdb_id}`));
  console.log(`\n=== Comedias, lote 2 (${masComedias.length} resultados, ${nuevos.length} que no estaban en el lote 1, hayMas=${hayMas}) ===`);

  const conSuerte = elegirConSuerte(populares);
  console.log(`\n=== "Me siento con suerte" (sobre Populares) ===`);
  console.log(conSuerte ? `- [${conSuerte.tipoContenido}] ${conSuerte.titulo} (${conSuerte.anio})` : 'Sin resultados');

  await pool.end();
}

main().catch((err) => {
  console.error('Error probando el motor:', err);
  process.exit(1);
});
