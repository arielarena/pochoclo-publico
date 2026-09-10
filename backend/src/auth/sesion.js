import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';

/**
 * Lee la sesión desde la cookie y deja `req.usuario` (o null si no hay
 * sesión). No corta nunca: es para las rutas que existen con cuenta y sin
 * cuenta, que a partir de la milestone 21 van a ser casi todas las de
 * búsqueda (la sección 1 del Definitivo mantiene la app usable sin
 * registrarse).
 *
 * Si leer la sesión falla, se sigue como usuario anónimo en vez de romper
 * la búsqueda: que la base de sesiones tenga un mal día no es motivo para
 * que nadie pueda buscar una película.
 */
export async function cargarSesion(req, res, siguiente) {
  try {
    const sesion = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    req.usuario = sesion?.user ?? null;
  } catch (err) {
    console.error('No se pudo leer la sesión, se sigue como anónimo:', err.message);
    req.usuario = null;
  }
  siguiente();
}

/**
 * Corta con 401 si no hay sesión. Para las rutas que no tienen sentido sin
 * cuenta (listas y gustos, milestones 19 y 20). Va después de cargarSesion.
 */
export function exigirSesion(req, res, siguiente) {
  if (!req.usuario) {
    return res.status(401).json({ error: 'Necesitás iniciar sesión para hacer esto.' });
  }
  siguiente();
}
