/**
 * Ruta exacta "/terminos". Ver functions/_utils/rutasPublicas.js.
 * OJO: por ser ruta EXACTA no matchea "/terminos/aceptar", que sigue sin
 * tocarse (es correcto: esa ruta no es indexable, ver metadatos.js).
 */
export { onRequestGetRutaPublica as onRequestGet } from './_utils/rutasPublicas.js';
