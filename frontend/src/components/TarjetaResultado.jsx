import { Link } from 'react-router-dom';
import { urlPoster } from '../utils/imagenes.js';
import MedallaPuntaje from './MedallaPuntaje.jsx';
import BotonListas from '../listas/BotonListas.jsx';

const ETIQUETA_TIPO = { pelicula: 'Película', miniserie: 'Miniserie', serie: 'Serie' };

/**
 * `accion` reemplaza al botón de listas por otra cosa (lo usan las páginas
 * de lista, donde el botón es un "-" que saca de esa lista puntual y nada
 * más, según la sección 18).
 */
export default function TarjetaResultado({ resultado, destacar = false, accion }) {
  const poster = urlPoster(resultado.poster);

  return (
    /**
     * El contenedor exterior ya NO es el <Link>: el botón de listas es un
     * botón, y un botón dentro de un enlace no es HTML válido ni es usable
     * con teclado o lector de pantalla. Ahora el enlace cubre la tarjeta y
     * el botón vive al lado, superpuesto.
     *
     * Dos detalles que se ven raro si se tocan sin saber por qué:
     *  - `overflow-hidden` bajó al contenedor del póster (que es lo único
     *    que necesita recortarse, por el zoom del hover). Si vuelve acá
     *    arriba, recorta el menú desplegable del botón de listas.
     *  - `hover:z-20` y `focus-within:z-20` levantan la tarjeta sobre sus
     *    vecinas, porque si no el menú abierto queda tapado por la tarjeta
     *    siguiente de la grilla.
     */
    <div
      className={`tarjeta group relative hover:z-20 focus-within:z-20 ${
        destacar ? 'animar-pop' : ''
      }`}
    >
      <Link to={`/titulo/${resultado.tipo}/${resultado.tmdb_id}`} className="block">
        {/* El radio de arriba tiene que ser un pelo menor que el de la
            tarjeta, o el póster asoma por fuera de la esquina redondeada del
            borde. Es la diferencia entre el radio exterior y el interior de
            un borde de 1px. */}
        <div className="aspect-2/3 w-full overflow-hidden rounded-t-[calc(var(--radius-tarjeta)-1px)] bg-crema/5">
          {poster ? (
            <img
              src={poster}
              alt={resultado.titulo}
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-3 text-center font-display text-crema/60 italic">
              Sin imagen
            </div>
          )}
        </div>

        <div className="space-y-1 p-3">
          {/* `flex-wrap` está por un solo caso: a 320px la tarjeta mide 110px
              de ancho útil, y "PELÍCULA" en mayúsculas con tracking más la
              insignia "Clásico" más el gap piden 121, así que la insignia
              quedaba recortada por el `overflow-hidden` del póster. Aparecía
              solo cuando la búsqueda devolvía algún clásico, por eso es
              intermitente entre corridas de la auditoría.

              No afecta a ningún otro tamaño, y eso no es una suposición: una
              fila flexible solo se parte cuando el contenido NO entra, así
              que donde entra el render es idéntico. Por eso se prefirió esto
              a un `max-[359px]:`, que sería adivinar dónde empieza a no
              entrar: el ancho depende del largo de la etiqueta, no del
              viewport, y "MINISERIE" es más larga que "PELÍCULA".

              El gap va separado por eje por el mismo motivo: `gap-x-2` es
              exactamente el `gap-2` que había, y el `gap-y-1` solo existe
              cuando hay una segunda línea, donde 8px separaban de más
              (adentro de la tarjeta el ritmo es el `space-y-1` de 4px). */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tracking-wide text-crema/50 uppercase">
            <span>{ETIQUETA_TIPO[resultado.tipoContenido] ?? resultado.tipoContenido}</span>
            {resultado.es_clasico && (
              <span className="insignia text-[0.65rem] font-semibold tracking-wide text-crema/70 normal-case">
                Clásico
              </span>
            )}
          </div>
          <h3 className="titulo-bloque line-clamp-2 leading-snug">{resultado.titulo}</h3>
          <p className="text-sm text-crema/50">{resultado.anio ?? 'Sin año'}</p>
        </div>
      </Link>

      <div className="absolute top-2 right-2">
        <MedallaPuntaje valor={resultado.puntuacion} />
      </div>

      <div className="absolute top-2 left-2">
        {accion ?? (
          <BotonListas
            item={{ tmdb_id: resultado.tmdb_id, tipo: resultado.tipo, titulo: resultado.titulo }}
          />
        )}
      </div>
    </div>
  );
}
