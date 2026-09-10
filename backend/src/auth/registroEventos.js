/**
 * Registro de eventos de seguridad.
 *
 * QUÉ FALTABA: no quedaba rastro de nada. Si alguien pregunta "¿entraron a mi
 * cuenta?", o si aparece un pico raro de intentos de login, hoy no hay forma
 * de saber qué pasó ni desde cuándo. Los logs del proyecto estaban limpios de
 * datos personales, que está bien, pero también estaban vacíos de esto.
 *
 * VERSIÓN MÍNIMA A PROPÓSITO: escribe líneas en la salida del proceso, que es
 * lo que cualquier hosting ya recoge y guarda. No hay tabla nueva, ni panel,
 * ni alertas. Una tabla convendría recién si alguna vez hay que CONSULTAR
 * esto desde la app (por ejemplo, para mostrarle al usuario sus últimos
 * accesos); mientras el consumidor sea una persona mirando los logs del
 * hosting, agregar una tabla es agregar mantenimiento sin agregar respuestas.
 *
 * QUÉ SE GUARDA Y QUÉ NO, que es la decisión que importa:
 *
 *  - SÍ: qué pasó, el id del usuario, y la IP.
 *  - NO: el correo, el nombre, ni por supuesto la contraseña o los tokens.
 *
 * El id en vez del correo no es una formalidad: un log es lo que más se copia,
 * se reenvía y se conserva de todo el sistema, y una lista de correos es
 * material de valor por sí sola. Con el id, la línea solo sirve cruzada contra
 * la base, que es exactamente cuando hace falta. La IP sí va, porque sin ella
 * el registro no responde la única pregunta para la que existe: si los
 * accesos vienen del mismo lugar de siempre o no.
 *
 * OJO CON LA LEY 25.326: la IP es un dato personal. La política de privacidad
 * ya avisa que se registran datos técnicos de cada visita con fines de
 * seguridad, así que esto entra dentro de lo declarado. Si alguna vez este
 * registro se guarda por más tiempo o se usa para otra cosa, hay que
 * actualizar esa página.
 */

/** Estado del acotador de ruido de `limiteAlcanzado`. Ver ahí abajo. */
const ultimoLimite = new Map();
const VENTANA_DE_SILENCIO_MS = 60 * 1000;

/** Formato fijo, para que se pueda filtrar con un grep. */
function escribir(evento, datos) {
  const partes = Object.entries(datos)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  console.log(`[seguridad] ${new Date().toISOString()} ${evento} ${partes}`);
}

export const registroSeguridad = {
  ingreso: (usuarioId, ip) => escribir('ingreso', { usuario: usuarioId, ip }),
  ingresoFallido: (ip, ruta) => escribir('ingreso-fallido', { ip, ruta }),
  altaDeCuenta: (usuarioId, ip) => escribir('alta-de-cuenta', { usuario: usuarioId, ip }),
  cambioDeContrasena: (usuarioId, ip) => escribir('cambio-de-contrasena', { usuario: usuarioId, ip }),
  restablecimiento: (ip) => escribir('restablecimiento-de-contrasena', { ip }),
  pedidoDeRestablecimiento: (ip) => escribir('pedido-de-restablecimiento', { ip }),
  sesionesCerradas: (usuarioId, ip) => escribir('sesiones-cerradas', { usuario: usuarioId, ip }),
  bajaDeCuenta: (usuarioId, ip) => escribir('baja-de-cuenta', { usuario: usuarioId, ip }),
  /**
   * La re-aceptación de los Términos (routes/terminos.js). Va acá y no en un
   * registro aparte porque es de las pocas cosas de esta app que después puede
   * hacer falta demostrar cuándo pasaron, igual que un alta o una baja.
   */
  aceptacionDeTerminos: (usuarioId, ip) => escribir('aceptacion-de-terminos', { usuario: usuarioId, ip }),
  limiteAlcanzado: (ip, ruta) => {
    /**
     * ESTE evento se acota a uno por minuto por IP y ruta, y es el único que
     * lo necesita: los demás pasan cuando una persona hace algo, pero al
     * límite se llega justamente cuando hay un script en bucle. Sin el tope,
     * un solo atacante escribe miles de líneas iguales, que es la forma más
     * barata de tapar cualquier otra cosa que hubiera pasado ahí cerca, y de
     * gastar la cuota de logs del hosting.
     *
     * Se pierde el CONTEO exacto de intentos, que no es lo que este registro
     * viene a responder: para eso están los "ingreso-fallido" de antes del
     * límite. Lo que importa acá es que se llegó, y desde dónde.
     */
    const clave = `${ip}|${ruta}`;
    const ahora = Date.now();
    if (ahora - (ultimoLimite.get(clave) ?? 0) < VENTANA_DE_SILENCIO_MS) return;
    ultimoLimite.set(clave, ahora);
    if (ultimoLimite.size > 1000) ultimoLimite.clear();
    escribir('limite-alcanzado', { ip, ruta });
  },
};
