import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pool } from '../config/db.js';

/**
 * Respaldo y restauración de la base.
 *
 * LA DECISIÓN QUE HAY QUE ENTENDER: NO SE RESPALDA TODO, y no es por ahorrar
 * espacio. Las tablas se dividen en dos clases con consecuencias muy distintas
 * si se pierden:
 *
 *  - **Datos de gente** (`user`, `session`, `account`, `verification`,
 *    `items_lista`, `plataformas_usuario`, `gustos_usuario`). Si se pierden,
 *    **no hay forma de recuperarlos**: son las cuentas, las tres listas y los
 *    gustos. Es lo que este respaldo protege.
 *  - **Caché y espejos** (`titulos`, `series_tvmaze`, `agregados_catalogo`).
 *    Son 17,6 de los 17,7 MB de la base, y **se regeneran solos**: `titulos`
 *    se vuelve a llenar con el uso normal (ver 4.13),
 *    `series_tvmaze` con `npm run seed-tvmaze` y `agregados_catalogo` con
 *    `npm run recalcular`. Perderlas cuesta tiempo de recálculo, no datos.
 *
 * Meterlas en el respaldo de todos los días haría que el archivo pese cien
 * veces más y que restaurar sea cien veces más lento, para proteger algo que
 * un comando reconstruye. Por eso van solo con `--con-cache`, que es lo que
 * conviene para mudarse de proveedor, no para el respaldo periódico.
 *
 * **Esto NO reemplaza a los respaldos del proveedor.** Neon tiene recuperación
 * a un punto en el tiempo, que cubre cosas que un volcado no puede: volver a
 * cinco minutos antes de un `DELETE` mal escrito. Lo que este script agrega es
 * lo que aquélla no da: **una copia que vive fuera de Neon**. Si se pierde el
 * acceso a la cuenta, o el proyecto se borra entero, la recuperación a un punto
 * en el tiempo se va con él. Los dos se necesitan, y por motivos distintos.
 *
 * EL ORDEN DE LAS TABLAS SE CALCULA, no está escrito a mano: se leen las claves
 * foráneas de `information_schema` y se ordenan de modo que ninguna fila se
 * inserte antes que aquella a la que apunta. Si mañana se agrega una tabla, el
 * respaldo la toma sola; escrito a mano, se la olvidaría en silencio, que es la
 * peor forma de que falle un respaldo.
 *
 * Uso:
 *   npm run respaldo                          crea uno en backend/respaldos/
 *   npm run respaldo -- --con-cache           incluye las tablas grandes
 *   npm run respaldo -- --listar              qué respaldos hay
 *   npm run respaldo -- --verificar <archivo> lo abre y comprueba que esté sano
 *   npm run respaldo -- --restaurar <archivo> lo vuelca a la base
 *   npm run respaldo -- --restaurar <archivo> --forzar   si la base tiene datos
 *   npm run respaldo -- --podar               aplica la retención
 *   npm run respaldo -- --podar --simulacro   dice qué borraría, sin borrar
 *
 * La poda la corre sola la tarea programada, vía `npm run mantenimiento`. Ver
 * `mantenimiento.js`, que es el punto de entrada de todo lo periódico.
 */

/**
 * Dónde se guardan los respaldos.
 *
 * **`CARPETA_RESPALDOS` es la vía más barata de sacar la copia de esta
 * máquina**, que es la mitad del problema que un respaldo tiene que resolver:
 * un archivo que vive en el mismo disco que se puede romper protege contra un
 * borrado accidental, pero no contra que el disco se muera. Apuntándola a una
 * carpeta sincronizada (OneDrive, Drive, Dropbox) o a un disco externo, la
 * copia sale de acá sin que haga falta ningún servicio ni ninguna cuenta.
 *
 * Por omisión sigue siendo `backend/respaldos/`, que está en `.gitignore`
 * porque un respaldo lleva correos y hashes de contraseña. **Si se apunta a
 * otro lado, hay que comprobar que ese otro lado no termine sincronizado a un
 * repositorio ni compartido con nadie.**
 */
const CARPETA = process.env.CARPETA_RESPALDOS
  ? path.resolve(process.env.CARPETA_RESPALDOS)
  : path.resolve(process.cwd(), 'respaldos');

/**
 * Política de retención de la poda.
 *
 * POR QUÉ HACEN FALTA LAS DOS VENTANAS, que no son lo mismo:
 *
 *  - `DIAS_COMPLETOS` cubre **el error que se descubre tarde**, que es la
 *    razón de ser de este respaldo (la recuperación a un punto en el tiempo de
 *    Neon son 6 horas, ver la sección 10 de las notas de decisiones del proyecto). Con 30 días alcanza
 *    para volver más atrás del momento en que alguien se dio cuenta.
 *  - `MESES_ARCHIVADOS` cubre **la corrupción lenta**: algo que se rompe de a
 *    poco y recién se nota meses después, cuando los 30 días ya se reciclaron.
 *    Se guarda el más nuevo de cada mes.
 *
 * Sin poda, una tarea diaria acumula archivos para siempre. Con estos valores
 * el techo son 42 archivos, que a los ~100 kB que pesa hoy el respaldo de
 * cuentas es despreciable.
 */
const DIAS_COMPLETOS = 30;
const MESES_ARCHIVADOS = 12;

/** Las que se regeneran solas. Ver el comentario de arriba. */
const CACHE = new Set(['titulos', 'series_tvmaze', 'agregados_catalogo']);

const args = process.argv.slice(2);
const tiene = (f) => args.includes(f);
const valor = (f) => {
  const i = args.indexOf(f);
  return i === -1 ? null : args[i + 1];
};

function comillas(nombre) {
  /**
   * Las tablas de Better Auth son "user", "session", etc., en camelCase y
   * entre comillas dobles. Sin comillas Postgres las pasa a minúsculas y
   * "user" además es palabra reservada. Ver 4.16.
   */
  return `"${nombre.replace(/"/g, '""')}"`;
}

/**
 * El tipo de cada columna, para saber cuáles hay que serializar a mano.
 *
 * LA TRAMPA QUE ESTO TAPA, y que encontró el simulacro la primera vez que
 * corrió: `pg` convierte un array de JavaScript en un **array de Postgres**
 * (`{1,2}`), no en JSON. Para una columna `INTEGER[]` eso es exactamente lo que
 * hace falta; para una `JSONB` que guarda una lista —como `gustos_usuario.anios`,
 * que lleva los tramos de año (ver 4.18)— produce
 * `invalid input syntax for type json` y la restauración se cae entera.
 *
 * Es el modo de fallo más peligroso posible en un respaldo: el archivo se crea
 * bien, se verifica bien, y recién falla el día que hace falta restaurarlo.
 */
async function tiposDeColumna(nombres) {
  const { rows } = await pool.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [nombres]
  );
  const mapa = {};
  for (const r of rows) {
    (mapa[r.table_name] ??= {})[r.column_name] = r.data_type;
  }
  return mapa;
}

function paraInsertar(valor, tipo) {
  if (valor === null || valor === undefined) return null;
  /**
   * `pg` ya serializa un objeto plano a JSON, pero no un array: ése lo toma
   * como array de Postgres. Se serializan los dos a mano para que no haya un
   * caso que dependa del tipo de dato que tocó guardar.
   */
  if (tipo === 'json' || tipo === 'jsonb') return JSON.stringify(valor);
  return valor;
}

async function tablas() {
  const { rows } = await pool.query(`
    SELECT c.relname AS nombre
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname
  `);
  return rows.map((r) => r.nombre);
}

/** Ordena las tablas para que una fila nunca se inserte antes que su referida. */
async function ordenarPorDependencia(nombres) {
  const { rows } = await pool.query(`
    SELECT tc.table_name AS origen, ccu.table_name AS destino
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  `);
  const dependeDe = new Map(nombres.map((n) => [n, new Set()]));
  for (const { origen, destino } of rows) {
    if (origen !== destino && dependeDe.has(origen) && nombres.includes(destino)) {
      dependeDe.get(origen).add(destino);
    }
  }
  const orden = [];
  const puesto = new Set();
  let vuelta = 0;
  while (orden.length < nombres.length) {
    let avance = false;
    for (const n of nombres) {
      if (puesto.has(n)) continue;
      if ([...dependeDe.get(n)].every((d) => puesto.has(d))) {
        orden.push(n);
        puesto.add(n);
        avance = true;
      }
    }
    /**
     * Un ciclo de claves foráneas dejaría esto girando para siempre. No hay
     * ninguno hoy, pero un respaldo que se cuelga es peor que uno que avisa.
     */
    if (!avance || vuelta++ > nombres.length) {
      for (const n of nombres) if (!puesto.has(n)) orden.push(n);
      console.warn('AVISO: hay un ciclo de claves foráneas; el orden puede no servir para restaurar.');
      break;
    }
  }
  return orden;
}

async function crear() {
  const conCache = tiene('--con-cache');
  const todas = await tablas();
  const elegidas = conCache ? todas : todas.filter((t) => !CACHE.has(t));
  const orden = await ordenarPorDependencia(elegidas);

  const datos = {};
  const conteos = {};
  for (const t of orden) {
    const { rows } = await pool.query(`SELECT * FROM ${comillas(t)}`);
    datos[t] = rows;
    conteos[t] = rows.length;
  }

  const respaldo = {
    version: 1,
    creado: new Date().toISOString(),
    conCache,
    orden,
    conteos,
    /**
     * Se guardan los nombres de las tablas que existen pero no se respaldaron,
     * para que al restaurar se pueda avisar qué falta reconstruir.
     */
    omitidas: todas.filter((t) => !elegidas.includes(t)),
    datos,
  };

  fs.mkdirSync(CARPETA, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const archivo = path.join(CARPETA, `pochoclo-${sello}${conCache ? '-completo' : ''}.json.gz`);
  const crudo = Buffer.from(JSON.stringify(respaldo), 'utf8');
  fs.writeFileSync(archivo, zlib.gzipSync(crudo, { level: 9 }));

  const filas = Object.values(conteos).reduce((a, b) => a + b, 0);
  console.log(`Respaldo creado: ${path.relative(process.cwd(), archivo)}`);
  console.log(`  ${orden.length} tablas, ${filas} filas`);
  console.log(
    `  ${(crudo.length / 1024).toFixed(0)} kB sin comprimir, ${(fs.statSync(archivo).size / 1024).toFixed(0)} kB en disco`
  );
  for (const t of orden) if (conteos[t]) console.log(`     ${String(conteos[t]).padStart(7)}  ${t}`);
  if (respaldo.omitidas.length) {
    console.log(`  Sin incluir (se regeneran): ${respaldo.omitidas.join(', ')}`);
  }
  return archivo;
}

function leer(archivo) {
  const buf = zlib.gunzipSync(fs.readFileSync(archivo));
  const r = JSON.parse(buf.toString('utf8'));
  if (r.version !== 1) throw new Error(`Versión de respaldo desconocida: ${r.version}`);
  return r;
}

function verificar(archivo) {
  const r = leer(archivo);
  console.log(`${path.basename(archivo)}`);
  console.log(`  creado: ${r.creado}`);
  let problemas = 0;
  for (const t of r.orden) {
    const filas = r.datos[t];
    if (!Array.isArray(filas)) {
      console.log(`  MAL  ${t}: no hay filas`);
      problemas++;
      continue;
    }
    if (filas.length !== r.conteos[t]) {
      console.log(`  MAL  ${t}: dice ${r.conteos[t]} y trae ${filas.length}`);
      problemas++;
      continue;
    }
    console.log(`  ok   ${String(filas.length).padStart(7)}  ${t}`);
  }
  console.log(problemas === 0 ? '\nEl archivo está sano.' : `\n${problemas} problemas.`);
  return problemas === 0;
}

async function restaurar(archivo) {
  const r = leer(archivo);

  /**
   * Una restauración pisa lo que haya. Si la base tiene cuentas, casi siempre
   * es un error de tipeo: se está restaurando sobre producción en vez de sobre
   * una copia. Se pide `--forzar` a propósito.
   */
  const { rows: hay } = await pool.query('SELECT count(*)::int AS n FROM "user"');
  if (hay[0].n > 0 && !tiene('--forzar')) {
    throw new Error(
      `La base tiene ${hay[0].n} cuentas y restaurar las borra. Si es lo que querés, agregá --forzar.`
    );
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    /**
     * Se vacía en el orden inverso al de inserción, así ninguna fila queda
     * apuntando a otra que ya no está.
     */
    for (const t of [...r.orden].reverse()) {
      await cliente.query(`DELETE FROM ${comillas(t)}`);
    }
    const tipos = await tiposDeColumna(r.orden);
    for (const t of r.orden) {
      const filas = r.datos[t];
      if (!filas.length) continue;
      const columnas = Object.keys(filas[0]);
      const lista = columnas.map(comillas).join(', ');
      /**
       * De a lotes: un INSERT con 48.000 filas se pasa del máximo de
       * parámetros de un mensaje del protocolo de Postgres (65.535).
       */
      const porLote = Math.max(1, Math.floor(60000 / columnas.length));
      for (let i = 0; i < filas.length; i += porLote) {
        const lote = filas.slice(i, i + porLote);
        const valores = [];
        const marcas = lote.map(
          (fila, f) =>
            '(' +
            columnas
              .map((c, k) => {
                valores.push(paraInsertar(fila[c], tipos[t]?.[c]));
                return `$${f * columnas.length + k + 1}`;
              })
              .join(', ') +
            ')'
        );
        await cliente.query(
          `INSERT INTO ${comillas(t)} (${lista}) VALUES ${marcas.join(', ')}`,
          valores
        );
      }
    }
    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }

  console.log(`Restaurado desde ${path.basename(archivo)} (${r.creado})`);
  for (const t of r.orden) if (r.conteos[t]) console.log(`  ${String(r.conteos[t]).padStart(7)}  ${t}`);
  if (r.omitidas.length) {
    console.log(`\nOJO: este respaldo no incluía ${r.omitidas.join(', ')}.`);
    console.log('Se reconstruyen con: npm run seed-tvmaze y npm run recalcular.');
  }
}

function listar() {
  if (!fs.existsSync(CARPETA)) return console.log('Todavía no hay respaldos.');
  const archivos = fs
    .readdirSync(CARPETA)
    .filter((a) => a.endsWith('.json.gz'))
    .sort()
    .reverse();
  if (!archivos.length) return console.log('Todavía no hay respaldos.');
  for (const a of archivos) {
    const st = fs.statSync(path.join(CARPETA, a));
    console.log(`  ${(st.size / 1024).toFixed(0).padStart(6)} kB  ${a}`);
  }
}

/**
 * La fecha que lleva el nombre del archivo.
 *
 * Se lee del NOMBRE y no de la fecha del archivo en disco a propósito: copiar
 * o mover un respaldo le cambia la fecha del sistema de archivos, y ahí la
 * poda empezaría a borrar por un dato que no dice cuándo se tomó la foto.
 *
 * Devuelve null si no se entiende, y quien llama **no borra lo que no
 * entiende**: un archivo con otro nombre puede ser algo que alguien dejó ahí a
 * mano, y equivocarse borrando es lo único que no tiene arreglo acá.
 */
function fechaDeNombre(archivo) {
  const m = archivo.match(/^pochoclo-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, a, mes, d, h, min] = m;
  const f = new Date(`${a}-${mes}-${d}T${h}:${min}:00Z`);
  return Number.isNaN(f.getTime()) ? null : f;
}

/**
 * Borra los respaldos que la política de retención ya no cubre.
 *
 * TRES PROTECCIONES, y las tres están por algo:
 *
 *  1. **Nunca borra el más nuevo**, pase lo que pase con las ventanas. Si
 *     alguien deja el reloj del sistema mal, o toca las constantes, el peor
 *     caso sigue siendo quedarse con un respaldo y no con ninguno.
 *  2. **Nunca borra lo que no puede fechar** por el nombre (ver arriba).
 *  3. **`--simulacro` dice qué borraría sin borrar nada.** Conviene correrlo
 *     la primera vez, y después de tocar las constantes.
 */
function podar({ simulacro = false } = {}) {
  if (!fs.existsSync(CARPETA)) return { borrados: 0, conservados: 0 };

  const archivos = fs
    .readdirSync(CARPETA)
    .filter((a) => a.endsWith('.json.gz'))
    .map((a) => ({ nombre: a, fecha: fechaDeNombre(a) }))
    .sort((x, y) => (y.fecha?.getTime() ?? 0) - (x.fecha?.getTime() ?? 0));

  const ahora = Date.now();
  const dia = 24 * 60 * 60 * 1000;
  const mesesVistos = new Set();
  const aBorrar = [];
  let conservados = 0;

  for (const [i, f] of archivos.entries()) {
    // Protecciones 1 y 2.
    if (i === 0 || !f.fecha) {
      conservados++;
      continue;
    }
    const edadDias = (ahora - f.fecha.getTime()) / dia;
    if (edadDias <= DIAS_COMPLETOS) {
      conservados++;
      continue;
    }
    /**
     * Fuera de la ventana diaria: sobrevive el más nuevo de cada mes, y solo
     * mientras ese mes entre en la ventana de archivo.
     */
    const mes = f.nombre.slice(9, 16); // pochoclo-YYYY-MM
    const edadMeses = edadDias / 30.44;
    if (!mesesVistos.has(mes) && edadMeses <= MESES_ARCHIVADOS) {
      mesesVistos.add(mes);
      conservados++;
      continue;
    }
    aBorrar.push(f.nombre);
  }

  for (const nombre of aBorrar) {
    if (!simulacro) fs.unlinkSync(path.join(CARPETA, nombre));
    console.log(`  ${simulacro ? 'borraría' : 'borrado'}: ${nombre}`);
  }
  console.log(
    `Poda: ${conservados} conservados, ${aBorrar.length} ${simulacro ? 'a borrar' : 'borrados'}` +
      ` (${DIAS_COMPLETOS} días completos + ${MESES_ARCHIVADOS} meses archivados)`
  );
  return { borrados: aBorrar.length, conservados };
}

async function main() {
  if (tiene('--listar')) return listar();
  if (tiene('--podar')) return void podar({ simulacro: tiene('--simulacro') });
  if (tiene('--verificar')) {
    const a = valor('--verificar');
    if (!a) throw new Error('Falta el archivo después de --verificar');
    if (!verificar(a)) process.exitCode = 1;
    return;
  }
  if (tiene('--restaurar')) {
    const a = valor('--restaurar');
    if (!a) throw new Error('Falta el archivo después de --restaurar');
    return restaurar(a);
  }
  await crear();
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
