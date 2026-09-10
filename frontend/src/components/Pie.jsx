import { Link } from 'react-router-dom';
import { ENLACE_DONACION, TAGLINE } from '../config/sitio.js';

const clasesEnlace = 'underline-offset-4 transition hover:text-crema hover:underline';

/**
 * El pie tiene forma de puñado de pochoclo: su borde superior no es un borde
 * sino una silueta de grumos, hecha con una máscara CSS de 8 capas (ver
 * `pie-pochoclo` en index.css). Por eso acá NO va ningún `border-t`: la
 * máscara lo recortaría junto con el resto y quedaría a rayas.
 *
 * El fondo pasa a `superficie`, que es lo que hace que la silueta se vea
 * contra el `noche` de la página. El texto en crema/60 sobre superficie mide
 * 6.06:1, así que la legibilidad no sufre por el cambio de fondo.
 *
 * Ojo: enmascarar crea contexto de apilamiento y bloque contenedor, así que
 * nada con `position: fixed` puede vivir adentro de este footer.
 *
 * ATRIBUCIÓN A TMDb: el logo NO es decorativo ni opcional. Las condiciones de
 * uso de su API dicen textualmente "You shall use the TMDB logo to identify
 * your use of the TMDB APIs" y exigen mostrar el aviso de que el producto no
 * está respaldado ni certificado por ellos. Tres reglas que hay que respetar
 * si se toca esta parte:
 *
 *  - El logo tiene que ser MENOS prominente que la marca propia. Por eso el
 *    isotipo de Pochoclo va a 40px y el de TMDb a 16px de alto.
 *  - No se puede modificar el color, la proporción, ni rotarlo o espejarlo.
 *    Por eso es el SVG oficial sin tocar (public/tmdb.svg, bajado de
 *    themoviedb.org) y no una versión redibujada.
 *  - El aviso va acá y también en "Acerca de", que es la sección de créditos
 *    donde ellos piden que esté.
 */
export default function Pie() {
  return (
    <footer className="pie-pochoclo mt-24">
      <div className="franja-ancho flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col items-center gap-4 text-center sm:items-start sm:text-left">
          <div className="flex items-center gap-4">
            {/* 48px contra los 16 del logo de TMDb: tres veces más alto. Es
                lo que pide su licencia, que el logo de ellos quede menos
                prominente que la marca propia de la aplicación. */}
            <img
              src="/isotipo.png"
              alt="Pochoclo"
              width="48"
              height="48"
              className="h-12 w-12 object-contain"
            />
            <span aria-hidden="true" className="h-8 w-px bg-linea" />
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noreferrer"
              className="transition hover:opacity-80"
            >
              <img
                src="/tmdb.svg"
                alt="The Movie Database"
                className="h-4 w-auto"
                width="123"
                height="16"
              />
            </a>
          </div>
          {/* El eslogan, con el mismo tratamiento que en el imagotipo: Inter
              itálica en manteca. Sale de la sección 22 del Definitivo, que
              define esa fuente y ese color como los del "texto alternativo"
              de la marca, y el Definitivo le gana a la regla de las notas de decisiones del proyecto de
              que la itálica va solo en la fuente de títulos.

              La itálica es REAL, no sintética: para eso se bajó
              inter-latin-italic.woff2 (ver src/fuentes.css). Sin ese archivo
              el navegador inclina la recta y se ve peor, sin avisar nadie.

              El manteca acá no contradice la regla de reservar el dorado para
              lo accionable: el eslogan es parte del bloque de marca, va pegado
              al isotipo naranja, y los enlaces del pie son crema/60, así que
              no hay dos cosas doradas compitiendo. Mide 7.94:1 sobre
              superficie, muy por encima de AA.

              Lo que NO puede hacer es parecerse al `text-sm text-crema/60` de
              acá abajo, que es el tratamiento de la letra chica y lo comparten
              el aviso de TMDb y el <nav> legal.

              Sumar marca propia no entra en conflicto con la licencia de TMDb;
              al contrario, refuerza lo que ella pide (que su logo quede menos
              prominente que el nuestro). */}
          <p className="text-base italic text-manteca">{TAGLINE}</p>
          <p className="max-w-sm text-sm text-crema/60">
            Este producto usa la API de TMDb, pero no está respaldado ni certificado por TMDb.
          </p>
        </div>

        <nav
          aria-label="Legal"
          className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-crema/60 sm:justify-end"
        >
          <Link to="/acerca-de" className={clasesEnlace}>
            Acerca de
          </Link>
          {/* Sección 20: el enlace de donaciones convive con la sección más
              detallada de "Acerca de", y apunta ahí para que se explique
              antes de pedir. Si todavía no hay medio de pago configurado,
              no se muestra. */}
          {ENLACE_DONACION && (
            <Link to="/acerca-de#donaciones" className={clasesEnlace}>
              Donar
            </Link>
          )}
          {/* Los Términos se aceptan por uso, no con un cartel al entrar (ver
              el comentario de PaginaTerminos). Este enlace, que está en todas
              las pantallas, es lo que los hace disponibles desde cualquier
              punto del sitio. Va antes que Privacidad porque es el documento
              que enmarca al otro. */}
          <Link to="/terminos" className={clasesEnlace}>
            Términos
          </Link>
          <Link to="/privacidad" className={clasesEnlace}>
            Privacidad
          </Link>
          <Link to="/accesibilidad" className={clasesEnlace}>
            Accesibilidad
          </Link>
        </nav>
      </div>
    </footer>
  );
}
