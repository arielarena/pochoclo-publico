import TarjetaResultado from './TarjetaResultado.jsx';
import EstadoVacio from './EstadoVacio.jsx';

/** Las clases de la grilla viven acá para que no haya dos definiciones del
 *  mismo layout: el esqueleto de carga y las páginas de lista las reusan. */
export const CLASES_GRILLA = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';

export default function GrillaResultados({ resultados, vacio }) {
  if (!resultados?.length) {
    return (
      vacio ?? (
        <EstadoVacio
          titulo="No encontramos nada con estos criterios"
          pista="Probá sacando alguna preferencia, o ampliá el rango de años."
        />
      )
    );
  }

  return (
    <div className={CLASES_GRILLA}>
      {resultados.map((r) => (
        <TarjetaResultado key={`${r.tipo}:${r.tmdb_id}`} resultado={r} />
      ))}
    </div>
  );
}
