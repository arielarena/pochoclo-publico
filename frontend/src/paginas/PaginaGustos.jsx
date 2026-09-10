import { useEffect, useMemo, useState } from 'react';
import { obtenerGeneros, obtenerGustos, guardarGustos } from '../api/cliente.js';
import NavCuenta from '../listas/NavCuenta.jsx';
import { OPCIONES_ANIOS, OPCIONES_DECADAS, seleccionDesdeTramos, tramosDesdeSeleccion } from '../utils/anios.js';
import SelectorLista from '../components/SelectorLista.jsx';
import Cargando from '../components/Cargando.jsx';
import useMetadatos from '../utils/useMetadatos.js';
import RegionViva from '../components/RegionViva.jsx';

/** El tope de la sección 19. El backend lo valida también, por las dudas. */
const MAXIMO_GENEROS = 5;

const OPCIONES_TIPO = [
  { valor: 'pelicula', etiqueta: 'Película' },
  { valor: 'miniserie', etiqueta: 'Miniserie' },
  { valor: 'serie', etiqueta: 'Serie' },
];

/**
 * Gustos Registrados (sección 19). Son tres campos y nada más: no se guarda
 * ninguna lista de títulos calculada a partir de ellos. El `/discover` se
 * ejecuta en vivo en cada búsqueda, que es lo que el Definitivo fija
 * explícitamente.
 *
 * Influyen en las búsquedas con formulario vacío (Opción 1, Opción 3 y el
 * modo Solo de "¿Quién está viendo?"), que es lo que conecta la milestone
 * siguiente.
 */
export default function PaginaGustos() {
  useMetadatos('misGustos');

  const [generosDisponibles, setGenerosDisponibles] = useState([]);
  const [generos, setGeneros] = useState([]);
  const [clasicos, setClasicos] = useState(false);
  const [tipos, setTipos] = useState([]);
  const [decadas, setDecadas] = useState([]);
  const [aniosSueltos, setAniosSueltos] = useState([]);

  const [guardados, setGuardados] = useState(null);
  const [modo, setModo] = useState('cargando');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [datosGeneros, datosGustos] = await Promise.all([obtenerGeneros(), obtenerGustos()]);
        setGenerosDisponibles(datosGeneros.generos ?? []);

        const gustos = datosGustos.gustos ?? { generos: [], tipos: [], anios: [], clasicos: false };
        const { decadas: d, anios: a } = seleccionDesdeTramos(gustos.anios);
        setGeneros(gustos.generos.map(String));
        setClasicos(Boolean(gustos.clasicos));
        setTipos(gustos.tipos);
        setDecadas(d);
        setAniosSueltos(a);
        setGuardados(gustos);
        setModo('listo');
      } catch (err) {
        setError(err.message);
        setModo('error');
      }
    })();
  }, []);

  const opcionesGeneros = useMemo(
    () =>
      generosDisponibles.map((g) => ({
        valor: String(g.id),
        etiqueta: g.nombre,
      })),
    [generosDisponibles]
  );

  const llegoAlTope = generos.length >= MAXIMO_GENEROS;

  /**
   * El tope de 5 se aplica dejando pasar solo las quitas cuando ya se llegó.
   * Se hace acá y no dentro de SelectorLista porque es una regla de este
   * campo puntual, no del componente, que lo usan muchas otras pantallas
   * sin ningún tope.
   */
  function cambiarGeneros(nuevos) {
    if (nuevos.length <= MAXIMO_GENEROS) {
      setGeneros(nuevos);
      return;
    }
    setMensaje('');
    setError(`Se pueden elegir hasta ${MAXIMO_GENEROS} géneros favoritos. Sacá alguno para cambiarlo.`);
  }

  const eligioTodosLosTipos = tipos.length === OPCIONES_TIPO.length;

  const aGuardar = {
    generos: generos.map(Number),
    tipos,
    anios: tramosDesdeSeleccion(decadas, aniosSueltos),
    clasicos,
  };

  const hayCambios =
    guardados !== null && JSON.stringify(aGuardar) !== JSON.stringify(guardados);

  async function guardar() {
    setError('');
    setMensaje('');
    setGuardando(true);
    try {
      const datos = await guardarGustos(aGuardar);
      setGuardados(datos.gustos);
      setMensaje('Listo, se guardaron tus gustos.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main id="contenido" className="pagina-lectura">
      <h1 className="titulo-pagina">Mis gustos</h1>
      <p className="mt-2 text-crema/60">
        Cuando entres sin decir qué querés ver, vamos a usar esto para ir con algo que te pueda
        gustar más que solo lo más popular. No hace falta completar todo.
      </p>

      <NavCuenta actual="/mis-gustos" />

      {modo === 'cargando' && <Cargando mensaje="Trayendo tus gustos…" />}

      {modo === 'error' && (
        <RegionViva rol="alert"  className="mensaje-error py-10 text-center">
          {error}
        </RegionViva>
      )}

      {modo === 'listo' && (
        <div className="mt-8 space-y-8">
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="titulo-bloque">Géneros favoritos</h2>
              <p className={`text-sm ${llegoAlTope ? 'text-manteca' : 'text-crema/50'}`}>
                {generos.length}/{MAXIMO_GENEROS}
              </p>
            </div>
            <p className="mt-1 mb-3 text-sm text-crema/60">
              Hasta {MAXIMO_GENEROS}. {llegoAlTope && 'Llegaste al límite: sacá uno para poder cambiarlo.'}
            </p>
            <SelectorLista
              etiqueta="Géneros favoritos"
              opciones={opcionesGeneros}
              seleccionados={generos}
              onCambiar={cambiarGeneros}
              multiple
              desplegable
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-crema/70">
              <input
                type="checkbox"
                checked={clasicos}
                onChange={(e) => setClasicos(e.target.checked)}
                className="casilla"
              />
              Ver clásicos
            </label>
            <p className="mt-1 text-sm text-crema/60">
              No afecta al límite de géneros.
            </p>
          </section>

          <section>
            <h2 className="titulo-bloque">Tipo preferido</h2>
            <p className="mt-1 mb-3 text-sm text-crema/60">
              {eligioTodosLosTipos
                ? 'Elegiste los tres, que equivale a no elegir ninguno: te vamos a mostrar de todo.'
                : 'Podés elegir más de uno. Elegir los tres equivale a no elegir ninguno.'}
            </p>
            <SelectorLista
              etiqueta="Tipo preferido"
              opciones={OPCIONES_TIPO}
              seleccionados={tipos}
              onCambiar={setTipos}
              multiple
            />
          </section>

          <section>
            <h2 className="titulo-bloque">Años y décadas favoritas</h2>
            <p className="mt-1 mb-3 text-sm text-crema/60">
              Sin límite. Podés mezclar décadas enteras con años sueltos.
            </p>
            <div className="space-y-4">
              <SelectorLista
                etiqueta="Décadas"
                opciones={OPCIONES_DECADAS}
                seleccionados={decadas}
                onCambiar={setDecadas}
                multiple
                desplegable
              />
              <SelectorLista
                etiqueta="Años sueltos"
                opciones={OPCIONES_ANIOS}
                seleccionados={aniosSueltos}
                onCambiar={setAniosSueltos}
                multiple
                desplegable
              />
            </div>
          </section>

          {error && (
            <RegionViva rol="alert"  className="mensaje-error">
              {error}
            </RegionViva>
          )}
          {mensaje && (
            <RegionViva rol="status"  className="text-sm text-manteca">
              {mensaje}
            </RegionViva>
          )}

          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !hayCambios}
            className="boton-primario"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </main>
  );
}
