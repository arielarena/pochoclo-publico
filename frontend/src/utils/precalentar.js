const PREFIJO = 'pochoclo:precalentado:';

/**
 * Dispara `tarea` como mucho una vez por pestaña para esta `clave`. Ver
 * 4.13.3 para el porqué completo; en una línea: `sessionStorage`
 * sobrevive a un F5 (se borra solo al cerrar la pestaña), así que ni
 * recargar la página ni repetir la misma elección muchas veces dispara el
 * precalentado más de una vez. La `clave` tiene que incluir la elección
 * concreta (`tipo:pelicula`, `estado-animo:llorar`...) y no solo la
 * pantalla: si el usuario cambia de elección, es una búsqueda distinta y
 * tiene que poder precalentarse de nuevo.
 *
 * Esto es cortesía con el backend y con TMDb, no la barrera de seguridad:
 * la protección real contra un uso hostil (o un script que le pega directo
 * a la API sin pasar por acá) es el límite de `limitePedidos` del backend,
 * que no depende de nada de esto.
 */
export function precalentarUnaVez(clave, tarea) {
  const bandera = PREFIJO + clave;
  if (sessionStorage.getItem(bandera)) return;
  sessionStorage.setItem(bandera, '1');
  tarea();
}
