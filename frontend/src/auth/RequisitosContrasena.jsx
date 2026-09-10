import { evaluarContrasena } from '../utils/contrasena.js';
import RegionViva from '../components/RegionViva.jsx';

/**
 * Lista de requisitos de la contraseña, que se van tildando mientras se
 * escribe. Va debajo del campo, en el alta, en el cambio desde el perfil y en
 * el restablecimiento.
 *
 * POR QUÉ UNA LISTA Y NO UNA BARRA DE "FUERZA": una barra de colores le dice
 * al usuario que algo anda mal pero no qué, así que hay que adivinar. La
 * lista dice exactamente qué falta, y al cumplirse cada punto se ve por qué
 * dejó de faltar. Además, una barra promete una medida de seguridad que en
 * realidad no estamos calculando.
 *
 * MIENTRAS EL CAMPO ESTÁ VACÍO se muestran todos los requisitos en gris, sin
 * cruces rojas: alguien que todavía no escribió nada no se equivocó en nada,
 * y arrancar en rojo es un reto que no se ganó. Es el mismo criterio que ya
 * usa el campo de correo, que no se marca por estar vacío.
 *
 * ACCESIBILIDAD: no hay `aria-live`, a propósito. Un anuncio por tecla
 * mientras se tipea una contraseña es inusable con lector de pantalla. En
 * cambio cada punto lleva su estado escrito en texto (oculto a la vista, con
 * la clase `.solo-lector`), así que quien recorre la lista con el lector
 * escucha "cumplido" o "falta" en cada uno, cuando decide leerla.
 */
export default function RequisitosContrasena({ valor, id }) {
  const { reglas, sinMezcla } = evaluarContrasena(valor);
  const vacio = !valor;

  return (
    <div id={id} className="mt-2">
      <ul className="space-y-1">
      {reglas.map((regla) => {
        const cumplido = !vacio && regla.ok;
        return (
          <li
            key={regla.clave}
            className={`flex items-start gap-2 text-sm ${cumplido ? 'text-manteca' : 'text-crema/50'}`}
          >
            {/* El símbolo es decorativo: el estado lo dice el texto oculto de
                al lado, así que no hace falta que el lector lea el carácter. */}
            <span aria-hidden="true" className="mt-px leading-5">
              {cumplido ? '✓' : '·'}
            </span>
            <span>
              {regla.etiqueta}
              <span className="solo-lector">{cumplido ? ' (cumplido)' : ' (falta)'}</span>
            </span>
          </li>
        );
      })}
      </ul>

      {/*
        Si no se explicara, la desaparición de tres requisitos al llegar a los
        16 caracteres se leería como un error de la pantalla. Acá sí conviene
        anunciarlo (aria-live) porque es un cambio puntual y no algo que se
        repita en cada tecla: pasa una sola vez, al cruzar el umbral.
      */}
      {sinMezcla && (
        <RegionViva rol="status"  className="mt-2 text-sm text-manteca">
          Es lo bastante larga, así que no hace falta que mezcle números ni símbolos.
        </RegionViva>
      )}
    </div>
  );
}
