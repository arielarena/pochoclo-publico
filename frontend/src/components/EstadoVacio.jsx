import { ILUSTRACIONES } from '../paginas/PaginaError.jsx';

/**
 * Estado vacío con una salida.
 *
 * Antes había seis textos distintos con tres estilos distintos repartidos por
 * la app ("No encontramos nada con estos criterios", "Ningún candidato pasa
 * los filtros", "Todavía no hay nada acá"...), y ninguno ofrecía qué hacer
 * después. Un callejón sin salida es peor que un mensaje feo: el usuario ve
 * que no hay nada pero no sabe si la culpa es suya, del filtro o de la app.
 *
 * `accion` es opcional y va como nodo, no como texto, porque a veces es un
 * botón que dispara algo y a veces un enlace a otra ruta.
 *
 * El icono reusa el balde de pochoclo volcado de `PaginaError` (2026-09-01):
 * antes había una segunda ilustración, un balde vacío dibujado inline, para
 * un caso que no es un error pero cuenta la misma historia ("no hay
 * pochoclo"). Menos opacidad que en la pantalla de error, porque acá es un
 * bloque más chico dentro de una pantalla que sigue teniendo contenido
 * alrededor, no el único elemento de la página.
 */
export default function EstadoVacio({ titulo, pista, accion }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
      <img src={ILUSTRACIONES[404]} alt="" className="h-16 w-auto opacity-40 sm:h-20" />

      <p className="titulo-bloque max-w-sm">{titulo}</p>
      {pista && <p className="max-w-md text-sm text-crema/60">{pista}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}
