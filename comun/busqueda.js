/**
 * Topes de búsqueda que el backend aplica y el frontend respeta de antemano.
 *
 * El frontend los aplica ANTES para que el formulario no deje cargar algo que
 * el backend después recortaría o rechazaría en silencio. Hasta el 2026-09-29
 * estaban copiados a mano en los dos paquetes. Los motivos medidos de cada
 * número siguen escritos en el archivo del backend que lo aplica.
 *
 * TIENE QUE SER JAVASCRIPT PURO: lo importan Node y el navegador.
 */

/**
 * Tope de títulos en "Parecido a". El backend recorta lo que pase
 * (backend/src/opciones/parecidoA.js, donde está la medición). Más de treinta
 * no traen ni un resultado más.
 */
export const MAXIMO_REFERENCIAS = 30;

/**
 * Tope de prioridades simultáneas. Cada una le cuesta al backend una búsqueda
 * entera (backend/src/opciones/prioridades.js).
 */
export const MAXIMO_PRIORIDADES = 4;

/**
 * Largo máximo del texto de los buscadores por título y por persona. El
 * backend contesta 400 si se pasa (backend/src/utils/consulta.js); el campo
 * del frontend no deja escribir más.
 */
export const LARGO_MAXIMO_CONSULTA = 120;
