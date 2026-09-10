import { registroSeguridad } from '../auth/registroEventos.js';

/**
 * Límite de pedidos por IP para las rutas de la app.
 *
 * POR QUÉ HACE FALTA, aunque las rutas de autenticación ya tengan el suyo:
 * el límite de Better Auth cubre `/api/auth/*` y nada más. Las rutas de
 * búsqueda quedaban completamente abiertas, y son las CARAS: una sola
 * llamada a POST /buscar puede disparar hasta 40 consultas a /discover más
 * 200 pedidos de detalle a TMDb (ver la sección 4.9.1 del las notas de decisiones del proyecto), y
 * tarda entre 2,5 y 3 segundos. O sea que un script haciendo pedidos en
 * bucle no solo nos tira el servidor: nos gasta la cuota de la API de TMDb,
 * que es de un tercero y no la controlamos.
 *
 * CÓMO CUENTA: una ventana fija por IP y por grupo de rutas. Es el mismo
 * mecanismo y el mismo compromiso que ya eligió el proyecto para el login
 * (ver rateLimit en auth/auth.js): el estado vive en la memoria del proceso,
 * lo que alcanza mientras el backend corra en UNA instancia, que es lo normal
 * en hosting gratuito. Con varias instancias cada una llevaría su propia
 * cuenta y el límite real se multiplicaría por la cantidad de instancias.
 *
 * ESTO NO REEMPLAZA UN WAF. Un límite en el proceso solo actúa DESPUÉS de
 * que el pedido llegó y ocupó una conexión, así que sirve contra el abuso de
 * la API (un script, un scraper, alguien probando) y no contra un DDoS de
 * volumen, que hay que cortar antes de que toque el servidor. Eso es trabajo
 * de Cloudflare, delante del dominio.
 *
 * DEPENDE DE `trust proxy`: la IP sale de `req.ip`, así que al publicar hay
 * que configurar PROXIES_CONFIABLES (ver index.js) o todos los visitantes van
 * a compartir la IP del proxy y un solo abusador dejaría a todos afuera.
 */

/** Cada cuánto se barren las IPs que ya no tienen ventana activa. */
const INTERVALO_DE_LIMPIEZA_MS = 10 * 60 * 1000;

/**
 * @param {object} opciones
 * @param {number} opciones.ventanaSegundos  Largo de la ventana.
 * @param {number} opciones.maximo           Pedidos permitidos por ventana.
 * @param {string} opciones.mensaje          Qué se le contesta al usuario.
 */
export function limitePedidos({ ventanaSegundos, maximo, mensaje }) {
  const ventanaMs = ventanaSegundos * 1000;

  /** IP -> { cuenta, vence } */
  const baldes = new Map();

  /**
   * El Map crece con cada IP nueva, así que sin esto sería una fuga de
   * memoria lenta pero segura en un server de larga vida. `unref` hace que
   * este temporizador no impida que el proceso termine solo.
   */
  const limpieza = setInterval(() => {
    const ahora = Date.now();
    for (const [ip, balde] of baldes) {
      if (balde.vence <= ahora) baldes.delete(ip);
    }
  }, INTERVALO_DE_LIMPIEZA_MS);
  limpieza.unref?.();

  return function limitar(req, res, siguiente) {
    const ahora = Date.now();
    const ip = req.ip ?? 'desconocida';

    let balde = baldes.get(ip);
    if (!balde || balde.vence <= ahora) {
      balde = { cuenta: 0, vence: ahora + ventanaMs };
      baldes.set(ip, balde);
    }

    balde.cuenta += 1;

    /**
     * Encabezados estándar (RFC 9331): le dicen a un cliente honesto cuánto
     * le queda, así no tiene que descubrirlo chocándose contra el límite.
     */
    const restantes = Math.max(0, maximo - balde.cuenta);
    res.set('RateLimit-Limit', String(maximo));
    res.set('RateLimit-Remaining', String(restantes));
    res.set('RateLimit-Reset', String(Math.ceil((balde.vence - ahora) / 1000)));

    if (balde.cuenta > maximo) {
      res.set('Retry-After', String(Math.ceil((balde.vence - ahora) / 1000)));
      /**
       * El propio registro se encarga de no repetir la línea mil veces
       * mientras dure el abuso (ver registroEventos.js).
       */
      registroSeguridad.limiteAlcanzado(ip, req.path);
      return res.status(429).json({ error: mensaje });
    }

    siguiente();
  };
}
