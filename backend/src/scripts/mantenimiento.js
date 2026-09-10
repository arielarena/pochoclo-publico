import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * El punto de entrada de todo lo que corre solo, cada tanto.
 *
 * QUÉ HACE, Y POR QUÉ ESTÁN JUNTAS CUATRO COSAS QUE PARECEN DISTINTAS. Las
 * cuatro son mantenimiento periódico y las cuatro se olvidan igual de fácil si
 * dependen de que alguien se acuerde:
 *
 *  | tarea            | cada | cuesta            | si no se hace |
 *  |------------------|------|-------------------|---------------|
 *  | respaldo + poda  | 1 d  | segundos          | **se pierden cuentas** |
 *  | latido de correo | 30 d | un mail           | **la clave SMTP vence sola** |
 *  | recalcular       | 7 d  | ~1 min, 530 TMDb  | la Puntuación se desajusta |
 *  | seed-tvmaze      | 30 d | ~10 min, 375 pág  | faltan duraciones de series |
 *  | precalentar      | 1 d  | ~4 min, 16 búsq.  | el primer visitante paga 13-19 s |
 *
 * El latido es la que menos parece mantenimiento y es la que más se parece al
 * resto: los proveedores de SMTP vencen las claves por inactividad, y Pochoclo
 * manda tan poco correo que se le puede morir sola. Ver latidoCorreo.js.
 *
 * **LA CADENCIA SE DECIDE POR FECHA DE ÚLTIMA CORRIDA, no por día de la
 * semana**, y esa es la decisión de diseño que importa. Un disparador del tipo
 * "los lunes" se pierde entero si la máquina está apagada el lunes, y no se
 * entera nadie: la próxima oportunidad es el lunes siguiente. Guardando cuándo
 * corrió cada tarea, con que la máquina se prenda una vez cada tantos días
 * alcanza, y lo atrasado se pone al día en la primera corrida.
 *
 * Por eso también **basta con UNA tarea programada diaria**, en vez de una por
 * tarea con disparadores distintos: el estado decide, no el calendario.
 *
 * EL ESTADO vive en `estado-mantenimiento.json`, dentro de la carpeta de
 * respaldos. Si se borra, la próxima corrida hace todo una vez y se reordena
 * sola, así que no es un archivo crítico.
 *
 * **UNA TAREA QUE FALLA NO CANCELA LAS SIGUIENTES**, y la fecha solo se
 * actualiza si la tarea terminó bien. O sea que si TMDb está caído, el
 * respaldo se toma igual y el recálculo se reintenta mañana en vez de quedar
 * marcado como hecho.
 *
 * Uso:
 *   npm run mantenimiento                  hace lo que corresponda por fecha
 *   npm run mantenimiento -- --simulacro   dice qué haría, sin hacer nada
 *   npm run mantenimiento -- --forzar      corre todas, ignorando fechas
 *   npm run mantenimiento -- --estado      muestra cuándo corrió cada una
 */

const RAIZ = process.cwd();
const CARPETA = process.env.CARPETA_RESPALDOS
  ? path.resolve(process.env.CARPETA_RESPALDOS)
  : path.resolve(RAIZ, 'respaldos');
const ESTADO = path.join(CARPETA, 'estado-mantenimiento.json');

const args = process.argv.slice(2);
const tiene = (f) => args.includes(f);
const SIMULACRO = tiene('--simulacro');
const FORZAR = tiene('--forzar');

/**
 * El disparador diario no cae siempre a la misma hora exacta (unos minutos
 * de variación entre corridas), así que dos corridas consecutivas pueden
 * quedar apenas por debajo de las 24 horas exactas. Sin margen, la
 * comparación estricta salteaba el día entero por una diferencia de
 * minutos, y recién se ponía al día la corrida siguiente. Encontrado el
 * 2026-09-04: faltó el respaldo de un día, con la máquina prendida y sin
 * ningún error, porque esa corrida llegó 2 minutos antes que la anterior.
 */
const MARGEN_DIAS = 0.1; // ~2,4 horas de tolerancia

/**
 * Las tareas, en orden de importancia.
 *
 * **El respaldo va PRIMERO a propósito.** Es la única cuyo fallo es
 * irreversible; las demás reconstruyen datos que se pueden volver a calcular, o
 * avisan de algo que se puede arreglar después. Si la corrida se corta por el
 * motivo que sea, que se haya cortado después del respaldo y no antes.
 */
const TAREAS = [
  {
    clave: 'respaldo',
    dias: 1,
    titulo: 'Respaldo de las tablas de cuentas',
    /**
     * Dos comandos en una tarea: podar sin respaldar antes dejaría el
     * conteo corto justo el día que se recicla el más viejo.
     */
    comandos: [
      ['src/scripts/respaldo.js', []],
      ['src/scripts/respaldo.js', ['--podar']],
    ],
  },
  {
    clave: 'latido',
    dias: 30,
    titulo: 'Correo de latido (mantiene viva la clave SMTP)',
    /**
     * Va segunda, y no última, aunque sea la más barata: es un chequeo de
     * salud, y su resultado interesa aunque las dos tareas pesadas de abajo
     * fallen. Cuesta segundos, así que no le quita tiempo a nada.
     */
    comandos: [['src/scripts/latidoCorreo.js', []]],
  },
  {
    clave: 'recalcular',
    dias: 7,
    titulo: 'Recálculo de agregados del catálogo (C, máximos, clásicos)',
    comandos: [['src/jobs/recalcularAgregados.js', []]],
  },
  {
    clave: 'tvmaze',
    dias: 30,
    titulo: 'Refresco del espejo de TVMaze (duración de series)',
    comandos: [['src/scripts/seedTvmaze.js', []]],
  },
  {
    clave: 'precalentar',
    dias: 1,
    titulo: 'Precalentar los 16 puntos de entrada fijos (estado de ánimo, tipo, no-se-que-ver)',
    /**
     * Va última a propósito: es la única de las cinco que no arregla ni
     * protege nada si falla (no se pierden datos, no vence ninguna clave, no
     * se desajusta ninguna fórmula) — solo hace que el próximo visitante
     * pague el camino frío en vez de encontrar el caché tibio. Que se quede
     * sin correr un día porque las de arriba tardaron no es grave.
     */
    comandos: [['src/scripts/precalentar.js', []]],
  },
];

function leerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  } catch {
    return {};
  }
}

function guardarEstado(estado) {
  fs.mkdirSync(CARPETA, { recursive: true });
  /**
   * Escritura atómica (2026-09-01): un `writeFileSync` directo, si el proceso
   * muere a mitad de camino (un corte de luz — justo lo que `vigilancia.js`
   * vigila con `chequearCorriente`), puede dejar el JSON truncado.
   * `leerEstado()` traga ese error de parseo y cae a "nunca corrió nada", así
   * que la corrida siguiente reprocesaría TODO de cero: recalcular (~530
   * llamadas a TMDb), el reseed de TVMaze (~10 min) y el respaldo, justo
   * después de un evento que ya de por sí es un riesgo. Escribir a un
   * temporal en la misma carpeta y renombrar es atómico en el mismo
   * filesystem: o el archivo viejo queda intacto, o el nuevo queda completo.
   */
  const temporal = `${ESTADO}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(estado, null, 2));
  fs.renameSync(temporal, ESTADO);
}

function diasDesde(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (24 * 60 * 60 * 1000);
}

function correr(script, extra) {
  const r = spawnSync(process.execPath, [script, ...extra], {
    cwd: RAIZ,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  return r.status === 0;
}

function mostrarEstado() {
  const estado = leerEstado();
  console.log(`Estado en ${path.relative(RAIZ, ESTADO)}\n`);
  for (const t of TAREAS) {
    const ultimo = estado[t.clave];
    const d = diasDesde(ultimo);
    const cuando = ultimo ? `${new Date(ultimo).toLocaleString('es-AR')} (hace ${d.toFixed(1)} d)` : 'nunca';
    console.log(`  ${t.clave.padEnd(12)} cada ${String(t.dias).padStart(2)} d   última: ${cuando}`);
  }
}

async function main() {
  if (tiene('--estado')) return mostrarEstado();

  const estado = leerEstado();
  const inicio = Date.now();
  let hechas = 0;
  let fallidas = 0;
  let salteadas = 0;

  console.log(`Mantenimiento de Pochoclo - ${new Date().toLocaleString('es-AR')}`);
  console.log(`Respaldos en: ${CARPETA}\n`);

  for (const t of TAREAS) {
    const d = diasDesde(estado[t.clave]);
    const toca = FORZAR || d >= t.dias - MARGEN_DIAS;

    if (!toca) {
      console.log(`[-] ${t.titulo}\n    al día (hace ${d.toFixed(1)} d, corresponde cada ${t.dias})`);
      salteadas++;
      continue;
    }

    console.log(`[>] ${t.titulo}`);
    if (SIMULACRO) {
      console.log(`    correría: ${t.comandos.map(([s, e]) => [s, ...e].join(' ')).join(' && ')}`);
      hechas++;
      continue;
    }

    let bien = true;
    for (const [script, extra] of t.comandos) {
      if (!correr(script, extra)) {
        bien = false;
        break;
      }
    }

    if (bien) {
      /**
       * La fecha se mueve SOLO si salió bien. Marcarla igual convertiría un
       * fallo puntual en un salteo silencioso de todo el período siguiente.
       */
      estado[t.clave] = new Date().toISOString();
      guardarEstado(estado);
      hechas++;
      console.log(`    ok\n`);
    } else {
      fallidas++;
      console.error(`    FALLÓ. No se movió la fecha, así que se reintenta en la próxima corrida.\n`);
    }
  }

  const seg = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(
    `\nResumen: ${hechas} ${SIMULACRO ? 'a correr' : 'hechas'}, ${salteadas} al día, ${fallidas} fallidas. ${seg}s`
  );
  /**
   * Sale distinto de cero para que el programador de tareas lo registre como
   * error y se pueda ver en su historial sin abrir ningún log.
   */
  if (fallidas) process.exitCode = 1;
}

main().catch((e) => {
  console.error('Mantenimiento abortado:', e.message);
  process.exitCode = 1;
});
