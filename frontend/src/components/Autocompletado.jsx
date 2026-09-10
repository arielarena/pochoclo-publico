import { useEffect, useRef, useState } from 'react';
import { formatearLista } from '../utils/texto.js';
import ListaDeChips from './ListaDeChips.jsx';
import RegionViva from '../components/RegionViva.jsx';

/**
 * Buscador con autocompletado genérico: escribís, espera un momento sin
 * tipear (debounce), muestra opciones, elegís, queda como chip removible.
 * Lo usan Actor/Director (vía buscarPersona) y Parecido a (vía
 * buscarTitulo) — misma mecánica, distinta fuente de datos.
 *
 * Si el usuario tipea algo que no matchea ninguna opción y se va del
 * campo sin elegir nada, ese intento queda registrado y se avisa debajo
 * del campo (acumulando todos los intentos fallidos de esa instancia).
 *
 * ------------------------------------------------------------------------
 * REESCRITO EL 2026-08-26 DESPUÉS DE LA AUDITORÍA CON LECTOR DE PANTALLA.
 *
 * ANTES DECÍA SER UN COMBOBOX Y NO SE COMPORTABA COMO UNO, que es peor que
 * no haber puesto ningún rol. El <input> declaraba `role="combobox"` y
 * `aria-autocomplete="list"`, pero no había `aria-controls`, la lista no era
 * un `listbox`, sus filas no eran `option`, no había `aria-activedescendant`
 * y no había NINGÚN manejador de teclado. Medido con NVDA: al escribir
 * "padrino" y apretar flecha abajo, se volvía a leer lo tipeado y no se movía
 * nada; a las sugerencias solo se llegaba con Tab, que las anunciaba como
 * botones sueltos.
 *
 * Eso importa porque el rol es una promesa: NVDA anuncia "cuadro combinado" y
 * quien lo escucha aprieta flecha abajo esperando recorrer las opciones.
 *
 * QUÉ CAMBIÓ, y por qué cada cosa:
 *
 *  - La lista pasó de <div> con <button> a <ul role="listbox"> con
 *    <li role="option">. Las opciones YA NO SON FOCUSABLES, y eso es
 *    deliberado: en el patrón de combobox el foco no se mueve nunca del
 *    campo, y quién está activo lo dice `aria-activedescendant`. Es lo que
 *    permite seguir escribiendo mientras se recorren las sugerencias.
 *  - Teclado completo: flechas, Enter, Escape, Inicio y Fin.
 *  - Una región viva que dice cuántas sugerencias hay. Antes se escribía y no
 *    pasaba nada audible. El patrón ya existía en el proyecto, aplicado en un
 *    solo lado (listas/BuscadorParaAgregar.jsx), así que esto lo empareja.
 *  - El aviso de "No encontramos a ..." pasó a `role="status"`. Aparecía en
 *    pantalla sin decir nada, y es justo el aviso que más falta le hace a
 *    quien no está mirando el campo.
 *  - Los chips salieron a ListaDeChips, que además arregla que el foco se
 *    perdiera al quitar uno.
 * ------------------------------------------------------------------------
 */
export default function Autocompletado({
  buscarFn,
  valor,
  onChange,
  obtenerClave,
  renderOpcion,
  renderChip,
  etiqueta,
  placeholder = 'Buscar…',
}) {
  const [consulta, setConsulta] = useState('');
  const [opciones, setOpciones] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(-1);
  const [intentosFallidos, setIntentosFallidos] = useState([]);
  const temporizador = useRef(null);
  const campoRef = useRef(null);
  const ultimaBusquedaResuelta = useRef({ consulta: '', huboResultados: true });
  /**
   * Identifica qué corrida del efecto de abajo es la más nueva. `clearTimeout`
   * evita que se DISPARE un pedido viejo mientras se sigue escribiendo, pero
   * no cancela uno que ya está en vuelo esperando red: sin esto, si "batman"
   * (pedido A) tarda más que "batman begins" (pedido B) y A responde después
   * de B, su `then` igual corría y pisaba las sugerencias correctas de B con
   * las de A.
   */
  const idPedido = useRef(0);

  const base = `autocompletado-${etiqueta
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`;
  const idCampo = base;
  const idLista = `${base}-lista`;
  const idOpcion = (i) => `${base}-opcion-${i}`;

  const desplegado = abierto && consulta.trim().length > 0;

  useEffect(() => {
    idPedido.current += 1;
    const idEfecto = idPedido.current;

    if (!consulta.trim()) {
      setOpciones([]);
      return;
    }
    setBuscando(true);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      try {
        const resultados = await buscarFn(consulta);
        /**
         * Si mientras esperábamos la red se disparó un pedido más nuevo (u
         * otro efecto vació la consulta), esta respuesta ya es vieja: se
         * descarta en vez de pisar lo que el usuario está viendo ahora.
         */
        if (idEfecto !== idPedido.current) return;
        setOpciones(resultados);
        ultimaBusquedaResuelta.current = { consulta: consulta.trim(), huboResultados: resultados.length > 0 };
      } catch {
        if (idEfecto !== idPedido.current) return;
        setOpciones([]);
        ultimaBusquedaResuelta.current = { consulta: consulta.trim(), huboResultados: false };
      } finally {
        if (idEfecto === idPedido.current) setBuscando(false);
      }
    }, 350);
    return () => clearTimeout(temporizador.current);
  }, [consulta, buscarFn]);

  /**
   * Al cambiar las sugerencias, la que estaba activa ya no existe. Se vuelve a
   * "ninguna" en vez de a la primera: preseleccionar haría que un Enter
   * apurado elija algo que el usuario no llegó a escuchar.
   */
  useEffect(() => {
    setIndiceActivo(-1);
  }, [opciones]);

  function elegir(opcion) {
    const clave = obtenerClave(opcion);
    if (!valor.some((v) => obtenerClave(v) === clave)) {
      onChange([...valor, opcion]);
    }
    setConsulta('');
    setOpciones([]);
    setIndiceActivo(-1);
  }

  function quitarPorClave(clave) {
    onChange(valor.filter((v) => obtenerClave(v) !== clave));
  }

  function alPerderFoco() {
    const textoIntentado = consulta.trim();
    const resuelta = ultimaBusquedaResuelta.current;
    if (textoIntentado && !buscando && resuelta.consulta === textoIntentado && !resuelta.huboResultados) {
      setIntentosFallidos((prev) => (prev.includes(textoIntentado) ? prev : [...prev, textoIntentado]));
      setConsulta('');
      setOpciones([]);
    }
    setTimeout(() => setAbierto(false), 150);
  }

  function alTeclear(e) {
    /**
     * Sin sugerencias en pantalla, las teclas hacen lo de siempre (mover el
     * cursor dentro del texto). Solo se las intercepta cuando hay una lista
     * que recorrer, salvo la flecha abajo, que además sirve para volver a
     * abrirla después de un Escape.
     */
    if (e.key === 'ArrowDown' && !desplegado && consulta.trim()) {
      setAbierto(true);
      return;
    }
    if (!desplegado || buscando || opciones.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setIndiceActivo((i) => (i + 1) % opciones.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setIndiceActivo((i) => (i <= 0 ? opciones.length - 1 : i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setIndiceActivo(0);
        break;
      case 'End':
        e.preventDefault();
        setIndiceActivo(opciones.length - 1);
        break;
      case 'Enter':
        /**
         * Solo si hay una opción activa. Sin eso, Enter enviaría el
         * formulario de Preferencias con el campo a medio escribir.
         */
        if (indiceActivo >= 0) {
          e.preventDefault();
          elegir(opciones[indiceActivo]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setAbierto(false);
        setIndiceActivo(-1);
        break;
      default:
        break;
    }
  }

  /**
   * Lo que se anuncia al asentarse la búsqueda.
   *
   * Va con `role="status"` (cortés), no `alert`: interrumpir lo que se está
   * leyendo por un conteo de sugerencias sería peor que el silencio que había.
   * Y solo se arma cuando la búsqueda terminó, así que el debounce de 350ms
   * hace que sea un anuncio por búsqueda y no uno por tecla. Es el mismo
   * cuidado que ya está documentado en auth/RequisitosContrasena.jsx.
   *
   * LA CONDICIÓN MIRA LA BÚSQUEDA RESUELTA Y NO ALCANZA CON `!buscando`, que
   * es lo que decía antes. `setBuscando(true)` vive dentro del efecto, o sea
   * que corre DESPUÉS del render, y en ese render intermedio `desplegado` ya
   * es true, `buscando` todavía es false y `opciones` está vacío: el anuncio
   * salía "Sin sugerencias." y medio segundo más tarde se desdecía con
   * "10 sugerencias.". Contradecirse es peor que el silencio que había antes,
   * porque quien lo escucha ya dejó de esperar. Comparando contra la consulta
   * que de verdad se resolvió, mientras se escribe no se anuncia nada.
   */
  let anuncio = '';
  if (desplegado && !buscando && ultimaBusquedaResuelta.current.consulta === consulta.trim()) {
    if (opciones.length === 0) anuncio = 'Sin sugerencias.';
    else if (opciones.length === 1) anuncio = '1 sugerencia. Usá las flechas para recorrerlas.';
    else anuncio = `${opciones.length} sugerencias. Usá las flechas para recorrerlas.`;
  }

  return (
    <div>
      <ListaDeChips
        chips={valor.map((v) => ({ clave: obtenerClave(v), etiqueta: renderChip(v) }))}
        onQuitar={quitarPorClave}
        alQuedarVacia={() => campoRef.current?.focus()}
      />

      <div className="relative">
        <label htmlFor={idCampo} className="solo-lector">
          {etiqueta}
        </label>
        <input
          ref={campoRef}
          id={idCampo}
          type="text"
          value={consulta}
          onChange={(e) => {
            setConsulta(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={alPerderFoco}
          onKeyDown={alTeclear}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={desplegado}
          aria-controls={desplegado ? idLista : undefined}
          aria-autocomplete="list"
          aria-activedescendant={indiceActivo >= 0 ? idOpcion(indiceActivo) : undefined}
          autoComplete="off"
          className="campo"
        />
        {desplegado && (
          <ul
            id={idLista}
            role="listbox"
            aria-label={`Sugerencias para ${etiqueta}`}
            className="panel-flotante barra-desplazamiento absolute z-20 mt-1 max-h-56 w-full overflow-y-auto bg-noche"
          >
            {buscando && (
              <li role="presentation" className="px-3 py-2 text-sm text-crema/50">
                Buscando…
              </li>
            )}
            {!buscando && opciones.length === 0 && (
              <li role="presentation" className="px-3 py-2 text-sm text-crema/50">
                Sin resultados
              </li>
            )}
            {!buscando &&
              opciones.map((op, i) => (
                <li
                  key={obtenerClave(op)}
                  id={idOpcion(i)}
                  role="option"
                  aria-selected={i === indiceActivo}
                  /* onMouseDown y no onClick: el blur del campo corre antes
                     que el click y cerraría la lista antes de que llegue. */
                  onMouseDown={(e) => {
                    e.preventDefault();
                    elegir(op);
                  }}
                  onMouseEnter={() => setIndiceActivo(i)}
                  className={`cursor-pointer px-3 py-2 text-left text-sm ${
                    i === indiceActivo ? 'bg-superficie text-crema' : 'text-crema'
                  }`}
                >
                  {renderOpcion(op)}
                </li>
              ))}
          </ul>
        )}
      </div>

      <RegionViva rol="status"  className="solo-lector">
        {anuncio}
      </RegionViva>

      {intentosFallidos.length > 0 && (
        /* role="status" y no un <p> pelado: aparece al salir del campo, o sea
           cuando el foco ya se fue a otro lado, así que sin esto se dibujaba
           en pantalla sin decir nada. */
        <RegionViva rol="status"  className="mt-1.5 text-xs text-crema/50">
          No encontramos a {formatearLista(intentosFallidos)}. Al continuar puede ser que no veas títulos suyos.
        </RegionViva>
      )}
    </div>
  );
}
