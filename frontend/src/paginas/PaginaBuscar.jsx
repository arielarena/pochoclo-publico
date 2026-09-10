import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  obtenerGeneros,
  obtenerPaises,
  obtenerIdiomas,
  obtenerProveedores,
  buscarPersona,
  buscarTitulo,
  obtenerLista,
} from '../api/cliente.js';
import { urlImagen } from '../utils/imagenes.js';
import {
  ANIO_ACTUAL,
  ANIO_MAXIMO,
  MENSAJE_RANGO_ANIO_INVALIDO,
  OPCIONES_ANIOS,
  OPCIONES_DECADAS,
  anioSospechoso,
  rangoAnioInvalido,
  tramosDesdeSeleccion,
} from '../utils/anios.js';
import { useListas } from '../listas/ContextoListas.jsx';
import Autocompletado from '../components/Autocompletado.jsx';
import SelectorLista from '../components/SelectorLista.jsx';
import BotonSuerte from '../components/BotonSuerte.jsx';
import CampoNumero from '../components/CampoNumero.jsx';
import EnlaceVolver from '../components/EnlaceVolver.jsx';
import { formatearLista } from '../utils/texto.js';
import useMetadatos from '../utils/useMetadatos.js';
import RegionViva from '../components/RegionViva.jsx';

const TIPOS = [
  { valor: 'pelicula', etiqueta: 'Película' },
  { valor: 'miniserie', etiqueta: 'Miniserie' },
  { valor: 'serie', etiqueta: 'Serie' },
];

const COMPLEJIDADES = [
  { valor: 'relajar', etiqueta: 'Para relajar' },
  { valor: 'pensar', etiqueta: 'Para pensar' },
];

/**
 * `ANIO_ACTUAL` es con qué año arrancan los campos de Año vacíos al tocar una
 * flecha: partir de 0 obligaría a miles de clicks para llegar a un año real.
 * Las constantes y las dos reglas del campo Año viven en utils/anios.js, que
 * las comparte con el panel de Filtros: son la misma regla en dos pantallas y
 * estuvieron duplicadas a mano.
 */

/**
 * Tope de prioridades simultáneas. Cada una le cuesta al backend una
 * búsqueda entera (ver opciones/prioridades.js), y el mismo número está del
 * otro lado: acá se aplica antes, para que el formulario no deje marcar algo
 * que después se iba a recortar en silencio.
 */
const MAXIMO_PRIORIDADES = 4;

/**
 * Tope de títulos en "Parecido a". Mismo caso que el de arriba: el número
 * está DUPLICADO A MANO en `backend/src/opciones/parecidoA.js`
 * (MAXIMO_REFERENCIAS), donde vive el motivo medido, y acá se aplica antes
 * para que el formulario no deje cargar algo que el backend después iba a
 * recortar en silencio. Si se cambia uno, hay que cambiar el otro.
 *
 * Lo que hace falta saber acá: más de treinta referencias no traen ni un
 * resultado más (el tope real es cuántos candidatos se detallan), y el atajo
 * de "usar mis favoritas" puede cargar la lista entera de alguien.
 */
const MAXIMO_REFERENCIAS = 30;

/**
 * Sección 6: el campo Año tiene dos modalidades y se usa una a la vez. El
 * rango cubre "Antes de" (solo Hasta) y "Después de" (solo Desde), y de
 * paso permite acotar por los dos lados; la lista cubre la selección de
 * varios años o décadas sueltos, que un rango no puede expresar.
 */
const MODALIDADES_ANIO = [
  { valor: 'rango', etiqueta: 'Un rango de años' },
  { valor: 'lista', etiqueta: 'Años y décadas sueltos' },
];

/**
 * Las listas de años y décadas viven en utils/anios.js: las comparten este
 * campo y los años favoritos de los Gustos Registrados.
 */

function slugificar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * El botón "Priorizar" de una categoría (sección 6). Cuando está marcado
 * muestra el numerito de orden de selección adentro de la casilla, que es
 * como lo pide la sección: es lo que decide el orden de las divisiones
 * cuando ninguna cumple más prioridades que las otras.
 *
 * Es un <button role="checkbox"> y no un <input>, justamente porque hay que
 * dibujar el número adentro de la casilla y un input no puede tener
 * contenido. El nombre accesible incluye la categoría: nueve botones que
 * anuncian solo "Priorizar" no le sirven a nadie con lector de pantalla.
 */
function BotonPrioridad({ titulo, activa, numero, deshabilitado, onAlternar }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={activa}
      aria-label={activa ? `Priorizar ${titulo}, prioridad ${numero}` : `Priorizar ${titulo}`}
      disabled={deshabilitado}
      onClick={onAlternar}
      className={`boton-secundario px-3 py-1 text-xs ${
        activa ? 'border-manteca text-manteca' : 'text-crema/70'
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid h-4 w-4 place-content-center rounded border text-[10px] font-bold leading-none ${
          activa ? 'border-manteca bg-manteca text-noche' : 'border-linea-control bg-noche'
        }`}
      >
        {activa ? numero : ''}
      </span>
      Priorizar
    </button>
  );
}

function Seccion({ titulo, prioridad, children }) {
  const id = `seccion-${slugificar(titulo)}`;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="titulo-bloque">
          {titulo}
        </h2>
        {prioridad && <BotonPrioridad titulo={titulo} {...prioridad} />}
      </div>
      <div role="group" aria-labelledby={id}>
        {children}
      </div>
    </div>
  );
}

export default function PaginaBuscar() {
  useMetadatos('buscar');

  const navigate = useNavigate();
  const { state } = useLocation();
  const modo = state?.modo === 'simple' ? 'simple' : 'detallada';
  const prefill = state?.prefill ?? {};
  const filtrosIniciales = state?.filtrosIniciales;

  /**
   * El formulario tal cual estaba la última vez que se buscó, para cuando se
   * vuelve desde /resultados con la flecha de atrás.
   *
   * Va aparte de `prefill` a propósito, aunque los dos rellenen campos:
   * `prefill` es una sugerencia de arranque que viene de otra pantalla (el
   * género que corresponde a un estado de ánimo, por ejemplo) y solo toca
   * tres campos; `restaurar` es lo que el usuario había escrito, tiene que
   * poder devolver el formulario ENTERO, y le gana a la sugerencia.
   */
  const restaurar = state?.restaurar ?? {};

  const [generosDisponibles, setGenerosDisponibles] = useState([]);
  const [paisesDisponibles, setPaisesDisponibles] = useState([]);
  const [idiomasDisponibles, setIdiomasDisponibles] = useState([]);
  const [proveedoresDisponibles, setProveedoresDisponibles] = useState([]);

  const [tipos, setTipos] = useState(restaurar.tipos ?? prefill.tipo ?? []);
  const [parecidoA, setParecidoA] = useState(restaurar.parecidoA ?? []);
  const [avisoReferencias, setAvisoReferencias] = useState('');
  const [generos, setGeneros] = useState(restaurar.generos ?? prefill.generos ?? []);
  const [plataformas, setPlataformas] = useState(restaurar.plataformas ?? []);
  const [actores, setActores] = useState(restaurar.actores ?? []);
  const [directores, setDirectores] = useState(restaurar.directores ?? []);
  const [paises, setPaises] = useState(restaurar.paises ?? []);
  const [idiomas, setIdiomas] = useState(restaurar.idiomas ?? []);
  const [modalidadAnio, setModalidadAnio] = useState(restaurar.modalidadAnio ?? ['rango']);
  const [anioDesde, setAnioDesde] = useState(restaurar.anioDesde ?? '');
  const [anioHasta, setAnioHasta] = useState(restaurar.anioHasta ?? '');
  const [decadas, setDecadas] = useState(restaurar.decadas ?? []);
  const [aniosSueltos, setAniosSueltos] = useState(restaurar.aniosSueltos ?? []);
  const [complejidad, setComplejidad] = useState(restaurar.complejidad ?? prefill.complejidad ?? []);
  const [errorAnio, setErrorAnio] = useState(null);

  /**
   * Priorizar preferencias (sección 6). Es una lista ordenada de claves de
   * categoría: el orden ES el dato, porque desempata las divisiones cuando
   * ninguna cumple más prioridades que las otras.
   */
  const [prioridades, setPrioridades] = useState(restaurar.prioridades ?? []);

  /**
   * Los dos atajos de la sección 6 que se alimentan de las listas del
   * usuario: "toda mi lista Favoritas" como referencia de Parecido a, y
   * "Mis plataformas" en Disponible en. El contexto ya tiene las claves
   * (sin detalle), que es todo lo que hace falta para saber si mostrarlos.
   */
  const { listas, plataformas: misPlataformas } = useListas();
  const cantidadFavoritas = listas.favoritas.length;
  const [cargandoFavoritas, setCargandoFavoritas] = useState(false);
  const [errorFavoritas, setErrorFavoritas] = useState('');

  /**
   * El contexto guarda solo tipo y tmdb_id, y el Autocompletado necesita el
   * título para dibujar los chips, así que acá sí hace falta pedir la lista
   * con detalle. Es un pedido puntual, cuando el usuario toca el botón.
   */
  /**
   * Mismo patrón que el tope de géneros de "Mis gustos": se dejan pasar
   * siempre las quitas y se avisa al llegar, en vez de que el campo deje de
   * responder sin explicación.
   */
  function cambiarParecidoA(nuevas) {
    if (nuevas.length <= MAXIMO_REFERENCIAS || nuevas.length < parecidoA.length) {
      setAvisoReferencias('');
      setParecidoA(nuevas);
      return;
    }
    setAvisoReferencias(`Se pueden elegir hasta ${MAXIMO_REFERENCIAS} títulos de referencia.`);
  }

  async function usarFavoritas() {
    setErrorFavoritas('');
    setAvisoReferencias('');
    setCargandoFavoritas(true);
    try {
      const datos = await obtenerLista('favoritas');
      const referencias = (datos.resultados ?? []).map((r) => ({
        tmdb_id: r.tmdb_id,
        tipo: r.tipo,
        titulo: r.titulo,
        anio: r.anio,
      }));
      // Se suman a lo que ya haya elegido a mano, sin repetir y sin pasar el
      // tope: la lista de favoritas de alguien puede ser mucho más larga.
      setParecidoA((previas) => {
        const yaEstan = new Set(previas.map((p) => `${p.tipo}:${p.tmdb_id}`));
        const nuevas = referencias.filter((r) => !yaEstan.has(`${r.tipo}:${r.tmdb_id}`));
        const juntas = [...previas, ...nuevas];
        if (juntas.length > MAXIMO_REFERENCIAS) {
          setAvisoReferencias(
            `Se pueden usar hasta ${MAXIMO_REFERENCIAS} títulos de referencia, así que agregamos los primeros.`
          );
          return juntas.slice(0, MAXIMO_REFERENCIAS);
        }
        return juntas;
      });
    } catch (err) {
      setErrorFavoritas(err.message);
    } finally {
      setCargandoFavoritas(false);
    }
  }

  /**
   * Los géneros se vuelven a pedir cuando cambia el Tipo, porque TMDb tiene
   * dos taxonomías de género que comparten solo 8 IDs de 27. Elegir
   * "Miniserie" y "Thriller" armaba una búsqueda que devolvía cero, porque
   * Thriller no existe para series.
   *
   * **Desde el 2026-08-30 casi ninguno desaparece.** Cinco de los seis que no
   * existen en TV (Terror, Thriller, Romance, Música e Historia) el motor los
   * recrea con una rama de keywords, así que se pueden pedir para series igual
   * (ver KEYWORDS_DE_GENERO_SERIE en el backend). Los que tienen equivalente
   * real (Acción, Aventura, Fantasía, Ciencia Ficción, Bélica) se traducen al
   * ID que corresponde. **El único que sigue desapareciendo es Película de
   * TV**, que es un formato y no un tema: para una serie no significa nada.
   */
  useEffect(() => {
    obtenerGeneros(tipos).then((d) => setGenerosDisponibles(d.generos)).catch(() => {});
  }, [tipos]);

  /**
   * Los nombres de género se recuerdan acá, acumulados, porque para cuando hay
   * que avisar que uno se descartó ya no está en la lista de disponibles: la
   * lista nueva es justamente la que no lo tiene.
   */
  const nombresDeGenero = useRef(new Map());
  useEffect(() => {
    for (const g of generosDisponibles) nombresDeGenero.current.set(g.id, g.nombre);
  }, [generosDisponibles]);

  /**
   * Si un género elegido deja de aplicar al cambiar el Tipo, se saca de la
   * selección y se avisa. Se saca de verdad y no se deja "colgado" porque un
   * género que no existe en la taxonomía pedida no filtra nada: dejarlo daría
   * la impresión de estar buscando algo que no se está buscando.
   *
   * 'CLASICOS' sobrevive siempre: no es un ID de TMDb y no pertenece a
   * ninguna de las dos taxonomías (ver la sección 4.2 de las notas de decisiones del proyecto).
   */
  const [generosDescartados, setGenerosDescartados] = useState([]);
  useEffect(() => {
    if (!generosDisponibles.length) return;
    const validos = new Set(generosDisponibles.map((g) => g.id));
    const sobrevivientes = generos.filter((g) => g === 'CLASICOS' || validos.has(g));
    if (sobrevivientes.length === generos.length) {
      setGenerosDescartados([]);
      return;
    }

    const perdidos = generos.filter((g) => g !== 'CLASICOS' && !validos.has(g));
    setGenerosDescartados(perdidos.map((id) => nombresDeGenero.current.get(id) ?? String(id)));
    setGeneros(sobrevivientes);
    /**
     * Depende solo de la lista de disponibles: es el cambio de Tipo lo que
     * dispara la revisión, no cada vez que el usuario toca un género.
     */
  }, [generosDisponibles]);

  useEffect(() => {
    if (modo === 'detallada') {
      obtenerPaises().then((d) => setPaisesDisponibles(d.paises)).catch(() => {});
      obtenerIdiomas().then((d) => setIdiomasDisponibles(d.idiomas)).catch(() => {});
      obtenerProveedores().then((d) => setProveedoresDisponibles(d.proveedores)).catch(() => {});
    }
  }, [modo]);

  const buscarPersonaCb = useCallback((q) => buscarPersona(q).then((d) => d.resultados), []);
  const buscarTituloCb = useCallback((q) => buscarTitulo(q).then((d) => d.resultados), []);

  const opcionesGeneros = [
    ...generosDisponibles.map((g) => ({ valor: g.id, etiqueta: g.nombre })),
    { valor: 'CLASICOS', etiqueta: 'Clásicos', oculto: true },
  ];
  const opcionesPaises = paisesDisponibles.map((p) => ({ valor: p.codigo, etiqueta: p.nombre }));
  const opcionesIdiomas = idiomasDisponibles.map((i) => ({ valor: i.codigo, etiqueta: i.nombre }));
  const opcionesProveedores = proveedoresDisponibles.map((p) => ({
    valor: p.id,
    etiqueta: p.nombre,
    icono: p.logo ? <img src={urlImagen(p.logo, 'w45')} alt="" className="h-6 w-6 rounded-full" /> : null,
  }));

  const verClasicos = generos.includes('CLASICOS');
  function alternarVerClasicos(marcado) {
    setGeneros(marcado ? [...generos, 'CLASICOS'] : generos.filter((g) => g !== 'CLASICOS'));
  }

  const usaRangoDeAnios = modalidadAnio[0] !== 'lista';

  /**
   * El backend acepta el campo Año como un objeto ({ exacto } o
   * { desde, hasta }) o como un array de esos objetos, que combina con OR
   * (ver normalizarTramosAnio en logic/resultados.js). La modalidad de
   * lista aprovecha esa segunda forma: cada década es un tramo de diez
   * años y cada año suelto un tramo exacto.
   */
  function armarAnio() {
    if (modo !== 'detallada') return undefined;

    if (!usaRangoDeAnios) {
      const tramos = tramosDesdeSeleccion(decadas, aniosSueltos);
      return tramos.length ? tramos : undefined;
    }

    if (!anioDesde && !anioHasta) return undefined;
    return {
      desde: anioDesde ? Number(anioDesde) : undefined,
      hasta: anioHasta ? Number(anioHasta) : undefined,
    };
  }

  function revisarAnioAlSalir() {
    setAnioRevisado(true);
    return validarAnio();
  }

  function validarAnio() {
    /**
     * La modalidad de lista no puede quedar mal formada: son opciones
     * elegidas de una lista, no números tipeados a mano.
     */
    if (!usaRangoDeAnios) {
      setErrorAnio(null);
      return true;
    }
    if (rangoAnioInvalido(anioDesde, anioHasta)) {
      setErrorAnio(MENSAJE_RANGO_ANIO_INVALIDO);
      return false;
    }
    setErrorAnio(null);
    return true;
  }

  const hayAnioSospechoso = usaRangoDeAnios && anioSospechoso(anioDesde, anioHasta);

  /**
   * El aviso aparece al SALIR del campo, igual que el de correo inválido, y
   * no mientras se escribe: tipear "1990" pasa por "1" y por "19", que son
   * años menores a 1887, así que en cada tecla el aviso saltaría solo para
   * desaparecer dos teclas después.
   *
   * Antes esto era un temporizador de tres segundos. Cumplía la misma función
   * pero peor: si alguien se quedaba pensando con el campo a medio escribir,
   * el aviso aparecía igual; y si salía del campo enseguida, tenía que esperar
   * a que un reloj invisible se cumpliera para recién ahí ver el comentario.
   * Atarlo al foco lo hace previsible: el aviso llega cuando la respuesta está
   * terminada.
   */
  const [anioRevisado, setAnioRevisado] = useState(false);
  const avisoAnioVisible = anioRevisado && hayAnioSospechoso;

  /**
   * Qué categorías tienen algo cargado. Priorizar una vacía no significa
   * nada (no hay con qué entrar en conflicto), así que el botón aparece
   * únicamente cuando el campo tiene contenido.
   *
   * Las prioridades marcadas no se borran cuando su campo se vacía: se
   * ignoran mientras esté vacío y vuelven solas si el usuario recarga el
   * campo. Borrarlas de verdad haría perder la elección por tocar un chip.
   */
  const categoriaConValor = {
    tipo: tipos.length > 0,
    parecidoA: parecidoA.length > 0,
    plataformas: modo === 'detallada' && plataformas.length > 0,
    generos: generos.length > 0,
    actores: modo === 'detallada' && actores.length > 0,
    directores: modo === 'detallada' && directores.length > 0,
    paises: modo === 'detallada' && paises.length > 0,
    idiomas: modo === 'detallada' && idiomas.length > 0,
    anio: armarAnio() !== undefined,
    complejidad: complejidad.length > 0,
  };
  const prioridadesActivas = prioridades.filter((c) => categoriaConValor[c]);
  const enElTope = prioridadesActivas.length >= MAXIMO_PRIORIDADES;

  function alternarPrioridad(categoria) {
    setPrioridades((previas) =>
      previas.includes(categoria)
        ? previas.filter((c) => c !== categoria)
        : [...previas, categoria]
    );
  }

  function prioridadDe(categoria) {
    if (!categoriaConValor[categoria]) return null;
    const indice = prioridadesActivas.indexOf(categoria);
    const activa = indice >= 0;
    return {
      activa,
      numero: indice + 1,
      deshabilitado: !activa && enElTope,
      onAlternar: () => alternarPrioridad(categoria),
    };
  }

  function armarPreferencias() {
    /**
     * 'CLASICOS' viaja dentro del array de géneros, tal como lo pide la
     * sección 12 del Definitivo. No es un ID de TMDb, pero el motor lo
     * separa y lo resuelve con sus propias búsquedas, así que acá se manda
     * tal cual y el resultado es el OR real ("Comedia OR Clásicos").
     */
    return {
      tipo: tipos.length ? tipos : undefined,
      generos: generos.length ? generos : undefined,
      paises: modo === 'detallada' && paises.length ? paises : undefined,
      idiomas: modo === 'detallada' && idiomas.length ? idiomas : undefined,
      plataformas: modo === 'detallada' && plataformas.length ? plataformas : undefined,
      actores: modo === 'detallada' && actores.length ? actores.map((a) => a.id) : undefined,
      directores: modo === 'detallada' && directores.length ? directores.map((d) => d.id) : undefined,
      anio: armarAnio(),
      complejidad: complejidad[0] || undefined,
    };
  }

  /**
   * Lo único que viaja como filtro inicial es lo que traiga la sub-opción
   * de donde vino el usuario (hoy, el `{ limitesEdad: ['ATP'] }` de
   * Familia). Los campos del formulario van todos como Preferencias: desde
   * que el motor sabe resolver Clásicos y Complejidad con sus propias
   * búsquedas, ya no hay ninguno que necesite el rodeo de mandarse como
   * filtro para no perderse.
   */
  function armarFiltrosIniciales() {
    const filtros = { ...filtrosIniciales };
    return Object.keys(filtros).length ? filtros : undefined;
  }

  /**
   * El formulario entero, para que la flecha de "Volver" de /resultados pueda
   * devolverlo tal cual estaba. Viaja en el state de la navegación y no en
   * sessionStorage: es un dato de ESTA navegación, no algo que deba sobrevivir
   * a cerrar la pestaña, y así se va solo cuando el usuario empieza de nuevo.
   *
   * Los campos disponibles (géneros, países…) no van: son catálogos que la
   * pantalla vuelve a pedir al montarse.
   */
  function instantaneaDelFormulario() {
    return {
      tipos,
      parecidoA,
      generos,
      plataformas,
      actores,
      directores,
      paises,
      idiomas,
      modalidadAnio,
      anioDesde,
      anioHasta,
      decadas,
      aniosSueltos,
      complejidad,
      prioridades,
    };
  }

  function origenParaVolver() {
    return {
      ruta: '/buscar',
      estado: { modo, filtrosIniciales, restaurar: instantaneaDelFormulario() },
    };
  }

  function irAResultados(soloUno) {
    if (!validarAnio()) return;

    /**
     * Una sola prioridad no divide nada: no tiene con qué entrar en
     * conflicto, y todo lo no priorizado sigue aplicando igual. Así que
     * recién a partir de dos vale la pena mandarlas.
     */
    const prioridadesAEnviar = prioridadesActivas.length >= 2 ? prioridadesActivas : undefined;

    /**
     * Con referencias elegidas, la búsqueda sale de las listas de
     * similares en vez de discover, pero el resto de las Preferencias se
     * sigue respetando: el backend se queda con los similares que además
     * las cumplen (ver opciones/parecidoA.js).
     */
    if (parecidoA.length > 0) {
      navigate('/resultados', {
        state: {
          flujo: 'parecido-a',
          parametros: {
            referencias: parecidoA.map((r) => ({ tmdb_id: r.tmdb_id, tipo: r.tipo })),
            preferencias: armarPreferencias(),
            prioridades: prioridadesAEnviar,
          },
          soloUno,
          filtrosIniciales: armarFiltrosIniciales(),
          origen: origenParaVolver(),
        },
      });
      return;
    }

    navigate('/resultados', {
      state: {
        flujo: 'buscar',
        parametros: { preferencias: armarPreferencias(), prioridades: prioridadesAEnviar },
        soloUno,
        filtrosIniciales: armarFiltrosIniciales(),
        origen: origenParaVolver(),
      },
    });
  }

  function buscarAhora(e) {
    e.preventDefault();
    irAResultados(false);
  }

  return (
    <main id="contenido" className="resplandor pagina-ancho">
      {/* La salida de la pantalla, para quien entró y se arrepintió. Va
          arriba de todo y no al final: si estuviera abajo de las opciones,
          quien quiere salir tendría que pasar por encima de todas ellas. */}
      <div className="mb-6">
        <EnlaceVolver />
      </div>

      <h1 className="titulo-pagina text-center">Búsqueda con preferencias</h1>
      <p className="mx-auto mt-2 max-w-lg text-center text-sm text-crema/50">
        {modo === 'simple'
          ? 'Búsqueda simple: lo justo para arrancar. Si te queda corta, volvé y elegí "Detallada".'
          : 'Búsqueda detallada: todas las preferencias en un solo formulario.'}
      </p>

      <form onSubmit={buscarAhora} className="panel mt-8 space-y-8 p-6">
        <Seccion titulo="Tipo" prioridad={prioridadDe('tipo')}>
          <SelectorLista etiqueta="Tipo" opciones={TIPOS} seleccionados={tipos} onCambiar={setTipos} multiple />
        </Seccion>

        <Seccion titulo="Parecido a" prioridad={prioridadDe('parecidoA')}>
          <Autocompletado
            buscarFn={buscarTituloCb}
            valor={parecidoA}
            onChange={cambiarParecidoA}
            obtenerClave={(t) => `${t.tipo}:${t.tmdb_id}`}
            renderOpcion={(t) => `${t.titulo}${t.anio ? ` (${t.anio})` : ''}`}
            renderChip={(t) => t.titulo}
            etiqueta="Parecido a"
            placeholder="Buscar una película o serie de referencia…"
          />
          {avisoReferencias && (
            <RegionViva rol="status" className="mt-1.5 text-xs text-crema/50">
              {avisoReferencias}
            </RegionViva>
          )}
          {/*
            Sección 6: "Permite seleccionar toda la lista Favoritas como
            referencia (si no está vacía; si está vacía, esa opción no se
            muestra)". Por eso el botón aparece solo cuando hay algo.
          */}
          {cantidadFavoritas > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={usarFavoritas}
                disabled={cargandoFavoritas}
                className="boton-secundario"
              >
                {cargandoFavoritas
                  ? 'Trayendo tus favoritas…'
                  : 'Usar mis favoritas como referencia'}
              </button>
              {errorFavoritas && (
                <RegionViva rol="alert"  className="mensaje-error mt-1.5">
                  {errorFavoritas}
                </RegionViva>
              )}
            </div>
          )}

          {parecidoA.length > 0 && (
            <p className="mt-1.5 text-xs text-crema/50">
              Con referencias elegidas, la búsqueda se arma por similitud y el resto de las preferencias se
              aplican sobre esos parecidos. Si quedan pocos, completamos la lista con títulos que cumplen tus
              preferencias, señalados aparte.
            </p>
          )}
        </Seccion>

        {modo === 'detallada' && (
          <Seccion titulo="Disponible en" prioridad={prioridadDe('plataformas')}>
            <SelectorLista
              etiqueta="Disponible en"
              opciones={opcionesProveedores}
              seleccionados={plataformas}
              onCambiar={setPlataformas}
              multiple
              desplegable
            />
            {/* Misma regla que Favoritas: la opción no se muestra si la
                lista está vacía (sección 6).

                Los ids van tal cual llegan del contexto, que son NÚMEROS,
                porque `opcionesProveedores` de acá arriba usa `valor: p.id`,
                también número. Pasarlos por String() rompe dos cosas en
                silencio: el chip pierde su etiqueta y muestra el id pelado
                (SelectorLista busca la opción con un Map, y `get('8')` no
                encuentra la clave 8), y la criba de "Parecido a" descarta
                todo, porque `aplicarFiltros` compara con includes() contra
                los ids numéricos del candidato. Ojo que
                PaginaMisPlataformas.jsx sí trabaja con strings: ahí las
                opciones se arman con `valor: String(p.id)` y se vuelven a
                Number() al guardar. */}
            {misPlataformas.length > 0 && (
              <button
                type="button"
                onClick={() => setPlataformas([...misPlataformas])}
                className="boton-secundario mt-2"
              >
                Usar mis plataformas guardadas
              </button>
            )}
          </Seccion>
        )}

        <Seccion titulo="Género" prioridad={prioridadDe('generos')}>
          <SelectorLista
            etiqueta="Género"
            opciones={opcionesGeneros}
            seleccionados={generos}
            onCambiar={setGeneros}
            multiple
            desplegable
          />
          <label className="mt-3 flex items-center gap-2 text-sm text-crema/70">
            <input
              type="checkbox"
              checked={verClasicos}
              onChange={(e) => alternarVerClasicos(e.target.checked)}
              className="casilla"
            />
            Ver clásicos
          </label>
          {/*
            No es un error, es información: el usuario no hizo nada mal. Va con
            aria-live para que un lector de pantalla lo anuncie, porque el
            cambio lo dispara tocar OTRO campo (Tipo) y si no pasaría
            desapercibido.

            **En la práctica ahora solo lo alcanza "Película de TV"**, desde que
            los otros cinco géneros sin equivalente se recrean con keywords. Por
            eso el texto ya no culpa a TMDb: que "Película de TV" no aplique a
            una serie no es una limitación de nadie, es lo que significa. El
            mecanismo se deja genérico igual, que no cuesta nada.
          */}
          {generosDescartados.length > 0 && (
            <RegionViva rol="status"  className="texto-ayuda mt-2">
              {generosDescartados.length === 1
                ? `Saqué ${generosDescartados[0]}: no aplica a series.`
                : `Saqué ${formatearLista(generosDescartados)}: no aplican a series.`}
            </RegionViva>
          )}
        </Seccion>

        {modo === 'detallada' && (
          <>
            <Seccion titulo="Actor / actriz" prioridad={prioridadDe('actores')}>
              <Autocompletado
                buscarFn={buscarPersonaCb}
                valor={actores}
                onChange={setActores}
                obtenerClave={(p) => p.id}
                renderOpcion={(p) => `${p.nombre}${p.departamentoConocido ? ` · ${p.departamentoConocido}` : ''}`}
                renderChip={(p) => p.nombre}
                etiqueta="Actor / actriz"
                placeholder="Buscar actor o actriz…"
              />
            </Seccion>

            <Seccion titulo="Director/a, productor/a…" prioridad={prioridadDe('directores')}>
              <Autocompletado
                buscarFn={buscarPersonaCb}
                valor={directores}
                onChange={setDirectores}
                obtenerClave={(p) => p.id}
                renderOpcion={(p) => `${p.nombre}${p.departamentoConocido ? ` · ${p.departamentoConocido}` : ''}`}
                renderChip={(p) => p.nombre}
                etiqueta="Director/a, productor/a…"
                placeholder="Buscar director/a…"
              />
            </Seccion>

            {(actores.length > 0 || directores.length > 0) && (
              <p className="-mt-4 text-xs text-crema/60">
                {parecidoA.length > 0
                  ? 'Nota: por una limitación de la fuente de datos, los títulos que agreguemos para completar la lista van a ser solo películas.'
                  : 'Nota: por una limitación de la fuente de datos, Actor/Director solo puede filtrar películas, se excluyen series de esta búsqueda mientras estén activos.'}
              </p>
            )}

            <Seccion titulo="País de origen" prioridad={prioridadDe('paises')}>
              <SelectorLista
                etiqueta="País de origen"
                opciones={opcionesPaises}
                seleccionados={paises}
                onCambiar={setPaises}
                multiple
                desplegable
              />
            </Seccion>

            <Seccion titulo="Idioma original" prioridad={prioridadDe('idiomas')}>
              <SelectorLista
                etiqueta="Idioma original"
                opciones={opcionesIdiomas}
                seleccionados={idiomas}
                onCambiar={setIdiomas}
                multiple
                desplegable
              />
            </Seccion>

            <Seccion titulo="Año" prioridad={prioridadDe('anio')}>
              <SelectorLista
                etiqueta="Cómo elegir el año"
                opciones={MODALIDADES_ANIO}
                seleccionados={modalidadAnio}
                onCambiar={(v) => setModalidadAnio(v.length ? v : ['rango'])}
                multiple={false}
              />

              {!usaRangoDeAnios && (
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="mb-2 text-sm text-crema/70">Décadas</p>
                    <SelectorLista
                      etiqueta="Décadas"
                      opciones={OPCIONES_DECADAS}
                      seleccionados={decadas}
                      onCambiar={setDecadas}
                      multiple
                      desplegable
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-crema/70">Años sueltos</p>
                    <SelectorLista
                      etiqueta="Años sueltos"
                      opciones={OPCIONES_ANIOS}
                      seleccionados={aniosSueltos}
                      onCambiar={setAniosSueltos}
                      multiple
                      desplegable
                    />
                  </div>
                </div>
              )}

              <div className={`items-center gap-3 ${usaRangoDeAnios ? 'mt-4 flex' : 'hidden'}`}>
                <CampoNumero
                  id="anio-desde"
                  etiqueta="Año desde"
                  etiquetaVisible={false}
                  placeholder="Desde"
                  valor={anioDesde}
                  onCambiar={(v) => {
                    setAnioDesde(v);
                    setAnioRevisado(false);
                  }}
                  onBlur={revisarAnioAlSalir}
                  max={ANIO_MAXIMO}
                  valorInicial={ANIO_ACTUAL}
                  className="w-36"
                />
                <span aria-hidden="true" className="text-crema/60">
                  -
                </span>
                <CampoNumero
                  id="anio-hasta"
                  etiqueta="Año hasta"
                  etiquetaVisible={false}
                  placeholder="Hasta"
                  valor={anioHasta}
                  onCambiar={(v) => {
                    setAnioHasta(v);
                    setAnioRevisado(false);
                  }}
                  onBlur={revisarAnioAlSalir}
                  max={ANIO_MAXIMO}
                  valorInicial={ANIO_ACTUAL}
                  className="w-36"
                />
              </div>
              {errorAnio && (
                <RegionViva rol="alert"  className="mensaje-error mt-1.5">
                  {errorAnio}
                </RegionViva>
              )}
              {!errorAnio && avisoAnioVisible && (
                <p className="texto-ayuda mt-1.5">¿No es un poco viejo?</p>
              )}
              {!usaRangoDeAnios && decadas.length + aniosSueltos.length > 1 && (
                <p className="mt-3 text-xs text-crema/50">
                  Buscamos títulos de cualquiera de los períodos elegidos. Cuantos más agregues, más tarda la
                  búsqueda.
                </p>
              )}
            </Seccion>
          </>
        )}

        <Seccion titulo="Complejidad" prioridad={prioridadDe('complejidad')}>
          <SelectorLista
            etiqueta="Complejidad"
            opciones={COMPLEJIDADES}
            seleccionados={complejidad}
            onCambiar={setComplejidad}
            multiple={false}
          />
        </Seccion>

        {/*
          Qué van a hacer las prioridades marcadas, dicho antes de buscar.
          Con una sola no pasa nada (no hay con qué entrar en conflicto), y
          eso conviene avisarlo: si no, el usuario marca una, no ve ninguna
          diferencia, y concluye que el botón no anda.
        */}
        {prioridadesActivas.length > 0 && (
          <RegionViva rol="status" como="div"  className="rounded-panel border border-linea bg-noche/60 p-4 text-sm text-crema/70">
            {prioridadesActivas.length === 1 ? (
              <>
                Marcaste una sola prioridad. Priorizar sirve para decidir qué se cede cuando dos o más
                preferencias no pueden cumplirse a la vez, así que con una sola la búsqueda sale igual que
                siempre.
              </>
            ) : (
              <>
                Si no hay títulos que cumplan tus {prioridadesActivas.length} prioridades a la vez, dividimos
                los resultados: cada división cumple una y deja afuera las otras. El resto de lo que pediste
                sigue aplicando en todas.
                {enElTope && ' Llegaste al máximo de prioridades que podemos combinar.'}
              </>
            )}
          </RegionViva>
        )}

        <div className="flex flex-col items-center gap-4">
          <button
            type="submit"
            className="boton-destacado w-full"
          >
            Buscar
          </button>
          <BotonSuerte onClick={() => irAResultados(true)} />
        </div>
      </form>
    </main>
  );
}
