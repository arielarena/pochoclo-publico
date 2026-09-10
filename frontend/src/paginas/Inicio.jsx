import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LightRays from '../components/efectos/LightRays.jsx';
import ModalTipoBusqueda from '../components/ModalTipoBusqueda.jsx';
import useMetadatos from '../utils/useMetadatos.js';
import { obtenerNoSeQueVer } from '../api/cliente.js';
import { precalentarUnaVez } from '../utils/precalentar.js';

/**
 * Precalienta "No sé qué ver" apenas se monta Inicio, antes de que el
 * usuario haya elegido nada — es la única de las 5 opciones con un destino
 * fijo y determinado (siempre los mismos `flujo`/`parametros`), así que no
 * hay nada que adivinar. Dispara el mismo par de pedidos que
 * `PaginaResultados` haría al llegar ahí (el adelanto solo-Populares y el
 * completo, ver 4.10): gracias a la caché corta de
 * `obtenerNoSeQueVer` (api/cliente.js), si el usuario efectivamente elige
 * esa opción unos segundos después, esos pedidos ya están en camino o
 * resueltos, y no se disparan de nuevo.
 *
 * `precalentarUnaVez` (utils/precalentar.js) es la guarda contra "actualizar
 * la página constantemente": usa `sessionStorage`, que sobrevive a un F5, así
 * que esto dispara como mucho una vez por pestaña. Es cortesía con el
 * backend/TMDb, no la barrera de seguridad real — ver el comentario de ese
 * archivo para la razón completa.
 */
function precalentarNoSeQueVer() {
  precalentarUnaVez('no-se-que-ver', () => {
    /**
     * Fire-and-forget: un fallo acá no tiene que afectar en nada a Inicio, y
     * si la búsqueda real llega a fallar más tarde, PaginaResultados la va a
     * reintentar por su cuenta con su propio manejo de error.
     */
    obtenerNoSeQueVer({ soloRapido: true }).catch(() => {});
    obtenerNoSeQueVer({}).catch(() => {});
  });
}

/**
 * Las cinco opciones de búsqueda de la sección 5 del Definitivo, en el
 * mismo orden. Opción 1 ("No sé qué ver") no tiene formulario propio, va
 * directo a /resultados. Opción 2 ("Con preferencias") no tiene
 * sub-opciones, así que el modal Simple/Detallada aparece acá mismo,
 * antes de cambiar de ruta. Opciones 3, 4 y 5 llevan a su propia pantalla
 * para elegir la sub-opción primero.
 *
 * Los iconos son SVG inline, con el mismo criterio que los de /tipo y
 * /quien-esta-viendo: cinco formas simples que heredan el color del texto y
 * no suman un pedido de red. Van con aria-hidden porque la etiqueta de al
 * lado ya dice lo mismo.
 *
 * Antes las cinco opciones eran texto pelado, lo que las hacía cinco párrafos
 * iguales en una lista: nada distinguía una de otra hasta leerlas. Además era
 * la única de las tres pantallas de elección sin iconos.
 */
const OPCIONES = [
  {
    tipo: 'link',
    to: '/resultados',
    state: { flujo: 'no-se-que-ver', parametros: {}, origen: { ruta: '/' } },
    etiqueta: 'No sé qué ver',
    descripcion: 'Elegimos por vos, entre lo más popular ahora.',
    // Dados: azar
    icono: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" />
      </>
    ),
  },
  {
    tipo: 'modal',
    etiqueta: 'Con preferencias',
    descripcion: 'Tipo, género, actores, país, idioma y más.',
    // Perillas de ajuste
    icono: (
      <>
        <path d="M5 21v-7M5 10V3M12 21v-11M12 6V3M19 21v-4M19 13V3" />
        <path d="M2.5 14h5M9.5 10h5M16.5 17h5" />
      </>
    ),
  },
  {
    tipo: 'link',
    to: '/tipo',
    etiqueta: 'Por tipo',
    descripcion: 'Película, miniserie, serie o cualquier cosa.',
    // Claqueta
    icono: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 5v14M17 5v14M3 9.7h4M3 14.3h4M17 9.7h4M17 14.3h4" />
      </>
    ),
  },
  {
    tipo: 'link',
    to: '/estado-animo',
    etiqueta: 'Por estado de ánimo',
    descripcion: 'Según cómo estás hoy.',
    // Cara
    icono: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      </>
    ),
  },
  {
    tipo: 'link',
    to: '/quien-esta-viendo',
    etiqueta: '¿Quién está viendo?',
    descripcion: 'Solo, en pareja, con amigos, o en familia.',
    // Dos personas
    icono: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
        <path d="M16 5.2a3.2 3.2 0 0 1 0 5.9M17.5 14.6a5.5 5.5 0 0 1 3 4.9" />
      </>
    ),
  },
];

/** Los cinco accesos comparten forma; solo cambia si son <button> o <Link>. */
function ContenidoOpcion({ opcion }) {
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative h-7 w-7 shrink-0 text-manteca"
      >
        {opcion.icono}
      </svg>
      <span className="relative">
        <span className="titulo-bloque block">{opcion.etiqueta}</span>
        <span className="mt-0.5 block text-sm text-crema/60">{opcion.descripcion}</span>
      </span>
    </>
  );
}

export default function Inicio() {
  useMetadatos('inicio');

  const [modalAbierto, setModalAbierto] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    precalentarNoSeQueVer();
  }, []);

  function elegirModoPreferencias(valor) {
    setModalAbierto(false);
    navigate('/buscar', { state: { modo: valor } });
  }

  /**
   * `isolate` en <main> no es decorativo: sin él el fondo de rayos no se ve.
   * El contenedor de los rayos usa -z-10 para quedar detrás del contenido, y
   * si <main> no crea su propio contexto de apilamiento ese -10 se resuelve
   * contra <body>. Ahí pierde: el orden de pintado de CSS dibuja los hijos
   * con z-index negativo ANTES que los fondos de los bloques estáticos en
   * flujo, y el contenedor raíz de App.jsx tiene un bg-noche opaco que lo
   * tapaba entero. Con `isolate`, el -10 se resuelve dentro de <main>, que no
   * tiene fondo propio.
   *
   * El `w-screen` centrado a mano es para que los rayos crucen la pantalla y
   * no solo la columna de 42rem del contenido: un haz de luz que arranca y
   * termina en el borde invisible de un contenedor se lee como un recuadro,
   * no como luz. (El recorte del sobrante lo hace el `overflow-x-clip` del
   * contenedor raíz en App.jsx; sin eso, 100vw genera scroll horizontal.)
   *
   * La MÁSCARA no es decorativa, tapa un defecto del shader: el efecto atenúa
   * el color hacia abajo pero no el alfa, así que en el borde inferior del
   * canvas queda un velo oscuro que corta de golpe y se ve como una línea
   * divisoria cruzando la pantalla. La máscara lo apaga de a poco. Se
   * resuelve acá y no adentro del shader porque LightRays.jsx es código
   * adaptado de reactbits y conviene poder actualizarlo sin perder parches.
   */
  return (
    <main id="contenido" className="pagina-lectura relative isolate">
      <div
        className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[34rem] w-screen -translate-x-1/2"
        style={{
          maskImage: 'linear-gradient(to bottom, black 45%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 45%, transparent 100%)',
        }}
      >
        {/*
          Todos los valores del efecto se cambian acá. Los que no se pasan
          quedan en el default de la firma de LightRays.jsx (raysOrigin,
          pulsating, noiseAmount, distortion). Ver la tabla de props en
          frontend/README.md.

          Los haces quedan quietos. Con el seguimiento encendido, mover el
          mouse desplazaba el foco de luz, que llamaba la atención hacia el
          fondo en vez de hacia las opciones. Van las dos props juntas y no
          solo followMouse: el shader mezcla la dirección con la posición del
          mouse siempre que mouseInfluence sea mayor a cero, así que con
          followMouse en false y mouseInfluence en su default los rayos
          quedarían torcidos de forma permanente hacia el centro.
        */}
        <LightRays
          raysOrigin="top-center"
          raysColor="#f2a317"
          raysSpeed={0.7}
          lightSpread={0.65}
          rayLength={1.8}
          fadeDistance={1.1}
          saturation={0.9}
          followMouse={false}
          mouseInfluence={0}
        />
      </div>

      <section className="mb-12 text-center">
        <h1 className="titulo-hero">¿Qué vemos esta noche?</h1>
        <p className="bajada mx-auto mt-4 text-center">Elegí cómo querés buscar.</p>
      </section>

      <nav aria-label="Opciones de búsqueda" className="flex flex-col gap-3">
        {OPCIONES.map((op) =>
          op.tipo === 'modal' ? (
            <button
              key={op.etiqueta}
              type="button"
              onClick={() => setModalAbierto(true)}
              className="tarjeta group relative flex items-center gap-4 overflow-hidden px-5 py-4 text-left"
            >
              <span aria-hidden="true" className="brillo-tarjeta pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <ContenidoOpcion opcion={op} />
            </button>
          ) : (
            <Link
              key={op.etiqueta}
              to={op.to}
              state={op.state}
              className="tarjeta group relative flex items-center gap-4 overflow-hidden px-5 py-4"
            >
              <span aria-hidden="true" className="brillo-tarjeta pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <ContenidoOpcion opcion={op} />
            </Link>
          )
        )}
      </nav>

      {modalAbierto && (
        <ModalTipoBusqueda
          titulo="¿Simple o detallada?"
          opciones={[
            { valor: 'simple', etiqueta: 'Simple', descripcion: 'Tipo, Parecido a, Género y Complejidad.' },
            { valor: 'detallada', etiqueta: 'Detallada', descripcion: 'Todas las preferencias disponibles.' },
          ]}
          onElegir={elegirModoPreferencias}
          onCerrar={() => setModalAbierto(false)}
        />
      )}
    </main>
  );
}
