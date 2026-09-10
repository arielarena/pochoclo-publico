import { useCallback, useState } from 'react';
import SelectorLista from './SelectorLista.jsx';
import Autocompletado from './Autocompletado.jsx';
import CampoNumero from './CampoNumero.jsx';
import { buscarPersona } from '../api/cliente.js';
import {
  ANIO_ACTUAL,
  ANIO_MAXIMO,
  MENSAJE_RANGO_ANIO_INVALIDO,
  anioSospechoso,
  rangoAnioInvalido,
} from '../utils/anios.js';
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
const EDADES = [
  { valor: 'ATP', etiqueta: 'ATP' },
  { valor: '+14', etiqueta: '+14' },
  { valor: '+17', etiqueta: '+17' },
];
const ESTADOS = [
  { valor: 'terminada', etiqueta: 'Terminada' },
  { valor: 'en_emision', etiqueta: 'En emisión' },
];

/**
 * Estos cuatro valores están duplicados a mano en PaginaBuscar.jsx, que tiene
 * el mismo par de campos Desde/Hasta. Si se cambian acá, cambiarlos allá.
 */
/**
 * Los IDs de género que existen en una sola de las dos taxonomías de TMDb.
 * Duplicados a mano desde backend/src/data/genres.js, que es la fuente: si
 * cambian allá, cambiarlos acá. Es el mismo trato que tiene
 * utils/filtrosCliente.js con logic/resultados.js (no hay tipos compartidos
 * entre frontend y backend).
 */
const SOLO_PELICULA = new Set([28, 12, 14, 36, 27, 10402, 10749, 878, 10770, 53, 10752]);
const SOLO_SERIE = new Set([10759, 10762, 10763, 10764, 10765, 10766, 10767, 10768]);
const EMPTY_SET = new Set();

/**
 * Las constantes del campo Año (con qué año arranca vacío, el techo, el piso
 * del aviso) y sus dos reglas viven en utils/anios.js, compartidas con el
 * campo Año de las Preferencias.
 */

/**
 * Filtros (sección 7 del Definitivo), exclusivos de /resultados. Se
 * aplican en el cliente sobre los candidatos ya traídos (ver
 * utils/filtrosCliente.js), así que cada cambio acá refleja al toque, sin
 * volver a pedirle nada al backend.
 *
 * Actor/Director SÍ están acá desde v2. Antes no podían estar: verificar si
 * un candidato tenía a una persona exigía pedirle sus créditos a TMDb, o sea
 * una llamada por título en cada búsqueda. Desde que `credits` viaja en el
 * mismo `append_to_response` que el resto del detalle, cada candidato ya
 * llega con los IDs de su reparto y su dirección, y filtrar pasó a ser una
 * comparación en memoria que no cuesta ni una llamada.
 */
export default function PanelFiltros({
  filtros,
  onCambiar,
  generosDisponibles,
  generosRecreados = EMPTY_SET,
  paisesDisponibles,
  idiomasDisponibles,
  proveedoresDisponibles,
}) {
  function set(campo, valor) {
    onCambiar({ ...filtros, [campo]: valor });
  }

  const buscarPersonaCb = useCallback((q) => buscarPersona(q).then((d) => d.resultados), []);

  /**
   * Los géneros que se muestran dependen del filtro de Tipo, porque TMDb tiene
   * dos taxonomías que comparten solo 8 IDs de 27. Ofrecer "Thriller" cuando
   * el Tipo elegido es Serie es ofrecer un filtro que deja la grilla vacía sin
   * explicar por qué: Thriller no existe para series en TMDb.
   *
   * **`generosRecreados` es la excepción, y es la que evita ofrecer un filtro
   * imposible sobre títulos que SÍ están en la grilla.** Cinco géneros que no
   * existen en la taxonomía de series (Terror, Thriller, Historia, Romance,
   * Música) el motor los recrea con keywords, así que una búsqueda de series de
   * terror devuelve series de terror de verdad. Esconder Terror ahí dejaría a
   * esos títulos sin forma de filtrarse. Trae los géneros que los candidatos en
   * mano cumplen por esa vía, así que solo aparecen cuando hay algo que filtrar.
   *
   * Acá se filtra en el cliente y no pidiendo la lista otra vez al backend,
   * a diferencia de PaginaBuscar: los Filtros ya trabajan enteros en memoria
   * sobre los candidatos traídos (ver 4.5), así que meter un
   * round-trip para esto rompería esa propiedad. Los IDs de cada taxonomía
   * están duplicados a mano acá; si cambian en data/genres.js del backend,
   * cambiarlos también acá.
   */
  const tipoElegido = filtros.tipo ?? [];
  const soloSeries = tipoElegido.length > 0 && !tipoElegido.includes('pelicula');
  const soloPeliculas = tipoElegido.length > 0 && tipoElegido.every((x) => x === 'pelicula');
  const generosVisibles = generosDisponibles.filter((g) => {
    if (soloSeries) return !SOLO_PELICULA.has(g.id) || generosRecreados.has(g.id);
    if (soloPeliculas) return !SOLO_SERIE.has(g.id);
    return true;
  });

  const opcionesGeneros = [
    ...generosVisibles.map((g) => ({ valor: g.id, etiqueta: g.nombre })),
    { valor: 'CLASICOS', etiqueta: 'Clásicos', oculto: true },
  ];
  const opcionesPaises = paisesDisponibles.map((p) => ({ valor: p.codigo, etiqueta: p.nombre }));
  const opcionesIdiomas = idiomasDisponibles.map((i) => ({ valor: i.codigo, etiqueta: i.nombre }));
  const opcionesProveedores = proveedoresDisponibles.map((p) => ({ valor: p.id, etiqueta: p.nombre }));

  const generosFiltro = filtros.generos ?? [];
  const verClasicos = generosFiltro.includes('CLASICOS');

  /**
   * La duración total se guarda en minutos, como el resto de las
   * duraciones, pero se pide en horas: nadie piensa una serie en "900
   * minutos", la piensa en "15 horas".
   */
  const aHoras = (minutos) => (minutos == null ? '' : Math.round(minutos / 60));
  function setDuracionTotal(campo, valorEnHoras) {
    const minutos = valorEnHoras === '' ? undefined : Math.round(Number(valorEnHoras) * 60);
    const nuevo = { ...filtros.duracionTotal, [campo]: minutos };
    const vacio = nuevo.mayorA == null && nuevo.menorA == null;
    set('duracionTotal', vacio ? undefined : nuevo);
  }

  const anioDesde = filtros.anio?.desde ?? '';
  const anioHasta = filtros.anio?.hasta ?? '';
  function setAnio(campo, valor) {
    const nuevo = { ...filtros.anio, [campo]: valor === '' ? undefined : Number(valor) };
    if (nuevo.desde == null && nuevo.hasta == null) set('anio', undefined);
    else set('anio', nuevo);
  }
  const anioInvalido = rangoAnioInvalido(anioDesde, anioHasta);
  const hayAnioSospechoso = anioSospechoso(anioDesde, anioHasta);

  /**
   * Igual que en PaginaBuscar: el aviso aparece al SALIR del campo, no
   * mientras se escribe, porque tipear "1990" pasa por "1" y por "19".
   */
  const [anioRevisado, setAnioRevisado] = useState(false);
  const avisoAnioVisible = anioRevisado && hayAnioSospechoso;

  return (
    /* `grid-cols-1` explícito, no `grid` a secas.
       La diferencia no es cosmética: sin declarar columnas, la grilla arma
       una columna implícita de tamaño `auto`, cuyo mínimo es el min-content
       de lo que tenga adentro. El par Desde/Hasta del campo Año son dos
       cajas de 128px más el guión, o sea 287px que no se achican, así que
       esa única columna crecía a 287 y se salía de la pantalla en un
       teléfono de 320 (medido: el panel entero desbordaba hasta 328px). Las
       utilities `grid-cols-N` de Tailwind son `repeat(N, minmax(0, 1fr))`,
       y ese 0 de mínimo es justamente lo que deja que la columna se achique. */
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div>
        <p className="etiqueta-campo mb-2">Tipo</p>
        <SelectorLista
          etiqueta="Tipo"
          opciones={TIPOS}
          seleccionados={filtros.tipo ?? []}
          onCambiar={(v) => set('tipo', v.length ? v : undefined)}
          multiple
        />
      </div>

      <div>
        <p className="etiqueta-campo mb-2">Género</p>
        <SelectorLista
          etiqueta="Género"
          opciones={opcionesGeneros}
          seleccionados={generosFiltro}
          onCambiar={(v) => set('generos', v.length ? v : undefined)}
          multiple
          desplegable
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-crema/70">
          <input
            type="checkbox"
            checked={verClasicos}
            onChange={(e) =>
              set(
                'generos',
                e.target.checked
                  ? [...generosFiltro, 'CLASICOS']
                  : generosFiltro.filter((g) => g !== 'CLASICOS').length
                    ? generosFiltro.filter((g) => g !== 'CLASICOS')
                    : undefined
              )
            }
            className="casilla"
          />
          Ver clásicos
        </label>
      </div>

      <div>
        <p className="etiqueta-campo mb-2">Disponible en</p>
        <SelectorLista
          etiqueta="Disponible en"
          opciones={opcionesProveedores}
          seleccionados={filtros.plataformas ?? []}
          onCambiar={(v) => set('plataformas', v.length ? v : undefined)}
          multiple
          desplegable
        />
      </div>

      <div>
        <p className="etiqueta-campo mb-2">País de origen</p>
        <SelectorLista
          etiqueta="País de origen"
          opciones={opcionesPaises}
          seleccionados={filtros.paises ?? []}
          onCambiar={(v) => set('paises', v.length ? v : undefined)}
          multiple
          desplegable
        />
      </div>

      <div>
        <p className="etiqueta-campo mb-2">Idioma original</p>
        <SelectorLista
          etiqueta="Idioma original"
          opciones={opcionesIdiomas}
          seleccionados={filtros.idiomas ?? []}
          onCambiar={(v) => set('idiomas', v.length ? v : undefined)}
          multiple
          desplegable
        />
      </div>

      <div>
        <p className="etiqueta-campo mb-2">Actor / actriz</p>
        <Autocompletado
          buscarFn={buscarPersonaCb}
          valor={filtros.actores ?? []}
          onChange={(v) => set('actores', v.length ? v : undefined)}
          obtenerClave={(p) => p.id}
          renderOpcion={(p) => `${p.nombre}${p.departamentoConocido ? ` · ${p.departamentoConocido}` : ''}`}
          renderChip={(p) => p.nombre}
          etiqueta="Actor / actriz"
          placeholder="Buscar actor o actriz…"
        />
      </div>

      <div>
        <p className="etiqueta-campo mb-2">Director/a, productor/a…</p>
        <Autocompletado
          buscarFn={buscarPersonaCb}
          valor={filtros.directores ?? []}
          onChange={(v) => set('directores', v.length ? v : undefined)}
          obtenerClave={(p) => p.id}
          renderOpcion={(p) => `${p.nombre}${p.departamentoConocido ? ` · ${p.departamentoConocido}` : ''}`}
          renderChip={(p) => p.nombre}
          etiqueta="Director/a, productor/a…"
          placeholder="Buscar director/a…"
        />
      </div>

      <div>
        <p className="etiqueta-campo mb-2">Complejidad</p>
        <SelectorLista
          etiqueta="Complejidad"
          opciones={COMPLEJIDADES}
          seleccionados={filtros.complejidad ? [filtros.complejidad] : []}
          onCambiar={(v) => set('complejidad', v[0] || undefined)}
          multiple={false}
        />
      </div>

      <div>
        <p className="etiqueta-campo mb-2">Año</p>
        <div className="flex items-center gap-3">
          <CampoNumero
            id="filtro-anio-desde"
            etiqueta="Año desde"
            etiquetaVisible={false}
            placeholder="Desde"
            valor={anioDesde}
            onCambiar={(v) => {
              setAnio('desde', v);
              setAnioRevisado(false);
            }}
            onBlur={() => setAnioRevisado(true)}
            max={ANIO_MAXIMO}
            valorInicial={ANIO_ACTUAL}
            className="w-32"
          />
          <span aria-hidden="true" className="text-crema/60">
            -
          </span>
          <CampoNumero
            id="filtro-anio-hasta"
            etiqueta="Año hasta"
            etiquetaVisible={false}
            placeholder="Hasta"
            valor={anioHasta}
            onCambiar={(v) => {
              setAnio('hasta', v);
              setAnioRevisado(false);
            }}
            onBlur={() => setAnioRevisado(true)}
            max={ANIO_MAXIMO}
            valorInicial={ANIO_ACTUAL}
            className="w-32"
          />
        </div>
        {anioInvalido && (
          <RegionViva rol="alert"  className="mensaje-error mt-1.5">
            {MENSAJE_RANGO_ANIO_INVALIDO}
          </RegionViva>
        )}
        {!anioInvalido && avisoAnioVisible && (
          <p className="texto-ayuda mt-1.5">¿No es un poco viejo?</p>
        )}
      </div>

      <div>
        <p className="etiqueta-campo mb-2">Límite de edad</p>
        <SelectorLista
          etiqueta="Límite de edad"
          opciones={EDADES}
          seleccionados={filtros.limitesEdad ?? []}
          onCambiar={(v) => set('limitesEdad', v.length ? v : undefined)}
          multiple
        />
      </div>

      <div>
        {/*
          El acotado a 0-10 lo hace CampoNumero al salir del campo. Acá se
          hacía en cada tecla, y eso peleaba con el usuario: tipear "10"
          pasa primero por "1", y cualquier segundo dígito quedaba
          reescrito antes de terminar de escribirlo.
        */}
        <CampoNumero
          id="filtro-puntuacion"
          etiqueta="Puntuación mínima"
          min={0}
          max={10}
          paso={0.5}
          valor={filtros.puntuacionMinima ?? ''}
          onCambiar={(v) => set('puntuacionMinima', v === '' ? undefined : Number(v))}
        />
      </div>

      <div>
        <p className="etiqueta-campo mb-2">Estado (series y miniseries)</p>
        <SelectorLista
          etiqueta="Estado"
          opciones={ESTADOS}
          seleccionados={filtros.estado ? [filtros.estado] : []}
          onCambiar={(v) => set('estado', v[0] || undefined)}
          multiple={false}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CampoNumero
          id="filtro-duracion-mayor"
          etiqueta="Duración mayor a (min)"
          min={0}
          valor={filtros.duracion?.mayorA ?? ''}
          onCambiar={(v) => set('duracion', { ...filtros.duracion, mayorA: v === '' ? undefined : Number(v) })}
        />
        <CampoNumero
          id="filtro-duracion-menor"
          etiqueta="Duración menor a (min)"
          min={0}
          valor={filtros.duracion?.menorA ?? ''}
          onCambiar={(v) => set('duracion', { ...filtros.duracion, menorA: v === '' ? undefined : Number(v) })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CampoNumero
          id="filtro-temporadas-mayor"
          etiqueta="Temporadas mayor a"
          min={0}
          valor={filtros.temporadas?.mayorA ?? ''}
          onCambiar={(v) => set('temporadas', { ...filtros.temporadas, mayorA: v === '' ? undefined : Number(v) })}
        />
        <CampoNumero
          id="filtro-temporadas-menor"
          etiqueta="Temporadas menor a"
          min={0}
          valor={filtros.temporadas?.menorA ?? ''}
          onCambiar={(v) => set('temporadas', { ...filtros.temporadas, menorA: v === '' ? undefined : Number(v) })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CampoNumero
          id="filtro-episodios-mayor"
          etiqueta="Episodios mayor a"
          min={0}
          valor={filtros.episodios?.mayorA ?? ''}
          onCambiar={(v) => set('episodios', { ...filtros.episodios, mayorA: v === '' ? undefined : Number(v) })}
        />
        <CampoNumero
          id="filtro-episodios-menor"
          etiqueta="Episodios menor a"
          min={0}
          valor={filtros.episodios?.menorA ?? ''}
          onCambiar={(v) => set('episodios', { ...filtros.episodios, menorA: v === '' ? undefined : Number(v) })}
        />
      </div>

      <div>
        <p className="etiqueta-campo mb-2">Cuánto lleva verla entera</p>
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero
            id="filtro-duracion-total-mayor"
            etiqueta="Más de (horas)"
            min={0}
            valor={aHoras(filtros.duracionTotal?.mayorA)}
            onCambiar={(v) => setDuracionTotal('mayorA', v)}
          />
          <CampoNumero
            id="filtro-duracion-total-menor"
            etiqueta="Menos de (horas)"
            min={0}
            valor={aHoras(filtros.duracionTotal?.menorA)}
            onCambiar={(v) => setDuracionTotal('menorA', v)}
          />
        </div>
        <p className="texto-ayuda mt-1.5">
          No todas las series tienen este dato. Las que no lo tengan quedan afuera mientras el filtro esté
          activo.
        </p>
      </div>
    </div>
  );
}
