import { pool } from '../config/db.js';
import { buscarConFormularioVacio } from '../opciones/formularioVacio.js';
import { buscarPorEstadoAnimo } from '../opciones/estadoAnimo.js';
import { leerContextoDeUsuario } from '../opciones/personalizacion.js';
import { ESTADOS_ANIMO } from '../data/estadosAnimo.js';

/**
 * Precalienta el caché de detalle (`titulos.detalle`) para los 16 puntos de
 * entrada que son fijos e iguales para cualquier visitante anónimo: los 11
 * botones de "¿Estado de ánimo?" (Opción 4), las 4 tarjetas de "Quiero..."
 * (Opción 3: película / miniserie / serie / cualquier cosa) y "No sé qué
 * ver" (Opción 1) sin cuenta.
 *
 * POR QUÉ ESTO EXISTE. Medido en vivo contra producción el 2026-08-31: un
 * botón de estado de ánimo en frío (`HORAS_FRESCURA_DETALLE` venció, 7 días)
 * tarda entre 13 y 19 segundos, contra 1-3 s con el caché tibio. Esos 16
 * botones no dependen de Preferencias del usuario, así que son EXACTAMENTE
 * la misma búsqueda para todo el mundo — no hay motivo para que el primer
 * visitante de la semana pague ese camino frío. Con esto, ninguno lo paga:
 * lo paga esta corrida, una vez por día, contra el mismo caché que después
 * lee cualquier visitante real.
 *
 * POR QUÉ SECUENCIAL Y NO EN PARALELO ENTRE SÍ. Cada búsqueda ya paraleliza
 * sus propias llamadas a TMDb por dentro (CONCURRENCIA_DISCOVER,
 * CONCURRENCIA_DETALLE en motorBusqueda.js). Lanzar las 16 a la vez
 * multiplicaría esa concurrencia por 16 contra la misma API, con el riesgo
 * de empezar a recibir 429. Corriendo una por una, cada una tarda lo mismo
 * que mide arriba (13-19 s en frío), así que el total ronda los 4 minutos —
 * aceptable para una tarea que corre una vez al día, de madrugada.
 *
 * DESPUÉS DEL PRIMER DÍA ESTO CASI NO CUESTA NADA: con el caché ya tibio
 * (HORAS_FRESCURA_DETALLE = 7 días), la corrida diaria solo vuelve a pedirle
 * el detalle a TMDb a lo que venció esa semana, no a los 16 botones enteros.
 *
 * NO USA `req.usuario`: `leerContextoDeUsuario(undefined)` devuelve el
 * contexto anónimo sin ninguna consulta a la base (ver
 * opciones/personalizacion.js), que es exactamente lo que corresponde acá —
 * esto calienta el caché COMPARTIDO de `titulos`, no nada específico de una
 * cuenta.
 */

const TIPOS = ['pelicula', 'miniserie', 'serie', 'cualquier-cosa'];

async function precalentarUno(nombre, fn) {
  const t0 = Date.now();
  try {
    const { resultados } = await fn();
    console.log(`  [ok] ${nombre.padEnd(24)} ${((Date.now() - t0) / 1000).toFixed(1)}s, ${resultados.length} resultados`);
    return true;
  } catch (err) {
    console.warn(`  [FALLO] ${nombre.padEnd(24)} ${((Date.now() - t0) / 1000).toFixed(1)}s: ${err.message}`);
    return false;
  }
}

async function main() {
  const contexto = await leerContextoDeUsuario(undefined);
  const inicio = Date.now();
  let fallidas = 0;

  console.log('Precalentando los 16 puntos de entrada fijos...\n');

  if (!(await precalentarUno('no-se-que-ver', () => buscarConFormularioVacio(contexto)))) fallidas++;

  for (const tipo of TIPOS) {
    const preferenciasBase = tipo === 'cualquier-cosa' ? {} : { tipo: [tipo] };
    if (!(await precalentarUno(`tipo/${tipo}`, () => buscarConFormularioVacio(contexto, { preferenciasBase })))) {
      fallidas++;
    }
  }

  for (const clave of Object.keys(ESTADOS_ANIMO)) {
    if (!(await precalentarUno(`estado-animo/${clave}`, () => buscarPorEstadoAnimo(clave)))) fallidas++;
  }

  const seg = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`\nListo en ${seg}s. ${fallidas} de 16 fallaron.`);
  await pool.end();
  /**
   * Si alguna falló, que la tarea de mantenimiento se marque como no hecha
   * y se reintente mañana — es barato: con el caché ya tibio, reintentar
   * solo vuelve a pedir lo que siga fallando o lo que venza esa semana.
   */
  if (fallidas) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Precalentamiento abortado:', err);
  process.exitCode = 1;
});
