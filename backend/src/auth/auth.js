import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import 'dotenv/config';
import { pool } from '../config/db.js';
import {
  validarNombre,
  validarCorreo,
  validarFechaNacimiento,
  validarAceptacionTerminos,
  validarContrasena,
  contextoDeUsuario,
  LARGO_MINIMO_CONTRASENA,
  LARGO_MAXIMO_CONTRASENA,
} from './validaciones.js';
import { estaFiltrada } from './contrasenaFiltrada.js';
import { registroSeguridad } from './registroEventos.js';
import {
  enviarVerificacion,
  enviarRestablecerContrasena,
  enviarIntentoDeRegistro,
  enviarAvisoCambioDeContrasena,
  enviarAvisoCuentaBorrada,
  HAY_CORREO_CONFIGURADO,
} from './correo.js';

/**
 * Código con el que se marcan los errores de validación que escribimos
 * NOSOTROS, para distinguirlos de los que escribe Better Auth.
 *
 * POR QUÉ HACE FALTA: los mensajes nuestros están redactados para que los lea
 * el usuario ("Esa contraseña aparece en filtraciones...") y el cliente los
 * muestra tal cual. Los de la librería no: vienen en inglés y con nombres
 * internos ("[body.email] Invalid email address"). En el cable se distinguían
 * solo por ausencia: los de la librería traen `code` y los nuestros no. Eso
 * alcanzaba de casualidad y se rompe con el primer error suyo que salga sin
 * código, así que ahora los nuestros se marcan a propósito.
 *
 * EL VALOR ESTÁ DUPLICADO A MANO en frontend/src/auth/clienteAuth.js, que es
 * el único que lo lee. Si se cambia acá, cambiarlo allá.
 */
export const CODIGO_VALIDACION = 'VALIDACION_POCHOCLO';

/** Error de validación nuestro, ya marcado. Ver CODIGO_VALIDACION. */
function errorDeValidacion(mensaje) {
  return new APIError('BAD_REQUEST', { message: mensaje, code: CODIGO_VALIDACION });
}

/**
 * Autenticación de v3 (sección 2 del Definitivo, nota de autenticación).
 *
 * Better Auth corre acá adentro, en nuestro propio Express, y guarda usuarios
 * y sesiones en la misma base de Neon que ya usa todo lo demás. No hace falta
 * un ORM: el adaptador que trae adentro acepta directamente la Pool de `pg`
 * que exporta config/db.js.
 *
 * Se evaluó "Managed Better Auth" (el servicio que Neon integró en su
 * plataforma) como alternativa más simple, tal como pedía el Definitivo, y
 * quedó descartado en agosto de 2026 por dos motivos: sigue en beta, y su
 * documentación lista como no soportadas las arquitecturas donde el frontend
 * y el backend son despliegues separados, que es exactamente la nuestra.
 */

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error('Falta BETTER_AUTH_SECRET en el .env (ver .env.example)');
}

/**
 * BETTER_AUTH_URL es OBLIGATORIA, y no puede tener un valor por omisión.
 *
 * Tenía uno ('http://localhost:3000') y de esa variable cuelgan DOS
 * propiedades de seguridad independientes:
 *
 *  1. Si no es https, la cookie de sesión sale sin `Secure` (ver
 *     USAR_COOKIES_SEGURAS más abajo), o sea que viaja en claro.
 *  2. auth/correo.js la usa para decidir si el sitio está publicado, y con
 *     eso decide si imprime o no en el log el enlace de restablecer
 *     contraseña, que lleva un token de un solo uso adentro.
 *
 * O sea que olvidarse de definirla al desplegar degradaba las dos cosas a la
 * vez, en silencio y sin ningún aviso. Un valor por omisión no es aceptable
 * para algo que decide si una credencial viaja cifrada: es mejor no arrancar.
 */
if (!process.env.BETTER_AUTH_URL) {
  throw new Error(
    'Falta BETTER_AUTH_URL en el .env (ver .env.example). Es la dirección pública ' +
      'de este backend, y de ella dependen la cookie Secure y que los enlaces con ' +
      'token no se impriman en el log.'
  );
}

/**
 * Combinación que deja a todos los usuarios encerrados afuera: exigir el
 * correo verificado sin tener con qué mandar el correo de verificación.
 * Es un error de configuración, no un estado válido, así que corta el
 * arranque en vez de descubrirse cuando alguien no puede entrar.
 */
if (process.env.EXIGIR_CORREO_VERIFICADO === 'true' && !HAY_CORREO_CONFIGURADO) {
  throw new Error(
    'EXIGIR_CORREO_VERIFICADO está en true pero no hay SMTP configurado: nadie podría verificar su correo ni entrar. Configurá SMTP_HOST, SMTP_USUARIO y SMTP_CLAVE (ver .env.example).'
  );
}

/**
 * LA OTRA MITAD DE `EXIGIR_CORREO_VERIFICADO`, QUE SU NOMBRE NO DICE.
 *
 * Esa variable parece controlar una sola cosa (si hace falta confirmar la
 * casilla para entrar) y controla dos. La segunda es que el alta con un correo
 * QUE YA EXISTE conteste lo mismo que una con un correo nuevo, o sea que no se
 * pueda averiguar quién tiene cuenta en Pochoclo. Ver 4.16 para por qué acá ese
 * dato importa: la lista de películas de alguien dice cosas de esa persona, así
 * que hasta el "tiene cuenta" es información suya.
 *
 * NO ES UN CAPRICHO DE LA LIBRERÍA, ES ARITMÉTICA. Su condición es
 * `requireEmailVerification || autoSignIn === false`, y son exactamente las dos
 * formas de que el alta NO devuelva una sesión. Cegar la respuesta duplicada
 * consiste en que las dos sean idénticas, y una sesión no se puede falsificar:
 * un alta real abre una y una falsa no podría. Verificado el 2026-09-08 con la
 * variable apagada: un alta nueva contesta con token de sesión, y una duplicada
 * contesta 422 con `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`.
 *
 * **O SEA QUE NO HAY NINGUNA CONFIGURACIÓN QUE DÉ LAS DOS COSAS**: o el alta
 * entra directo, o las direcciones que ya tienen cuenta quedan protegidas.
 *
 * POR ESO ESTA GUARDA NO PROHÍBE APAGARLA, OBLIGA A DECIRLO. El escenario que
 * hay que poder atender existe y es razonable: si un día se cae el proveedor de
 * correo, nadie puede confirmar su casilla y la reacción sensata es apagar la
 * verificación para destrabar a la gente. Ese cambio parece acotado a "por ahora
 * no pedimos confirmación" y de paso reabre la enumeración, sin ningún error y
 * sin nada en el código que lo sugiera. **El problema nunca fue la
 * configuración, fue el silencio.**
 *
 * Con esto, apagar la verificación por ese motivo sigue tardando un minuto;
 * lo que ya no se puede es hacerlo sin enterarse de qué más se está apagando.
 */
if (
  process.env.EXIGIR_CORREO_VERIFICADO !== 'true' &&
  process.env.PERMITIR_ENUMERACION_DE_CUENTAS !== 'true'
) {
  throw new Error(
    'EXIGIR_CORREO_VERIFICADO no está en true, y eso apaga DOS cosas, no una:\n' +
      '  1. que haga falta confirmar el correo para entrar, y\n' +
      '  2. que el alta con un correo que YA TIENE CUENTA conteste lo mismo que\n' +
      '     una con un correo nuevo. Sin eso, cualquiera puede averiguar qué\n' +
      '     direcciones tienen cuenta en Pochoclo probándolas de a una.\n' +
      '\n' +
      'Las dos van juntas por necesidad: cegar la respuesta duplicada exige que\n' +
      'el alta no devuelva sesión, y sin verificación el alta entra directo.\n' +
      '\n' +
      'Si esto es a propósito (por ejemplo, el proveedor de correo está caído y\n' +
      'hay que dejar entrar a la gente), agregá PERMITIR_ENUMERACION_DE_CUENTAS=true\n' +
      'al .env para dejar constancia de que la decisión se tomó, y sacá las dos\n' +
      'variables juntas cuando se resuelva.'
  );
}

if (!HAY_CORREO_CONFIGURADO) {
  console.warn(
    '[auth] Sin SMTP configurado: los correos de verificación y de recuperación de contraseña NO se envían, se escriben en esta consola. Ver .env.example.'
  );
}

/**
 * Orígenes del frontend a los que se les permite usar la sesión.
 *
 * Es una lista y no un valor solo porque en desarrollo conviven dos: el
 * servidor de Vite (5173) y el de `vite preview`, que es contra el que
 * corren la auditoría de accesibilidad y las pruebas de punta a punta
 * (4173). Al publicar va a haber al menos el dominio real, y capaz también
 * el de una vista previa de despliegue.
 *
 * Se separan por coma en URL_FRONTEND.
 */
export const ORIGENES_FRONTEND = (process.env.URL_FRONTEND || 'http://localhost:5173,http://localhost:4173')
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean);

/**
 * Si las cookies de sesión se marcan `Secure` (o sea, si el navegador solo
 * las manda por HTTPS).
 *
 * Se deduce de la URL pública del backend y no de NODE_ENV a propósito: es
 * la misma variable que ya hay que configurar bien para publicar, así que no
 * agrega un segundo lugar donde equivocarse. Con NODE_ENV, olvidárselo en el
 * hosting dejaría las cookies sin `Secure` sin que nada avise.
 *
 * Coincide con lo que hoy hace Better Auth por su cuenta. Está escrito igual
 * por el mismo motivo que el SSL en config/db.js: que la decisión no dependa
 * de lo que decida la próxima versión de la librería.
 */
const USAR_COOKIES_SEGURAS = process.env.BETTER_AUTH_URL.startsWith('https://');

/**
 * Aviso de que la contraseña cambió. Vive suelto y no dentro del hook para no
 * meterle un `async` de más al `switch` que decide qué se registra.
 *
 * La salida que ofrece es la RECUPERACIÓN y no el login: si el cambio no lo
 * hizo el dueño, la contraseña que él sabe ya no sirve, así que mandarlo a
 * iniciar sesión sería mandarlo a una puerta que no abre. Lo único que
 * todavía controla es la casilla a la que le llega este mail.
 */
function avisarCambioDeContrasena(usuario) {
  enviarAvisoCambioDeContrasena({
    user: usuario,
    urlRecuperar: `${ORIGENES_FRONTEND[0]}/recuperar-contrasena`,
  }).catch(() => {});
}

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  /**
   * El frontend vive en otro origen que el backend, así que la cookie de
   * sesión viaja entre dominios. Better Auth solo acepta pedidos de los
   * orígenes listados acá, que es lo que evita que cualquier sitio pueda
   * usar la sesión del usuario.
   */
  trustedOrigins: ORIGENES_FRONTEND,

  /**
   * Límite de intentos. Better Auth lo trae, pero APAGADO fuera de
   * producción, así que hay que encenderlo a mano o en desarrollo no existe
   * (verificado: 12 logins fallidos seguidos, los 12 contestaron 401).
   * La sección 2 del Definitivo nombra la "ausencia de límite de intentos de
   * login" entre los riesgos que justifican usar una librería en vez de
   * programar la autenticación a mano, así que dejarlo librado al default
   * sería quedarse justo con el agujero que se quiso evitar.
   *
   * El almacenamiento es en memoria del proceso: alcanza mientras el backend
   * corra en una sola instancia, que es lo normal en hosting gratuito. Si
   * algún día corre en varias, cada una llevaría su propia cuenta y el
   * límite real se multiplicaría: ahí hay que pasar a storage: 'database'
   * (suma una tabla y una consulta por pedido).
   */
  rateLimit: {
    enabled: true,
    storage: 'memory',
    window: 60,
    max: 100,
    customRules: {
      // Adivinar contraseñas es el ataque que importa acá.
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 3 },

      /**
       * Las tres rutas que MANDAN UN MAIL van más apretadas todavía, y no es
       * por el costo: sin límite, cualquiera puede escribir la dirección de
       * otra persona en un bucle y llenarle la casilla de correos de
       * Pochoclo que nunca pidió. El que sufre el abuso no es el sitio, es un
       * tercero, y además nos quema la reputación del remitente.
       */
      '/request-password-reset': { window: 60, max: 3 },
      '/send-verification-email': { window: 60, max: 3 },
      // Acá el riesgo es otro: probar tokens de restablecimiento a lo bruto.
      '/reset-password': { window: 60, max: 5 },

      /**
       * LAS DOS RUTAS QUE VERIFICAN LA CONTRASEÑA CON LA SESIÓN YA ABIERTA.
       * Se agregaron el 2026-09-08 y las dos estaban flojas por motivos
       * distintos, medidos contra el servidor real:
       *
       *  - `/delete-user` no tenía NINGUNA regla propia y caía al balde
       *    global: **100 contraseñas incorrectas por minuto** antes del 429
       *    (contadas una por una), o sea veinte veces más permisivo que el
       *    login, sobre un endpoint que verifica la contraseña igual que él.
       *  - `/change-password` sí cortaba, a 3 cada 10 segundos, pero ese
       *    número **no lo elegimos nosotros**: sale de las reglas por
       *    omisión de Better Auth (`getDefaultSpecialRules`). Escrito acá,
       *    deja de depender de lo que decida su próxima versión. Es el mismo
       *    criterio con el que ya están escritos a mano USAR_COOKIES_SEGURAS
       *    y el SSL de config/db.js.
       *
       * Van a la ventana de 60 segundos de `/sign-in/email`, que es lo que
       * son: probar una contraseña. Con 5 no molestan a nadie, porque quien
       * cambia la suya o borra la cuenta la escribe una vez, no cinco.
       */
      '/change-password': { window: 60, max: 5 },
      '/delete-user': { window: 60, max: 5 },
    },
  },

  /**
   * Cuánto dura una sesión.
   *
   * Estaba en el default de Better Auth (7 días) sin que nadie lo hubiera
   * elegido. 30 días es una decisión de producto: Pochoclo se usa de a ratos y
   * con semanas de por medio, así que pedir la contraseña cada semana sería
   * pedirla casi siempre. Lo que se protege detrás de esa cuenta es una lista
   * de películas y unos gustos, no dinero ni identidad, y ese es el motivo por
   * el que 30 días es un riesgo aceptable acá y no lo sería en un banco.
   *
   * `updateAge` en 1 día quiere decir que la sesión se renueva sola al usarla,
   * como mucho una vez por día. O sea que quien entra seguido no se desloguea
   * nunca, y quien no aparece en 30 días tiene que volver a entrar. Sin esto,
   * los 30 días correrían desde el login y cortarían a alguien en la mitad de
   * su uso normal.
   *
   * DOS COSAS QUE SIGUEN ACOTANDO ESTO, y por eso el número largo no queda
   * solo: la cookie es httpOnly (el JavaScript de la página no puede leerla), y
   * el usuario puede cerrar de golpe todas las sesiones desde su perfil, cosa
   * que además pasa sola al cambiar la contraseña.
   *
   * Y la salida para la computadora prestada es el "Mantener la sesión
   * abierta" del formulario de login: al destildarlo, el cliente manda
   * `rememberMe: false` y la cookie deja de ser persistente, así que se borra
   * al cerrar el navegador.
   */
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  advanced: {
    /**
     * De dónde sacar la IP del cliente, que es la clave con la que el límite
     * de intentos separa a un visitante de otro.
     *
     * Better Auth no ve el socket: recibe un Request estándar, así que sin
     * esto la única fuente sería un encabezado. Su default es `x-forwarded-for`,
     * que en desarrollo no existe, y entonces avisaba por consola que estaba
     * cayendo a "un solo balde compartido por ruta". Eso no es cosmético: con
     * un balde compartido, cinco intentos fallidos de CUALQUIERA dejaban a
     * todos los demás sin poder entrar por un minuto.
     *
     * `x-ip-cliente` lo escribe nuestro propio Express justo antes del
     * handler (ver index.js), a partir de `req.ip`, y lo SOBRESCRIBE siempre,
     * así que un cliente no puede mandarse una IP inventada para saltearse el
     * límite. Es la misma solución en desarrollo y en producción: lo único
     * que cambia es cuántos proxies confía Express, que se configura allá.
     */
    ipAddress: {
      ipAddressHeaders: ['x-ip-cliente'],
    },

    // Ver el comentario de USAR_COOKIES_SEGURAS.
    useSecureCookies: USAR_COOKIES_SEGURAS,

    /**
     * Atributos de la cookie de sesión, escritos a mano aunque coincidan con
     * los defaults de Better Auth.
     *
     * `httpOnly` es el que importa y es el motivo por el que el token de
     * sesión NO está en localStorage en ninguna parte de la app (verificado:
     * el frontend no usa localStorage ni sessionStorage). Con httpOnly, el
     * JavaScript de la página no puede leer la cookie ni con
     * `document.cookie`, así que un XSS no se lleva la sesión. Un token
     * guardado en localStorage sí sería legible por cualquier script.
     *
     * `sameSite: 'lax'` alcanza porque el frontend y el backend son el mismo
     * sitio en los dos entornos: en desarrollo, dos puertos de localhost; al
     * publicar, la idea es que el backend viva en un subdominio
     * (api.pochoclo.ar), que sigue siendo el mismo sitio que pochoclo.ar.
     *
     * OJO AL PUBLICAR: si el backend termina en un dominio DISTINTO (por
     * ejemplo un .onrender.com), esto pasa a ser cross-site y hay que poner
     * `sameSite: 'none'` con `secure: true`. Ahí Safari bloquea igual la
     * cookie por su Intelligent Tracking Prevention y el login no anda en
     * ese navegador, que es justo lo que el subdominio evita.
     */
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
    },
  },

  /**
   * Requisitos de la contraseña, aplicados en los TRES momentos en que se
   * elige una: el alta, el cambio desde el perfil, y el restablecimiento con
   * el enlace del correo.
   *
   * POR QUÉ ACÁ Y NO EN databaseHooks: la contraseña no es un campo del
   * usuario. Better Auth la hashea y la guarda en la tabla `account`, así que
   * el hook de `user.create.before` nunca la ve. `hooks.before` sí: corre
   * antes de cualquier endpoint y recibe el cuerpo del pedido tal como llegó.
   *
   * Las cuatro rutas están en una tabla y no en una cadena de `if` para que
   * agregar una sea agregar una línea. El nombre del campo cambia según la
   * ruta, que es justo el detalle que se olvida cuando esto se escribe suelto
   * en cada lugar: en el alta es `password` y en las otras tres es
   * `newPassword`.
   *
   * `/reset-password/:token` (el GET al que lleva el enlace del mail) no
   * figura y no tiene que figurar: no trae contraseña, solo redirige.
   */
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      /**
       * Los campos del alta se validan ACÁ ADEMÁS de en
       * `databaseHooks.user.create.before`, y la duplicación es a propósito.
       *
       * POR QUÉ: aquel hook corre **solo cuando el usuario se crea de
       * verdad**. Desde que el alta con un correo existente devuelve una
       * respuesta ciega, eso abría un oráculo de enumeración: mandando un
       * nombre inválido a propósito, un correo nuevo contestaba 400 (porque
       * llegaba a crearse y el hook lo rechazaba) y uno que ya tenía cuenta
       * contestaba 200 (porque nunca se crea nada y el hook no corre). O sea
       * que la validación misma delataba qué direcciones existen.
       *
       * `hooks.before` corre para todos los pedidos a la ruta, exista o no el
       * correo, así que la respuesta queda igual en los dos casos.
       *
       * **El hook de `databaseHooks` NO se saca**: sigue siendo la garantía
       * de que ningún usuario se crea inválido, venga por donde venga. Esto
       * es una guarda de más, no un reemplazo.
       */
      if (ctx.path === '/sign-up/email') {
        for (const revisar of [
          () => validarNombre(ctx.body?.name),
          () => validarCorreo(ctx.body?.email),
          () => validarFechaNacimiento(ctx.body?.fechaNacimiento),
          () => validarAceptacionTerminos(ctx.body?.aceptoTerminos),
        ]) {
          const resultado = revisar();
          if (resultado.error) throw errorDeValidacion(resultado.error);
        }
      }

      /**
       * Borrar la cuenta EXIGE la contraseña, y esto es lo único que lo
       * garantiza.
       *
       * NO ALCANZA CON QUE EL FORMULARIO LA PIDA, que es lo que este archivo
       * daba por hecho hasta el 2026-09-08: el `password` de `/delete-user`
       * es OPCIONAL en Better Auth, y sin él la librería cae a un chequeo de
       * frescura de la sesión cuyo default son 24 horas. O sea que un
       * `POST /api/auth/delete-user` con el cuerpo vacío y una cookie de
       * sesión de menos de un día borraba la cuenta y todas sus listas, sin
       * escribir la contraseña ni una vez. Medido contra el servidor real
       * antes de este arreglo: contestaba 200 y la fila desaparecía.
       *
       * Es justo el escenario que el borrado dice cubrir (la computadora
       * ajena con la sesión abierta un minuto), y el formulario no lo cubría
       * porque el límite es la API y no la pantalla.
       *
       * OJO CON EL ARREGLO QUE PARECE OBVIO Y ES EL CONTRARIO: poner
       * `session.freshAge = 0` NO exige la contraseña, la vuelve innecesaria
       * siempre. La condición de la librería es
       * `if (!password && freshAge !== 0)`, así que con 0 el chequeo se
       * saltea entero. Por eso se exige acá, del lado nuestro, donde el
       * criterio queda escrito y no depende de un default de la librería.
       *
       * El `token` es la otra vía legítima de esa misma ruta (el enlace de
       * confirmación por correo). Hoy no se puede llegar por ahí, porque
       * `sendDeleteAccountVerification` no está configurado y sin eso no
       * existe ningún token válido; se contempla igual para que activar esa
       * opción algún día no choque contra esta guarda.
       */
      if (ctx.path === '/delete-user' && !ctx.body?.password && !ctx.body?.token) {
        throw errorDeValidacion('Para borrar la cuenta hay que escribir tu contraseña.');
      }

      const CAMPO_DE_CONTRASENA = {
        '/sign-up/email': 'password',
        '/reset-password': 'newPassword',
        '/change-password': 'newPassword',
        '/set-password': 'newPassword',
      };

      const campo = CAMPO_DE_CONTRASENA[ctx.path];
      if (!campo) return;

      const contrasena = ctx.body?.[campo];

      /**
       * Palabras que no pueden aparecer en la contraseña de esta persona.
       *
       * En el alta vienen en el mismo pedido. Al cambiarla desde el perfil
       * salen de la sesión, si ya está resuelta. Al restablecerla con el
       * enlace del correo NO hay ninguna de las dos cosas: en ese pedido solo
       * viaja el token, así que ahí este chequeo no corre y todos los demás
       * sí. Es una limitación conocida y no un olvido.
       */
      const usuarioDeLaSesion = ctx.context?.session?.user;
      const contexto = contextoDeUsuario({
        nombre: ctx.body?.name ?? usuarioDeLaSesion?.name,
        correo: ctx.body?.email ?? usuarioDeLaSesion?.email,
      });

      const resultado = validarContrasena(contrasena, { contexto });
      if (resultado.error) {
        throw errorDeValidacion(resultado.error);
      }

      /**
       * La consulta a Have I Been Pwned va ÚLTIMA, después de todo lo que se
       * resuelve en memoria: si la contraseña ya se rechazó por corta o por
       * común, no hay por qué gastar una llamada de red ni hacer esperar al
       * usuario. Falla abierta (ver contrasenaFiltrada.js): si el servicio no
       * contesta, devuelve null y se deja pasar.
       */
      if (await estaFiltrada(contrasena)) {
        throw errorDeValidacion(
          'Esa contraseña aparece en filtraciones de otros sitios, así que ya está en las listas que se usan para adivinar. Elegí otra. (No sabemos de dónde salió ni la relacionamos con vos.)'
        );
      }
    }),

    /**
     * Registro de eventos de seguridad (ver auth/registroEventos.js).
     *
     * Va en el hook `after` porque acá ya se sabe si la operación salió bien:
     * el código de estado de la respuesta es la única forma de distinguir un
     * login exitoso de uno fallido sin repetir la lógica de la librería.
     *
     * Nunca lanza: un problema al escribir una línea de log no puede hacer
     * fallar un login que ya fue correcto.
     */
    after: createAuthMiddleware(async (ctx) => {
      try {
        const ip = ctx.headers?.get?.('x-ip-cliente') ?? undefined;
        const estado = ctx.context?.returned?.status ?? 200;
        const salioBien = estado < 400;
        const usuarioId = ctx.context?.newSession?.user?.id ?? ctx.context?.session?.user?.id;

        switch (ctx.path) {
          case '/sign-in/email':
            if (salioBien) registroSeguridad.ingreso(usuarioId, ip);
            /**
             * El fallido NO lleva usuario, y no por falta de ganas: si el
             * correo no existe no hay id, y si existe, anotarlo convertiría
             * el log en una lista de "cuentas que alguien está intentando
             * abrir", que es información que no queremos dejar escrita.
             */
            else registroSeguridad.ingresoFallido(ip, ctx.path);
            break;
          case '/sign-up/email':
            if (salioBien) registroSeguridad.altaDeCuenta(usuarioId, ip);
            break;
          case '/change-password':
            if (salioBien) {
              registroSeguridad.cambioDeContrasena(usuarioId, ip);
              /**
               * NO SE ESPERA EL ENVÍO, y es a propósito: la contraseña ya
               * cambió cuando esto corre, así que hacer esperar a la persona
               * el viaje al servidor de correo sería cobrarle un segundo por
               * algo que no cambia el resultado. `enviarCorreo` no lanza (ver
               * correo.js), y el `.catch` está igual para que una promesa
               * rechazada no llegue nunca al proceso.
               */
              const usuario = ctx.context?.session?.user;
              if (usuario) {
                avisarCambioDeContrasena(usuario);
              }
            }
            break;
          case '/reset-password':
            if (salioBien) registroSeguridad.restablecimiento(ip);
            break;
          case '/request-password-reset':
            /**
             * Se anota siempre, salga o no: el pedido en sí es la señal, y
             * contestamos lo mismo exista o no la cuenta, así que el log
             * tampoco puede distinguirlo sin delatar lo que la respuesta
             * esconde.
             */
            registroSeguridad.pedidoDeRestablecimiento(ip);
            break;
          case '/revoke-other-sessions':
          case '/revoke-sessions':
            if (salioBien) registroSeguridad.sesionesCerradas(usuarioId, ip);
            break;
          case '/delete-user':
            if (salioBien) registroSeguridad.bajaDeCuenta(usuarioId, ip);
            break;
          default:
            break;
        }

        /**
         * El 429 NO se puede detectar acá: el limitador de Better Auth corta
         * el pedido ANTES de que se despache el endpoint, así que ni este
         * hook ni el `before` llegan a correr. Se registra desde Express, con
         * un oyente de `finish` sobre la respuesta (ver index.js).
         */
      } catch {
        // Ver el comentario de arriba: el registro no puede romper nada.
      }
    }),
  },

  emailAndPassword: {
    enabled: true,

    /**
     * Redundante con el hook de arriba, que es más estricto y corre antes.
     * Se deja igual para que la librería no tenga un criterio propio distinto
     * del nuestro si alguna vez se toca el hook.
     */
    minPasswordLength: LARGO_MINIMO_CONTRASENA,
    maxPasswordLength: LARGO_MAXIMO_CONTRASENA,

    /**
     * EXIGIR el correo verificado para poder entrar.
     *
     * Va por variable de entorno y arranca APAGADO, y el motivo no es
     * pereza: encenderlo sin SMTP configurado deja a todo el mundo afuera,
     * porque nadie podría recibir el mail con el que verificar. La secuencia
     * correcta al publicar es (1) configurar SMTP, (2) comprobar que llegan
     * los mails, (3) recién ahí poner EXIGIR_CORREO_VERIFICADO=true.
     *
     * Ojo con un efecto que no es obvio: al encenderlo, las cuentas que ya
     * existan sin verificar dejan de poder entrar hasta que verifiquen. Con
     * cuentas de prueba da igual; con usuarios reales hay que avisar antes.
     */
    requireEmailVerification: process.env.EXIGIR_CORREO_VERIFICADO === 'true',

    /**
     * Alguien intentó registrarse con un correo que YA tiene cuenta.
     *
     * ESTO EXISTE PORQUE LA RESPUESTA AHORA ES CIEGA. Con
     * `requireEmailVerification` encendido, Better Auth deja de contestar
     * "ya existe una cuenta con ese correo" y devuelve exactamente lo mismo
     * que ante un alta nueva: un usuario sintético, y hasta hashea la
     * contraseña igual para no delatarse por el tiempo que tarda. Eso cierra
     * la enumeración de usuarios, que acá tiene un costo real para la
     * persona: la lista de películas que alguien guarda dice cosas de esa
     * persona, así que hasta el dato de "tiene cuenta" es información suya.
     * Es el mismo criterio que ya seguía la recuperación de contraseña.
     *
     * **OJO CON EL ACOPLAMIENTO: si `EXIGIR_CORREO_VERIFICADO` vuelve a
     * false, la enumeración se reabre sola.** El cegado no es una opción
     * aparte: Better Auth lo activa a partir de esa misma bandera, porque un
     * alta real sin verificación devuelve una sesión y una falsa no podría,
     * así que las dos respuestas serían distinguibles igual.
     *
     * Quien tiene que enterarse del intento es el dueño de la dirección, no
     * quien lo probó. Sin este aviso, el cegado convertiría un intento contra
     * una cuenta en un silencio total.
     *
     * No lanza nunca: `enviarCorreo()` ya se traga sus errores, y un fallo
     * del proveedor de mail no puede cambiar la respuesta del alta, que es
     * justamente lo que tiene que quedar idéntico.
     */
    /**
     * Con qué forma se arma el usuario SINTÉTICO que se devuelve cuando el
     * correo ya existía.
     *
     * SIN ESTO EL CEGADO NO SIRVE, y el motivo es concreto y estuvo medido:
     * `terminosAceptadosEn` lo pone nuestro hook de `databaseHooks` al crear
     * el usuario, y el usuario sintético no pasa por ahí, así que salía en
     * `null`. Un alta real devolvía una fecha y una duplicada devolvía null,
     * o sea **un oráculo de enumeración perfecto**: alcanzaba con mirar ese
     * campo para saber qué direcciones tienen cuenta.
     *
     * La regla al agregar cualquier campo propio al usuario: si lo completa
     * un hook de creación, hay que completarlo también acá, porque el
     * sintético no pasa por ninguno.
     */
    customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
      ...coreFields,
      ...additionalFields,
      id,
      aceptoTerminos: true,
      terminosAceptadosEn: new Date(),
    }),

    onExistingUserSignUp: async ({ user }) => {
      await enviarIntentoDeRegistro({
        user,
        urlIngreso: `${ORIGENES_FRONTEND[0]}/iniciar-sesion`,
      });
    },

    /**
     * Recuperación de contraseña.
     *
     * `resetPasswordTokenExpiresIn` en una hora: lo suficiente para que
     * alguien lea el mail cuando puede, y lo bastante corto para que un
     * enlace olvidado en una casilla ajena no siga sirviendo. Better Auth ya
     * lo invalida después del primer uso.
     */
    sendResetPassword: async ({ user, url }) => {
      await enviarRestablecerContrasena({ user, url });
    },
    resetPasswordTokenExpiresIn: 60 * 60,

    /**
     * Restablecer la contraseña CIERRA TODAS LAS SESIONES ABIERTAS.
     *
     * Es opt-in en Better Auth y el default es `false`, así que hasta el
     * 2026-09-08 no pasaba. Medido antes del arreglo: con una sesión abierta,
     * restablecer la contraseña desde el enlace del correo la dejaba viva y
     * válida por 30 días más.
     *
     * ESO VACIABA JUSTO EL CASO PARA EL QUE EXISTE LA RECUPERACIÓN. Alguien
     * que sospecha que otro entró a su cuenta hace exactamente esto: pide el
     * enlace y elige una contraseña nueva. Si la sesión del otro sobrevive, no
     * arregló nada, y encima se queda tranquilo creyendo que sí. La sesión
     * además se renueva sola al usarse (`session.updateAge`), o sea que el
     * intruso podía quedarse indefinidamente.
     *
     * EL PROYECTO YA TENÍA ESTE ARGUMENTO ESCRITO Y APLICADO EN EL OTRO LADO:
     * `PaginaPerfil` manda `revokeOtherSessions: true` al cambiar la
     * contraseña, con el comentario de que "si alguien cambia la suya porque
     * sospecha que otro entró, dejarle la sesión abierta a ese otro no arregla
     * nada". Faltaba el mismo criterio acá, que es donde más falta hace:
     * cambiar la contraseña desde el perfil exige saberla, y restablecerla es
     * la vía de quien ya no la sabe, o sea la de quien perdió el control de la
     * cuenta.
     *
     * ACÁ SE CIERRAN TODAS Y NO "TODAS MENOS LA MÍA", a diferencia del perfil,
     * y es correcto: quien restablece no tiene sesión abierta (por eso llegó
     * al enlace), y la pantalla lo manda a iniciar sesión con la contraseña
     * nueva. No hay ninguna sesión propia que preservar.
     */
    revokeSessionsOnPasswordReset: true,
  },

  /**
   * Verificación de la dirección de correo.
   *
   * `sendOnSignUp` manda el mail al crear la cuenta aunque la verificación
   * todavía no sea obligatoria: así, para cuando se encienda, la mayoría ya
   * va a estar verificada y el cambio no molesta a nadie.
   *
   * `autoSignInAfterVerification` evita el paso tonto de hacer que alguien
   * que acaba de demostrar que la casilla es suya tenga que escribir la
   * contraseña otra vez.
   */
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await enviarVerificacion({ user, url });
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },

  user: {
    /**
     * Borrar la cuenta es un derecho concreto de la Ley 25.326, que la
     * página de Privacidad ya nombra. Sin sendDeleteAccountVerification el
     * borrado es inmediato.
     *
     * QUIEN EXIGE LA CONTRASEÑA ES EL `hooks.before` DE MÁS ARRIBA, no esta
     * opción y no el formulario. Acá decía que "el cliente igual la exige, así
     * que nadie puede borrar la cuenta de otro con la sesión prestada", y era
     * falso: el formulario no es un límite, la API sí. Ver el comentario de
     * `/delete-user` en `hooks.before` para el detalle de por qué la librería
     * sola no alcanza.
     *
     * Las listas y los gustos se van solas: sus tablas apuntan a "user" con
     * ON DELETE CASCADE, igual que "session" y "account". Verificado el
     * 2026-09-08 sobre una cuenta con listas, gustos, plataformas y sesión:
     * las cinco tablas quedan en cero.
     */
    deleteUser: {
      enabled: true,

      /**
       * Avisarle al dueño que su cuenta se borró.
       *
       * VA EN `beforeDelete` PORQUE ES LA ÚNICA VENTANA QUE HAY: `afterDelete`
       * corre con la fila ya borrada, y aunque recibe el usuario, para
       * entonces no queda nada a lo que volver si el envío falla. Acá la
       * cuenta todavía existe y el correo y el nombre son los de verdad.
       *
       * NO PUEDE CANCELAR EL BORRADO: si lanzara, Better Auth abortaría la
       * operación, y entonces un problema del proveedor de correo dejaría a
       * alguien sin poder ejercer un derecho que la Ley 25.326 le reconoce.
       * Por eso no se espera el envío y cualquier fallo queda tragado.
       */
      beforeDelete: async (usuario) => {
        enviarAvisoCuentaBorrada({ user: usuario }).catch(() => {});
      },
    },

    additionalFields: {
      /**
       * La sección 17 pide aplicar el límite de edad automáticamente según
       * la edad del perfil. Va como campo del usuario y no en una tabla
       * aparte porque el motor lo necesita en cada búsqueda, y así viaja
       * dentro de la sesión sin una consulta extra a la base.
       */
      fechaNacimiento: {
        type: 'date',
        required: true,
        input: true,
      },

      /**
       * Aceptación explícita de los Términos y Condiciones.
       *
       * Va `required: false` a nivel de esquema aunque el alta lo exija: si
       * lo marcara como obligatorio acá, la librería rechazaría el pedido
       * antes de llegar a nuestro hook y el usuario vería el mensaje en
       * inglés de Better Auth. Quien decide es el hook de más abajo, que
       * contesta en español y es igual de imposible de saltear.
       *
       * Se guarda el booleano Y la fecha. El booleano por sí solo no dice
       * nada (siempre va a ser true, porque sin true no hay alta); la fecha
       * es la que sirve, porque comparada contra la fecha de la última
       * versión de los Términos dice si esa persona aceptó la versión
       * vigente o una anterior. Es la única forma de saberlo sin guardar una
       * copia entera del documento por usuario.
       */
      aceptoTerminos: {
        type: 'boolean',
        required: false,
        input: true,
      },
      terminosAceptadosEn: {
        type: 'date',
        required: false,
        /**
         * input: false es lo que impide que el cliente elija la fecha en la
         * que dice haber aceptado. La pone el servidor, con su reloj.
         */
        input: false,
      },
    },
  },

  /**
   * Validación del alta del lado del servidor.
   *
   * El formulario ya valida lo mismo antes de enviar, pero eso son atributos
   * de HTML y JavaScript del navegador: cualquiera abre las devtools, borra
   * el `required` del campo Nombre y crea una cuenta sin nombre (comprobado).
   * Este hook corre en nuestro proceso, así que es el único punto que no se
   * puede saltear.
   *
   * Lo del NOMBRE es lo que este hook agrega de verdad: Better Auth acepta
   * cualquier `name`, incluido el vacío. Lo del correo es defensa en
   * profundidad: su propio validador ya rechaza "juan@gmail" y los espacios
   * sobrantes ANTES de llegar acá (verificado el 2026-08-22, contesta
   * VALIDATION_ERROR), así que en la práctica esta rama casi no se activa;
   * queda para que el criterio quede escrito de nuestro lado y no dependa de
   * lo que decida validar la librería en la próxima versión.
   *
   * El `toLowerCase` sí hace algo visible: guarda "Juan@Gmail.com" como
   * "juan@gmail.com", así la misma casilla no puede terminar en dos cuentas
   * distintas por una mayúscula.
   *
   * Los mensajes van en español porque llegan al usuario tal cual: el
   * `mensajeDeError` del cliente traduce los códigos conocidos de la
   * librería, no los textos nuestros.
   */
  databaseHooks: {
    user: {
      create: {
        before: async (usuario) => {
          const nombre = validarNombre(usuario.name);
          if (nombre.error) throw errorDeValidacion(nombre.error);

          const correo = validarCorreo(usuario.email);
          if (correo.error) throw errorDeValidacion(correo.error);

          /**
           * Edad mínima. La cuenta la hace el servidor con SU reloj: el del
           * navegador lo cambia el usuario desde el sistema operativo.
           */
          const fechaNacimiento = validarFechaNacimiento(usuario.fechaNacimiento);
          if (fechaNacimiento.error) {
            throw errorDeValidacion(fechaNacimiento.error);
          }

          const terminos = validarAceptacionTerminos(usuario.aceptoTerminos);
          if (terminos.error) throw errorDeValidacion(terminos.error);

          return {
            data: {
              ...usuario,
              name: nombre.valor,
              email: correo.valor,
              fechaNacimiento: fechaNacimiento.valor,
              aceptoTerminos: true,
              terminosAceptadosEn: new Date(),
            },
          };
        },
      },

      /**
       * Edición del perfil (`updateUser` desde /perfil).
       *
       * Este hook no existía, y era el agujero más concreto que tenía la
       * cuenta: el alta validaba todo y la edición no validaba nada, así que
       * lo que el registro rechazaba se podía dejar igual con un PATCH
       * después. Un nombre vacío, o una fecha de nacimiento de 1300, o
       * bajarse la edad por debajo del mínimo.
       *
       * Se valida SOLO lo que viene en el pedido: `updateUser` es parcial,
       * así que un campo ausente significa "no lo toques", no "borralo".
       *
       * Los campos de aceptación de Términos se RECHAZAN, no se descartan, y
       * la diferencia importa por cómo Better Auth trata lo que devuelve un
       * hook. En `db/with-hooks.mjs` hace:
       *
       *     actualData = { ...actualData, ...result.data }
       *
       * O sea que FUSIONA: borrar una clave del objeto que devolvemos no la
       * saca, porque la original sobrevive al spread. Se comprobó en la base
       * (un `delete datos.aceptoTerminos` dejaba igual el false del pedido).
       * Lo mismo vale para cualquier campo que alguna vez haya que blindar
       * acá: la única forma de anular un valor es pisarlo con otro o cortar
       * el pedido.
       *
       * Se corta el pedido y no se pisa el valor porque pisarlo con `true`
       * sería mentir en las cuentas anteriores a los Términos, que tienen
       * FALSE legítimamente: se crearon cuando el documento no existía.
       * Ningún cliente propio manda estos campos al editar el perfil.
       */
      update: {
        before: async (cambios) => {
          const datos = { ...cambios };

          /**
           * Se compara contra `undefined` y no con el operador `in`: Better
           * Auth arma el objeto con TODOS los campos editables y deja en
           * undefined los que el pedido no trajo. Con `in`, editar solo la
           * fecha de nacimiento hacía que se validara un nombre que nadie
           * mandó, y el pedido moria con "Escribí un nombre" (comprobado).
           */

          if (datos.name !== undefined) {
            const nombre = validarNombre(datos.name);
            if (nombre.error) throw errorDeValidacion(nombre.error);
            datos.name = nombre.valor;
          }

          /**
           * Better Auth ya rechaza el cambio de correo antes de llegar acá
           * (update-user.mjs corta con EMAIL_CAN_NOT_BE_UPDATED en cuanto ve
           * un `email` en el body), así que esta rama hoy no se activa nunca.
           * Queda por si esa decisión cambia de versión: el correo identifica
           * la cuenta y no puede quedar sin validar.
           */
          if (datos.email !== undefined) {
            const correo = validarCorreo(datos.email);
            if (correo.error) throw errorDeValidacion(correo.error);
            datos.email = correo.valor;
          }

          if (datos.fechaNacimiento !== undefined) {
            const fecha = validarFechaNacimiento(datos.fechaNacimiento);
            if (fecha.error) throw errorDeValidacion(fecha.error);
            datos.fechaNacimiento = fecha.valor;
          }

          if (datos.aceptoTerminos !== undefined || datos.terminosAceptadosEn !== undefined) {
            throw errorDeValidacion('La aceptación de los términos no se puede modificar.');
          }

          return { data: datos };
        },
      },
    },
  },
});
