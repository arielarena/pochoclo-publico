import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  HAY_CORREO_CONFIGURADO,
  direccionDeAvisos,
  enviarAvisoVigilancia,
} from '../auth/correo.js';

/**
 * Vigilancia de la máquina donde corre Pochoclo.
 *
 * POR QUÉ EXISTE. El 2026-08-30 el sitio estuvo cayéndose por tandas durante
 * casi una hora y se descubrió de casualidad, usándolo. Hasta entonces no había
 * ningún aviso de nada: la notebook se podía sobrecalentar, quedarse sin disco,
 * perder la microSD de los respaldos o dejar de respaldar, y nadie se enteraba.
 *
 * ES LA CAPA INTERNA, Y NO ALCANZA SOLA. Un vigilante que corre adentro de la
 * máquina **no puede avisar de su propia muerte**: si se apaga, se queda sin
 * red o se le llena el disco al punto de no poder escribir, es justo cuando más
 * falta hace el aviso y es cuando no lo va a poder mandar. Hace falta además un
 * chequeo externo que note que el sitio no responde. Esta capa dice QUÉ pasa;
 * la externa dice QUE pasa algo. Ninguna reemplaza a la otra.
 *
 * Uso:
 *   npm run vigilancia              corre los chequeos y avisa si algo cambió
 *   npm run vigilancia -- --estado  muestra el resultado sin mandar nada
 *   npm run vigilancia -- --forzar  manda el correo aunque no haya cambiado nada
 *
 * ---------------------------------------------------------------------------
 * LAS DOS REGLAS QUE LO HACEN UTIL EN VEZ DE RUIDOSO
 *
 * 1. **Un solo correo por corrida, con todo lo que cambió.** Con un correo por
 *    chequeo, una caída de red manda cinco a la vez y la próxima vez nadie los
 *    lee.
 * 2. **Avisa al empezar el problema y al resolverse, y en el medio se calla.**
 *    Corriendo cada 15 minutos, repetir el aviso mientras el problema dure son
 *    96 correos por día. Un vigilante ruidoso se termina ignorando, que es lo
 *    mismo que no tenerlo.
 *
 * Las dos las cumple el archivo de estado: guarda qué problemas estaban activos
 * en la corrida anterior, y solo se manda correo por las diferencias.
 * ---------------------------------------------------------------------------
 *
 * UN CHEQUEO QUE NO SE PUEDE EJECUTAR CUENTA COMO PROBLEMA, no como "todo bien".
 * Es la diferencia entre un vigilante y un adorno: si `journalctl` no se puede
 * leer o `/sys` no tiene lo que se espera, el silencio sería indistinguible de
 * la salud. Avisa una vez y después se calla, como cualquier otro problema.
 */

const args = process.argv.slice(2);
const SOLO_ESTADO = args.includes('--estado');
const FORZAR = args.includes('--forzar');

const RAIZ = process.cwd();
const CARPETA = process.env.CARPETA_RESPALDOS
  ? path.resolve(process.env.CARPETA_RESPALDOS)
  : path.resolve(RAIZ, 'respaldos');
const ESTADO = path.join(CARPETA, 'estado-vigilancia.json');

/** Umbrales. Todos se pueden ajustar por variable de entorno. */
const UMBRAL_DISCO = Number(process.env.VIGILANCIA_DISCO || 85);
const UMBRAL_TEMPERATURA = Number(process.env.VIGILANCIA_TEMPERATURA || 80);
const UMBRAL_RESPALDO_DIAS = Number(process.env.VIGILANCIA_RESPALDO_DIAS || 2);
const UMBRAL_WIFI_POR_HORA = Number(process.env.VIGILANCIA_WIFI_POR_HORA || 6);
const UMBRAL_DESCARTES_TMDB = Number(process.env.VIGILANCIA_DESCARTES_TMDB || 20);

/**
 * Cada cuántos minutos se corre el chequeo de Neon (ver `chequearNeon`), en
 * vez de en cada ciclo como el resto. No es una cadencia general: hoy es el
 * único chequeo que la necesita, así que el mecanismo (`cadenciaMinutos` en
 * `CHEQUEOS`) queda armado para que cualquier chequeo futuro tan caro como
 * este lo pueda usar sin duplicar nada, pero no hay una segunda instancia
 * todavía.
 */
const CADENCIA_NEON_MINUTOS = Number(process.env.VIGILANCIA_NEON_CADA_MINUTOS || 120);

/** Los servicios que tienen que estar corriendo, y los puntos de montaje. */
const SERVICIOS = (process.env.VIGILANCIA_SERVICIOS || 'pochoclo,cloudflared')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MONTAJES = (process.env.VIGILANCIA_MONTAJES || '/mnt/respaldos,/mnt/respaldos2')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Las direcciones que se piden, sacadas de las variables que YA EXISTEN.
 *
 * No se inventan variables nuevas a propósito: `BETTER_AUTH_URL` es la base
 * pública de la API y `URL_FRONTEND` la del sitio, así que si algún día cambia
 * el dominio, esto lo sigue solo. Una variable propia sería una cuarta copia del
 * dominio esperando quedar vieja.
 */
const PUERTO_LOCAL = Number(process.env.PORT || 3000);
const URL_LOCAL = `http://localhost:${PUERTO_LOCAL}/salud`;
const URL_API = process.env.BETTER_AUTH_URL
  ? `${process.env.BETTER_AUTH_URL.replace(/\/+$/, '')}/salud`
  : null;
const URL_SITIO = (process.env.URL_FRONTEND || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)[0] || null;

/** Corre un comando y devuelve su salida, o null si no se pudo. */
function correr(comando, argumentos) {
  try {
    return execFileSync(comando, argumentos, {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function leerNumero(archivo) {
  try {
    return Number(fs.readFileSync(archivo, 'utf8').trim());
  } catch {
    return null;
  }
}

/** Pide una direccion y devuelve como le fue, sin lanzar nunca. */
async function pedir(url, milisegundos = 10_000) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), milisegundos);
  try {
    const respuesta = await fetch(url, { signal: control.signal, redirect: 'follow' });
    return { ok: respuesta.ok, estado: respuesta.status };
  } catch (err) {
    /**
     * Incluye el corte por tiempo: sin esto, un servidor que acepta la conexión
     * y después se queda callado dejaría al vigilante colgado para siempre.
     */
    return { ok: false, estado: 0, error: err.name === 'AbortError' ? 'no contestó a tiempo' : err.message };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * ---------------------------------------------------------------- chequeos
 *
 * Cada uno devuelve null si está todo bien, o un texto describiendo el
 * problema. El texto va tal cual al correo, así que tiene que alcanzar para
 * entender qué pasa sin entrar a la máquina.
 */

/**
 * Servicios parados.
 *
 * SE CHEQUEAN POR SEPARADO ADEMAS DE `systemctl --failed`, y no es redundante:
 * un servicio **detenido a mano** queda `inactive`, no `failed`, así que no
 * aparece en esa lista. El caso es justamente el que importa: alguien lo paró
 * para probar algo y se olvidó de levantarlo.
 */
function chequearServicios() {
  const caidos = [];
  for (const servicio of SERVICIOS) {
    const estado = correr('systemctl', ['is-active', servicio]);
    if (estado !== 'active') caidos.push(`${servicio} (${estado ?? 'no se pudo consultar'})`);
  }
  return caidos.length ? `Servicios que no están corriendo: ${caidos.join(', ')}.` : null;
}

/**
 * El atrapatodo: cualquier unidad de systemd fallida.
 *
 * Cubre el mantenimiento, la copia a los soportes, el ahorro de energía del
 * Wi-Fi y cualquier cosa que se agregue después, **sin tener que enumerarlas**.
 */
function chequearUnidadesFallidas() {
  const salida = correr('systemctl', ['--failed', '--no-legend', '--plain']);
  if (salida === null) return 'No se pudo consultar systemd para ver si hay unidades fallidas.';
  if (!salida) return null;
  const nombres = salida
    .split('\n')
    .map((linea) => linea.trim().split(/\s+/)[0])
    .filter(Boolean);
  return `Unidades de systemd fallidas: ${nombres.join(', ')}.`;
}

/** Disco lleno. Un servidor sin espacio deja de funcionar entero y de formas raras. */
function chequearDisco() {
  let info;
  try {
    info = fs.statfsSync('/');
  } catch {
    return 'No se pudo medir el espacio libre del disco.';
  }
  /**
   * `bavail` y no `bfree`: es lo que de verdad puede usar un proceso que no
   * sea root, que es como corre todo esto.
   */
  const usadoPorCiento = Math.round(((info.blocks - info.bavail) / info.blocks) * 100);
  const libresGb = ((info.bavail * info.bsize) / 1024 ** 3).toFixed(1);
  if (usadoPorCiento < UMBRAL_DISCO) return null;
  return `Disco al ${usadoPorCiento}% (quedan ${libresGb} GB libres). El umbral es ${UMBRAL_DISCO}%.`;
}

/** Temperatura. Es una máquina de 2016 con ventilación pasiva. */
function chequearTemperatura() {
  let zonas;
  try {
    zonas = fs.readdirSync('/sys/class/thermal').filter((d) => d.startsWith('thermal_zone'));
  } catch {
    return 'No se pudo leer la temperatura (no existe /sys/class/thermal).';
  }
  const grados = zonas
    .map((z) => leerNumero(`/sys/class/thermal/${z}/temp`))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => n / 1000);
  if (!grados.length) return 'No se pudo leer la temperatura de ninguna zona térmica.';
  const maxima = Math.max(...grados);
  if (maxima < UMBRAL_TEMPERATURA) return null;
  return `Temperatura de ${maxima.toFixed(1)} grados. El umbral es ${UMBRAL_TEMPERATURA}.`;
}

/**
 * Los soportes de respaldo desmontados.
 *
 * ES EL MODO DE FALLO QUE INTRODUCE `nofail` EN EL fstab, y por eso hay que
 * vigilarlo. Con `nofail`, si la microSD o el pendrive se aflojan o se mueren,
 * **el arranque sigue como si nada** y las copias dejan de hacerse en silencio.
 * Sin `nofail` el arranque caería en modo emergencia y el sitio quedaría caído,
 * que es peor; este chequeo es el precio de esa decisión.
 *
 * Se detecta comparando el dispositivo del directorio con el de su padre: si
 * son el mismo, ahí no hay nada montado. Así no hace falta `mountpoint`.
 */
function chequearMontajes() {
  const sueltos = [];
  for (const punto of MONTAJES) {
    try {
      const propio = fs.statSync(punto).dev;
      const padre = fs.statSync(path.dirname(punto)).dev;
      if (propio === padre) sueltos.push(punto);
    } catch {
      sueltos.push(`${punto} (no existe)`);
    }
  }
  if (!sueltos.length) return null;
  return `Soportes de respaldo sin montar: ${sueltos.join(', ')}. Las copias no se están haciendo ahí.`;
}

/** El respaldo más nuevo, envejecido. */
function chequearRespaldo() {
  let archivos;
  try {
    archivos = fs
      .readdirSync(CARPETA)
      .filter((n) => n.endsWith('.json.gz'))
      .map((n) => ({ n, t: fs.statSync(path.join(CARPETA, n)).mtimeMs }));
  } catch {
    return `No se pudo leer la carpeta de respaldos (${CARPETA}).`;
  }
  if (!archivos.length) return `No hay ningún respaldo en ${CARPETA}.`;
  const masNuevo = archivos.reduce((a, b) => (a.t > b.t ? a : b));
  const dias = (Date.now() - masNuevo.t) / 86_400_000;
  if (dias <= UMBRAL_RESPALDO_DIAS) return null;
  return (
    `El respaldo más nuevo tiene ${dias.toFixed(1)} días (${masNuevo.n}). ` +
    `El umbral es ${UMBRAL_RESPALDO_DIAS}. Revisar pochoclo-mantenimiento.`
  );
}

/**
 * Andando con batería, o sea que se cortó la luz.
 *
 * NO ES UN AVISO DE QUE ALGO SE ROMPIO, es un aviso con tiempo: la batería da
 * unas cuatro horas, y esta BIOS **no tiene encendido automático**, así que si
 * se agota el sitio queda caído hasta que alguien vaya a prender la máquina a
 * mano.
 */
function chequearCorriente() {
  let entradas;
  try {
    entradas = fs.readdirSync('/sys/class/power_supply');
  } catch {
    return null; // Una máquina sin batería (un servidor de verdad) no tiene esto.
  }
  const adaptadores = entradas.filter(
    (d) => leerNumero(`/sys/class/power_supply/${d}/online`) !== null
  );
  if (!adaptadores.length) return null;

  const enchufada = adaptadores.some(
    (a) => leerNumero(`/sys/class/power_supply/${a}/online`) === 1
  );
  if (enchufada) return null;

  const baterias = entradas.filter((d) => d.startsWith('BAT'));
  const carga = baterias.length
    ? leerNumero(`/sys/class/power_supply/${baterias[0]}/capacity`)
    : null;
  return (
    'Está andando con batería: se cortó la luz.' +
    (carga !== null ? ` Carga al ${carga}%.` : '') +
    ' Esta BIOS no enciende sola, así que si se agota el sitio queda caído hasta prenderla a mano.'
  );
}

/**
 * Wi-Fi inestable.
 *
 * Es la señal temprana de lo que pasó el 2026-08-30: cada reasociación mata las
 * cuatro conexiones del túnel a la vez y Cloudflare contesta 1033 hasta que se
 * vuelven a registrar.
 */
function chequearWifi() {
  /**
   * Se filtra por identificador y no se traga el diario entero: sin `-t`, cada
   * corrida (una cada 15 minutos) bajaría una hora completa de logs de todo el
   * sistema para buscarle una línea. `wpa_supplicant` es quien emite estos
   * eventos; si algún día lo emitiera otro, este chequeo daría cero en
   * silencio, que es el único punto ciego que le queda.
   */
  const salida = correr('journalctl', [
    '--since',
    '1 hour ago',
    '-t',
    'wpa_supplicant',
    '--no-pager',
    '-q',
  ]);
  if (salida === null) {
    return 'No se pudo leer el diario del sistema para contar las desconexiones de Wi-Fi.';
  }
  const cuenta = (salida.match(/CTRL-EVENT-DISCONNECTED/g) || []).length;
  if (cuenta < UMBRAL_WIFI_POR_HORA) return null;
  return (
    `${cuenta} desconexiones de Wi-Fi en la última hora (el umbral es ${UMBRAL_WIFI_POR_HORA}). ` +
    'Cada una corta el túnel. Revisar el ahorro de energía y la señal.'
  );
}

/** Suma los grupos de captura numéricos de todas las coincidencias de un patrón. */
function sumarCoincidencias(texto, patron) {
  let total = 0;
  for (const m of texto.matchAll(patron)) total += Number(m[1]);
  return total;
}

/**
 * Neon, con una consulta real — no alcanza con que `/salud` conteste 200.
 *
 * ES EL HUECO QUE NINGÚN OTRO CHEQUEO PUEDE VER. `/salud` (`index.js`)
 * contesta `{estado:'ok'}` sin tocar la base, y `leerDetallesFrescos()` —
 * que sí la toca, adentro de `completarDetalle()` — no tiene ningún `try`
 * alrededor. O sea que si Neon está inalcanzable, `/salud` sigue en 200
 * mientras TODA búsqueda real devuelve 500: `apiPublica` y los dos monitores
 * externos de UptimeRobot quedarían los tres en verde con el sitio roto.
 *
 * **NO SE METE EN `/salud` NI SE CORRE EN CADA CICLO, y las dos decisiones
 * son la misma.** UptimeRobot pega contra `/salud` cada 5 minutos; si esa
 * ruta tocara Neon, mantendría el cómputo casi siempre despierto, contra los
 * ~8,7 de 191,9 CU-h que usa hoy el proyecto en todo un mes (medido con el
 * MCP de Neon el 2026-08-31). Acá, con `cadenciaMinutos`, alcanza con cada
 * un par de horas: una caída de Neon no se resuelve sola en minutos, así que
 * enterarse dos horas tarde sigue siendo mucho antes que "nadie se entera
 * hasta que alguien reclama".
 *
 * **Import dinámico y no `import` estático arriba del archivo, a
 * propósito.** `config/db.js` tira si falta `DATABASE_URL`, y ese throw
 * pasaría al CARGAR el módulo — antes de que este chequeo puntual llegue a
 * correr, tumbando el script entero y apagando los otros diez chequeos con
 * él. Con el import adentro de la función, un `DATABASE_URL` faltante queda
 * atrapado acá y se reporta como el problema de ESTE chequeo, nada más — es
 * el mismo principio que "un chequeo que no se puede ejecutar cuenta como
 * problema" de la cabecera del archivo, llevado a su extremo.
 *
 * El pool se cierra al terminar: sin eso, la conexión abierta mantendría
 * vivo el proceso hasta el `idleTimeoutMillis` de `pg` (10 s) en vez de
 * salir apenas termina, que en un script disparado cada 15 minutos suma.
 */
async function chequearNeon() {
  let pool;
  try {
    ({ pool } = await import('../config/db.js'));
    await pool.query('SELECT 1');
    return null;
  } catch (err) {
    return `No se pudo consultar Neon: ${err.message}`;
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}

/**
 * Candidatos que una búsqueda descartó en silencio por fallas de TMDb o de
 * Neon, contados sobre el diario del sistema de la última hora.
 *
 * DE QUÉ AVISA. `completarDetalle()` (`motorBusqueda.js`) no lanza cuando
 * algunos candidatos fallan al pedirles el detalle a TMDb, ni cuando el lote
 * de escrituras no se pudo guardar (`guardarLote()`): registra un
 * `console.warn` y la búsqueda responde igual, con menos resultados de los
 * que debería. Es la decisión correcta para quien está mirando la pantalla
 * en el momento (mejor una respuesta incompleta que un error), pero nadie
 * se entera de que está pasando — hasta ahora.
 *
 * **Hoy, con el tráfico casi nulo del sitio, esto nunca debería dispararse.**
 * El motivo por el que existe es de cara a cuando haya más visitas: una sola
 * IP en el tope del límite de pedidos (30 búsquedas caras por minuto) puede
 * llegar a pedirle a TMDb más de lo que tolera, y ahí es donde el descarte
 * silencioso deja de ser una rareza. El umbral por defecto (20 en una hora)
 * es alto a propósito, para no avisar por el 429 ocasional de una sola
 * búsqueda con mala suerte.
 *
 * Se lee el diario de la unidad `pochoclo` con `-u`, no con `-t` como el
 * chequeo de Wi-Fi: `-u` filtra por unidad de systemd, que es como se
 * identifica un servicio propio (`wpa_supplicant`, en cambio, no es una
 * unidad, es quien emite esos eventos).
 */
function chequearDescartesTmdb() {
  const salida = correr('journalctl', ['-u', 'pochoclo', '--since', '1 hour ago', '--no-pager', '-q']);
  if (salida === null) {
    return 'No se pudo leer el diario del sistema para contar los descartes silenciosos.';
  }

  const candidatos = sumarCoincidencias(salida, /(\d+) candidatos fallaron al traer detalle/g);
  const lote = sumarCoincidencias(salida, /No se pudo guardar el lote de (\d+) títulos/g);
  if (candidatos < UMBRAL_DESCARTES_TMDB && lote < UMBRAL_DESCARTES_TMDB) return null;

  const partes = [];
  if (candidatos >= UMBRAL_DESCARTES_TMDB) {
    partes.push(`${candidatos} candidatos descartados por fallas de TMDb al pedir su detalle`);
  }
  if (lote >= UMBRAL_DESCARTES_TMDB) partes.push(`${lote} títulos sin guardar por fallas al escribir en Neon`);
  return (
    `${partes.join(' y ')} en la última hora (umbral ${UMBRAL_DESCARTES_TMDB}). ` +
    'Búsquedas devolviendo resultados de menos, en silencio para quien las pide.'
  );
}

/**
 * El backend, desde adentro de la propia máquina.
 *
 * Distingue "el backend está roto" de "el camino hasta el backend está roto",
 * que es la primera pregunta que hay que responder cuando el sitio no anda y la
 * que hizo rápido el diagnóstico del 2026-08-30.
 */
async function chequearBackendLocal() {
  const r = await pedir(URL_LOCAL, 8000);
  if (r.ok) return null;
  return `El backend no responde en ${URL_LOCAL} (${r.error ?? 'HTTP ' + r.estado}).`;
}

/**
 * La API por su dirección pública, o sea atravesando el túnel y Cloudflare.
 *
 * ES EL CHEQUEO QUE FALTABA, y el que justifica los otros dos de red. El
 * 2026-08-30 el sitio estuvo caído por tandas casi una hora **con `pochoclo` y
 * `cloudflared` los dos en `active` y sin ninguna unidad fallida**: el proceso
 * del túnel estaba vivo, lo que se habían muerto eran sus cuatro conexiones con
 * el borde de Cloudflare. Ningún chequeo de estado de servicios puede ver eso.
 * La única forma es pedir la dirección pública y mirar qué contesta.
 *
 * Cuando falla, vuelve a preguntarle a localhost para poder decir de qué lado
 * está el problema. Cuesta un pedido más y solo en el caso malo, y ahorra el
 * paso de diagnóstico que uno haría igual.
 */
async function chequearApiPublica() {
  if (!URL_API) {
    return 'No está definida BETTER_AUTH_URL, así que no se puede comprobar la API pública.';
  }
  const r = await pedir(URL_API);
  if (r.ok) return null;
  const local = await pedir(URL_LOCAL, 8000);
  const pista = local.ok
    ? 'El backend SÍ responde en localhost, así que lo que está roto es el camino: el túnel o Cloudflare. En el navegador se ve como error 1033.'
    : 'El backend tampoco responde en localhost, así que el problema es del backend y no del túnel.';
  return `La API pública no responde en ${URL_API} (${r.error ?? 'HTTP ' + r.estado}). ${pista}`;
}

/** El sitio, que lo sirve Cloudflare Pages y puede romperse por su cuenta. */
async function chequearSitioPublico() {
  if (!URL_SITIO) {
    return 'No está definida URL_FRONTEND, así que no se puede comprobar el sitio.';
  }
  const r = await pedir(URL_SITIO);
  if (r.ok) return null;
  return `El sitio no responde en ${URL_SITIO} (${r.error ?? 'HTTP ' + r.estado}).`;
}

/*
 * OJO CON LA PARADOJA DE LOS TRES DE ARRIBA, que es la misma que obliga a tener
 * una capa externa: si la notebook se queda sin internet, los dos chequeos
 * públicos fallan **y el correo tampoco puede salir**. El problema queda
 * registrado en el archivo de estado, así que cuando vuelva la conexión se
 * manda un aviso de "se resolvió", que al menos deja constancia de que hubo un
 * corte. Pero avisar EN el momento es imposible desde acá, por definición.
 */

const CHEQUEOS = [
  { clave: 'backendLocal', titulo: 'Backend en la propia máquina', correr: chequearBackendLocal },
  { clave: 'apiPublica', titulo: 'API pública (túnel y Cloudflare)', correr: chequearApiPublica },
  { clave: 'sitioPublico', titulo: 'Sitio público', correr: chequearSitioPublico },
  { clave: 'neon', titulo: 'Base de datos (Neon)', correr: chequearNeon, cadenciaMinutos: CADENCIA_NEON_MINUTOS },
  { clave: 'descartesTmdb', titulo: 'Descartes silenciosos por TMDb/Neon', correr: chequearDescartesTmdb },
  { clave: 'servicios', titulo: 'Servicios de Pochoclo', correr: chequearServicios },
  { clave: 'unidades', titulo: 'Unidades de systemd', correr: chequearUnidadesFallidas },
  { clave: 'disco', titulo: 'Espacio en disco', correr: chequearDisco },
  { clave: 'temperatura', titulo: 'Temperatura', correr: chequearTemperatura },
  { clave: 'montajes', titulo: 'Soportes de respaldo', correr: chequearMontajes },
  { clave: 'respaldo', titulo: 'Antigüedad del respaldo', correr: chequearRespaldo },
  { clave: 'corriente', titulo: 'Corriente eléctrica', correr: chequearCorriente },
  { clave: 'wifi', titulo: 'Estabilidad del Wi-Fi', correr: chequearWifi },
];

// ------------------------------------------------------------------ estado

function leerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  } catch {
    return { activos: {} };
  }
}

function guardarEstado(estado) {
  fs.mkdirSync(CARPETA, { recursive: true });
  /**
   * Escritura atómica (2026-09-01), mismo motivo que mantenimiento.js: un
   * `writeFileSync` directo puede dejar el JSON truncado si el proceso muere
   * a mitad de camino, y acá eso resetea la bandeja de "ya avisado" (repite
   * los correos de problemas que ya se habían reportado) y el contador de
   * `corridas`, disparando un despertar de Neon fuera de cadencia. Escribir
   * a un temporal en la misma carpeta y renombrar es atómico en el mismo
   * filesystem.
   */
  const temporal = `${ESTADO}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(estado, null, 2));
  fs.renameSync(temporal, ESTADO);
}

// -------------------------------------------------------------------- main

async function main() {
  /**
   * Con --estado no se persiste nada (ver más abajo), así que tampoco tiene
   * sentido leer el estado viejo para decidir qué saltear: se corren los
   * trece chequeos frescos, cadencia incluida, porque es justamente lo que
   * alguien pide al tipear el comando a mano.
   */
  const estadoPrevio = SOLO_ESTADO ? { activos: {} } : leerEstado();
  const corridas = { ...(estadoPrevio.corridas ?? {}) };
  const ahoraMs = Date.now();

  const problemas = new Map();
  const corrieronEsteCiclo = new Set();

  for (const chequeo of CHEQUEOS) {
    /**
     * Los chequeos con `cadenciaMinutos` (hoy solo `neon`) no corren en cada
     * ciclo. Si todavía no toca, se arrastra el último resultado conocido en
     * vez de tratarlo como "sin problema": sin este arrastre, un problema
     * real desaparecería del correo apenas se saltea un ciclo y volvería a
     * aparecer como "nuevo" en el siguiente, en vez de seguir contando como
     * el mismo problema activo de siempre.
     */
    const cadenciaMs = (chequeo.cadenciaMinutos ?? 0) * 60_000;
    const ultimaCorrida = corridas[chequeo.clave];
    const tocaCorrer =
      SOLO_ESTADO || !cadenciaMs || !ultimaCorrida || ahoraMs - new Date(ultimaCorrida).getTime() >= cadenciaMs;

    if (!tocaCorrer) {
      const previo = estadoPrevio.activos?.[chequeo.clave];
      if (previo?.detalle) problemas.set(chequeo.clave, { titulo: chequeo.titulo, detalle: previo.detalle });
      continue;
    }

    let resultado;
    try {
      /**
       * `await` aunque varios chequeos sean sincrónicos: los de red no lo son,
       * y esperar un valor que no es promesa no cuesta nada.
       */
      resultado = await chequeo.correr();
    } catch (err) {
      // Un chequeo que revienta no puede tirar abajo a los demás.
      resultado = `El chequeo falló con un error inesperado: ${err.message}`;
    }
    corrieronEsteCiclo.add(chequeo.clave);
    if (cadenciaMs) corridas[chequeo.clave] = new Date(ahoraMs).toISOString();
    if (resultado) problemas.set(chequeo.clave, { titulo: chequeo.titulo, detalle: resultado });
  }

  for (const chequeo of CHEQUEOS) {
    const problema = problemas.get(chequeo.clave);
    const salteado = problema && (chequeo.cadenciaMinutos ?? 0) > 0 && !corrieronEsteCiclo.has(chequeo.clave);
    console.log(
      `[${problema ? 'MAL' : ' ok'}] ${chequeo.titulo}${problema ? ': ' + problema.detalle : ''}` +
        (salteado ? ' (sin recorrer este ciclo, resultado del anterior)' : '')
    );
  }

  if (SOLO_ESTADO) return;

  const previos = new Set(Object.keys(estadoPrevio.activos ?? {}));
  const ahora = new Set(problemas.keys());

  const nuevos = [...ahora].filter((c) => !previos.has(c));
  const resueltos = [...previos].filter((c) => !ahora.has(c));

  /**
   * Se guarda siempre, aunque no se mande correo: así el estado refleja la
   * realidad incluso si el envío falla. Lleva `detalle` (no solo `desde`,
   * como hasta el 2026-09-01) porque es lo que le permite a un chequeo
   * salteado por cadencia mostrar el mismo texto la próxima vez, sin haber
   * vuelto a correr.
   */
  const activos = {};
  for (const clave of ahora) {
    activos[clave] = {
      desde: estadoPrevio.activos?.[clave]?.desde ?? new Date(ahoraMs).toISOString(),
      detalle: problemas.get(clave).detalle,
    };
  }
  guardarEstado({ activos, corridas, ultimaCorrida: new Date(ahoraMs).toISOString() });

  if (!nuevos.length && !resueltos.length && !FORZAR) {
    console.log(
      problemas.size
        ? `Sin novedades: ${problemas.size} problema(s) siguen activos, ya avisados.`
        : 'Sin novedades: todo en orden.'
    );
    return;
  }

  if (!HAY_CORREO_CONFIGURADO) {
    console.log('Hay novedades pero el SMTP no está configurado: no se manda nada.');
    return;
  }

  const para = direccionDeAvisos();
  if (!para) {
    console.error(
      'Hay novedades y SMTP configurado, pero no se pudo resolver a dónde avisar. ' +
        'Poné CORREO_LATIDO en el .env, o una dirección válida en CORREO_REMITENTE.'
    );
    process.exitCode = 1;
    return;
  }

  const cuando = new Date().toLocaleString('es-AR');
  /**
   * El asunto es lo único que se ve desde el teléfono sin abrir nada, así que
   * tiene que decir por sí solo si esto es un problema nuevo, uno resuelto, o
   * una prueba. El tercer caso solo ocurre con --forzar.
   */
  const asunto = nuevos.length
    ? `Pochoclo: ${nuevos.length} problema${nuevos.length > 1 ? 's' : ''} en la notebook`
    : resueltos.length
      ? `Pochoclo: se resolvió ${resueltos.length > 1 ? 'todo lo pendiente' : 'el problema'}`
      : 'Pochoclo: prueba de la vigilancia, todo en orden';

  const partes = [`Vigilancia de Pochoclo, ${cuando}.`, ''];

  if (!nuevos.length && !resueltos.length) {
    partes.push(
      'Este correo salió con --forzar, o sea a propósito: no cambió nada.',
      /**
       * El número sale de CHEQUEOS.length y no está escrito a mano: ya
       * quedó desactualizado una vez (decía "los ocho" con once chequeos).
       */
      `Sirve para comprobar que el aviso llega. Los ${CHEQUEOS.length} chequeos dieron bien.`,
      ''
    );
  }

  if (nuevos.length) {
    partes.push('PROBLEMAS NUEVOS', '');
    for (const clave of nuevos) {
      const p = problemas.get(clave);
      partes.push(`  * ${p.titulo}: ${p.detalle}`);
    }
    partes.push('');
  }

  if (resueltos.length) {
    partes.push('SE RESOLVIERON', '');
    for (const clave of resueltos) {
      const titulo = CHEQUEOS.find((c) => c.clave === clave)?.titulo ?? clave;
      partes.push(`  * ${titulo}`);
    }
    partes.push('');
  }

  const siguenActivos = [...ahora].filter((c) => !nuevos.includes(c));
  if (siguenActivos.length) {
    partes.push('SIGUEN ACTIVOS (ya avisados)', '');
    for (const clave of siguenActivos) partes.push(`  * ${problemas.get(clave).titulo}`);
    partes.push('');
  }

  partes.push(
    'Este aviso lo manda src/scripts/vigilancia.js, cada 15 minutos, desde la',
    'notebook. Avisa cuando un problema empieza y cuando se resuelve, y se calla',
    'en el medio.',
    '',
    'OJO: esta vigilancia corre ADENTRO de la notebook. Comprueba la dirección',
    'pública, así que sí detecta un túnel caído, pero NO puede avisar si la',
    'máquina se apaga o se queda sin internet: ahí tampoco puede mandar este',
    'correo. Para ese caso hace falta un chequeo desde afuera.'
  );

  const enviado = await enviarAvisoVigilancia({ para, asunto, texto: partes.join('\n') });
  console.log(
    enviado
      ? `Aviso enviado a ${para}: ${nuevos.length} nuevo(s), ${resueltos.length} resuelto(s).`
      : `NO se pudo enviar el aviso a ${para}. El problema queda registrado igual.`
  );
  if (!enviado) process.exitCode = 1;
}

main().catch((err) => {
  console.error('La vigilancia falló:', err.message);
  process.exitCode = 1;
});
