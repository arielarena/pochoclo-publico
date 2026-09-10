import { Link, useLocation } from 'react-router-dom';
import { useTerminos } from '../auth/ContextoTerminos.jsx';
import RegionViva from '../components/RegionViva.jsx';

/** Dónde se acepta. Está acá y en App.jsx; si cambia, cambian las dos. */
export const RUTA_ACEPTAR_TERMINOS = '/terminos/aceptar';

/**
 * El pedido de re-aceptación de los Términos, arriba de todas las pantallas.
 *
 * Lo promete el punto 9 de /terminos. Aparece solo si esta persona tiene la
 * aceptación pendiente, o sea casi nunca: la fecha de vigencia se toca solo
 * cuando el cambio le impone algo nuevo a quien ya tiene cuenta.
 *
 * TRES DECISIONES QUE SE VEN ARBITRARIAS SI NO SE SABE POR QUÉ:
 *
 *  1. **No se puede cerrar.** No es un anuncio, es una pregunta que espera
 *     respuesta, y una que se puede hacer desaparecer con una "x" es una que
 *     nadie contesta. La forma de que deje de aparecer es contestarla, en
 *     cualquiera de los dos sentidos: aceptando, o dando de baja la cuenta.
 *  2. **No bloquea nada.** Se puede seguir usando el sitio entero, incluidas
 *     las listas y el perfil. Cortarle el acceso a sus propias listas a quien
 *     todavía no leyó el documento nuevo sería presionarlo para que acepte sin
 *     leer, que es lo contrario de lo que un consentimiento tiene que ser. Y
 *     el propio punto 9 ofrece como salida borrar la cuenta desde el perfil:
 *     bloquear el perfil dejaría esa salida sin puerta.
 *  3. **Es `role="status"` y no `role="alert"`.** Alert interrumpe lo que el
 *     lector de pantalla esté diciendo, y esto no es una urgencia: está desde
 *     que carga la página y va a seguir estando. Status lo anuncia cuando
 *     termina la frase en curso.
 *
 * Se esconde en su propia pantalla, donde repetir el pedido arriba del pedido
 * no agrega nada.
 */
export default function AvisoTerminos() {
  const { pendiente } = useTerminos();
  const { pathname } = useLocation();

  if (!pendiente || pathname === RUTA_ACEPTAR_TERMINOS) return null;

  /**
   * Es un <section> con nombre, y no un <div>, porque va entre el encabezado y
   * el <main>: o sea fuera de todo landmark. axe-core lo marcó (regla
   * "region": todo el contenido de la página tiene que estar dentro de uno), y
   * tiene razón, porque quien navega por landmarks con un lector de pantalla
   * se saltearía este aviso entero sin enterarse de que existe. Un <section>
   * con aria-label ES un landmark; sin el nombre, no.
   */
  return (
    <section aria-label="Aviso sobre los Términos y Condiciones" className="border-b border-linea bg-superficie">
      <div className="franja-ancho flex flex-wrap items-center justify-between gap-3 py-3">
        {/* Ojo con el texto: NO puede decir "para seguir usando tu cuenta" ni
            nada que insinúe que algo está cortado, porque no lo está (ver el
            punto 2 de arriba). Un aviso que amenaza con una consecuencia que
            no existe es una forma de apurar una aceptación. */}
        <RegionViva rol="status"  className="text-sm text-crema/80">
          Actualizamos los Términos y Condiciones. Te pedimos que los leas y nos digas si los aceptás.
        </RegionViva>
        <Link to={RUTA_ACEPTAR_TERMINOS} className="boton-primario shrink-0 px-4 py-2 text-sm">
          Ver qué cambió
        </Link>
      </div>
    </section>
  );
}
