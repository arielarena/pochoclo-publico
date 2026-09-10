/**
 * Qué se guarda de un error cuando se lo registra en el log.
 *
 * POR QUÉ NO SE IMPRIME EL ERROR ENTERO, que es lo que se hacía: los errores
 * de `pg` traen campos extra además del mensaje, y algunos llevan valores de
 * la fila que falló. El caso concreto que lo motivó es una violación de
 * unicidad al registrarse:
 *
 *     err.message = 'duplicate key value violates unique constraint "user_email_key"'
 *     err.detail  = 'Key (email)=(alguien@ejemplo.com) already exists.'
 *
 * O sea que un alta con un correo repetido dejaba **la dirección de un
 * usuario** en el agregador de logs del hosting, que es el lugar del sistema
 * que más gente mira y más tiempo conserva las cosas. Es el mismo criterio
 * que ya seguían el manejador de pedidos inválidos de index.js (que registra
 * `err.type` y no el mensaje) y registroEventos.js (que guarda el id del
 * usuario y nunca su correo).
 *
 * EL DIAGNÓSTICO NO SE PIERDE: el mensaje de `pg` ya nombra la restricción
 * que falló, que es lo que hace falta para arreglarlo. Lo que sobra es el
 * valor de la fila.
 *
 * Los campos que quedan afuera a propósito, todos de `pg`: `detail`, `where`,
 * `internalQuery`, `query`, `parameters`, `table`, `column`, `constraint`,
 * `schema`. Los cuatro primeros pueden contener datos; los otros son nombres
 * del esquema, que tampoco hacen falta en un log porque ya están en el
 * mensaje cuando importan.
 */
export function resumenDeError(err) {
  if (!(err instanceof Error)) {
    /**
     * Alguien tiró algo que no es un Error (un string, un objeto suelto). Se
     * deja constancia del tipo, no del contenido, por el mismo motivo.
     */
    return { nombre: 'NoEsUnError', tipo: typeof err };
  }

  return {
    nombre: err.name,
    codigo: err.code,
    mensaje: err.message,
    pila: err.stack,
  };
}
