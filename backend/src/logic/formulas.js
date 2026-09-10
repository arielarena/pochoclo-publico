const M = 30; // constante de la fórmula Bayesiana (sección 16)

/**
 * Debajo de esta cantidad de votos no hay Puntuación ("no disponible").
 *
 * Se exporta porque define cuál es el catálogo que a la app le importa: el
 * job de agregados calcula `C` sobre los títulos que superan este umbral,
 * y tiene que ser el mismo número que usa la fórmula o `C` estaría
 * promediando títulos que después nunca se puntúan.
 */
export const VOTOS_MINIMOS_PUNTUACION = 10;

/**
 * Fórmula de Puntuación (sección 16). En v1, v y R salen solo de TMDb
 * ("Camino B"): v = vote_count, R = vote_average.
 * Devuelve null si v < VOTOS_MINIMOS_PUNTUACION.
 */
export function puntuacion({ votos, promedio, c }) {
  if (votos == null || votos < VOTOS_MINIMOS_PUNTUACION) return null;
  if (c == null) return null;
  const valor = (votos / (votos + M)) * promedio + (M / (votos + M)) * c;
  return Math.round(valor * 10) / 10; // un decimal
}

/**
 * Fórmula de Popularidad (sección 16).
 */
export function popularidad({ popularity, votos, popularityMax, votosMax }) {
  const partePopularity = popularityMax > 0 ? (popularity ?? 0) / popularityMax : 0;
  const parteVotos = votosMax > 0 ? (votos ?? 0) / votosMax : 0;
  return 0.7 * partePopularity + 0.3 * parteVotos;
}
