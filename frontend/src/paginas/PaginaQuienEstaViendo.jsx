import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ModalTipoBusqueda, {
  OPCIONES_RAPIDA_O_DETALLADA,
  TITULO_RAPIDA_O_DETALLADA,
} from '../components/ModalTipoBusqueda.jsx';
import TarjetaOpcion from '../components/TarjetaOpcion.jsx';
import EnlaceVolver from '../components/EnlaceVolver.jsx';
import useMetadatos from '../utils/useMetadatos.js';
import { obtenerNoSeQueVer, buscar } from '../api/cliente.js';
import { precalentarUnaVez } from '../utils/precalentar.js';

/**
 * Sección 9 del Definitivo. Géneros preseleccionados con los mismos IDs de
 * TMDb que usa el backend (src/data/genres.js): Romance=10749, Terror=27,
 * Comedia=35, Acción=28.
 *
 * La descripción de cada tarjeta dice qué preselección aplica. No es adorno:
 * la etiqueta sola ("En pareja") no deja adivinar que eso va a traer romance
 * y terror, y esa tabla vive en el backend, donde el usuario no la ve. Misma
 * decisión que las pistas de /estado-animo.
 *
 * Los iconos son SVG inline, heredan currentColor y van con aria-hidden
 * porque la etiqueta de al lado ya dice lo mismo. Mismo patrón que /tipo.
 */
const MODOS = [
  {
    clave: 'solo',
    etiqueta: 'Solo',
    descripcion: 'Sin preselección: lo mejor para vos.',
    icono: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      </>
    ),
  },
  {
    clave: 'pareja',
    etiqueta: 'En pareja',
    descripcion: 'Romance y terror, funciona de a dos.',
    icono: (
      <>
        <circle cx="8.5" cy="8" r="3" />
        <circle cx="15.5" cy="8" r="3" />
        <path d="M3 19.5c0-3 2.5-5 5.5-5M21 19.5c0-3-2.5-5-5.5-5" />
      </>
    ),
  },
  {
    clave: 'amigos',
    etiqueta: 'Con amigos',
    descripcion: 'Comedia, terror y acción, para ver en grupo.',
    icono: (
      <>
        <circle cx="7" cy="8.5" r="2.6" />
        <circle cx="17" cy="8.5" r="2.6" />
        <circle cx="12" cy="7" r="2.9" />
        <path d="M2.5 19c0-2.6 2-4.3 4.5-4.3M21.5 19c0-2.6-2-4.3-4.5-4.3M7 19.5c0-3 2.2-5 5-5s5 2 5 5" />
      </>
    ),
  },
  {
    clave: 'familia',
    etiqueta: 'En familia',
    descripcion: 'Comedia o clásicos, y solo títulos ATP.',
    icono: (
      <>
        <circle cx="7.5" cy="7.5" r="2.6" />
        <circle cx="16.5" cy="7.5" r="2.6" />
        <circle cx="12" cy="14.5" r="2.1" />
        <path d="M3 17c0-2.4 2-4 4.5-4M21 17c0-2.4-2-4-4.5-4M8.5 21c0-2 1.5-3.4 3.5-3.4s3.5 1.4 3.5 3.4" />
      </>
    ),
  },
];

const PRESET_POR_MODO = {
  solo: {},
  pareja: { generos: [10749, 27] },
  amigos: { generos: [35, 27, 28] },
  /**
   * "Comedia + Clásicos" (sección 9), con el OR real del campo Género:
   * el motor separa el valor sintético 'CLASICOS' y lo resuelve con sus
   * propias búsquedas (ver especificacionesDeClasicos en el backend).
   */
  familia: { generos: [35, 'CLASICOS'] },
};

export default function PaginaQuienEstaViendo() {
  useMetadatos('quienEstaViendo');

  /**
   * `seleccion` puede venir de vuelta desde /resultados con la flecha de
   * atrás, así que arranca de lo que traiga el state y no siempre en null.
   */
  const [seleccion, setSeleccion] = useState(useLocation().state?.seleccion ?? null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const navigate = useNavigate();

  /**
   * Apenas se abre el modal ya está fija la elección (Solo/Pareja/Amigos/
   * Familia) — el usuario todavía tiene que leer "Rápida/Detallada" y
   * clickear una, así que esa pausa es la que se aprovecha. "Solo" es el
   * mismo flujo que Inicio ("no-se-que-ver"); los otros tres pasan por
   * `buscar()` con el preset de género. Ver 4.13.3.
   */
  function abrirModal() {
    setModalAbierto(true);
    const preset = PRESET_POR_MODO[seleccion];
    precalentarUnaVez(`quien-esta-viendo:${seleccion}`, () => {
      if (seleccion === 'solo') {
        obtenerNoSeQueVer({ soloRapido: true }).catch(() => {});
        obtenerNoSeQueVer({}).catch(() => {});
      } else {
        buscar({ preferencias: preset }).catch(() => {});
      }
    });
  }

  function elegirTipoBusqueda(valor) {
    setModalAbierto(false);
    const preset = PRESET_POR_MODO[seleccion];
    const filtrosIniciales = seleccion === 'familia' ? { limitesEdad: ['ATP'] } : undefined;

    if (valor === 'rapida') {
      if (seleccion === 'solo') {
        navigate('/resultados', {
          state: {
            flujo: 'no-se-que-ver',
            parametros: {},
            soloUno: false,
            origen: { ruta: '/quien-esta-viendo', estado: { seleccion } },
          },
        });
        return;
      }
      navigate('/resultados', {
        state: {
          flujo: 'buscar',
          parametros: { preferencias: preset },
          soloUno: false,
          filtrosIniciales,
          origen: { ruta: '/quien-esta-viendo', estado: { seleccion } },
        },
      });
      return;
    }

    navigate('/buscar', {
      state: { modo: 'detallada', prefill: seleccion === 'solo' ? {} : preset, filtrosIniciales },
    });
  }

  return (
    <main id="contenido" className="resplandor pagina-medio">
      {/* La salida de la pantalla, para quien entró y se arrepintió. Va
          arriba de todo y no al final: si estuviera abajo de las opciones,
          quien quiere salir tendría que pasar por encima de todas ellas. */}
      <div className="mb-6">
        <EnlaceVolver />
      </div>

      <h1 className="titulo-pagina text-center">¿Quién está viendo?</h1>
      <p className="mx-auto mt-2 max-w-md text-center text-crema/60">
        Según con quién estés, la búsqueda arranca distinto.
      </p>

      {/* Mismas medidas que /tipo, que es su pantalla hermana: cuatro
          opciones en dos columnas, y ajustadas para que el contenido
          principal entre sin scroll. */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {MODOS.map((m) => (
          <TarjetaOpcion
            key={m.clave}
            activo={seleccion === m.clave}
            onElegir={() => setSeleccion(m.clave)}
            etiqueta={m.etiqueta}
            pista={m.descripcion}
            icono={m.icono}
            className="min-h-[9.5rem]"
            clasePista="max-w-[16rem]"
          />
        ))}
      </div>

      {seleccion && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={abrirModal}
            className="boton-destacado w-full max-w-xs"
          >
            Continuar
          </button>
        </div>
      )}

      {modalAbierto && (
        <ModalTipoBusqueda
          titulo={TITULO_RAPIDA_O_DETALLADA}
          opciones={OPCIONES_RAPIDA_O_DETALLADA}
          onElegir={elegirTipoBusqueda}
          onCerrar={() => setModalAbierto(false)}
        />
      )}
    </main>
  );
}
