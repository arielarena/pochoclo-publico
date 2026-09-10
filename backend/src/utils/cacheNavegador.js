/**
 * `Cache-Control` para las cuatro rutas de referencia (`/generos`, `/paises`,
 * `/idiomas`, `/proveedores`): listas que alimentan los selectores de
 * Preferencias/Filtros y que son iguales para cualquier visitante.
 *
 * Hasta el 2026-09-01 ninguna llevaba ningún `Cache-Control`, así que
 * `PaginaBuscar` y `PaginaResultados` — que las piden cada una en su propio
 * efecto — las volvían a pedir en cada visita a esas pantallas, aunque el
 * contenido no hubiera cambiado. Una hora alcanza: `/proveedores` es la que
 * más se mueve, y lo hace mes a mes, no minuto a minuto.
 *
 * Es un caché de NAVEGADOR (`public` porque no hay nada privado en la
 * respuesta), no un pedido a Cloudflare de cachear en el borde: estas rutas
 * viajan con `Vary: Origin` y `Access-Control-Allow-Credentials`, así que
 * cachearlas en un CDN compartido entre orígenes sería un riesgo de CORS que
 * esto no toca.
 */
const UNA_HORA = 60 * 60;

export function cachearUnaHora(res) {
  res.set('Cache-Control', `public, max-age=${UNA_HORA}`);
}
