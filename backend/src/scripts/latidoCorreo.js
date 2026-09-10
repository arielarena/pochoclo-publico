import 'dotenv/config';
import nodemailer from 'nodemailer';
import { HAY_CORREO_CONFIGURADO, direccionDeAvisos, enviarLatido } from '../auth/correo.js';

/**
 * Manda los correos de latido del mantenimiento.
 *
 * El porqué está en `auth/correo.js`, junto a `enviarLatido`: los proveedores
 * de SMTP vencen las claves por INACTIVIDAD (Brevo, a los 90 días), y Pochoclo
 * manda correo tan poco que puede quedarse sin envío sin haber tocado nada. El
 * modo de fallo es silencioso, así que la única defensa es usarlo a propósito
 * cada tanto.
 *
 * Lo corre `mantenimiento.js` una vez por mes. A mano:
 *   npm run latido-correo
 *
 * ---------------------------------------------------------------------------
 * SON DOS LATIDOS DISTINTOS, Y LA DIFERENCIA IMPORTA
 *
 * 1. **La clave del backend** (`SMTP_CLAVE`), que es con la que salen los
 *    correos de verificación y de restablecimiento. Se late llamando a
 *    `enviarLatido()`, o sea **por el mismo camino que un mail de verdad**:
 *    mismo transporte, mismas credenciales, mismo remitente. Eso prueba la
 *    clave y de paso prueba nuestro código.
 *
 * 2. **Las claves de `SMTP_CLAVES_EXTRA`**, que las usa otro programa y no
 *    este. El caso que las motivó es la que Gmail tiene guardada para poder
 *    responder desde `contacto@pochoclo.ar`: si pasan 90 días sin contestarle
 *    a nadie, esa clave se muere sola, y **te enterás justo el día que
 *    necesitás responder algo urgente**, que suele ser un pedido de acceso o
 *    de supresión con plazo legal corriendo.
 *
 * PARA LAS DE (2) HAY QUE ABRIR UNA CONEXIÓN PROPIA, y no es una inconsistencia
 * con lo que dice `correo.js`: para la clave del backend existe un "camino
 * real" que conviene ejercitar, y para éstas no, porque el programa que las usa
 * de verdad es Gmail. Lo único que se está comprobando acá es que la clave
 * siga viva, así que abrir el transporte a mano es la única forma y alcanza.
 *
 * EL LOGIN ES EL MISMO PARA TODAS (`SMTP_USUARIO`). En Brevo el usuario es de
 * la cuenta y cada clave es una contraseña distinta suya. Si algún día se suma
 * una clave de otro proveedor, esto hay que repensarlo.
 * ---------------------------------------------------------------------------
 *
 * A DÓNDE VAN. `CORREO_LATIDO` si está puesta; si no, la dirección que haya
 * dentro de `CORREO_REMITENTE`, que es una que ya existe por definición. Con
 * Cloudflare Email Routing esa dirección se reenvía a la casilla personal, así
 * que el latido llega sin configurar nada nuevo.
 *
 * SIN SMTP CONFIGURADO NO FALLA, sale bien y no hace nada. Es el estado normal
 * en una máquina de desarrollo, y hacer fallar el mantenimiento entero todos
 * los días por eso convertiría el aviso en ruido, que es la forma más rápida
 * de que se deje de mirar.
 */

/** Las claves extra declaradas, sin vacíos ni repetidas. */
function clavesExtra() {
  const crudo = process.env.SMTP_CLAVES_EXTRA || '';
  const lista = crudo
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  return [...new Set(lista)];
}

/**
 * Late una clave que no es la del backend, con su propia conexión.
 *
 * Devuelve true si el relay aceptó el mensaje. No distingue el motivo del
 * fallo a propósito: para lo que sirve esto, "la clave no anda" es todo lo que
 * hace falta saber, y el mensaje del proveedor ya queda en el log.
 */
async function latirClaveExtra({ clave, numero, para }) {
  const puerto = Number(process.env.SMTP_PUERTO || 587);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    // Misma convención que en correo.js: 465 es TLS directo, 587 STARTTLS.
    secure: puerto === 465,
    auth: { user: process.env.SMTP_USUARIO, pass: clave },
  });

  const cuando = new Date().toLocaleString('es-AR');

  try {
    await transporte.sendMail({
      from: process.env.CORREO_REMITENTE || process.env.SMTP_USUARIO,
      to: para,
      subject: `Pochoclo: la clave SMTP extra ${numero} sigue viva (${cuando})`,
      text:
        `Latido de una clave SMTP que no usa el backend sino otro programa.\n\n` +
        `La que motivó esto es la que Gmail tiene guardada para responder desde\n` +
        `contacto@pochoclo.ar. Sin uso, el proveedor la da de baja a los 90 días.\n\n` +
        `Si dejás de recibir este mensaje, revisá SMTP_CLAVES_EXTRA en el .env y\n` +
        `el panel del proveedor.\n\n` +
        `Fecha de este envío: ${cuando}`,
    });
    return true;
  } catch (err) {
    console.error(`[latido] La clave extra ${numero} falló: ${err.message}`);
    return false;
  } finally {
    transporte.close();
  }
}

async function main() {
  if (!HAY_CORREO_CONFIGURADO) {
    console.log('[latido] SMTP no configurado: no hay nada que mantener vivo. Se saltea.');
    return;
  }

  const para = direccionDeAvisos();

  if (!para) {
    /**
     * Acá sí conviene fallar: el SMTP está configurado, o sea que el sitio
     * manda correo de verdad, y sin destino este chequeo no existe.
     */
    console.error(
      '[latido] Hay SMTP configurado pero no se pudo resolver a dónde mandar el latido. ' +
        'Poné CORREO_LATIDO en el .env, o una dirección válida en CORREO_REMITENTE.'
    );
    process.exitCode = 1;
    return;
  }

  let fallidas = 0;

  // 1. La clave del backend, por el camino de siempre.
  if (await enviarLatido({ para })) {
    /**
     * "Aceptado" y no "entregado": SMTP termina cuando el relay se hace cargo
     * del mensaje. Que llegue lo confirma la persona que lo recibe, no esto.
     */
    console.log(
      `[latido] Clave del backend: aceptada por el relay para ${para}. ` +
        'Si no aparece en la casilla, el problema está después del relay (ruta, DKIM, spam).'
    );
  } else {
    fallidas++;
    // enviarCorreo() no lanza nunca y ya registró el motivo.
    console.error(
      `[latido] Clave del backend: NO se pudo enviar a ${para}. El envío está roto: ` +
        'no van a salir ni las verificaciones de cuenta ni los restablecimientos de contraseña.'
    );
  }

  // 2. Las que usa otro programa, cada una con su propia conexión.
  const extras = clavesExtra();

  if (!extras.length) {
    console.log('[latido] No hay claves en SMTP_CLAVES_EXTRA. Si configuraste "Enviar como" en Gmail, esa clave debería estar acá.');
  }

  for (const [i, clave] of extras.entries()) {
    const numero = i + 1;
    if (await latirClaveExtra({ clave, numero, para })) {
      console.log(`[latido] Clave extra ${numero}: aceptada por el relay para ${para}.`);
    } else {
      fallidas++;
    }
  }

  if (fallidas) process.exitCode = 1;
}

main().catch((e) => {
  console.error('[latido] Abortado:', e.message);
  process.exitCode = 1;
});
