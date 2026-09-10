import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSesion } from '../auth/ContextoSesion.jsx';
import ModalTipoBusqueda from '../components/ModalTipoBusqueda.jsx';
import {
  obtenerListas,
  agregarALista as agregarEnServidor,
  quitarDeLista as quitarEnServidor,
  guardarMisPlataformas,
} from '../api/cliente.js';
import RegionViva from '../components/RegionViva.jsx';

/** Las tres listas de la sección 18, con su nombre para mostrar. */
export const LISTAS = [
  { clave: 'favoritas', etiqueta: 'Favoritas', singular: 'Favoritas' },
  { clave: 'visto', etiqueta: 'Visto', singular: 'Visto' },
  { clave: 'ver_mas_tarde', etiqueta: 'Ver más tarde', singular: 'Ver más tarde' },
];

export function etiquetaDeLista(clave) {
  return LISTAS.find((l) => l.clave === clave)?.etiqueta ?? clave;
}

const ContextoListas = createContext(null);

const VACIAS = { favoritas: [], visto: [], ver_mas_tarde: [] };

function clave({ tipo, tmdb_id }) {
  return `${tipo}:${tmdb_id}`;
}

/**
 * Las listas del usuario, disponibles en toda la app.
 *
 * El diseño clave: se traen **una sola vez** al abrir sesión, y solo las
 * claves (tipo + tmdb_id), sin título ni póster. Con eso cada botón "+" de
 * cada tarjeta sabe al instante en qué listas está su título, sin una
 * llamada por tarjeta. Son pocos bytes por ítem, así que una lista de
 * cientos de títulos entra sin problema.
 *
 * Agregar y quitar actualizan el estado local **antes** de que conteste el
 * servidor, y lo revierten si falla. Sin eso, tocar "+" tendría una demora
 * visible en una acción que tiene que sentirse instantánea.
 *
 * Sin sesión, todo queda vacío y `puedeUsarListas` en false: la app se
 * sigue usando igual, solo que sin los botones de listas.
 */
export function ProveedorListas({ children }) {
  const { usuario } = useSesion();

  const [listas, setListas] = useState(VACIAS);
  const [vistosEnVerMasTarde, setVistosEnVerMasTarde] = useState([]);
  const [plataformas, setPlataformas] = useState([]);
  const [cargando, setCargando] = useState(false);

  /**
   * El título sobre el que se está preguntando "¿lo agregás también a
   * Visto?" (sección 18). Vive acá y no en cada tarjeta para que haya un
   * solo modal en toda la app en vez de uno por resultado.
   */
  const [sugerencia, setSugerencia] = useState(null);
  /* Lo que se anuncia al agregar o quitar. Ver la región viva del final. */
  const [anuncio, setAnuncio] = useState('');

  const recargar = useCallback(async () => {
    if (!usuario) {
      setListas(VACIAS);
      setVistosEnVerMasTarde([]);
      setPlataformas([]);
      return;
    }
    setCargando(true);
    try {
      const datos = await obtenerListas();
      setListas(datos.listas ?? VACIAS);
      setVistosEnVerMasTarde(datos.vistosEnVerMasTarde ?? []);
      setPlataformas(datos.plataformas ?? []);
    } catch (err) {
      console.error('No se pudieron traer las listas:', err.message);
    } finally {
      setCargando(false);
    }
  }, [usuario]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function estaEn(lista, item) {
    return (listas[lista] ?? []).some((x) => clave(x) === clave(item));
  }

  /**
   * Arma el texto de la región viva.
   *
   * POR QUÉ NOMBRA EL TÍTULO. En una tarjeta suelta alcanzaría con "Agregado a
   * Favoritas", pero los dos buscadores de las páginas de lista muestran una
   * fila por resultado y el botón de cada una está a un Tab del siguiente: sin
   * el título no se sabe sobre cuál se actuó. Es el mismo motivo por el que el
   * "+" lleva el título en su aria-label.
   *
   * El contador del final fuerza que dos acciones iguales seguidas produzcan
   * textos distintos. Sin él, agregar dos títulos a la misma lista deja el
   * mismo texto en la región y el lector no la vuelve a leer, así que la
   * segunda acción parece no haber ocurrido. Va fuera de la vista del usuario
   * porque la región es `solo-lector`, y de todos modos se lee como una pausa.
   */
  const contadorAnuncio = useRef(0);
  function anunciar(item, que) {
    contadorAnuncio.current += 1;
    const nombre = item?.titulo ? `${item.titulo}: ` : '';
    setAnuncio(`${nombre}${que}.${'\u00a0'.repeat(contadorAnuncio.current % 2)}`);
  }

  /**
   * Devuelve `{ sugerirVisto }`: true cuando se agregó a Favoritas algo que
   * no estaba en Visto. Quien llama decide cómo preguntarlo (la sección 18
   * pide un modal en las tarjetas y algo no bloqueante en el buscador de
   * las listas).
   */
  async function agregar(lista, item) {
    setListas((previas) => ({
      ...previas,
      [lista]: [...previas[lista], { tipo: item.tipo, tmdb_id: item.tmdb_id }],
    }));

    try {
      const { sugerirVisto } = await agregarEnServidor(lista, item);
      /**
       * La regla de "Ver más tarde" depende del cruce con Visto, así que
       * agregar a cualquiera de las dos puede cambiarla.
       */
      if (lista === 'visto' && estaEn('ver_mas_tarde', item)) {
        setVistosEnVerMasTarde((previos) => [...previos, { tipo: item.tipo, tmdb_id: item.tmdb_id }]);
      }
      if (lista === 'ver_mas_tarde' && estaEn('visto', item)) {
        setVistosEnVerMasTarde((previos) => [...previos, { tipo: item.tipo, tmdb_id: item.tmdb_id }]);
      }
      /* CUANDO VA A APARECER EL MODAL NO SE ANUNCIA ACÁ, y no es un olvido: su
         propio título ya dice "Agregaste X a Favoritas", así que las dos cosas
         juntas hacen que se escuche dos veces lo mismo. */
      if (!sugerirVisto) anunciar(item, `agregado a ${etiquetaDeLista(lista)}`);
      return { sugerirVisto };
    } catch (err) {
      /**
       * Deshace SOLO esta adición, sobre el estado vigente en ese momento —
       * no una foto de `listas` tomada al entrar a la función. Con una foto
       * vieja, si otra llamada a agregar/quitar sobre la misma lista corrió
       * en el medio (dos "+" apretados rápido) y ya terminó bien, restaurarla
       * le borraría también su cambio, aunque esa sí hubiera tenido éxito en
       * el servidor.
       */
      setListas((previas) => ({
        ...previas,
        [lista]: previas[lista].filter((x) => clave(x) !== clave(item)),
      }));
      throw err;
    }
  }

  async function quitar(lista, item) {
    setListas((previas) => ({
      ...previas,
      [lista]: previas[lista].filter((x) => clave(x) !== clave(item)),
    }));
    setVistosEnVerMasTarde((previos) => previos.filter((x) => clave(x) !== clave(item)));

    try {
      await quitarEnServidor(lista, item);
      anunciar(item, `quitado de ${etiquetaDeLista(lista)}`);
    } catch (err) {
      /**
       * Mismo criterio que en agregar: se repone SOLO este ítem sobre el
       * estado vigente, sin pisar `listas` entera con una foto vieja. El
       * chequeo de `some` evita duplicarlo si por otro camino ya había
       * vuelto a aparecer.
       */
      setListas((previas) =>
        previas[lista].some((x) => clave(x) === clave(item))
          ? previas
          : { ...previas, [lista]: [...previas[lista], { tipo: item.tipo, tmdb_id: item.tmdb_id }] }
      );
      throw err;
    }
  }

  async function alternar(lista, item) {
    if (estaEn(lista, item)) {
      await quitar(lista, item);
      return { sugerirVisto: false };
    }
    return agregar(lista, item);
  }

  async function guardarPlataformas(ids) {
    const anterior = plataformas;
    setPlataformas(ids);
    try {
      await guardarMisPlataformas(ids);
    } catch (err) {
      setPlataformas(anterior);
      throw err;
    }
  }

  const valor = {
    puedeUsarListas: Boolean(usuario),
    cargando,
    listas,
    plataformas,
    vistosEnVerMasTarde,
    estaEn,
    agregar,
    quitar,
    alternar,
    guardarPlataformas,
    recargar,
    cantidad: (lista) => (listas[lista] ?? []).length,
    pedirSugerenciaVisto: setSugerencia,
  };

  return (
    <ContextoListas.Provider value={valor}>
      {children}

      {/*
        UNA SOLA REGIÓN VIVA PARA TODA LA APP, por el mismo argumento que el
        modal de acá abajo: los botones "+" son uno por tarjeta y una región
        por tarjeta serían decenas en la grilla de resultados.

        Existe porque la auditoría del 2026-08-26 dejó la pregunta abierta y la
        respuesta era que no se anunciaba nada. Se veía tapado en el caso más
        común: al agregar el primer título a una lista, el "+" cambia de nombre
        ("Agregar X a una lista" pasa a "X: editar en qué listas está") y el
        foco vuelve ahí, así que el lector lee el nombre nuevo y parece un
        acuse de recibo. Pero **al agregarlo a una segunda lista el nombre ya
        no cambia**, y ahí no quedaba absolutamente ningún rastro audible:
        medido, ni región viva, ni modal, ni cambio de nombre. Quitar de una
        lista tenía el mismo problema.
      */}
      <RegionViva rol="status"  className="solo-lector">
        {anuncio}
      </RegionViva>

      {/*
        La pregunta inmediata de Favoritas -> Visto (sección 18). Se reusa
        el modal de elección que ya existe: sus props son genéricas
        (título, opciones, onElegir), aunque el nombre del archivo hable de
        tipo de búsqueda, que fue su primer uso.

        `!estaEn('visto', sugerencia)` es la carrera de agregar rápido a
        Favoritas y a Visto desde el mismo "+" antes de que aparezca este
        modal: `sugerirVisto` viaja en la respuesta del pedido a Favoritas, y
        si para cuando esa respuesta vuelve el pedido a Visto ya se resolvió
        (optimista, así que `listas` ya lo tiene), preguntar si marcarlo como
        visto sería una pregunta sobre algo que ya pasó. Al leer `estaEn` en
        cada render, esto también saca el modal si llegó a aparecer y la
        carrera se resuelve un instante después.
      */}
      {sugerencia && !estaEn('visto', sugerencia) && (
        <ModalTipoBusqueda
          titulo={`Agregaste ${sugerencia.titulo} a Favoritas. ¿La marcamos como vista?`}
          opciones={[
            { valor: 'si', etiqueta: 'Sí, marcarla como vista' },
            { valor: 'no', etiqueta: 'No, todavía no la vi' },
          ]}
          onElegir={async (respuesta) => {
            const item = sugerencia;
            setSugerencia(null);
            if (respuesta === 'si') {
              await agregar('visto', item).catch((err) =>
                console.error('No se pudo agregar a Visto:', err.message)
              );
            }
          }}
          onCerrar={() => setSugerencia(null)}
        />
      )}
    </ContextoListas.Provider>
  );
}

export function useListas() {
  const contexto = useContext(ContextoListas);
  if (!contexto) {
    throw new Error('useListas tiene que usarse dentro de <ProveedorListas>');
  }
  return contexto;
}
