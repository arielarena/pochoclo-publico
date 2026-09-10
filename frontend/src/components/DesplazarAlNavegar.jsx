import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Cuánto se espera, como mucho, a que el destino de un fragmento aparezca en
 * el documento. Es el tiempo que puede tardar en llegar el chunk de la
 * pantalla en una conexión mala; pasado eso se deja de escuchar y la página
 * se queda donde esté, que es lo que hacía antes de existir la espera.
 */
const ESPERA_MAXIMA_DESTINO = 5000;

/**
 * Deja el destino de un fragmento a la vista y con el foco puesto. Está aparte
 * porque se llama desde dos momentos distintos: cuando el destino ya estaba en
 * el documento, y cuando apareció mientras se lo esperaba. El porqué de cada
 * una de sus tres líneas está en el bloque de abajo.
 */
function desplazarAlDestino(destino, mismaPantalla) {
  destino.scrollIntoView({ behavior: mismaPantalla ? 'auto' : 'instant', block: 'start' });

  if (!destino.hasAttribute('tabindex')) destino.setAttribute('tabindex', '-1');
  destino.focus({ preventScroll: true });
}

/**
 * Va al destino de un fragmento, esperándolo si todavía no está en el
 * documento. Devuelve la función que deja de esperar, para la limpieza del
 * efecto que lo llame (o `undefined` si no hubo nada que esperar).
 */
function irAlFragmento(hash, { mismaPantalla, arribaMientrasEspera = false }) {
  const id = decodeURIComponent(hash.slice(1));

  const destino = document.getElementById(id);
  if (destino) {
    desplazarAlDestino(destino, mismaPantalla);
    return undefined;
  }

  /**
   * Todavía no está en el documento: la pantalla se está cargando. En una
   * navegación conviene dejar la página arriba mientras tanto, que es donde
   * arranca cualquier pantalla nueva; en la carga inicial no, porque ahí la
   * posición la restaura el navegador y no hay que pisarla.
   */
  if (arribaMientrasEspera) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

  let reloj = 0;
  const observador = new MutationObserver(() => {
    const aparecido = document.getElementById(id);
    if (!aparecido) return;
    dejarDeEsperar();
    desplazarAlDestino(aparecido, mismaPantalla);
  });

  function dejarDeEsperar() {
    clearTimeout(reloj);
    observador.disconnect();
  }

  observador.observe(document.body, { childList: true, subtree: true });
  reloj = setTimeout(dejarDeEsperar, ESPERA_MAXIMA_DESTINO);
  return dejarDeEsperar;
}

/**
 * Lleva la página arriba de todo al cambiar de ruta, o a la sección indicada
 * si la dirección trae un fragmento.
 *
 * POR QUÉ HACE FALTA: React Router no desplaza nada al navegar. El navegador
 * tampoco, porque no hay una carga de documento nueva: solo se reemplaza el
 * contenido. O sea que entrando a una ficha desde el fondo de una grilla
 * larga, la ficha aparece empezada por la mitad. Lo reportó la auditoría del
 * 2026-08-26 y no es un problema solo de accesibilidad: le pasa a cualquiera.
 *
 * CUATRO DECISIONES QUE SE VEN ARBITRARIAS SI NO SE SABE POR QUÉ:
 *
 *  - **Solo en PUSH y REPLACE, nunca en POP.** POP es el botón "atrás" del
 *    navegador, y ahí lo correcto es volver a donde estabas, no al principio.
 *    El navegador ya restaura esa posición solo; forzar el desplazamiento la
 *    pisaría, que es el defecto clásico de los ScrollToTop escritos de apuro.
 *
 *    OJO CON UNA TRAMPA: en la carga inicial `useNavigationType()` también
 *    devuelve POP, así que este efecto no la toca. De la dirección con la que
 *    se entró se ocupa el otro efecto, el de montaje; ver su comentario, que
 *    explica por qué no se puede resolver con una marca de "es la primera
 *    vez" adentro de este.
 *
 *  - **Depende del `pathname` y del `hash`, no de la `location` entera.** Eso
 *    deja afuera a propósito el caso de "Traer más resultados", que no navega:
 *    suma títulos a la misma ruta, y mandar arriba ahí le haría perder el
 *    lugar a quien estaba leyendo la grilla, que es justo lo contrario de lo
 *    que quiere. Esto último lo pidió explícitamente la auditoría.
 *
 *    El `hash` entró el 2026-08-27, y tapa un fallo silencioso: el "Donar" del
 *    pie es un <Link to="/acerca-de#donaciones">, o sea una navegación del
 *    router, y el router no desplaza a ningún fragmento. La dirección quedaba
 *    con el `#donaciones` puesto y la página arrancaba de arriba, así que el
 *    enlace parecía llevar a "Acerca de" a secas. Ojo con la diferencia: los
 *    enlaces internos de /privacidad son <a href="#..."> pelados, o sea
 *    navegación de fragmento nativa del navegador, que sí desplaza sola y no
 *    pasa por acá (ver el comentario de EnlaceSeccion en esa página).
 *
 *  - **SE ESPERA AL DESTINO SI TODAVÍA NO ESTÁ EN EL DOCUMENTO** (2026-09-05).
 *    Este efecto corre cuando React ya committeó, pero con las pantallas
 *    lazy-cargadas (App.jsx, 2026-09-01) lo montado en ese momento puede ser
 *    el fallback de Suspense: el chunk de /acerca-de todavía viene en camino y
 *    #donaciones no existe. Antes eso caía en el scrollTo(0) y NO REINTENTABA,
 *    porque las dependencias del efecto son pathname/hash/tipo y ninguna de
 *    las tres cambia cuando el chunk termina de llegar. O sea que el lazy
 *    loading reintrodujo, por otro lado, el mismo fallo que el `hash` había
 *    venido a tapar: el enlace parecía llevar a "Acerca de" a secas.
 *
 *    Lo tapa un MutationObserver acotado, y no un temporizador que reintente:
 *    el observador dispara en cuanto el chunk monta su DOM, así que no hay ni
 *    un cuadro de retraso ni frames quemados preguntando. El tope de tiempo
 *    está para que un fragmento que no existe (una dirección mal escrita) no
 *    deje un observador escuchando para siempre.
 *
 *  - **`behavior: 'instant'` al cambiar de ruta, `'auto'` dentro de la misma.**
 *    Una ruta nueva no es un movimiento dentro de la misma pantalla, así que
 *    animarlo no comunica nada y además sería movimiento no pedido, en contra
 *    de lo que respeta el resto de la app (ver utils/movimiento.js). Pero
 *    quedándose en la misma pantalla sí lo es: el "Donar" del pie estando ya
 *    en /acerca-de es el mismo gesto que un enlace interno de /privacidad, y
 *    tiene que verse igual. De ahí que se compare el `pathname` con el de la
 *    navegación anterior.
 *
 *    `'auto'` no quiere decir "que decida el navegador": quiere decir "seguí
 *    el `scroll-behavior` del CSS", que index.css pone en `smooth` y apaga con
 *    `prefers-reduced-motion`. O sea que delegando acá, el respeto por quien
 *    pidió menos movimiento sale de un solo lugar y no hay que consultar
 *    `prefiereMenosMovimiento()` a mano.
 *
 * EL FOCO SE MUEVE CON EL DESPLAZAMIENTO, y no es un extra: una navegación de
 * fragmento nativa corre el punto de partida del tabulador hasta el destino,
 * y desplazar a mano no. Sin esto, quien llega a Donaciones con teclado o con
 * lector de pantalla sigue parado en el enlace del pie: la pantalla se movió y
 * para él no cambió nada. El `tabIndex` se pone solo si hace falta, porque una
 * <section> no es enfocable, y `preventScroll` evita que el foco vuelva a
 * desplazar lo que ya se desplazó (el `scroll-margin-top` del destino es lo
 * que lo deja debajo del encabezado pegajoso, y un segundo desplazamiento lo
 * ignoraría).
 */
export default function DesplazarAlNavegar() {
  const { pathname, hash } = useLocation();
  const tipo = useNavigationType();
  /**
   * La ruta de la navegación anterior, para saber si esto es un salto dentro
   * de la misma pantalla o una pantalla nueva. Se actualiza siempre, incluso
   * en POP, o si no la comparación quedaría vieja después de un "atrás".
   */
  const rutaAnterior = useRef(null);
  /**
   * El fragmento de la dirección con la que se entró, congelado en el primer
   * render: el efecto (1) corre una sola vez y no tiene que ver los cambios
   * posteriores, de los que ya se ocupa el (2).
   */
  const hashInicial = useRef(hash);

  /**
   * 1) LA DIRECCIÓN CON LA QUE SE ENTRÓ AL SITIO, si trae fragmento.
   *
   * Va en un efecto aparte y no adentro del de abajo porque en la carga
   * inicial `useNavigationType()` devuelve POP, igual que un "atrás" de
   * verdad, y ahí el efecto de abajo corta a propósito. Distinguir los dos
   * casos desde ese efecto no se puede hacer sin trampas: cualquier marca de
   * "es la primera vez" se consume en la primera corrida, y con StrictMode
   * los efectos corren dos veces en desarrollo, así que la segunda vería la
   * marca ya gastada y el enlace andaría en producción y no en desarrollo.
   * Este efecto, en cambio, es idempotente: correrlo dos veces desplaza dos
   * veces al mismo lugar.
   */
  useEffect(() => {
    if (!hashInicial.current) return undefined;
    /**
     * No es un movimiento dentro de una pantalla que ya se estaba mirando,
     * así que va instantáneo.
     */
    return irAlFragmento(hashInicial.current, { mismaPantalla: false });
  }, []);

  // 2) LAS NAVEGACIONES POSTERIORES.
  useEffect(() => {
    const anterior = rutaAnterior.current;
    rutaAnterior.current = pathname;

    if (tipo === 'POP') return undefined;

    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      return undefined;
    }

    /**
     * Lo devuelto es la limpieza: navegando de nuevo antes de que el destino
     * aparezca, se deja de esperar. Si no, el destino de la navegación vieja
     * podría montarse después y robarle el desplazamiento a la nueva.
     */
    return irAlFragmento(hash, {
      mismaPantalla: anterior === pathname,
      arribaMientrasEspera: true,
    });
  }, [pathname, hash, tipo]);

  return null;
}
