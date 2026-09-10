import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  obtenerNoSeQueVer,
  obtenerPorTipo,
  obtenerPorEstadoAnimo,
  buscar,
  parecidoA,
  obtenerGeneros,
  obtenerPaises,
  obtenerIdiomas,
  obtenerProveedores,
} from '../api/cliente.js';
import { aplicarFiltrosCliente, ordenarCliente } from '../utils/filtrosCliente.js';
import GrillaResultados from '../components/GrillaResultados.jsx';
import EsqueletoGrilla from '../components/EsqueletoGrilla.jsx';
import EstadoVacio from '../components/EstadoVacio.jsx';
import TarjetaResultado from '../components/TarjetaResultado.jsx';
import PanelFiltros from '../components/PanelFiltros.jsx';
import { useSesion } from '../auth/ContextoSesion.jsx';
import { edadCumplida, franjaDeEdad, tieneLimiteDeEdad } from '../utils/edad.js';
import useMetadatos from '../utils/useMetadatos.js';
import RegionViva from '../components/RegionViva.jsx';
import EnlaceVolver from '../components/EnlaceVolver.jsx';

const claveDe = (c) => `${c.tipo}:${c.tmdb_id}`;

/**
 * Cuántos resultados son "una recomendación completa". Es el mismo 20 que el
 * resto de la app: el top del que sortea "Me siento con suerte" y el objetivo
 * de relleno de "Parecido a".
 */
const RESULTADOS_ESPERADOS = 20;

function tieneFiltros(filtros) {
  return Object.values(filtros ?? {}).some((v) => v !== undefined);
}

/**
 * Qué es cada bloque de la búsqueda con formulario vacío (sección 5), en
 * palabras del usuario. El título corto lo manda el backend; esto es la
 * línea que explica de dónde salió cada grupo.
 *
 * Las divisiones por prioridad (sección 6) traen su propia descripción desde
 * el backend, porque depende de qué priorizó el usuario y no se puede
 * escribir de antemano.
 */
const DESCRIPCION_DE_BLOQUE = {
  gustos: 'Salen de los géneros, años y tipos que marcaste como favoritos.',
  gustosResultantes: 'Parecidos a lo que tenés en Favoritas y en Visto.',
  populares: 'Lo que más se está viendo ahora.',
};

/**
 * "Por tus gustos" y "Porque te gustaron" son los dos bloques que pueden
 * juntar muchos títulos sin que el usuario haya pedido nada raro: el primero
 * hereda el tope de un discover normal (hasta 200 por lote), el segundo el
 * de MAXIMO_A_DETALLAR en el backend (80). Los dos ya vienen enteros en la
 * misma respuesta — no paginan — así que "Mostrar más" acá es revelar de a
 * LIMITE_SECCION_INICIAL sobre lo que ya está en memoria, sin pedirle nada
 * al servidor. "Populares" queda afuera a propósito: es el bloque que
 * sostiene la pantalla cuando no hay nada personalizado, y truncarlo
 * empeoraría justo el caso de quien no tiene ninguno de los otros dos.
 */
const CLAVES_SECCION_EXPANDIBLE = new Set(['gustos', 'gustosResultantes']);

/**
 * Los dos únicos flujos que traen bloques (sección 5, formulario vacío:
 * Opción 1 y Opción 3). Son los únicos donde vale la pena el adelanto de
 * `cargarLista` de acá abajo: "buscar", "parecido-a" y "estado-animo" no
 * tienen un bloque barato (Populares) separado de uno caro que valga la pena
 * adelantar, así que siguen pidiendo todo de una, como siempre.
 */
const FLUJOS_CON_BLOQUES = new Set(['no-se-que-ver', 'tipo']);

/**
 * Cuánto revela cada tanda de "Mostrar más".
 *
 * **NO son RESULTADOS_ESPERADOS, aunque arrancaron siendo ese mismo 20.** Ese
 * es el número de "una recomendación completa" (el top del que sortea "Me
 * siento con suerte", el objetivo de relleno de "Parecido a", el umbral del
 * aviso de "hay poco" de más abajo); esto es cuánto se muestra de una tanda
 * antes de tener que apretar "Mostrar más", que es una decisión de pantalla.
 * Bajar esto no mueve aquello: son dos preguntas distintas que casualmente
 * empezaron con el mismo valor, y separarlas es lo que permite acortar las
 * secciones sin tocar cuándo la app avisa que una búsqueda trajo poco.
 *
 * El de celular es más chico porque ahí la grilla es de 2 columnas (debajo del
 * `sm` de Tailwind — ver CLASES_GRILLA en GrillaResultados.jsx): 15 en 2
 * columnas serían 8 filas, contra las 3 de escritorio con 5, así que 10 (5
 * filas) queda más parejo.
 *
 * **No es reactivo a resize/rotación**, mismo criterio que
 * `tienePunteroGrueso()` y `prefiereMenosMovimiento()` en utils/movimiento.js:
 * se lee una sola vez, al cargar el módulo.
 */
const LIMITE_SECCION_ESCRITORIO = 15;
const LIMITE_SECCION_MOVIL = 10;
function limiteSeccionInicial() {
  if (typeof window === 'undefined' || !window.matchMedia) return LIMITE_SECCION_ESCRITORIO;
  return window.matchMedia('(max-width: 639px)').matches
    ? LIMITE_SECCION_MOVIL
    : LIMITE_SECCION_ESCRITORIO;
}
const LIMITE_SECCION_INICIAL = limiteSeccionInicial();

const CAMPOS_ORDEN = [
  { valor: 'puntuacion', etiqueta: 'Puntuación' },
  { valor: 'popularidad', etiqueta: 'Popularidad' },
  { valor: 'anio', etiqueta: 'Año' },
  { valor: 'duracion', etiqueta: 'Duración' },
  { valor: 'temporadas', etiqueta: 'Temporadas' },
  { valor: 'episodios', etiqueta: 'Episodios' },
];

/**
 * Lo que se anuncia por la región viva cuando la lista cambia.
 *
 * POR QUÉ ESTA PANTALLA NECESITA UNA Y LAS DEMÁS NO: acá los Filtros y el
 * Ordenar se aplican ENTEROS EN EL CLIENTE y al instante (ver 4.5 de
 * las notas de decisiones del proyecto). No hay ida al servidor, no hay demora, no hay esqueleto de
 * carga: nada delata que algo pasó. Mover "Puntuación mínima" a 9 puede
 * llevar la grilla de 80 títulos a 3 sin una sola palabra. La auditoría con
 * lector de pantalla del 2026-08-26 lo confirmó en los cuatro cambios
 * posibles (llegada de resultados, filtro, orden y "Traer más resultados"):
 * de los cuatro, no se anunciaba ninguno.
 *
 * EL TEXTO INCLUYE EL ORDEN A PROPÓSITO. Reordenar no cambia CUÁNTOS
 * resultados hay, así que un anuncio que dijera solo el número sería idéntico
 * al anterior, y una región viva que repite el mismo texto no siempre se
 * vuelve a anunciar. Nombrando el orden, el texto cambia y el anuncio sale.
 */
function anuncioDeResultados({ mostrados, total, orden }) {
  let base;
  if (mostrados === 0) base = 'Ningún resultado con los filtros puestos.';
  else if (mostrados === total) base = `${total} resultado${total === 1 ? '' : 's'}.`;
  else base = `Mostrando ${mostrados} de ${total} resultados.`;

  if (!orden.campo) return base;
  const campo = CAMPOS_ORDEN.find((c) => c.valor === orden.campo)?.etiqueta ?? orden.campo;
  const direccion = orden.direccion === 'asc' ? 'de menor a mayor' : 'de mayor a menor';
  return `${base} Ordenados por ${campo}, ${direccion}.`;
}

/**
 * Ruta compartida por las cinco opciones de búsqueda (sección 5 del
 * Definitivo). Cada pantalla de búsqueda arma sus propios criterios (solo
 * Preferencias, sección 4) y navega para acá con
 * `navigate('/resultados', { state })`. Los Filtros y el Ordenar
 * (secciones 7 y 8) viven exclusivamente acá: se traen los candidatos SIN
 * filtrar ni ordenar una sola vez, y de ahí en más cada cambio de filtro u
 * orden se aplica en memoria (utils/filtrosCliente.js), sin volver a
 * pedirle nada al backend.
 *
 * `location.state` esperado: { flujo, parametros, soloUno, filtrosIniciales? }
 */
/**
 * `filtros` solo se manda al backend en el camino de "Me siento con
 * suerte": ahí el título único lo elige el servidor (al azar entre los 20
 * mejores), así que si no sabe de los filtros, sortea sobre candidatos que
 * el usuario ya descartó. Para la lista completa se sigue pidiendo sin
 * filtros y filtrando en el cliente, como describe 4.5. Las
 * rutas GET de Opciones no aceptan filtros, pero tampoco los reciben:
 * todo flujo que arrastra filtros iniciales usa una ruta POST.
 */
function pedir(flujo, parametros, { conSuerte = false, filtros, lote = 1, sinLimiteDeEdad = false, soloRapido = false } = {}) {
  const comunes = { conSuerte, lote, sinLimiteDeEdad, soloRapido };
  switch (flujo) {
    case 'no-se-que-ver':
      return obtenerNoSeQueVer(comunes);
    case 'tipo':
      return obtenerPorTipo(parametros.tipoSeleccionado, comunes);
    case 'estado-animo':
      return obtenerPorEstadoAnimo(parametros.clave, comunes);
    case 'buscar':
      return buscar({ ...parametros, filtros }, comunes);
    case 'parecido-a':
      return parecidoA(parametros.referencias, {
        preferencias: parametros.preferencias,
        prioridades: parametros.prioridades,
        filtros,
        conSuerte,
        lote,
        sinLimiteDeEdad,
      });
    default:
      return Promise.reject(new Error('Tipo de búsqueda desconocido.'));
  }
}

export default function PaginaResultados() {
  useMetadatos('resultados');

  const { state } = useLocation();
  const { usuario } = useSesion();

  const [modo, setModo] = useState('cargando'); // 'cargando' | 'uno' | 'lista' | 'error'
  const [resultadoUnico, setResultadoUnico] = useState(null);
  const [candidatos, setCandidatos] = useState([]);
  const [error, setError] = useState(null);

  /**
   * Los tres bloques de la búsqueda con formulario vacío (sección 5). Solo
   * los devuelven las Opciones 1 y 3, y solo con sesión: en el resto de los
   * flujos queda vacío y la pantalla se comporta como siempre.
   */
  const [bloques, setBloques] = useState([]);

  /**
   * Cuánto se muestra de cada sección expandible (ver CLAVES_SECCION_EXPANDIBLE),
   * por clave de bloque. Ausente = LIMITE_SECCION_INICIAL.
   */
  const [mostradosPorSeccion, setMostradosPorSeccion] = useState({});

  /**
   * Sección 17: el límite de edad del perfil se aplica solo, y se puede
   * apagar. No es un Filtro más y por eso no vive en el panel: los Filtros
   * se aplican en el cliente sobre lo ya traído, y esto cambia lo que el
   * servidor manda, así que rehace la búsqueda.
   */
  const [sinLimiteDeEdad, setSinLimiteDeEdad] = useState(false);

  const [lote, setLote] = useState(1);
  const [hayMas, setHayMas] = useState(false);
  /**
   * Cuántos parecidos encontró la búsqueda antes de que los sacara la exclusión
   * de "Visto". Ver el cartel de abajo: sin este dato, "no existen" y "ya los
   * viste a todos" son indistinguibles desde acá.
   */
  const [parecidosEncontrados, setParecidosEncontrados] = useState(0);
  const [cargandoMas, setCargandoMas] = useState(false);

  const [filtros, setFiltros] = useState(state?.filtrosIniciales ?? {});
  const [orden, setOrden] = useState({ campo: '', direccion: 'desc' });

  // Lo que dice la región viva. Ver anuncioDeResultados, arriba.
  const [anuncio, setAnuncio] = useState('');
  const [panelAbierto, setPanelAbierto] = useState(false);

  const [generosDisponibles, setGenerosDisponibles] = useState([]);
  const [paisesDisponibles, setPaisesDisponibles] = useState([]);
  const [idiomasDisponibles, setIdiomasDisponibles] = useState([]);
  const [proveedoresDisponibles, setProveedoresDisponibles] = useState([]);

  useEffect(() => {
    obtenerGeneros().then((d) => setGenerosDisponibles(d.generos)).catch(() => {});
    obtenerPaises().then((d) => setPaisesDisponibles(d.paises)).catch(() => {});
    obtenerIdiomas().then((d) => setIdiomasDisponibles(d.idiomas)).catch(() => {});
    obtenerProveedores().then((d) => setProveedoresDisponibles(d.proveedores)).catch(() => {});
  }, []);

  const cargarUno = useCallback(async () => {
    setModo('cargando');
    setError(null);
    try {
      const datos = await pedir(state.flujo, state.parametros, {
        conSuerte: true,
        filtros: tieneFiltros(filtros) ? filtros : undefined,
        sinLimiteDeEdad,
      });
      setResultadoUnico(datos.resultado);
      setModo('uno');
    } catch (err) {
      setError(err.message);
      setModo('error');
    }
  }, [state, filtros, sinLimiteDeEdad]);

  const aplicarDatosDeLista = useCallback((datos) => {
    setCandidatos(datos.resultados);
    setBloques(datos.bloques ?? []);
    setMostradosPorSeccion({});
    setLote(1);
    setHayMas(Boolean(datos.hayMas));
    setParecidosEncontrados(datos.parecidosEncontrados ?? 0);
    setModo('lista');
  }, []);

  const cargarLista = useCallback(async () => {
    setModo('cargando');
    setError(null);

    /**
     * "no-se-que-ver" y "tipo" son los únicos con un bloque barato
     * (Populares, que no depende de nada personal) separado de dos que
     * pueden ser lentos (Gustos Registrados, Favoritas/Visto ponderado —
     * este último "la búsqueda más cara de la app", ver 4.19 de las notas de decisiones del proyecto).
     * Ahí conviene pedir un adelanto SOLO CON POPULARES en paralelo con el
     * pedido completo, para tener algo en pantalla antes. En el resto de los
     * flujos no hay nada que adelantar, así que siguen pidiendo todo junto.
     */
    if (!FLUJOS_CON_BLOQUES.has(state.flujo)) {
      try {
        const datos = await pedir(state.flujo, state.parametros, { sinLimiteDeEdad });
        aplicarDatosDeLista(datos);
      } catch (err) {
        setError(err.message);
        setModo('error');
      }
      return;
    }

    /**
     * El adelanto solo se aplica si el pedido completo no llegó primero: si
     * ya tenemos la respuesta de verdad, mostrar la parcial encima sería un
     * parpadeo hacia atrás y no un adelanto. Por eso `completaLlegada` se
     * revisa recién cuando el adelanto resuelve, nunca antes.
     */
    let completaLlegada = false;
    const pedidoCompleto = pedir(state.flujo, state.parametros, { sinLimiteDeEdad })
      .then((datos) => {
        completaLlegada = true;
        aplicarDatosDeLista(datos);
      })
      .catch((err) => {
        completaLlegada = true;
        setError(err.message);
        setModo('error');
      });

    pedir(state.flujo, state.parametros, { sinLimiteDeEdad, soloRapido: true })
      .then((datos) => {
        if (!completaLlegada) aplicarDatosDeLista(datos);
      })
      .catch(() => {
        /**
         * El adelanto es solo eso: si falla, no pasa nada — el pedido
         * completo sigue en camino y es el que de verdad importa.
         */
      });

    await pedidoCompleto;
  }, [state, sinLimiteDeEdad, aplicarDatosDeLista]);

  /**
   * Trae el lote siguiente de candidatos y lo suma a los que ya hay, sin
   * repetir. Es lo que destraba el caso incómodo de los Filtros: como se
   * aplican en el cliente sobre lo ya traído (ver 4.5), un
   * filtro exigente puede dejar la grilla casi vacía, y hasta ahora no
   * había forma de ampliar el conjunto sin rehacer la búsqueda entera.
   */
  const cargarMas = useCallback(async () => {
    setCargandoMas(true);
    setError(null);
    const siguiente = lote + 1;
    try {
      const datos = await pedir(state.flujo, state.parametros, { lote: siguiente, sinLimiteDeEdad });
      setCandidatos((previos) => {
        const yaEstaban = new Set(previos.map(claveDe));
        const nuevos = (datos.resultados ?? []).filter((c) => !yaEstaban.has(claveDe(c)));

        /**
         * Un título puede volver con más Coincidencias que antes: en "Parecido
         * a", uno que entró como relleno (coincidencias 0) para completar la
         * lista puede aparecer como parecido de verdad en el lote siguiente. La
         * sección en la que se muestra sale de ese número, así que quedarse con
         * la versión vieja lo dejaría para siempre bajo "Otros que cumplen tus
         * preferencias".
         */
        const llegados = new Map((datos.resultados ?? []).map((c) => [claveDe(c), c]));
        const actualizados = previos.map((previo) => {
          const llegado = llegados.get(claveDe(previo));
          return llegado && (llegado.coincidencias ?? 0) > (previo.coincidencias ?? 0)
            ? llegado
            : previo;
        });
        const huboMejora = actualizados.some((c, i) => c !== previos[i]);

        return nuevos.length || huboMejora ? [...actualizados, ...nuevos] : previos;
      });
      setLote(siguiente);
      setHayMas(Boolean(datos.hayMas));
      setParecidosEncontrados((previo) => Math.max(previo, datos.parecidosEncontrados ?? 0));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargandoMas(false);
    }
  }, [state, lote, sinLimiteDeEdad]);

  useEffect(() => {
    if (!state) return;
    if (state.soloUno) {
      cargarUno();
    } else {
      cargarLista();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, sinLimiteDeEdad]);

  const mostrados = useMemo(
    () => ordenarCliente(aplicarFiltrosCliente(candidatos, filtros), orden),
    [candidatos, filtros, orden]
  );
  const hayFiltrosActivos = Object.keys(filtros).length > 0;

  /**
   * Los géneros que estas series cumplen sin que TMDb se los asigne (Terror,
   * Thriller, Historia, Romance y Música no existen en su taxonomía; los deduce
   * el backend de las keywords, ver inferirGenerosDeSerie). El panel los
   * necesita para seguir ofreciéndolos cuando el Tipo elegido es Serie: si no,
   * una búsqueda de series de terror llena la grilla de series de terror y el
   * filtro de Terror no aparece.
   */
  const generosRecreados = useMemo(
    () => new Set(candidatos.flatMap((c) => c.generosInferidos ?? [])),
    [candidatos]
  );

  /**
   * Arma el anuncio de la región viva cuando cambia la lista.
   *
   * VA CON MEDIO SEGUNDO DE ESPERA y no en el acto: los filtros son campos
   * que se escriben (una puntuación mínima pasa por "9" mientras se tipea
   * "9.5") y cada tecla recalcula la lista. Sin la espera, el lector
   * encolaría un anuncio por tecla, que es tan inútil como el silencio que
   * había. Con la espera, se anuncia una vez, cuando la mano se detuvo.
   */
  useEffect(() => {
    if (modo !== 'lista') {
      setAnuncio('');
      return;
    }
    const t = setTimeout(() => {
      setAnuncio(anuncioDeResultados({ mostrados: mostrados.length, total: candidatos.length, orden }));
    }, 500);
    return () => clearTimeout(t);
  }, [modo, mostrados.length, candidatos.length, orden]);

  /**
   * El aviso del límite de edad solo aparece si de verdad hay uno: a los 17
   * o más no se aplica ninguno, así que ofrecer apagarlo sería confuso.
   */
  const aplicaLimiteDeEdad = Boolean(usuario) && tieneLimiteDeEdad(usuario?.fechaNacimiento);
  const franjaPropia = franjaDeEdad(edadCumplida(usuario?.fechaNacimiento));

  const hayPreferencias = Boolean(
    state?.parametros?.preferencias &&
      Object.values(state.parametros.preferencias).some((v) => (Array.isArray(v) ? v.length > 0 : v != null))
  );

  /**
   * Los resultados repartidos en secciones con título.
   *
   * Hay dos formas de dividir, y las dos se apagan en cuanto el usuario
   * elige un orden propio: ahí lo que quiere es una lista ordenada, y
   * partirla en grupos deja de tener sentido.
   *
   *  - **Los bloques que manda el backend**, que hoy son dos cosas
   *    distintas con la misma forma: los tres de la búsqueda con formulario
   *    vacío (Gustos Registrados, Favoritas/Visto, Populares) y las
   *    divisiones por prioridad en conflicto (sección 6). Cada candidato
   *    viene marcado con su bloque, así que la pantalla no necesita saber
   *    de cuál de los dos se trata.
   *  - **El relleno de "Parecido a"**: los que tienen coincidencias 0 no
   *    son parecidos, son lo que completa la lista cuando los similares no
   *    alcanzan (sección 16). Mezclarlos haría pasar por parecido algo que
   *    no lo es.
   *
   * Si no aplica ninguna, hay una sola sección con el título escondido
   * para lectores de pantalla (que igual hace falta, para que no se
   * salteen niveles de encabezado).
   */
  const secciones = useMemo(() => {
    /**
     * **Sin resultados no se dibuja ninguna sección.** Si no, la sección de más
     * abajo entra igual con la lista vacía y GrillaResultados pone su propio
     * cartel genérico, encima del de EstadoVacio: quedaban dos carteles
     * apilados diciendo lo mismo, y el de abajo sugería sacar una preferencia
     * aunque no hubiera ninguna puesta.
     */
    if (!mostrados.length) return [];

    if (!orden.campo && bloques.length > 1) {
      return bloques
        .map((b) => ({
          clave: b.clave,
          titulo: b.titulo,
          descripcion: b.descripcion ?? DESCRIPCION_DE_BLOQUE[b.clave],
          resultados: mostrados.filter((c) => c.bloque === b.clave),
        }))
        .filter((s) => s.resultados.length > 0);
    }

    if (state?.flujo === 'parecido-a' && !orden.campo) {
      /**
       * Los cruzados (títulos del otro tipo, ver cruceDeTipo.js en el backend)
       * llevan `coincidencias: 0` como el relleno, pero NO son relleno: vienen
       * intercalados entre los parecidos según cuánto se parecen, así que
       * mandarlos abajo desharía justamente eso. Se los reconoce por `cruzado`.
       */
      const parecidos = mostrados.filter((c) => c.coincidencias > 0 || c.cruzado);
      const relleno = mostrados.filter((c) => c.coincidencias === 0 && !c.cruzado);
      if (parecidos.length && relleno.length) {
        return [
          { clave: 'parecidos', titulo: 'Parecidos a tus referencias', resultados: parecidos },
          {
            clave: 'relleno',
            titulo: hayPreferencias ? 'Otros que cumplen tus preferencias' : 'Otros que pueden interesarte',
            descripcion: hayPreferencias
              ? 'No son parecidos a tus referencias, pero cumplen el resto de lo que pediste.'
              : 'Populares que comparten género con tus referencias, para completar la lista.',
            resultados: relleno,
          },
        ];
      }

      /**
       * **El cero hay que decirlo.** Con una combinación angosta ("parecido a
       * El Padrino" + Comedia + desde 1990) el backend contesta cero parecidos
       * y veinte de relleno, y eso está bien: esas películas no existen. Lo que
       * estaba mal era la pantalla, que sin las dos secciones caía en la grilla
       * sin título de más abajo, así que la persona veía veinte comedias y nada
       * le decía que ninguna se parecía a lo que había pedido.
       *
       * **Se mira `candidatos` y no `mostrados` a propósito**: si hubo parecidos
       * y los dejaron afuera los Filtros del panel, la explicación ya está a la
       * vista y es del usuario, así que ahí este cartel sobra.
       */
      const busquedaSinParecidos = !candidatos.some((c) => (c.coincidencias ?? 0) > 0);
      if (!parecidos.length && relleno.length && busquedaSinParecidos) {
        /**
         * **Cero parecidos tiene dos causas muy distintas y desde acá se ven
         * igual.** Puede que no existan, o puede que existan y estén todos en la
         * lista de "Visto", que el backend saca de cualquier búsqueda (sección
         * 5). Culpar a las preferencias en el segundo caso es doblemente malo:
         * afirma algo falso y sugiere aflojar una preferencia, que no cambiaría
         * nada. Por eso el backend manda cuántos encontró antes de excluir.
         */
        const yaVistos = parecidosEncontrados > 0;
        const queSonEstos = hayPreferencias
          ? 'Los que ves cumplen el resto de lo que pediste, pero no se parecen a tus referencias.'
          : 'Los que ves son populares que comparten género con tus referencias.';
        return [
          {
            clave: 'relleno',
            titulo: yaVistos
              ? 'Ya viste todos los parecidos que encontramos'
              : hayPreferencias
                ? 'No encontramos parecidos que cumplan tus preferencias'
                : 'No encontramos parecidos a tus referencias',
            descripcion: yaVistos
              ? `Los parecidos que encontramos ya están en tu lista de Visto. ${queSonEstos}`
              : hayPreferencias
                ? `${queSonEstos} Sacando alguna preferencia la búsqueda se amplía.`
                : queSonEstos,
            resultados: relleno,
          },
        ];
      }
    }

    return [{ clave: 'todos', titulo: 'Resultados de la búsqueda', oculto: true, resultados: mostrados }];
  }, [mostrados, candidatos, bloques, orden.campo, state?.flujo, hayPreferencias, parecidosEncontrados]);

  if (!state) {
    return (
      <main id="contenido" className="pagina-angosto text-center">
        <p className="text-crema/70">No hay ninguna búsqueda activa.</p>
        <Link to="/" className="mt-4 inline-block font-semibold text-manteca hover:underline">
          Volver al inicio
        </Link>
      </main>
    );
  }

  return (
    <main id="contenido" className="pagina-ancho">
      {/*
        Volver a la pantalla de la que vino la búsqueda, con lo que el usuario
        había cargado. Cada pantalla de origen manda su propio `origen` en el
        state: la ruta y lo que hace falta para reconstruirla (en /buscar, el
        formulario entero; en las de tarjetas, cuál estaba elegida).

        Sin `origen` (una búsqueda vieja, o una URL pegada a mano) el enlace
        apunta al inicio, que siempre existe. Por qué es un <Link> y no un
        navigate(-1): ver EnlaceVolver.
      */}
      <div className="mb-6">
        <EnlaceVolver
          a={state?.origen?.ruta ?? '/'}
          estado={state?.origen?.estado}
          /**
           * El texto lo puede fijar el origen: desde una Ficha no se vuelve a
           * ninguna búsqueda, se vuelve al título.
           */
          texto={state?.origen?.texto ?? (state?.origen?.ruta ? 'Volver a la búsqueda' : 'Volver al inicio')}
        />
      </div>

      <h1 className="titulo-pagina text-center">Resultados</h1>

      {/* La región viva de la pantalla. Es `status` (cortés) y no `alert`:
          esto acompaña a una acción que el usuario acaba de hacer, no
          interrumpe. Va vacía mientras se carga, porque de eso ya avisa el
          "Buscando algo bueno" de más abajo. */}
      <RegionViva rol="status"  className="solo-lector">
        {anuncio}
      </RegionViva>

      {/* Esqueleto en vez de los puntitos: una búsqueda tarda entre 2,5 y 3
          segundos, y el esqueleto además de dar señal de progreso reserva el
          espacio exacto que van a ocupar las tarjetas, así que la página no
          salta cuando llegan. El aviso para lectores de pantalla lo da el
          role="status", que el esqueleto no repite. */}
      {modo === 'cargando' && (
        <div className="mt-8">
          <RegionViva rol="status"  className="solo-lector">
            Buscando algo bueno
          </RegionViva>
          <EsqueletoGrilla />
        </div>
      )}

      {modo === 'error' && (
        <RegionViva rol="alert"  className="mensaje-error mt-6 text-center">
          {error}
        </RegionViva>
      )}

      {modo === 'uno' && resultadoUnico && (
        <div className="mt-10 flex flex-col items-center gap-6">
          <div className="w-full max-w-[220px]">
            <TarjetaResultado resultado={resultadoUnico} destacar />
          </div>
          <button
            type="button"
            onClick={cargarLista}
            className="text-sm font-semibold text-crema/80 hover:underline"
          >
            Más recomendaciones
          </button>
        </div>
      )}

      {modo === 'uno' && !resultadoUnico && (
        <EstadoVacio
          titulo="No encontramos nada con estos criterios"
          pista="Con la suerte no alcanzó. Podés ver la lista completa, que es más ancha."
          accion={
            <button type="button" onClick={cargarLista} className="boton-secundario">
              Ver todos los resultados
            </button>
          }
        />
      )}

      {modo === 'lista' && (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPanelAbierto((v) => !v)}
              aria-expanded={panelAbierto}
              className="boton-secundario"
            >
              Filtros{hayFiltrosActivos ? ` (${Object.keys(filtros).length})` : ''} · {panelAbierto ? 'Ocultar' : 'Mostrar'}
            </button>

            <div className="flex items-center gap-2">
              <label htmlFor="ordenar-campo" className="text-sm text-crema/60">
                Ordenar por
              </label>
              <select
                id="ordenar-campo"
                value={orden.campo}
                onChange={(e) => setOrden((o) => ({ ...o, campo: e.target.value }))}
                className="campo w-auto text-sm"
              >
                <option value="">Sin ordenar</option>
                {CAMPOS_ORDEN.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
              {orden.campo && (
                <select
                  aria-label="Dirección del orden"
                  value={orden.direccion}
                  onChange={(e) => setOrden((o) => ({ ...o, direccion: e.target.value }))}
                  className="campo w-auto text-sm"
                >
                  <option value="desc">Mayor a menor</option>
                  <option value="asc">Menor a mayor</option>
                </select>
              )}
            </div>
          </div>

          {panelAbierto && (
            <div className="panel mt-4 p-6">
              <PanelFiltros
                filtros={filtros}
                onCambiar={setFiltros}
                generosDisponibles={generosDisponibles}
                generosRecreados={generosRecreados}
                paisesDisponibles={paisesDisponibles}
                idiomasDisponibles={idiomasDisponibles}
                proveedoresDisponibles={proveedoresDisponibles}
              />
            </div>
          )}

          {aplicaLimiteDeEdad && (
            <div className="panel mt-4 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="casilla mt-0.5"
                  checked={!sinLimiteDeEdad}
                  onChange={(e) => setSinLimiteDeEdad(!e.target.checked)}
                />
                <span className="text-sm text-crema/80">
                  <span className="font-semibold text-crema">
                    Estamos mostrándote solo títulos {franjaPropia === 'ATP' ? 'ATP' : `ATP y ${franjaPropia}`}
                  </span>
                  <span className="mt-0.5 block text-crema/60">
                    Es por la fecha de nacimiento de tu perfil. Podés destildarlo para ver todo.
                  </span>
                </span>
              </label>
            </div>
          )}

          <p className="mt-4 text-sm text-crema/50">
            {mostrados.length} {mostrados.length === 1 ? 'resultado' : 'resultados'}
            {mostrados.length !== candidatos.length && ` de ${candidatos.length} candidatos`}
          </p>

          {mostrados.length === 0 && candidatos.length > 0 && (
            <EstadoVacio
              titulo={`Ninguno de los ${candidatos.length} candidatos pasa los filtros`}
              pista="Podés aflojar alguno desde el panel de arriba, o traer más resultados para ampliar la búsqueda."
              accion={
                hayMas ? (
                  <button
                    type="button"
                    onClick={cargarMas}
                    disabled={cargandoMas}
                    className="boton-secundario"
                  >
                    {cargandoMas ? 'Buscando más…' : 'Traer más resultados'}
                  </button>
                ) : (
                  <button type="button" onClick={() => setFiltros({})} className="boton-secundario">
                    Sacar todos los filtros
                  </button>
                )
              }
            />
          )}

{/* **Una grilla flaca no se explica sola**, y ese era el agujero que anota la
              sección 6 de las notas de decisiones del proyecto: con "películas paraguayas" aparecen 12 títulos y
              nadie puede distinguir "existe poco" de "la app está rota". Va solo cuando
              no queda nada más por traer, o sea que estos SON todos; si hay otro lote,
              el botón de abajo ya es la respuesta y este cartel sería crying wolf.

              Se mira `candidatos` y no `mostrados`, igual que en el aviso de "Parecido
              a": si la grilla quedó flaca por los Filtros del panel, eso lo hizo el
              usuario y lo tiene a la vista. Y "Parecido a" queda afuera porque ya tiene
              sus propias secciones diciendo lo mismo mejor. */}
          {state?.flujo !== 'parecido-a' &&
            !hayMas &&
            mostrados.length > 0 &&
            candidatos.length < RESULTADOS_ESPERADOS && (
              <p className="mt-4 text-sm text-crema/60">
                Con lo que pediste hay poco, y estos son todos. No es un error: sacando
                alguna preferencia van a aparecer más.
              </p>
            )}

          {mostrados.length === 0 && candidatos.length === 0 && (
            <EstadoVacio
              titulo={
                parecidosEncontrados > 0
                  ? 'Ya viste todos los parecidos que encontramos'
                  : hayMas
                    ? 'En esta primera tanda no encontramos nada'
                    : 'No encontramos nada con estos criterios'
              }
              pista={
                parecidosEncontrados > 0
                  ? 'Los parecidos a tus referencias ya están en tu lista de Visto, así que no te los repetimos.'
                  : hayMas
                    ? 'Puede haber más en la tanda siguiente: probá con "Traer más resultados", acá abajo.'
                    : 'Probá sacando alguna preferencia, o ampliá el rango de años.'
              }
            />
          )}

          {secciones.map((seccion, i) => {
            const expandible = CLAVES_SECCION_EXPANDIBLE.has(seccion.clave);
            const cantidadMostrada = expandible
              ? (mostradosPorSeccion[seccion.clave] ?? LIMITE_SECCION_INICIAL)
              : seccion.resultados.length;
            const quedanMas = expandible && seccion.resultados.length > cantidadMostrada;

            return (
              <section key={seccion.clave} className={i === 0 ? '' : 'mt-12'}>
                <h2
                  className={
                    seccion.oculto ? 'solo-lector' : `${i === 0 ? 'mt-8' : ''} titulo-seccion`
                  }
                >
                  {seccion.titulo}
                </h2>
                {seccion.descripcion && !seccion.oculto && (
                  <p className="mt-1 text-sm text-crema/50">{seccion.descripcion}</p>
                )}
                <div className="mt-4">
                  <GrillaResultados resultados={seccion.resultados.slice(0, cantidadMostrada)} />
                </div>
                {quedanMas && (
                  <div className="mt-6 flex justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        setMostradosPorSeccion((previo) => ({
                          ...previo,
                          [seccion.clave]: cantidadMostrada + LIMITE_SECCION_INICIAL,
                        }))
                      }
                      className="boton-secundario"
                    >
                      Mostrar más
                    </button>
                  </div>
                )}
              </section>
            );
          })}

          {/* Un error al traer más no tira abajo la lista que ya está en
              pantalla, así que se muestra acá y no en el bloque de error
              general, que solo aparece cuando la búsqueda entera falló. */}
          {error && (
            <RegionViva rol="alert"  className="mensaje-error mt-6 text-center">
              No pudimos traer más resultados: {error}
            </RegionViva>
          )}

          {hayMas && (
            <div className="mt-10 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={cargarMas}
                disabled={cargandoMas}
                className="boton-secundario"
              >
                {cargandoMas ? 'Buscando más…' : 'Traer más resultados'}
              </button>
              {cargandoMas && (
                <RegionViva rol="status"  className="text-xs text-crema/50">
                  Esto puede tardar unos segundos.
                </RegionViva>
              )}
            </div>
          )}

          {!hayMas && candidatos.length > 0 && lote > 1 && (
            <p className="mt-10 text-center text-sm text-crema/50">
              No hay más resultados para esta búsqueda.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
