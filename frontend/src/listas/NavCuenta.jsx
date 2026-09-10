import { Link } from 'react-router-dom';
import { LISTAS } from './ContextoListas.jsx';

/**
 * La navegación entre las pantallas de la cuenta: las tres listas, Mis
 * plataformas y Mis gustos.
 *
 * `actual` es la ruta de la pantalla en la que estás, para marcarla. Se
 * compara contra la ruta completa porque las listas comparten prefijo.
 */
export default function NavCuenta({ actual }) {
  const destinos = [
    ...LISTAS.map((l) => ({ ruta: `/listas/${l.clave}`, etiqueta: l.etiqueta })),
    { ruta: '/mis-plataformas', etiqueta: 'Mis plataformas' },
    { ruta: '/mis-gustos', etiqueta: 'Mis gustos' },
  ];

  return (
    <nav aria-label="Tu cuenta" className="mt-5 flex flex-wrap gap-2">
      {destinos.map((d) =>
        d.ruta === actual ? (
          <span
            key={d.ruta}
            aria-current="page"
            className="inline-flex items-center rounded-full border border-manteca bg-manteca px-5 py-2 font-display text-sm font-semibold text-noche"
          >
            {d.etiqueta}
          </span>
        ) : (
          <Link
            key={d.ruta}
            to={d.ruta}
            className="boton-secundario"
          >
            {d.etiqueta}
          </Link>
        )
      )}
    </nav>
  );
}
