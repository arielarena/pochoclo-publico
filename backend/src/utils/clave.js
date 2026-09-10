/**
 * La identidad de un título dentro de la app.
 *
 * Un `tmdb_id` NO alcanza por sí solo: TMDb numera películas y series por
 * separado, así que el id 1399 es una película y también una serie distinta.
 * Todo lo que dedupea, cruza listas o restaura un orden (el motor, las
 * divisiones por prioridad, el cruce de Visto, el orden de las listas) usa
 * esta pareja como clave, y la usaba escribiendo la misma plantilla a mano en
 * cada archivo.
 *
 * Vive en utils/ y no en logic/ porque no decide nada: es la forma de nombrar
 * un título, no una regla del Definitivo.
 */
export const claveDe = (candidato) => `${candidato.tipo}:${candidato.tmdb_id}`;
