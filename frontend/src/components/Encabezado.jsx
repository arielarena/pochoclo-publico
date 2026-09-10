import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSesion } from '../auth/ContextoSesion.jsx';

/**
 * `inline-flex min-h-6 items-center` está por el tamaño del objetivo táctil
 * (WCAG 2.5.8): el texto solo mide 20px de alto y estos enlaces van pegados
 * entre sí cuando hay sesión abierta ("Mis listas" y el nombre, separados por
 * 20px), así que tampoco los salva la excepción de espaciado.
 *
 * Sale gratis en altura: la barra la fija el imagotipo, que mide 40px, así
 * que llevar los enlaces de 20 a 24 no mueve nada de lo que se ve.
 */
const clasesLink = ({ isActive }) =>
  `inline-flex min-h-6 items-center text-sm font-semibold transition ${
    isActive ? 'text-manteca' : 'text-crema/60 hover:text-crema'
  }`;

/**
 * La parte de la sesión es un enlace al perfil, no un menú desplegable:
 * "Cerrar sesión" vive dentro del perfil, así que un desplegable sumaría
 * un widget con manejo de teclado y foco propio para ahorrar un clic. Si
 * la milestone 19 suma varias listas, ahí sí puede convenir agruparlas.
 */
function Sesion() {
  const { usuario, cargando } = useSesion();
  const { pathname } = useLocation();

  /**
   * Mientras se resuelve la sesión no se muestra nada, para no hacer
   * parpadear un "Iniciar sesión" en la cara de alguien que ya está adentro.
   */
  if (cargando) return <span className="w-16" aria-hidden="true" />;

  if (!usuario) {
    return (
      <NavLink to="/iniciar-sesion" className={clasesLink}>
        Iniciar sesión
      </NavLink>
    );
  }

  /**
   * El enlace apunta a /listas/favoritas, pero "Mis listas" representa a
   * toda la sección de cuenta que agrupa NavCuenta: las tres listas, Mis
   * plataformas y Mis gustos. El isActive por omisión de NavLink solo
   * compara contra el destino exacto, así que sin esto el texto se
   * iluminaba en Favoritas y no en el resto.
   */
  const misListasActivo =
    pathname.startsWith('/listas') || pathname === '/mis-plataformas' || pathname === '/mis-gustos';

  return (
    <>
      <NavLink
        to="/listas/favoritas"
        className={() =>
          `inline-flex min-h-6 items-center text-sm font-semibold transition ${
            misListasActivo ? 'text-manteca' : 'text-crema/60 hover:text-crema'
          }`
        }
      >
        Mis listas
      </NavLink>
      <NavLink to="/perfil" className={clasesLink}>
        {usuario.name || 'Mi perfil'}
      </NavLink>
    </>
  );
}

export default function Encabezado() {
  return (
    <>
      {/*
        LA CORTINA (2026-09-02): en iPhone, un `position: sticky` con
        `backdrop-blur` puede dejar un fantasma del contenido que iba
        scrolleando pegado en la franja de arriba del header, superpuesto a la
        barra de estado. Es un defecto de repintado de Safari (verificado en
        el dispositivo real que ni `transform-gpu` ni `will-change-transform`
        lo sacan, ver el comentario del header), no un hueco real en el
        layout.

        En vez de perseguir el bug de composición, se tapa la zona donde
        aparece: este div es un color SÓLIDO (sin blur, así no hereda el
        mismo defecto) `position: fixed` que vive apenas arriba del borde de
        la pantalla, siempre en el mismo lugar sin importar el scroll. El
        fantasma aparece ahí adentro cuando aparece, y como esta franja es
        opaca y se pinta de forma normal (nada de `backdrop-filter`), lo tapa.
      */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 -top-40 z-40 h-40 bg-noche" />
      {/*
        `transform-gpu` + `will-change-transform` (2026-09-02): el mismo
        intento de arreglar el defecto de arriba forzando una capa de
        composición propia. Se deja puesto aunque no haya alcanzado solo
        (verificado en el dispositivo real): no molesta y puede ayudar en
        combinación con la cortina.
      */}
      <header className="sticky top-0 z-40 transform-gpu will-change-transform border-b border-linea bg-noche/85 backdrop-blur-md">
        <div className="franja-ancho flex items-center justify-between py-4">
          {/*
            EL NOMBRE VA EN EL ENLACE Y LA IMAGEN QUEDA DECORATIVA, que es el
            patrón para un enlace cuyo único contenido es una imagen.

            Antes el `alt` era "pochoclo.", una transcripción fiel del imagotipo,
            y como el enlace no tiene texto propio ése terminaba siendo su nombre
            entero: quien lo escucha oye "pochoclo., vínculo" y no se entera de
            que es la vuelta al inicio, que es la única cosa que hace. Con el
            `alt` vacío la imagen deja de anunciarse aparte y no se lee dos veces.
          */}
          <Link to="/" aria-label="Pochoclo, ir al inicio" className="inline-flex h-10 items-center">
            <img
              src="/imagotipo.png"
              alt=""
              className="block h-full w-auto max-w-full object-contain"
            />
          </Link>
          {/*
            El encabezado no lleva accesos a las búsquedas. Las cinco opciones
            viven en el inicio, que es la pantalla que las explica una por una;
            repetirlas acá abreviadas ("Por ánimo", "¿Quién ve?") era un segundo
            menú peor que el primero, y le sacaba lugar a lo único que sí tiene
            que estar siempre a mano: la cuenta.

            Para empezar otra búsqueda se vuelve al inicio con el imagotipo, que
            es el enlace de al lado.
          */}
          <nav aria-label="Cuenta" className="flex flex-wrap gap-5">
            <Sesion />
          </nav>
        </div>
      </header>
    </>
  );
}
