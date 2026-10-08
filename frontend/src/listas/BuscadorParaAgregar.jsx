import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { buscarTitulo } from '../api/cliente.js';
import { urlPoster } from '../utils/imagenes.js';
import { etiquetaDeLista, useListas } from './ContextoListas.jsx';
import RegionViva from '../components/RegionViva.jsx';
/**
 * LARGO_MAXIMO_CONSULTA es el mismo número con el que el backend rechaza con
 * 400 (backend/src/utils/consulta.js). Acá el campo no deja escribir más, así
 * que ese error no se ve nunca.
 */
import { LARGO_MAXIMO_CONSULTA } from '../../../comun/busqueda.js';

const MILISEGUNDOS_DEBOUNCE = 350;

/**
 * El primero de los dos buscadores de la sección 18: busca títulos contra
 * TMDb y los agrega a la lista en la que estás parado.
 *
 * No es el `Autocompletado` de las Preferencias, y la diferencia es a
 * propósito: ahí elegís opciones que quedan como chips para armar una
 * búsqueda; acá cada resultado se muestra en la propia barra con un botón
 * que agrega o quita, sin pasar por la Ficha ni por ninguna otra pantalla.
 *
 * Dos reglas que la sección fija explícitamente:
 *  - **No aplica la exclusión de títulos "Visto"** de la sección 5. Acá el
 *    propósito es gestionar la lista, no recomendar, así que algo que ya
 *    viste tiene que poder aparecer.
 *  - La pregunta de Favoritas -> Visto es **no bloqueante**: un aviso al
 *    lado de esa fila puntual, no un modal ni un cartel global, y
 *    desaparece al cambiar de búsqueda.
 */
export default function BuscadorParaAgregar({ lista }) {
  const { estaEn, alternar, agregar } = useListas();

  /**
   * La consulta se guarda también en el estado de la entrada del historial,
   * para que entrar a la Ficha de un resultado y volver con "atrás" (o
   * recargar) no la borre: React desmonta esta pantalla al navegar, así que
   * el estado solo no sobrevive (ver 4.5 de las notas de decisiones del proyecto, mismo problema en
   * /resultados).
   *
   * **VA EN EL ESTADO DEL HISTORIAL Y NO EN LA DIRECCIÓN, A PROPÓSITO.** Con
   * un `?q=`, cualquiera podía mandar un enlace que abriera esta pantalla con
   * el texto que quisiera escrito en el campo. El estado del historial solo
   * lo escribe esta misma app: un enlace de afuera no lo puede traer.
   *
   * El input lee el estado local y no el del historial: un campo controlado
   * cuyo valor llega recién en el render de una navegación puede saltar el
   * cursor al final. El historial se actualiza después, con `replace`, así
   * que tipear no llena el historial de entradas.
   */
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const [consulta, setConsulta] = useState(() => {
    const guardada = ubicacion.state?.consultaBuscador;
    return typeof guardada === 'string' ? guardada.slice(0, LARGO_MAXIMO_CONSULTA) : '';
  });
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  // Clave "tipo:tmdb_id" de la fila sobre la que se está sugiriendo Visto.
  const [sugerencia, setSugerencia] = useState(null);
  const temporizador = useRef(null);

  useEffect(() => {
    if (!consulta.trim()) {
      setResultados([]);
      setSugerencia(null);
      return;
    }
    setBuscando(true);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      try {
        const datos = await buscarTitulo(consulta);
        setResultados(datos.resultados ?? []);
        setError('');
      } catch (err) {
        setResultados([]);
        setError(err.message);
      } finally {
        setBuscando(false);
      }
    }, MILISEGUNDOS_DEBOUNCE);
    return () => clearTimeout(temporizador.current);
  }, [consulta]);

  useEffect(() => {
    if ((ubicacion.state?.consultaBuscador ?? '') === consulta) return;
    // Misma dirección y el resto del estado intacto: solo cambia la consulta.
    navegar(
      { pathname: ubicacion.pathname, search: ubicacion.search, hash: ubicacion.hash },
      { replace: true, state: { ...ubicacion.state, consultaBuscador: consulta } }
    );
  }, [consulta, ubicacion, navegar]);

  // La sugerencia es de una búsqueda puntual: al cambiar el texto se va.
  useEffect(() => {
    setSugerencia(null);
  }, [consulta]);

  async function alAlternar(resultado) {
    const item = { tmdb_id: resultado.tmdb_id, tipo: resultado.tipo, titulo: resultado.titulo };
    setError('');
    try {
      const { sugerirVisto } = await alternar(lista, item);
      setSugerencia(sugerirVisto ? `${item.tipo}:${item.tmdb_id}` : null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function marcarComoVisto(resultado) {
    setSugerencia(null);
    try {
      await agregar('visto', { tmdb_id: resultado.tmdb_id, tipo: resultado.tipo, titulo: resultado.titulo });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <label htmlFor="buscador-agregar" className="block text-sm font-semibold text-crema/80">
        Agregar títulos a {etiquetaDeLista(lista)}
      </label>
      <input
        id="buscador-agregar"
        type="search"
        maxLength={LARGO_MAXIMO_CONSULTA}
        value={consulta}
        onChange={(e) => setConsulta(e.target.value)}
        placeholder="Buscá una película o serie por nombre"
        className="campo mt-1.5"
      />

      {error && (
        <RegionViva rol="alert"  className="mensaje-error mt-2">
          {error}
        </RegionViva>
      )}

      <RegionViva rol="status" como="div"  className="mt-2">
        {buscando && <p className="text-sm text-crema/50">Buscando…</p>}

        {!buscando && consulta.trim() && resultados.length === 0 && !error && (
          <p className="text-sm text-crema/50">No encontramos nada con ese nombre.</p>
        )}

        {resultados.length > 0 && (
          <ul className="panel divide-y divide-linea">
            {resultados.map((r) => {
              const dentro = estaEn(lista, r);
              const claveFila = `${r.tipo}:${r.tmdb_id}`;
              const poster = urlPoster(r.poster);

              return (
                <li key={claveFila} className="flex items-center gap-3 p-2.5">
                  <div className="min-w-0 flex-1">
                    {/*
                      El enlace a la Ficha cubre el póster, el título y el año,
                      y NO el aviso de "¿La viste?": ese aviso lleva un botón,
                      y un botón dentro de un enlace no es HTML válido. Mismo
                      criterio que TarjetaResultado.
                    */}
                    <Link
                      to={`/titulo/${r.tipo}/${r.tmdb_id}`}
                      className="group flex min-w-0 items-center gap-3 rounded"
                    >
                      <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-crema/5">
                        {poster && <img src={poster} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-crema group-hover:underline">{r.titulo}</p>
                        <p className="text-xs text-crema/50">{r.anio ?? 'Sin año'}</p>
                      </div>
                    </Link>

                    {/* pl-13 es el ancho del póster más el gap: alinea el aviso con el título. */}
                    {sugerencia === claveFila && !estaEn('visto', r) && (
                      <p className="mt-1 flex flex-wrap items-center gap-2 pl-13 text-xs text-crema/60">
                        <span>¿La viste?</span>
                        <button
                          type="button"
                          onClick={() => marcarComoVisto(r)}
                          className="font-semibold text-manteca hover:underline"
                        >
                          Marcar como vista
                        </button>
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => alAlternar(r)}
                    aria-label={
                      dentro
                        ? `Quitar ${r.titulo} de ${etiquetaDeLista(lista)}`
                        : `Agregar ${r.titulo} a ${etiquetaDeLista(lista)}`
                    }
                    className={`h-8 w-8 shrink-0 rounded-full text-lg font-semibold transition ${
                      dentro
                        ? 'bg-manteca text-noche'
                        : 'text-crema ring-1 ring-linea-control hover:ring-linea-activa'
                    }`}
                  >
                    <span aria-hidden="true">{dentro ? '-' : '+'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </RegionViva>
    </div>
  );
}
