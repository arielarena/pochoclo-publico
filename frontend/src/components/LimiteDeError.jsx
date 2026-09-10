/**
 * Límite de error de React ("error boundary"): atrapa el fallo que ocurre
 * MIENTRAS SE DIBUJA una pantalla y muestra la pantalla de error en vez de
 * dejar la app en blanco.
 *
 * Sin esto, un error de render desmonta el árbol entero: el usuario se queda
 * con una página negra y vacía, sin encabezado ni pie, y sin ninguna pista
 * de qué pasó ni de cómo salir. Es el peor modo de fallo posible y es
 * silencioso: solo se ve en la consola.
 *
 * QUÉ NO ATRAPA, que es tan importante como lo que sí: los errores de una
 * promesa (un fetch que falla), los de un manejador de eventos, y los del
 * render en el servidor. Esos los sigue manejando cada pantalla con su
 * propio estado `error`, que es donde se puede reintentar sin recargar.
 *
 * ES UNA CLASE porque React todavía no tiene equivalente con hooks:
 * `getDerivedStateFromError` y `componentDidCatch` solo existen en clases.
 * Es la única clase del proyecto, y no es una elección de estilo.
 *
 * SE REINICIA CAMBIÁNDOLE LA `key`: un límite que ya atrapó se queda en
 * estado de error para siempre, así que App.jsx lo monta con la ruta como
 * key y navegar a otra pantalla lo devuelve a la normalidad solo.
 *
 * DE AHÍ SALE LA ÚNICA RAREZA DE ESTE ARCHIVO: sus dos salidas recargan la
 * página en vez de navegar con el router. Si la key es la ruta, una
 * navegación a la ruta en la que ya estamos no la cambia, así que el límite
 * no se vuelve a montar y el enlace no hace nada. Eso pasa justo en el caso
 * más probable: el error ocurrió en el inicio y la salida ofrecida es ir al
 * inicio. Con una carga entera del documento el estado se tira siempre, sin
 * depender de qué ruta falló.
 */
import { Component } from 'react';
import PaginaError from '../paginas/PaginaError.jsx';

export default class LimiteDeError extends Component {
  state = { fallo: null };

  static getDerivedStateFromError(fallo) {
    return { fallo };
  }

  componentDidCatch(fallo, info) {
    /**
     * El detalle va entero a la consola, que es donde se lo mira cuando algo
     * falla, y no a la pantalla: el mensaje de un error de React nombra
     * componentes y props, que no le sirven a quien está tratando de ver una
     * película. Es el mismo criterio que responderError en el backend.
     */
    console.error('[render]', fallo, info?.componentStack);
  }

  render() {
    if (!this.state.fallo) return this.props.children;

    return (
      <PaginaError
        ilustracion="roto"
        titulo="Se nos cortó la película"
        mensaje="Algo falló de nuestro lado al dibujar esta pantalla. No es culpa tuya y no perdiste ninguna lista: probá de nuevo, o volvé al inicio."
        acciones={
          <>
            {/* Recargar y no un botón que limpie el estado: si el fallo es de
                render, volver a dibujar lo mismo vuelve a fallar. La recarga
                arranca de cero, que es lo único que puede cambiar el
                resultado. */}
            <button type="button" onClick={() => window.location.reload()} className="boton-primario">
              Recargar la página
            </button>
            {/* Un <a> y no un <Link>: ver el comentario de arriba. Con el
                router, este enlace sería un no-op cuando el error ocurrió en
                el propio inicio, que es cuando más se lo necesita. */}
            <a href="/" className="boton-secundario">
              Ir al inicio
            </a>
          </>
        }
      />
    );
  }
}
