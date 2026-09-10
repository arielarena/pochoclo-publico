import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import 'dotenv/config';
import { toNodeHandler } from 'better-auth/node';
import { auth, ORIGENES_FRONTEND } from './auth/auth.js';
import { cargarSesion } from './auth/sesion.js';
import { responderError } from './utils/responder.js';
import { resumenDeError } from './utils/resumenDeError.js';
import { limitePedidos } from './middleware/limitePedidos.js';
import { hsts, HSTS_DESCRIPCION } from './middleware/hsts.js';
import { registroSeguridad } from './auth/registroEventos.js';
import { buscarRouter } from './routes/buscar.js';
import { opcionesRouter } from './routes/opciones.js';
import { estadoAnimoRouter } from './routes/estadoAnimo.js';
import { fichaRouter } from './routes/ficha.js';
import { buscarTituloRouter } from './routes/buscarTitulo.js';
import { parecidoARouter } from './routes/parecidoA.js';
import { proveedoresRouter } from './routes/proveedores.js';
import { buscarPersonaRouter } from './routes/buscarPersona.js';
import { generosRouter } from './routes/generos.js';
import { paisesRouter } from './routes/paises.js';
import { idiomasRouter } from './routes/idiomas.js';
import { listasRouter } from './routes/listas.js';
import { gustosRouter } from './routes/gustos.js';
import { terminosRouter } from './routes/terminos.js';

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Cuántos proxies hay por delante de este server.
 *
 * Con 0 (el default, que es lo que corresponde en desarrollo) Express usa la
 * dirección real del socket y NO le cree a ningún `x-forwarded-for`. Al
 * publicar, casi cualquier hosting mete un proxy adelante: ahí hay que poner
 * 1, o el número de saltos que haya, o `req.ip` va a devolver la IP del
 * proxy para todo el mundo y el límite de intentos dejaría de distinguir a un
 * visitante de otro.
 *
 * Ojo con pasarse de número: confiar en más saltos de los que hay deja que el
 * cliente elija qué IP se le atribuye, que es justo lo contrario de lo que
 * queremos.
 */
const PROXIES_CONFIABLES = Number(process.env.PROXIES_CONFIABLES ?? 0);
app.set('trust proxy', PROXIES_CONFIABLES);

/**
 * Comprime las respuestas (gzip/brotli según lo que pida el cliente) ANTES
 * de que salgan de este proceso.
 *
 * POR QUÉ HACÍA FALTA. El backend corre en una notebook casera detrás de un
 * túnel de Cloudflare, y ESE tramo — notebook
 * hacia el borde de Cloudflare — es el eslabón más escaso de todo el diseño,
 * no el que va del borde al navegador. Cloudflare ya comprime lo que le
 * llega a servir al navegador, pero eso no tapa el primer tramo: medido en
 * vivo, una búsqueda de estado de ánimo son 216 kB de JSON sin comprimir, y
 * sin este middleware esos 216 kB salían enteros de la notebook por el
 * túnel. Con `compression()` de por medio, lo que sale de acá ya viene
 * comprimido, ~3,5 veces más chico, y Cloudflare le sigue sirviendo brotli
 * al navegador igual que antes.
 *
 * Va lo más arriba posible, antes de cualquier otro middleware que escriba
 * en la respuesta, porque funciona envolviendo `res.write`/`res.end` — cuanto
 * antes se instale, a más respuestas alcanza.
 */
app.use(compression());

/**
 * Cabeceras de seguridad.
 *
 * helmet no hace nada mágico: pone una docena de cabeceras que habría que
 * poner igual a mano. Lo que aporta es la lista completa (uno siempre se
 * olvida de alguna) y valores por defecto ya pensados.
 *
 * ESTO ES LA API, y eso cambia cuáles importan. Casi todas las cabeceras de
 * helmet protegen a un navegador que RENDERIZA una página; acá las respuestas
 * son JSON. Las que de verdad suman de este lado son tres:
 *
 *   - `X-Content-Type-Options: nosniff`, para que el navegador no adivine el
 *     tipo de una respuesta y termine ejecutando como script algo que dijimos
 *     que era JSON.
 *   - Sacar `X-Powered-By`, que venía anunciando "Express" en cada respuesta.
 *     No es un agujero, es información gratis para quien busca vulnerabilidades
 *     conocidas de una versión.
 *   - `Referrer-Policy`, para no filtrar direcciones internas al salir.
 *
 * LAS QUE IMPORTAN DE VERDAD VAN EN EL FRONTEND, que sirve el hosting y no
 * este Express: la CSP y el X-Frame-Options protegen la página que el usuario
 * mira, no esta API.
 *
 * DOS SE APAGAN A PROPÓSITO:
 *
 *   - `contentSecurityPolicy`: el default de helmet incluye
 *     `default-src 'self'`, que sobre una API no protege nada (no hay página
 *     que cargue recursos) y confunde a quien la lea creyendo que la CSP del
 *     sitio está resuelta. La CSV real va en el hosting del frontend.
 *   - `crossOriginResourcePolicy`: su valor por defecto es `same-origin`, y
 *     este backend existe justamente para que lo llame el frontend desde OTRO
 *     origen. Dejarlo puesto rompería la app. De que solo llamen los orígenes
 *     permitidos ya se ocupa CORS, unas líneas más abajo.
 *
 * `strictTransportSecurity` también va apagado acá porque HSTS lo maneja
 * nuestro propio middleware, que tiene la escalera de max-age y el control de
 * la precarga. Ver middleware/hsts.js.
 */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    strictTransportSecurity: false,
  })
);

/**
 * HSTS va lo más arriba posible, ANTES que CORS y que el handler de auth:
 * tiene que salir en TODAS las respuestas, incluidas las de error y las
 * preflight de CORS. Una respuesta sin la cabecera es una oportunidad menos
 * de que el navegador se entere. No hace nada en desarrollo, porque el
 * pedido no llega por HTTPS. Ver middleware/hsts.js.
 */
app.use(hsts);

/**
 * CORS con credenciales: la cookie de sesión viaja entre dos orígenes
 * distintos (Vite y este server), así que el navegador solo la manda si el
 * backend nombra explícitamente al frontend. Hasta v2 esto era un cors()
 * abierto a cualquiera, que sin cookies era inofensivo; con sesiones deja
 * de serlo.
 */
app.use(
  cors({
    origin: ORIGENES_FRONTEND,
    credentials: true,
  })
);

/**
 * Better Auth recibe un Request estándar y no ve el socket, así que no tiene
 * forma propia de saber quién le está hablando. Acá le pasamos la IP que
 * Express ya resolvió, en un encabezado que auth.js lee (ipAddressHeaders).
 *
 * Se ESCRIBE SIEMPRE, incluso si el pedido ya traía uno: así lo que mande el
 * cliente se descarta, y nadie puede inventarse una IP distinta en cada
 * intento para saltearse el límite de contraseñas.
 */
app.use('/api/auth', (req, res, siguiente) => {
  req.headers['x-ip-cliente'] = req.ip;

  /**
   * Los 429 del limitador de Better Auth se registran acá y no en sus hooks,
   * porque ese limitador corta el pedido antes de despachar el endpoint: los
   * hooks nunca llegan a correr. `finish` se dispara cuando la respuesta ya
   * salió, la haya escrito quien la haya escrito.
   *
   * Es justo el evento más valioso del registro: varios 429 seguidos sobre
   * /sign-in/email es alguien probando contraseñas.
   */
  res.on('finish', () => {
    if (res.statusCode === 429) registroSeguridad.limiteAlcanzado(req.ip, req.path);
  });

  siguiente();
});

/**
 * Tope de tamaño del cuerpo PARA LAS RUTAS DE AUTH.
 *
 * POR QUÉ HACE FALTA UNO APARTE, que es lo que no es obvio: el handler de
 * Better Auth va montado ANTES de `express.json()` (ver el comentario de
 * abajo), así que **el límite de 64 kB de ese parser no las cubre**. Medido el
 * 2026-08-28: un cuerpo de 9 MB contra `/api/auth/sign-up/email` se leía y se
 * parseaba entero antes de rechazarse por el largo del nombre, mientras que el
 * mismo cuerpo contra `/buscar` daba 413 sin tocar nada.
 *
 * Es la peor combinación posible: son las rutas SIN autenticar, o sea las que
 * cualquiera puede llamar, y el trabajo de leer y parsear se paga antes de
 * poder rechazar nada.
 *
 * 16 kB es holgado: el cuerpo legítimo más grande es un alta, con nombre (60),
 * correo (254) y contraseña (128), o sea menos de 1 kB. Si algún día se suma
 * un plugin de Better Auth con cuerpos más grandes, este es el número a subir.
 */
const TOPE_CUERPO_AUTH = 16 * 1024;

/**
 * El tope se aplica por `Content-Length` y no contando bytes del stream, y la
 * razón es la misma que obliga a todo lo de acá: **el cuerpo no se puede
 * tocar**, porque el handler de auth necesita leerlo él. Escuchar el stream
 * para contarlo sería consumirlo.
 *
 * Por eso también se exige que el encabezado ESTÉ presente: sin él, el tope se
 * saltearía mandando el cuerpo en trozos. Ningún cliente legítimo cae acá,
 * porque `fetch` lo pone solo en cualquier POST con cuerpo de texto.
 */
app.all('/api/auth/*', (req, res, siguiente) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return siguiente();

  const largo = req.get('content-length');

  if (largo === undefined) {
    return res.status(411).json({ error: 'Falta el encabezado Content-Length.' });
  }
  if (Number(largo) > TOPE_CUERPO_AUTH) {
    return res.status(413).json({ error: 'El pedido es demasiado grande.' });
  }

  return siguiente();
});

/**
 * El handler de Better Auth va ANTES de express.json(), y no es un detalle
 * de estilo: si el parser de JSON corre primero se come el body, y el
 * handler de auth recibe pedidos vacíos. Es un requisito explícito de la
 * documentación de Better Auth.
 */
app.all('/api/auth/*', toNodeHandler(auth));

/**
 * El tope de tamaño del body es una defensa barata contra el pedido enorme:
 * sin él, express.json() acepta el default de 100kb, y no hay ningún cuerpo
 * legítimo en esta app que se acerque. El más grande posible es un POST
 * /buscar con todas las preferencias cargadas, que son unos pocos cientos de
 * bytes.
 */
app.use(express.json({ limit: '64kb' }));

/**
 * Límite de pedidos por IP.
 *
 * Las rutas de autenticación NO pasan por acá: tienen el suyo, más estricto,
 * dentro de Better Auth, y además ya quedaron atendidas por el handler de
 * arriba. Esto cubre el resto de la app, que hasta ahora no tenía ninguno.
 *
 * Hay tres grupos porque el costo de un pedido varía muchísimo:
 *
 *  - Las búsquedas son las caras de verdad. Una sola puede disparar 40
 *    consultas a /discover y 200 pedidos de detalle a TMDb, y tarda unos 3
 *    segundos. 30 por minuto es una búsqueda cada dos segundos sostenida, que
 *    ninguna persona hace leyendo resultados.
 *  - El autocompletado dispara varios pedidos mientras se tipea (el campo
 *    tiene 350ms de debounce), así que necesita bastante más aire, y cada
 *    llamada es una sola consulta liviana a TMDb.
 *  - El resto (listas, gustos, catálogos de géneros y países) es barato y
 *    puede repetirse mucho en una sesión normal: acá el límite existe solo
 *    como tope de cordura.
 *
 * Van ANTES de cargarSesion a propósito: esa consulta la sesión contra la
 * base en cada pedido, y no tiene sentido pagarla por algo que se va a
 * rechazar igual.
 */
const MENSAJE_LIMITE = 'Estás haciendo demasiados pedidos seguidos. Esperá un momento y probá de nuevo.';

app.use(limitePedidos({ ventanaSegundos: 60, maximo: 240, mensaje: MENSAJE_LIMITE }));
app.use(
  ['/buscar', '/parecido-a', '/opciones'],
  limitePedidos({ ventanaSegundos: 60, maximo: 30, mensaje: MENSAJE_LIMITE })
);
app.use(
  ['/buscar-titulo', '/buscar-persona'],
  limitePedidos({ ventanaSegundos: 60, maximo: 90, mensaje: MENSAJE_LIMITE })
);

/**
 * Deja req.usuario (o null) en todas las rutas de la app. No corta nunca:
 * las rutas de búsqueda siguen andando sin cuenta.
 */
app.use(cargarSesion);

app.get('/salud', (req, res) => {
  res.json({ estado: 'ok' });
});

app.use(buscarRouter);
app.use(opcionesRouter);
app.use(estadoAnimoRouter);
app.use(fichaRouter);
app.use(buscarTituloRouter);
app.use(parecidoARouter);
app.use(proveedoresRouter);
app.use(buscarPersonaRouter);
app.use(generosRouter);
app.use(paisesRouter);
app.use(idiomasRouter);
app.use(listasRouter);
app.use(gustosRouter);
app.use(terminosRouter);

/**
 * 404: ninguna ruta coincidió.
 *
 * Sin esto Express contesta su propia página, que es HTML en inglés
 * ("Cannot GET /titulo/nada") y en desarrollo incluye el stack. Dos
 * problemas concretos: el cliente hace `res.json()` sobre eso y recibe null,
 * así que se queda sin mensaje; y una API que a veces contesta JSON y a
 * veces HTML obliga a quien la consume a adivinar cuál es cuál.
 *
 * Va DESPUÉS de todos los routers y ANTES del manejador de errores, que es
 * el único orden en que Express lo respeta.
 */
app.use((req, res) => {
  res.status(404).json({ error: 'No existe esa dirección en la API de Pochoclo.' });
});

/**
 * Manejador final de errores.
 *
 * Cada ruta ya atrapa lo suyo con responderError, así que esto es la red
 * abajo de la red: cubre lo que se tire FUERA de un try (un middleware, un
 * body mal formado que express.json() rechaza) y que hoy llegaba al
 * manejador por defecto de Express, que contesta el stack en HTML.
 *
 * Los cuatro parámetros son obligatorios: Express distingue un manejador de
 * errores de un middleware común contando los argumentos de la función.
 */
app.use((err, req, res, siguiente) => {
  /**
   * SI LA RESPUESTA YA EMPEZÓ A SALIR no se puede cambiar ni el código ni el
   * cuerpo, y no alcanza con no hacer nada: si este manejador termina sin
   * responder y sin delegar, el pedido queda abierto hasta que el cliente se
   * cansa, que del lado del usuario es una pantalla cargando para siempre. El
   * único que puede cerrarlo bien es el manejador por defecto de Express, que
   * corta la conexión, y para llegar hasta él hay que pasarle el error.
   */
  if (res.headersSent) {
    console.error('[no atrapado, respuesta ya empezada]', resumenDeError(err));
    return siguiente(err);
  }

  /**
   * Un cuerpo mal formado es culpa del pedido, no nuestra: express.json()
   * marca esos errores con status 400, y contestarles 500 sería mentir. La
   * diferencia se nota del lado del usuario: un 500 invita a "probá de
   * nuevo" por algo que no va a cambiar repitiéndolo.
   */
  const estado = Number(err?.status ?? err?.statusCode ?? 0);
  if (estado >= 400 && estado < 500) {
    /**
     * Se registra el TIPO del error, nunca su mensaje. El de body-parser
     * incluye un pedazo del cuerpo que llegó ("Unexpected token 'r',
     * "{roto" is not valid JSON), y un log es lo que más se copia y se
     * reenvía de todo el sistema: no es lugar para nada que haya escrito un
     * visitante. `err.type` ya dice lo único que sirve para diagnosticar
     * ('entity.parse.failed', 'entity.too.large').
     */
    console.warn('[pedido inválido]', estado, err?.type ?? err?.name ?? 'sin tipo');
    const mensaje =
      estado === 413
        ? 'Ese pedido es demasiado grande.'
        : 'Ese pedido no se entendió.';
    return res.status(estado).json({ error: mensaje });
  }
  responderError(res, err, 'no atrapado');
});

app.listen(PORT, () => {
  console.log(`Pochoclo backend escuchando en http://localhost:${PORT}`);
  console.log(`HSTS: ${HSTS_DESCRIPCION}`);
});
