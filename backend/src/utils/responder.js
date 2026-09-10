/**
 * Respuesta de error única para todas las rutas.
 *
 * QUÉ ARREGLA: hasta ahora las 17 rutas contestaban
 * `res.status(500).json({ error: err.message })`, o sea que le mandaban al
 * navegador el mensaje interno tal cual. Eso no es peligroso por sí solo,
 * pero es información que el visitante no necesita y que a nosotros no nos
 * conviene publicar: un error de Postgres nombra la tabla y la columna que
 * falló, y uno de `fetch` nombra el servicio del que dependemos y a veces la
 * URL. Es material gratis para alguien que esté mirando cómo está hecho esto
 * por dentro.
 *
 * Se verificó que el token de TMDb NO viaja en ninguna de esas URLs (va como
 * encabezado `Authorization`, ver services/tmdb.js), así que esto no está
 * tapando una fuga de credenciales. Es no dar detalle de más.
 *
 * EL DETALLE NO SE PIERDE: sigue yendo entero a la consola del servidor, que
 * es donde se lo mira cuando algo falla. Lo único que cambia es que el
 * cliente recibe una frase fija.
 *
 * OJO CON LO QUE **NO** PASA POR ACÁ: los 400 de validación siguen
 * contestando su mensaje propio, y tienen que seguir haciéndolo. "Se pueden
 * elegir hasta 5 géneros favoritos" es una instrucción para el usuario, no
 * una filtración; sin ese texto el formulario no puede explicar qué corregir.
 * La diferencia es que esos mensajes los escribimos nosotros a propósito, y
 * los de acá los escribe una librería sin saber quién los va a leer.
 */

import { resumenDeError } from './resumenDeError.js';

const MENSAJE_GENERICO = 'Algo falló de nuestro lado. Probá de nuevo en un momento.';

/**
 * @param {import('express').Response} res
 * @param {unknown} err       El error atrapado.
 * @param {string} [contexto] Qué se estaba haciendo, para el log del servidor.
 */
export function responderError(res, err, contexto = '') {
  /**
   * Del error se registra un resumen y no el objeto entero: los de `pg`
   * traen campos que pueden llevar valores de la fila que falló (una
   * violación de unicidad al registrarse deja el correo del usuario en
   * `err.detail`). Ver utils/resumenDeError.js.
   */
  console.error(contexto ? `[${contexto}]` : '[error]', resumenDeError(err));

  /**
   * Si ya se empezó a mandar la respuesta no se puede cambiar el código de
   * estado; forzarlo tira un segundo error arriba del primero.
   */
  if (res.headersSent) return;

  res.status(500).json({ error: MENSAJE_GENERICO });
}
