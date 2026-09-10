import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ModalTipoBusqueda, {
  OPCIONES_RAPIDA_O_DETALLADA,
  TITULO_RAPIDA_O_DETALLADA,
} from '../components/ModalTipoBusqueda.jsx';
import TarjetaOpcion from '../components/TarjetaOpcion.jsx';
import EnlaceVolver from '../components/EnlaceVolver.jsx';
import useMetadatos from '../utils/useMetadatos.js';
import { obtenerPorEstadoAnimo } from '../api/cliente.js';
import { precalentarUnaVez } from '../utils/precalentar.js';

/**
 * Claves y orden iguales a data/estadosAnimo.js del backend (sección 5).
 *
 * `pista` dice en una línea qué va a buscar cada opción. No es relleno: la
 * etiqueta sola ("Reflexionar", "Velocidad") no deja adivinar si eso trae
 * documentales o autos, y la tabla de géneros y keywords que hay detrás vive
 * en el backend, donde el usuario no la ve.
 */
const ESTADOS = [
  { clave: 'reirme', etiqueta: 'Reírme', pista: 'Comedia' },
  { clave: 'suspenso', etiqueta: 'Suspenso', pista: 'Thriller y tensión' },
  { clave: 'llorar', etiqueta: 'Llorar', pista: 'Drama que golpea' },
  { clave: 'enamorarme', etiqueta: 'Enamorarme', pista: 'Romance' },
  { clave: 'volarMiMente', etiqueta: 'Que me vuelen la mente', pista: 'Ciencia ficción y misterio' },
  { clave: 'pasarElTiempo', etiqueta: 'Pasar el tiempo', pista: 'Liviano, para relajar' },
  { clave: 'inspirador', etiqueta: 'Algo inspirador', pista: 'Historias reales que levantan' },
  { clave: 'accion', etiqueta: 'Acción', pista: 'Peleas y explosiones' },
  { clave: 'velocidad', etiqueta: 'Velocidad', pista: 'Persecuciones y carreras' },
  { clave: 'reflexionar', etiqueta: 'Reflexionar', pista: 'Documental e historia' },
  { clave: 'asustarme', etiqueta: 'Asustarme', pista: 'Terror' },
];

/**
 * Igual a backend/src/data/estadosAnimo.js, pero acá solo se usa el
 * componente de género para poder precargar el formulario de "Detallada"
 * (los keywords no tienen un campo propio en Preferencias, sección 4/6).
 */
const PREFILL_POR_ESTADO = {
  reirme: { generos: [35] },
  suspenso: { generos: [53] },
  llorar: { generos: [18] },
  enamorarme: { generos: [10749] },
  volarMiMente: { generos: [878, 9648] },
  pasarElTiempo: { complejidad: ['relajar'] },
  inspirador: { generos: [18] },
  accion: { generos: [28] },
  velocidad: { generos: [28] },
  reflexionar: { generos: [99, 36] },
  asustarme: { generos: [27] },
};

export default function PaginaEstadoAnimo() {
  useMetadatos('estadoAnimo');

  /**
   * `seleccion` puede venir de vuelta desde /resultados con la flecha de
   * atrás, así que arranca de lo que traiga el state y no siempre en null.
   */
  const [seleccion, setSeleccion] = useState(useLocation().state?.seleccion ?? null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const navigate = useNavigate();

  /**
   * Apenas se abre el modal ya está fija la elección (una de las 11) — el
   * usuario todavía tiene que leer "Rápida/Detallada" y clickear una, así
   * que esa pausa es la que se aprovecha. Si termina eligiendo "Detallada"
   * el precalentado no se usa, pero no cuesta más que un pedido de más.
   * Ver 4.13.3.
   */
  function abrirModal() {
    setModalAbierto(true);
    precalentarUnaVez(`estado-animo:${seleccion}`, () => {
      obtenerPorEstadoAnimo(seleccion, {}).catch(() => {});
    });
  }

  function elegirTipoBusqueda(valor) {
    setModalAbierto(false);
    if (valor === 'rapida') {
      navigate('/resultados', {
        state: {
          flujo: 'estado-animo',
          parametros: { clave: seleccion },
          soloUno: false,
          origen: { ruta: '/estado-animo', estado: { seleccion } },
        },
      });
      return;
    }
    navigate('/buscar', { state: { modo: 'detallada', prefill: PREFILL_POR_ESTADO[seleccion] } });
  }

  return (
    <main id="contenido" className="resplandor pagina-ancho">
      {/* La salida de la pantalla, para quien entró y se arrepintió. Va
          arriba de todo y no al final: si estuviera abajo de las opciones,
          quien quiere salir tendría que pasar por encima de todas ellas. */}
      <div className="mb-6">
        <EnlaceVolver />
      </div>

      <h1 className="titulo-pagina text-center">¿Cómo estás hoy?</h1>
      <p className="mx-auto mt-2 max-w-md text-center text-crema/60">
        Elegí con qué ganas venís y armamos la búsqueda.
      </p>

      {/* Cuatro columnas en pantallas grandes: con once opciones son tres
          filas, y así el contenido principal entra sin scroll. Con tres
          columnas eran cuatro filas y quedaba la última abajo del pliegue. */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {ESTADOS.map((e) => (
          <TarjetaOpcion
            key={e.clave}
            activo={seleccion === e.clave}
            onElegir={() => setSeleccion(e.clave)}
            etiqueta={e.etiqueta}
            pista={e.pista}
            className="min-h-[7rem] gap-1 px-4 py-5"
            claseEtiqueta="font-display text-lg leading-tight font-bold"
            clasePista="text-xs"
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

