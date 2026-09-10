/**
 * Pantalla de error, compartida por todos los errores que dejan al usuario
 * sin nada que mirar: la dirección que no existe (404), la ficha de un
 * título que TMDb ya no tiene, y el fallo de render que atrapa
 * `components/LimiteDeError.jsx`.
 *
 * Es una sola pantalla y no una por código a propósito: lo que cambia entre
 * un 404 y un "se rompió algo" es el texto y a dónde ofrecemos ir, no el
 * layout. Tener una sola evita lo que ya pasó con los estados vacíos, que
 * llegaron a ser seis textos con tres estilos distintos (ver EstadoVacio).
 *
 * REGLA QUE HEREDA DE `EstadoVacio`: una pantalla de error SIEMPRE ofrece una
 * salida. Un callejón sin salida es peor que un mensaje feo, porque el
 * usuario ve que no hay nada y no sabe si la culpa es suya, del enlace o de
 * la app.
 */
import { Link } from 'react-router-dom';

/**
 * Ilustración por tipo de error. Los archivos viven en
 * `frontend/public/img/`, así que se sirven tal cual, sin pasar por el
 * empaquetado.
 *
 * Van con `alt=""` en el render: no dicen nada que el título y el mensaje no
 * digan ya, y describirlas obligaría a un lector de pantalla a escuchar el
 * dibujo antes de enterarse de qué pasó.
 *
 * Si alguna vez se reemplazan, lo que tienen que respetar: fondo
 * transparente, lado mayor de unos 640px, y leerse sobre el fondo noche
 * (#150e1b). El `404` es un balde de pochoclo volcado con los granos
 * desparramados; el `roto`, una cinta de película cortada.
 */
export const ILUSTRACIONES = {
  404: '/img/error-404.png',
  roto: '/img/error-roto.png',
};

/**
 * @param {object} props
 * @param {string} [props.codigo]   El número del error ("404"). Se muestra
 *   grande y decorativo; el lector de pantalla lo recibe una sola vez, desde
 *   el encabezado, para no oírlo dos veces seguidas.
 * @param {string} props.titulo     Qué pasó, en una frase.
 * @param {string} [props.mensaje]  Por qué pasó y qué se puede hacer.
 * @param {'404'|'roto'} [props.ilustracion]
 * @param {React.ReactNode} [props.acciones] Las salidas. Si no se pasa
 *   ninguna, queda la de ir al inicio, que sirve siempre.
 */
export default function PaginaError({
  codigo,
  titulo,
  mensaje,
  ilustracion = 'roto',
  acciones,
}) {
  /**
   * El respaldo cubre que llegue un tipo de error que todavía no tiene
   * ilustración propia: mejor la genérica que un hueco en la pantalla.
   */
  const imagen = ILUSTRACIONES[ilustracion] ?? ILUSTRACIONES.roto;

  return (
    <main id="contenido" className="resplandor pagina-medio">
      <div className="flex flex-col items-center py-8 text-center sm:py-14">
        <img src={imagen} alt="" className="h-28 w-auto sm:h-36" />

        {codigo && (
          <p aria-hidden="true" className="mt-6 font-display text-5xl font-bold text-manteca sm:text-6xl">
            {codigo}
          </p>
        )}

        <h1 className="titulo-pagina mt-3">
          {codigo && <span className="solo-lector">Error {codigo}. </span>}
          {titulo}
        </h1>

        {mensaje && <p className="bajada mt-3">{mensaje}</p>}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {acciones ?? (
            <Link to="/" className="boton-primario">
              Ir al inicio
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
