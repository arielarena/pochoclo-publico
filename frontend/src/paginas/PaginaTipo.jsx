import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BotonSuerte from '../components/BotonSuerte.jsx';
import TarjetaOpcion from '../components/TarjetaOpcion.jsx';
import EnlaceVolver from '../components/EnlaceVolver.jsx';
import useMetadatos from '../utils/useMetadatos.js';
import { obtenerPorTipo } from '../api/cliente.js';
import { precalentarUnaVez } from '../utils/precalentar.js';

/**
 * Los iconos son SVG inline y no una fuente de iconos ni imágenes: son cuatro
 * formas simples, heredan el color del texto (así cambian solos entre el
 * estado normal y el activo) y no suman un pedido de red. Van con
 * aria-hidden porque la etiqueta de al lado ya dice lo mismo.
 */
const OPCIONES = [
  {
    valor: 'pelicula',
    etiqueta: 'Película',
    descripcion: 'Una historia que empieza y termina esta noche.',
    icono: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 5v14M17 5v14M3 9.7h4M3 14.3h4M17 9.7h4M17 14.3h4" />
      </>
    ),
  },
  {
    valor: 'miniserie',
    etiqueta: 'Miniserie',
    descripcion: 'Una temporada, una noche.',
    icono: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M9 10.5v3M12 10.5v3M15 10.5v3" />
      </>
    ),
  },
  {
    valor: 'serie',
    etiqueta: 'Serie',
    descripcion: 'Para engancharse varias temporadas.',
    icono: (
      <>
        <rect x="2.5" y="7.5" width="14" height="11" rx="2" />
        <path d="M7 4.5h14v11" />
      </>
    ),
  },
  {
    valor: 'cualquier-cosa',
    etiqueta: 'Cualquier cosa',
    descripcion: 'Sorprendeme, no tengo preferencia.',
    icono: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
        <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" />
      </>
    ),
  },
];

export default function PaginaTipo() {
  useMetadatos('tipo');

  /**
   * `seleccion` puede venir de vuelta desde /resultados con la flecha de
   * atrás, así que arranca de lo que traiga el state y no siempre en null.
   */
  const [seleccion, setSeleccion] = useState(useLocation().state?.seleccion ?? null);
  const navigate = useNavigate();

  /**
   * Se sabe el destino exacto ("Buscar", no "Me siento con suerte") apenas
   * se elige la tarjeta, antes de que el usuario clickee nada más — esa
   * pausa es la que se aprovecha. Ver 4.13.3.
   */
  function elegir(valor) {
    setSeleccion(valor);
    precalentarUnaVez(`tipo:${valor}`, () => {
      obtenerPorTipo(valor, { soloRapido: true }).catch(() => {});
      obtenerPorTipo(valor, {}).catch(() => {});
    });
  }

  function irAResultados(soloUno) {
    if (!seleccion) return;
    navigate('/resultados', {
      state: {
        flujo: 'tipo',
        parametros: { tipoSeleccionado: seleccion },
        soloUno,
        origen: { ruta: '/tipo', estado: { seleccion } },
      },
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

      <h1 className="titulo-pagina text-center">¿Qué tenés ganas de ver?</h1>
      <p className="mx-auto mt-2 max-w-md text-center text-crema/60">Elegí un formato y buscamos ahí.</p>

      {/* Las medidas de las tarjetas están ajustadas para que el contenido
          principal entre en una pantalla de notebook sin scroll (queda para
          abajo el pie, nada más). Si se agrandan, revisar eso. */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {OPCIONES.map((op) => (
          <TarjetaOpcion
            key={op.valor}
            activo={seleccion === op.valor}
            onElegir={() => elegir(op.valor)}
            etiqueta={op.etiqueta}
            pista={op.descripcion}
            icono={op.icono}
            className="min-h-[9.5rem]"
            clasePista="max-w-[15rem]"
          />
        ))}
      </div>

      {seleccion && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => irAResultados(false)}
            className="boton-destacado w-full max-w-xs"
          >
            Buscar
          </button>
          <BotonSuerte onClick={() => irAResultados(true)} />
        </div>
      )}
    </main>
  );
}
