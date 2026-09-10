/**
 * Recorta un texto en el último espacio antes de un máximo, para no dejar
 * una palabra por la mitad, y agrega una elipsis si cortó.
 *
 * Vive acá y no adentro de useMetadatos.js porque también la usan las
 * Cloudflare Pages Functions (frontend/functions/), que no pueden importar
 * nada que toque el DOM. Una sola implementación evita que el recorte de
 * una meta description termine siendo distinto entre lo que ve Google (por
 * useMetadatos) y lo que ve un crawler sin JavaScript (por la Function).
 */
export function recortar(texto, maximo = 160) {
  const limpio = String(texto).replace(/\s+/g, ' ').trim();
  if (limpio.length <= maximo) return limpio;

  const corte = limpio.slice(0, maximo - 1);
  const ultimoEspacio = corte.lastIndexOf(' ');
  return `${(ultimoEspacio > maximo / 2 ? corte.slice(0, ultimoEspacio) : corte).trimEnd()}…`;
}

/**
 * Enumera una lista con la puntuación del español: "a", "a y b", "a, b, y c".
 *
 * Vivía dentro de Autocompletado.jsx, que era su único consumidor. Se extrajo
 * cuando apareció el segundo (el aviso de géneros descartados de
 * PaginaBuscar), con el mismo criterio que utils/anios.js en su momento:
 * primero el uso, después la abstracción.
 */
export function formatearLista(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, y ${items[items.length - 1]}`;
}
