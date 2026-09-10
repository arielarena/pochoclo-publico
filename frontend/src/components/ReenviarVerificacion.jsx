import { useState } from 'react';
import { clienteAuth, mensajeDeError } from '../auth/clienteAuth.js';
import RegionViva from './RegionViva.jsx';

/**
 * El botón para pedir otro correo de confirmación.
 *
 * POR QUÉ HACE FALTA. El enlace de verificación **dura una hora** y se manda
 * una sola vez, al registrarse. Sin esto, quien tardaba más que eso en abrir su
 * casilla quedaba en un callejón sin salida: no podía entrar (con
 * EXIGIR_CORREO_VERIFICADO en true el login contesta EMAIL_NOT_VERIFIED) y no
 * tenía ninguna forma de pedir otro enlace. El único remedio era borrar la
 * cuenta y crearla de nuevo, y eso tampoco lo puede hacer alguien que no puede
 * iniciar sesión.
 *
 * NO HACE FALTA NINGUNA RUTA NUEVA EN EL BACKEND, y conviene saber por qué
 * antes de agregar una: `/send-verification-email` de Better Auth, llamada sin
 * sesión, **ya viene blindada contra enumeración**. Si la dirección no existe o
 * ya está verificada, firma igual un token que descarta, con un piso de 500 ms,
 * y contesta lo mismo en los tres casos. Sin eso, esta pantalla sería un
 * formulario donde se escribe un correo ajeno y el sitio dice si tiene cuenta,
 * que es justo lo que el alta ciega evita (ver 4.16 de las notas de decisiones del proyecto).
 *
 * Y POR ESO EL TEXTO DE ÉXITO ESTÁ REDACTADO ASÍ. De nada sirve que el servidor
 * conteste igual en los tres casos si la pantalla dice "te lo mandamos": eso
 * afirmaría que la cuenta existe. Dice "si esa dirección tiene una cuenta sin
 * confirmar", que además de no delatar nada es la verdad.
 *
 * @param {string} correo A qué dirección reenviar.
 * @param {string} [destino='/'] A dónde llevar a la persona después de que
 *   confirme desde el mail. En ese momento ya queda con la sesión abierta
 *   (`autoSignInAfterVerification`), así que puede ir directo a donde quería.
 */
export default function ReenviarVerificacion({ correo, destino = '/' }) {
  const [estado, setEstado] = useState('inicial');
  const [error, setError] = useState('');

  async function reenviar() {
    setEstado('enviando');
    setError('');

    const { error: fallo } = await clienteAuth.sendVerificationEmail({
      email: correo.trim(),
      /**
       * `destino` es una ruta interna y va prefijada con nuestro propio
       * origen, así que el enlace del correo no puede apuntar afuera.
       */
      callbackURL: `${window.location.origin}${destino}`,
    });

    if (fallo) {
      /**
       * El tope es de 3 por minuto, así que el 429 es el error esperable acá.
       * `mensajeDeError` ya lo traduce.
       */
      setError(mensajeDeError(fallo));
      setEstado('inicial');
      return;
    }

    setEstado('listo');
  }

  if (estado === 'listo') {
    return (
      <RegionViva rol="status" className="text-sm leading-relaxed text-crema/70">
        Listo. Si esa dirección tiene una cuenta sin confirmar, en unos minutos te llega un mensaje nuevo.
        Fijate también en la carpeta de correo no deseado.
      </RegionViva>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={reenviar}
        disabled={estado === 'enviando'}
        className="boton-secundario"
      >
        {estado === 'enviando' ? 'Enviando…' : 'Enviarme otro correo de confirmación'}
      </button>

      {error && (
        <RegionViva rol="alert" className="mensaje-error">
          {error}
        </RegionViva>
      )}
    </div>
  );
}
