import { elegirConSuerte } from '../logic/resultados.js';

/**
 * La forma de la respuesta de las cinco rutas de búsqueda.
 *
 * Todas contestan lo mismo salvo por un detalle: con `?conSuerte=true`
 * devuelven `{ resultado }` (un solo título, sorteado entre los 20 mejores por
 * Puntuación) en vez de `{ resultados, total }`. Es la sección 5 del
 * Definitivo, "Me siento con suerte".
 *
 * Vivía como función local de routes/opciones.js mientras esa fue la única
 * ruta con la opción; cuando la ganaron también /buscar, /parecido-a y
 * /opciones/estado-animo, las tres reescribieron el mismo condicional a mano.
 *
 * `bloques` y `hayMas` viajan solo si quien llama los tiene: los bloques son
 * de la búsqueda con formulario vacío y de las divisiones por prioridad, y
 * esas divisiones son lo único que no pagina (cada una es una búsqueda
 * aparte). Las claves en undefined no se serializan, así que la respuesta
 * de cada ruta queda igual que antes.
 */
export function respuestaDeBusqueda(req, { resultados, bloques, hayMas, parecidosEncontrados }) {
  if (req.query.conSuerte === 'true') {
    return { resultado: elegirConSuerte(resultados) };
  }
  return { resultados, total: resultados.length, bloques, hayMas, parecidosEncontrados };
}

/** El usuario puede apagar el límite de edad automático (sección 17). */
export function sinLimiteDeEdad(req) {
  return req.query.sinLimiteDeEdad === 'true';
}

/**
 * Adelanto sin Gustos Registrados ni Favoritas/Visto ponderado (sección 5):
 * solo Populares, que es el único bloque que no depende de nada personal.
 * Lo pide el frontend en paralelo con el pedido completo, para tener algo
 * que mostrar mientras el completo (que puede tardar bastante más si el
 * usuario tiene Favoritas/Visto cargados, ver gustosResultantes() en
 * opciones/formularioVacio.js) sigue en camino.
 */
export function soloRapido(req) {
  return req.query.soloRapido === 'true';
}
