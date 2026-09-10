import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { obtenerLista } from '../api/cliente.js';
import { LISTAS, etiquetaDeLista, useListas } from '../listas/ContextoListas.jsx';
import BuscadorParaAgregar from '../listas/BuscadorParaAgregar.jsx';
import NavCuenta from '../listas/NavCuenta.jsx';
import TarjetaResultado from '../components/TarjetaResultado.jsx';
import EsqueletoGrilla from '../components/EsqueletoGrilla.jsx';
import EstadoVacio from '../components/EstadoVacio.jsx';
import { CLASES_GRILLA } from '../components/GrillaResultados.jsx';
import useMetadatos from '../utils/useMetadatos.js';
import RegionViva from '../components/RegionViva.jsx';

const CLAVES_VALIDAS = LISTAS.map((l) => l.clave);

/** Sin acentos y en minúsculas, para que "Alien" matchee "alién" y al revés. */
function normalizar(texto) {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export default function PaginaLista() {
  useMetadatos('listas');

  const { lista } = useParams();
  const { quitar, vistosEnVerMasTarde, listas } = useListas();

  const [items, setItems] = useState([]);
  const [modo, setModo] = useState('cargando');
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');

  const esValida = CLAVES_VALIDAS.includes(lista);

  /**
   * Cantidad de ítems según el contexto (no según lo que ya se trajo): es
   * lo que cambia al instante cuando se agrega o se quita algo, así que
   * sirve para saber cuándo hay que volver a pedir el detalle.
   */
  const cantidadEnContexto = (listas[lista] ?? []).length;

  useEffect(() => {
    if (!esValida) return;
    let cancelado = false;

    (async () => {
      setModo('cargando');
      try {
        const datos = await obtenerLista(lista);
        if (cancelado) return;
        setItems(datos.resultados ?? []);
        setModo('listo');
      } catch (err) {
        if (cancelado) return;
        setError(err.message);
        setModo('error');
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [lista, esValida, cantidadEnContexto]);

  const mostrados = useMemo(() => {
    const texto = normalizar(filtro.trim());
    if (!texto) return items;
    return items.filter((i) => normalizar(i.titulo).includes(texto));
  }, [items, filtro]);

  /**
   * La regla de la sección 18: al entrar a "Ver más tarde", los títulos que
   * además están en "Visto" ofrecen eliminarse de ahí. Es una oferta, no una
   * eliminación forzada, así que solo se listan.
   */
  const yaVistos = useMemo(() => {
    if (lista !== 'ver_mas_tarde') return [];
    return items.filter((i) => vistosEnVerMasTarde.some((v) => v.tipo === i.tipo && v.tmdb_id === i.tmdb_id));
  }, [lista, items, vistosEnVerMasTarde]);

  if (!esValida) {
    return (
      <main id="contenido" className="pagina-lectura">
        <h1 className="titulo-pagina">Esa lista no existe</h1>
        <p className="mt-3 text-crema/70">
          Las listas son{' '}
          {LISTAS.map((l, i) => (
            <span key={l.clave}>
              {i > 0 && (i === LISTAS.length - 1 ? ' y ' : ', ')}
              <Link to={`/listas/${l.clave}`} className="font-semibold text-manteca hover:underline">
                {l.etiqueta}
              </Link>
            </span>
          ))}
          .
        </p>
      </main>
    );
  }

  const etiqueta = etiquetaDeLista(lista);

  async function quitarDeAca(item) {
    try {
      await quitar(lista, item);
      setItems((previos) => previos.filter((i) => !(i.tipo === item.tipo && i.tmdb_id === item.tmdb_id)));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main id="contenido" className="pagina-ancho">
      <h1 className="titulo-pagina">{etiqueta}</h1>
      <p className="mt-2 text-crema/60">
        {cantidadEnContexto === 0
          ? 'Todavía no hay nada acá.'
          : `${cantidadEnContexto} ${cantidadEnContexto === 1 ? 'título' : 'títulos'}`}
      </p>

      <NavCuenta actual={`/listas/${lista}`} />

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <BuscadorParaAgregar lista={lista} />

        <div>
          <label htmlFor="filtrar-lista" className="block text-sm font-semibold text-crema/80">
            Filtrar esta lista
          </label>
          <input
            id="filtrar-lista"
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder={`Buscar entre tus ${etiqueta.toLowerCase()}`}
            className="campo mt-1.5"
          />
          {filtro.trim() && (
            <RegionViva rol="status"  className="mt-2 text-sm text-crema/50">
              {mostrados.length} de {items.length} coinciden.
            </RegionViva>
          )}
        </div>
      </div>

      {yaVistos.length > 0 && (
        <section className="panel mt-8 p-5">
          <h2 className="titulo-bloque">
            {yaVistos.length === 1 ? 'Un título de acá ya lo viste' : `${yaVistos.length} títulos de acá ya los viste`}
          </h2>
          <p className="mt-1.5 text-sm text-crema/60">
            Están en Visto y siguen en Ver más tarde. Podés sacarlos de acá si querés, o dejarlos.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {yaVistos.map((i) => (
              <li key={`${i.tipo}:${i.tmdb_id}`}>
                <button
                  type="button"
                  onClick={() => quitarDeAca(i)}
                  className="boton-secundario"
                >
                  Sacar {i.titulo}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8">
        {modo === 'cargando' && (
          <>
            <RegionViva rol="status"  className="solo-lector">
              Trayendo tu lista
            </RegionViva>
            <EsqueletoGrilla cantidad={5} />
          </>
        )}

        {modo === 'error' && (
          <RegionViva rol="alert"  className="mensaje-error py-10 text-center">
            {error}
          </RegionViva>
        )}

        {modo === 'listo' && items.length === 0 && (
          <EstadoVacio
            titulo="Todavía no hay nada en esta lista"
            pista="Usá el buscador de arriba para agregar lo primero."
          />
        )}

        {modo === 'listo' && items.length > 0 && mostrados.length === 0 && (
          <EstadoVacio
            titulo="Ninguno de tus títulos coincide con ese texto"
            pista="Probá con menos palabras, o mirá la lista completa."
          />
        )}

        {mostrados.length > 0 && (
          <>
            {/*
              La grilla necesita su propio h2 aunque no haga falta verlo: sin
              él los encabezados saltan del h1 de la lista a los h3 de las
              tarjetas, que es una de las cosas que la auditoría de
              accesibilidad marca. Misma solución que en /resultados.
            */}
            <h2 className="solo-lector">Títulos en {etiqueta}</h2>
            <div className={CLASES_GRILLA}>
              {mostrados.map((r) => (
                <TarjetaResultado
                  key={`${r.tipo}:${r.tmdb_id}`}
                  resultado={r}
                  /**
                   * En una lista el botón es un "-" que saca de esta lista y
                   * nada más, sin el menú de las tres (sección 18).
                   */
                  accion={
                    <button
                      type="button"
                      onClick={() => quitarDeAca(r)}
                      aria-label={`Quitar ${r.titulo} de ${etiqueta}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-linea-control bg-noche/80 text-xl font-semibold text-crema backdrop-blur-sm transition hover:border-terciopelo-claro hover:text-terciopelo-claro"
                    >
                      <span aria-hidden="true">-</span>
                    </button>
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
