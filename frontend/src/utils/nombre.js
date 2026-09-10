/**
 * Validación del nombre del lado del cliente, antes de molestar al servidor.
 *
 * Existe como archivo propio, y no suelta en cada pantalla, porque el nombre
 * se escribe en DOS lugares: al crear la cuenta y al editar el perfil. Estaba
 * validado a mano en los dos, y en los dos solo se comprobaba que no estuviera
 * vacío, así que **el máximo de largo no se avisaba en ninguno**: se escribían
 * 200 caracteres, se enviaba, y recién ahí el servidor contestaba que no.
 *
 * ES COMODIDAD, NO SEGURIDAD. La validación que de verdad protege es la del
 * servidor (backend/src/auth/validaciones.js), que corre igual aunque acá se
 * borre todo desde las devtools. Esta es para que el mensaje aparezca antes de
 * enviar.
 *
 * El número está duplicado a mano allá, por el mismo motivo que el formato del
 * correo: son dos paquetes separados sin código común. Si se cambia uno,
 * cambiar el otro.
 */
export const LARGO_MAXIMO_NOMBRE = 60;

/** Devuelve el problema del nombre, o null si está bien. */
export function problemaDeNombre(texto) {
  const nombre = (texto ?? '').trim();

  if (!nombre) return 'Escribí un nombre. Puede ser un apodo.';

  if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    return `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE} caracteres.`;
  }

  return null;
}
