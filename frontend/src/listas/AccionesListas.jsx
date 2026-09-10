import { useState } from 'react';
import { LISTAS, useListas } from './ContextoListas.jsx';
import RegionViva from '../components/RegionViva.jsx';

/**
 * Las tres listas como botones sueltos, para la Ficha de Título.
 *
 * En las tarjetas de resultados se usa `BotonListas`, que esconde lo mismo
 * detrás de un menú porque ahí no hay lugar. En la Ficha sí lo hay, y tres
 * botones a la vista se entienden de un vistazo y son un widget menos que
 * manejar con teclado.
 */
export default function AccionesListas({ item }) {
  const { puedeUsarListas, estaEn, alternar, pedirSugerenciaVisto } = useListas();
  const [error, setError] = useState('');

  if (!puedeUsarListas) return null;

  async function alAlternar(lista) {
    setError('');
    try {
      const { sugerirVisto } = await alternar(lista, item);
      if (sugerirVisto) pedirSugerenciaVisto(item);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        {LISTAS.map((lista) => {
          const dentro = estaEn(lista.clave, item);
          return (
            <button
              key={lista.clave}
              type="button"
              aria-pressed={dentro}
              onClick={() => alAlternar(lista.clave)}
              className={`boton-secundario ${
                dentro ? 'border-manteca bg-manteca text-noche' : ''
              }`}
            >
              <span aria-hidden="true" className="mr-1.5">
                {dentro ? '✓' : '+'}
              </span>
              {lista.etiqueta}
            </button>
          );
        })}
      </div>
      {error && (
        <RegionViva rol="alert"  className="mensaje-error mt-2">
          {error}
        </RegionViva>
      )}
    </div>
  );
}
