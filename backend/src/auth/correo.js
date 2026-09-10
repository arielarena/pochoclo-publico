import nodemailer from 'nodemailer';
import 'dotenv/config';

/**
 * Envío de correo para verificación de cuenta y recuperación de contraseña.
 *
 * POR QUÉ SMTP Y NO LA API DE UN PROVEEDOR: todavía no está elegido con qué
 * se van a mandar los mails (Brevo, Zoho, Mailgun, Resend, el propio hosting;
 * todos tienen plan gratuito suficiente para esto). Los proveedores tienen
 * APIs distintas entre sí, pero SMTP lo hablan todos, así que esto funciona
 * con cualquiera cambiando cuatro variables de entorno y sin tocar código.
 * Si algún día conviene la API de uno en particular, se reemplaza solo este
 * archivo.
 *
 * QUÉ PASA MIENTRAS NO ESTÉ CONFIGURADO, que es hoy: no hay casilla porque
 * el dominio pochoclo.ar todavía no está comprado. Sin las variables SMTP,
 * este módulo NO manda nada y escribe el enlace en la consola del servidor.
 * Eso permite probar los dos flujos enteros en desarrollo, y es lo que evita
 * que la falta de correo rompa el registro.
 *
 * REGLA IMPORTANTE: enviarCorreo() NUNCA lanza. Si tirara, un fallo del
 * proveedor de mail (o su ausencia) reventaría el alta de la cuenta, que es
 * una operación que no tiene por qué depender de que el mail salga. Se
 * registra el problema en el log y se sigue.
 */

/**
 * Si la dirección pública apunta a la propia máquina, esto no está publicado.
 * Una dirección mal formada cuenta como publicada, que es el lado seguro:
 * ante la duda, no se imprime el token.
 */
function esLocal(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

const CONFIGURACION_SMTP = {
  host: process.env.SMTP_HOST,
  puerto: Number(process.env.SMTP_PUERTO || 587),
  usuario: process.env.SMTP_USUARIO,
  clave: process.env.SMTP_CLAVE,
  remitente: process.env.CORREO_REMITENTE,
};

/** ¿Hay con qué mandar mails de verdad? */
export const HAY_CORREO_CONFIGURADO = Boolean(
  CONFIGURACION_SMTP.host && CONFIGURACION_SMTP.usuario && CONFIGURACION_SMTP.clave
);

/**
 * El transporte se arma una sola vez y se reusa: nodemailer mantiene el pool
 * de conexiones, y armarlo por mail abriría una conexión TLS cada vez.
 */
const transporte = HAY_CORREO_CONFIGURADO
  ? nodemailer.createTransport({
      host: CONFIGURACION_SMTP.host,
      port: CONFIGURACION_SMTP.puerto,
      /**
       * 465 es TLS directo; 587 arranca en claro y sube a TLS con STARTTLS.
       * Es la convención de SMTP y no una preferencia nuestra.
       */
      secure: CONFIGURACION_SMTP.puerto === 465,
      auth: { user: CONFIGURACION_SMTP.usuario, pass: CONFIGURACION_SMTP.clave },
    })
  : null;

/**
 * Manda un correo. Devuelve true si salió, false si no.
 * No lanza nunca: ver el comentario de arriba.
 */
async function enviarCorreo({ para, asunto, texto, html }) {
  if (!transporte) {
    /**
     * Modo sin configurar: el enlace va al log para poder probar los dos
     * flujos en desarrollo sin casilla de correo.
     *
     * PERO NUNCA EN PRODUCCIÓN. Ese texto contiene el token de verificación o
     * el de restablecimiento de contraseña, o sea que imprimirlo con un sitio
     * publicado dejaría credenciales de un solo uso en el agregador de logs
     * del hosting, que suele verlo más gente y guardarlas más tiempo que
     * cualquier otra cosa del sistema.
     *
     * "Producción" se deduce de la URL pública, que es la misma señal que usa
     * la decisión de las cookies seguras, para no tener dos criterios
     * distintos de lo que significa estar publicado.
     *
     * El criterio es "el host NO es localhost", y no "la URL es https", que es
     * lo que decía antes. La diferencia importa en el caso peor: un despliegue
     * mal configurado, servido por http contra un dominio real, pasaba por
     * desarrollo y escupía los tokens al log. Preguntando por el host, ese
     * caso también queda tapado. Además BETTER_AUTH_URL ya no puede faltar
     * (auth.js corta el arranque si no está), así que acá no hace falta un
     * valor de respaldo.
     */
    const publicado = !esLocal(process.env.BETTER_AUTH_URL);

    if (publicado) {
      console.error(
        `[correo] SMTP NO CONFIGURADO con el sitio publicado: no se pudo enviar "${asunto}". ` +
          `El enlace NO se imprime acá por seguridad (contiene un token de un solo uso). ` +
          `Configurá SMTP_HOST, SMTP_USUARIO y SMTP_CLAVE.`
      );
      return false;
    }

    console.warn(
      `[correo] SMTP no configurado, no se envió nada.\n` +
        `         Para: ${para}\n` +
        `         Asunto: ${asunto}\n` +
        `         ${texto.replace(/\n/g, '\n         ')}`
    );
    return false;
  }

  try {
    await transporte.sendMail({
      from: CONFIGURACION_SMTP.remitente || CONFIGURACION_SMTP.usuario,
      to: para,
      subject: asunto,
      text: texto,
      html,
    });
    return true;
  } catch (err) {
    console.error('[correo] No se pudo enviar:', err.message);
    return false;
  }
}

/**
 * Cuerpo HTML mínimo y compartido.
 *
 * Deliberadamente sobrio: nada de imágenes remotas ni CSS externo. Los
 * clientes de correo bloquean las imágenes por defecto y descartan las hojas
 * de estilo, así que un mail "diseñado" se ve peor que uno simple. Además,
 * cargar una imagen desde nuestro servidor le avisaría al remitente cuándo se
 * abrió el mail, que es justo el tipo de rastreo que /privacidad promete que
 * no hacemos.
 *
 * El enlace va también como texto plano porque hay clientes que no muestran
 * HTML, y porque un botón sin URL visible es indistinguible de un phishing.
 *
 * EL ENLACE ES OPCIONAL desde el 2026-09-08, y no es una comodidad: el aviso
 * de cuenta borrada no tiene ningún destino al que mandar a nadie. Poniéndole
 * un botón al inicio solo para llenar el molde, el mail terminaría invitando a
 * volver justo a quien acaba de irse. Sin `enlace` no se dibujan ni el botón
 * ni la línea de "copiá y pegá".
 */
function armarHtml({ titulo, parrafos, textoBoton, enlace, cierre }) {
  const cuerpo = parrafos.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join('');
  const boton = enlace
    ? `<p style="margin:24px 0">
    <a href="${enlace}" style="background:#150e1b;color:#faf0de;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${textoBoton}</a>
  </p>
  <p style="margin:0 0 16px;font-size:14px;color:#555">Si el botón no funciona, copiá y pegá esta dirección en tu navegador:<br><span style="word-break:break-all">${enlace}</span></p>`
    : '';
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#150e1b;max-width:520px">
  <h1 style="font-size:20px;margin:0 0 16px">${titulo}</h1>
  ${cuerpo}
  ${boton}
  <p style="margin:0;font-size:14px;color:#555">${cierre}</p>
</div>`;
}

/** Verificación de la dirección de correo, al crear la cuenta. */
export async function enviarVerificacion({ user, url }) {
  return enviarCorreo({
    para: user.email,
    asunto: 'Confirmá tu correo en Pochoclo',
    texto:
      `Hola ${user.name},\n\n` +
      `Confirmá tu dirección de correo entrando acá:\n${url}\n\n` +
      `Si no creaste ninguna cuenta en Pochoclo, ignorá este mensaje.`,
    html: armarHtml({
      titulo: `Hola ${user.name}`,
      parrafos: ['Confirmá tu dirección de correo para terminar de activar tu cuenta en Pochoclo.'],
      textoBoton: 'Confirmar mi correo',
      enlace: url,
      cierre: 'Si no creaste ninguna cuenta en Pochoclo, ignorá este mensaje.',
    }),
  });
}

/**
 * Recuperación de contraseña.
 *
 * El texto dice explícitamente que el enlace vence y que se puede ignorar,
 * porque quien recibe esto sin haberlo pedido tiene que entender en dos
 * segundos que no hay nada que hacer. Un mail de recuperación alarmante es
 * la excusa perfecta para un phishing posterior.
 */
export async function enviarRestablecerContrasena({ user, url }) {
  return enviarCorreo({
    para: user.email,
    asunto: 'Restablecer tu contraseña de Pochoclo',
    texto:
      `Hola ${user.name},\n\n` +
      `Pediste restablecer tu contraseña. Entrá acá para elegir una nueva:\n${url}\n\n` +
      `El enlace vence en una hora y se puede usar una sola vez.\n` +
      `Si no lo pediste, no hace falta que hagas nada: tu contraseña sigue siendo la misma.`,
    html: armarHtml({
      titulo: `Hola ${user.name}`,
      parrafos: [
        'Pediste restablecer tu contraseña de Pochoclo.',
        'El enlace vence en una hora y se puede usar una sola vez.',
      ],
      textoBoton: 'Elegir una contraseña nueva',
      enlace: url,
      cierre: 'Si no lo pediste, no hace falta que hagas nada: tu contraseña sigue siendo la misma.',
    }),
  });
}

/**
 * Aviso al dueño de una cuenta cuando alguien intentó registrarse con su
 * correo.
 *
 * DE DÓNDE SALE. Con `requireEmailVerification` encendido, Better Auth deja
 * de contestar "ya existe una cuenta con ese correo" y devuelve exactamente
 * la misma respuesta que un alta nueva (hasta hashea la contraseña igual,
 * para no delatarse por el tiempo que tarda). Eso cierra la enumeración de
 * usuarios: nadie puede averiguar quién tiene cuenta probando direcciones.
 *
 * PERO ALGUIEN TIENE QUE ENTERARSE, y es el dueño de la dirección, no quien
 * probó. Sin este correo, el cegado convierte un intento contra tu cuenta en
 * un silencio total.
 *
 * EL TONO IMPORTA, igual que en el de restablecer contraseña: quien recibe
 * esto no hizo nada y no tiene que hacer nada. Un mail alarmante sobre una
 * cuenta es la excusa perfecta para el phishing que venga después, así que
 * dice explícitamente que no hay nada que hacer y por qué.
 */
export async function enviarIntentoDeRegistro({ user, urlIngreso }) {
  return enviarCorreo({
    para: user.email,
    asunto: 'Alguien intentó crear una cuenta con tu correo en Pochoclo',
    texto:
      `Hola ${user.name},\n\n` +
      `Alguien intentó crear una cuenta en Pochoclo con esta dirección, que ya tiene una.\n` +
      `No hicimos nada: tu cuenta, tus listas y tu contraseña siguen igual.\n\n` +
      `Si fuiste vos, entrá con tu contraseña de siempre:\n${urlIngreso}\n` +
      `Si no la recordás, usá "Olvidé mi contraseña" desde esa misma pantalla.\n\n` +
      `Si no fuiste vos, no hace falta que hagas nada. Quien lo intentó no vio ningún\n` +
      `dato tuyo, y tampoco pudo saber si esta dirección tenía cuenta o no.`,
    html: armarHtml({
      titulo: `Hola ${user.name}`,
      parrafos: [
        'Alguien intentó crear una cuenta en Pochoclo con esta dirección, que ya tiene una. No hicimos nada: tu cuenta, tus listas y tu contraseña siguen igual.',
        'Si fuiste vos, entrá con tu contraseña de siempre. Si no la recordás, usá "Olvidé mi contraseña" desde esa misma pantalla.',
      ],
      textoBoton: 'Iniciar sesión',
      enlace: urlIngreso,
      cierre:
        'Si no fuiste vos, no hace falta que hagas nada. Quien lo intentó no vio ningún dato tuyo, y tampoco pudo saber si esta dirección tenía cuenta o no.',
    }),
  });
}

/**
 * AVISOS DE QUE ALGO CAMBIÓ EN LA CUENTA (2026-09-08).
 *
 * POR QUÉ EXISTEN LOS DOS DE ABAJO. La app ya avisaba al dueño de una
 * dirección cuando alguien INTENTABA registrarse con ella (ver
 * enviarIntentoDeRegistro), con este argumento escrito: quien tiene que
 * enterarse es el dueño, no quien lo probó. Ese mismo argumento no se estaba
 * aplicando a las dos cosas más destructivas que se le pueden hacer a una
 * cuenta: cambiarle la contraseña y borrarla. Las dos pasaban en completo
 * silencio.
 *
 * NO SON UNA CONFIRMACIÓN NI UN PERMISO: las dos acciones ya ocurrieron
 * cuando el mail sale, y las dos exigen la contraseña. El mail existe para el
 * caso en que la contraseña la tenía otro (se filtró, se compartió, se
 * reusaba de otro sitio): sin aviso, esa persona se entera recién cuando no
 * puede entrar, que puede ser meses después.
 *
 * EL TONO ES EL DE enviarIntentoDeRegistro Y POR EL MISMO MOTIVO: quien lo
 * recibe casi siempre fue quien hizo el cambio, así que el mail no puede
 * alarmar. Un correo asustado sobre una cuenta es la excusa perfecta para el
 * phishing que venga después. Por eso dicen primero "si fuiste vos, listo".
 *
 * Y NO LLEVAN NINGÚN DATO DE LA CUENTA MÁS QUE EL NOMBRE. Nada de la
 * contraseña vieja ni de la nueva, ni IP, ni dispositivo: el correo puede
 * terminar en una casilla que ya no controla esa persona, que es justamente
 * el escenario del que se sospecha.
 */

/**
 * La contraseña cambió desde el perfil (`/change-password`).
 *
 * Manda a la recuperación y no al login a propósito: si el cambio no lo hizo
 * el dueño, la contraseña que él sabe ya no sirve, así que ofrecerle
 * "iniciá sesión" sería mandarlo a una puerta que no abre. Lo único que
 * todavía controla es su casilla de correo, que es exactamente lo que la
 * recuperación pide.
 */
export async function enviarAvisoCambioDeContrasena({ user, urlRecuperar }) {
  return enviarCorreo({
    para: user.email,
    asunto: 'Se cambió la contraseña de tu cuenta de Pochoclo',
    texto:
      `Hola ${user.name},

` +
      `Se acaba de cambiar la contraseña de tu cuenta de Pochoclo.
` +
      `También se cerraron las sesiones abiertas en otros dispositivos.

` +
      `Si fuiste vos, listo, no hace falta que hagas nada.

` +
      `Si NO fuiste vos, recuperá el acceso desde acá:
${urlRecuperar}
` +
      `Te vamos a mandar un enlace a esta misma dirección para que elijas una contraseña nueva.`,
    html: armarHtml({
      titulo: `Hola ${user.name}`,
      parrafos: [
        'Se acaba de cambiar la contraseña de tu cuenta de Pochoclo. También se cerraron las sesiones abiertas en otros dispositivos.',
        'Si fuiste vos, listo, no hace falta que hagas nada.',
      ],
      textoBoton: 'No fui yo: recuperar mi cuenta',
      enlace: urlRecuperar,
      cierre:
        'Te vamos a mandar un enlace a esta misma dirección para que elijas una contraseña nueva.',
    }),
  });
}

/**
 * La cuenta se borró (`/delete-user`).
 *
 * VA SIN ENLACE, que es la decisión de forma que importa: no hay ninguna
 * pantalla a la que mandar a alguien que acaba de irse, y un botón para
 * "volver" sería insistir. Tampoco hay nada que deshacer, así que el mail lo
 * dice en vez de sugerir un remedio que no existe.
 *
 * SE MANDA DESDE `beforeDelete`, o sea con la cuenta todavía en pie: después
 * del borrado ya no queda de dónde sacar el correo ni el nombre. Es la única
 * ventana en la que este mail se puede armar.
 */
export async function enviarAvisoCuentaBorrada({ user }) {
  return enviarCorreo({
    para: user.email,
    asunto: 'Se borró tu cuenta de Pochoclo',
    texto:
      `Hola ${user.name},

` +
      `Se borró tu cuenta de Pochoclo, con tus listas y tus gustos. No se puede deshacer.

` +
      `Si fuiste vos, listo. Gracias por haber pasado.
` +
      `Pochoclo se sigue usando entero sin cuenta, así que podés volver cuando quieras.

` +
      `Si NO fuiste vos, escribinos: alguien entró a tu sesión. Este es el único mail
` +
      `que te vamos a mandar sobre esto, porque ya no queda ninguna cuenta a la que avisarle.`,
    html: armarHtml({
      titulo: `Hola ${user.name}`,
      parrafos: [
        'Se borró tu cuenta de Pochoclo, con tus listas y tus gustos. No se puede deshacer.',
        'Si fuiste vos, listo. Gracias por haber pasado. Pochoclo se sigue usando entero sin cuenta, así que podés volver cuando quieras.',
      ],
      cierre:
        'Si no fuiste vos, escribinos: querría decir que alguien entró a tu sesión. Este es el único mail que te vamos a mandar sobre esto, porque ya no queda ninguna cuenta a la que avisarle.',
    }),
  });
}

/**
 * Correo de latido, que no lo lee ningún usuario: lo manda el mantenimiento
 * para que el envío no se muera de quieto.
 *
 * POR QUÉ EXISTE. Los proveedores de SMTP vencen las claves por INACTIVIDAD,
 * además de por fecha: Brevo las da de baja a los 90 días sin uso. Y Pochoclo
 * manda correo en dos situaciones nada más, verificar una cuenta y restablecer
 * una contraseña, así que un sitio tranquilo puede pasarse tres meses sin
 * mandar uno solo y quedarse sin correo sin haber tocado nada.
 *
 * LO QUE LO VUELVE GRAVE ES CÓMO FALLA: enviarCorreo() no lanza nunca, a
 * propósito (ver el comentario de arriba), así que el alta de la cuenta sigue
 * andando y el mail simplemente no sale. Nadie se entera hasta que alguien
 * reclama que no le llegó el correo para recuperar su contraseña, y para
 * entonces hace rato que está roto.
 *
 * QUÉ PRUEBA Y QUÉ NO, QUE ES LA PARTE QUE HAY QUE TENER CLARA. Un envío por
 * SMTP termina cuando el relay ACEPTA el mensaje, no cuando alguien lo recibe,
 * así que este latido demuestra que la clave sigue viva y que el proveedor nos
 * sigue aceptando mensajes (o sea: clave revocada, cuenta suspendida o cuota
 * agotada SÍ los detecta). **No demuestra que el mail haya llegado.** Lo que
 * pase después del relay (rechazo del destinatario, DKIM roto, spam) no vuelve
 * por esta vía.
 *
 * Por eso el destino importa: **tiene que ser una casilla que alguien mire de
 * verdad.** La mitad que el script no puede automatizar la pone la persona que
 * nota que este mes no llegó el latido.
 *
 * VA POR EL MISMO CAMINO QUE UN MAIL DE VERDAD, y eso es lo único que lo hace
 * valer: usa el mismo transporte, las mismas credenciales y el mismo
 * remitente. Un chequeo que abriera su propia conexión probaría otra cosa.
 */
export async function enviarLatido({ para }) {
  const cuando = new Date().toLocaleString('es-AR');
  return enviarCorreo({
    para,
    asunto: `Pochoclo: el envío de correo sigue vivo (${cuando})`,
    texto:
      `Este es el correo de latido del mantenimiento de Pochoclo.\n\n` +
      `Que haya llegado quiere decir que las credenciales SMTP siguen activas y\n` +
      `que el envío funciona. Se manda solo, una vez por mes, desde\n` +
      `src/scripts/latidoCorreo.js.\n\n` +
      `Si dejás de recibirlo, el envío de correo está roto: no van a salir ni\n` +
      `las verificaciones de cuenta ni los restablecimientos de contraseña.\n\n` +
      `Fecha de este envío: ${cuando}`,
  });
}

/**
 * A qué casilla van los avisos automáticos: el latido mensual y la vigilancia.
 *
 * `CORREO_LATIDO` si está puesta; si no, la dirección que haya dentro de
 * `CORREO_REMITENTE`, que es una que existe por definición. Con Cloudflare
 * Email Routing esa dirección se reenvía a la casilla personal, así que los
 * avisos llegan sin configurar nada nuevo. **Ojo con eso**: si el remitente es
 * `no-responder@`, tiene que haber una regla de Email Routing para esa
 * dirección o los avisos rebotan.
 *
 * Vivía dentro de `latidoCorreo.js`. Se movió acá cuando apareció el segundo
 * consumidor (`vigilancia.js`), que es la misma regla que siguieron las otras
 * extracciones del proyecto: la casilla donde alguien mira los avisos tiene que
 * ser una sola, y con dos copias de esta función se contradicen en silencio.
 *
 * Devuelve null si no se pudo resolver ninguna. Quien la llama decide qué hacer
 * con eso: al latido le corresponde fallar (hay SMTP, así que el chequeo
 * debería existir), y a la vigilancia también.
 */
export function direccionDeAvisos() {
  const explicita = process.env.CORREO_LATIDO?.trim();
  if (explicita) return explicita;

  const remitente = process.env.CORREO_REMITENTE;
  if (!remitente) return null;
  const entreAngulos = remitente.match(/<([^>]+)>/);
  const direccion = (entreAngulos ? entreAngulos[1] : remitente).trim();
  return direccion.includes('@') ? direccion : null;
}

/**
 * El aviso de la vigilancia (`scripts/vigilancia.js`).
 *
 * ES UN SOLO CORREO POR CORRIDA, con todo lo que cambió, y no uno por
 * problema. Con un correo por chequeo, una caída de red manda cinco a la vez y
 * la próxima vez nadie los lee. Un vigilante ruidoso se termina ignorando, que
 * es lo mismo que no tenerlo.
 *
 * El asunto lo arma quien llama, porque es lo único que se ve desde el teléfono
 * sin abrir nada y tiene que decir si esto es un problema nuevo o uno que se
 * resolvió.
 */
export async function enviarAvisoVigilancia({ para, asunto, texto }) {
  return enviarCorreo({ para, asunto, texto });
}
