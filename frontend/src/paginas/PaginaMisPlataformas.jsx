import { useEffect, useState } from 'react';
import { obtenerProveedores } from '../api/cliente.js';
import { useListas } from '../listas/ContextoListas.jsx';
import NavCuenta from '../listas/NavCuenta.jsx';
import SelectorLista from '../components/SelectorLista.jsx';
import Cargando from '../components/Cargando.jsx';
import useMetadatos from '../utils/useMetadatos.js';
import RegionViva from '../components/RegionViva.jsx';

/**
 * "Mis plataformas" (sección 18). Es lo que después alimenta la opción de
 * "Mis plataformas" dentro de la Preferencia "Disponible en" (sección 6),
 * que se conecta en la milestone 21.
 *
 * Se guarda el conjunto entero de una, no plataforma por plataforma: el
 * selector trabaja sobre la lista completa, así que mandarla entera evita
 * calcular el diff en dos lados.
 */
export default function PaginaMisPlataformas() {
  useMetadatos('misPlataformas');

  const { plataformas, guardarPlataformas } = useListas();

  const [disponibles, setDisponibles] = useState([]);
  const [elegidas, setElegidas] = useState([]);
  const [modo, setModo] = useState('cargando');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const datos = await obtenerProveedores();
        setDisponibles(datos.proveedores ?? []);
        setModo('listo');
      } catch (err) {
        setError(err.message);
        setModo('error');
      }
    })();
  }, []);

  // Las guardadas llegan por el contexto, que las trae al abrir sesión.
  useEffect(() => {
    setElegidas(plataformas.map(String));
  }, [plataformas]);

  const opciones = disponibles.map((p) => ({ valor: String(p.id), etiqueta: p.nombre }));

  async function guardar() {
    setError('');
    setMensaje('');
    setGuardando(true);
    try {
      await guardarPlataformas(elegidas.map(Number));
      setMensaje('Listo, se guardaron tus plataformas.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const hayCambios =
    elegidas.length !== plataformas.length ||
    elegidas.some((e) => !plataformas.includes(Number(e)));

  return (
    <main id="contenido" className="pagina-lectura">
      <h1 className="titulo-pagina">Mis plataformas</h1>
      <p className="mt-2 text-crema/60">
        Guardá dónde mirás, y después vas a poder filtrar por todas ellas de una sola vez en lugar de
        marcarlas una por una en cada búsqueda.
      </p>

      <NavCuenta actual="/mis-plataformas" />

      <div className="mt-8">
        {modo === 'cargando' && <Cargando mensaje="Trayendo las plataformas…" />}

        {modo === 'error' && (
          <RegionViva rol="alert"  className="mensaje-error py-10 text-center">
            {error}
          </RegionViva>
        )}

        {modo === 'listo' && (
          <>
            <SelectorLista
              etiqueta="Plataformas"
              opciones={opciones}
              seleccionados={elegidas}
              onCambiar={setElegidas}
              multiple
              desplegable
            />

            {error && (
              <RegionViva rol="alert"  className="mensaje-error mt-4">
                {error}
              </RegionViva>
            )}
            {mensaje && (
              <RegionViva rol="status"  className="mt-4 text-sm text-manteca">
                {mensaje}
              </RegionViva>
            )}

            <button
              type="button"
              onClick={guardar}
              disabled={guardando || !hayCambios}
              className="boton-primario mt-6"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
