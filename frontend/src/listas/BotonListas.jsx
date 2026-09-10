import { useEffect, useId, useRef, useState } from 'react';
import { LISTAS, useListas } from './ContextoListas.jsx';
import RegionViva from '../components/RegionViva.jsx';

/**
 * El botón "+" de la sección 18: despliega un menú con las tres listas y
 * agrega o saca de cada una.
 *
 * Para usuario no registrado no se dibuja nada. Es a propósito: las listas
 * requieren cuenta, y un botón que solo sirve para avisar que no podés
 * usarlo es ruido en cada tarjeta de cada búsqueda.
 *
 * `onSugerirVisto` lo dispara el contexto cuando se agrega a Favoritas algo
 * que no está en Visto. Quién pregunta y cómo lo decide quien usa este
 * componente, porque la sección 18 pide dos formas distintas: un modal en
 * las tarjetas, y algo no bloqueante en el buscador de las listas.
 */
export default function BotonListas({ item, onSugerirVisto, compacto = false }) {
  const { puedeUsarListas, estaEn, alternar, pedirSugerenciaVisto } = useListas();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState('');
  const contenedorRef = useRef(null);
  const botonRef = useRef(null);
  const menuRef = useRef(null);
  const [corrimiento, setCorrimiento] = useState(0);
  const idMenu = useId();

  /**
   * Mantiene el menú adentro de la pantalla.
   *
   * EL PROBLEMA: el menú mide 208px y se ancla al borde derecho del botón
   * "+", que vive dentro de una tarjeta de la grilla. A 320px una tarjeta
   * mide unos 136px, así que el menú sobresale casi 80px por la izquierda de
   * su tarjeta, y en la columna izquierda eso cae fuera de la pantalla. No se
   * ve ni se puede alcanzar, porque App.jsx recorta con `overflow-x-clip`. Es
   * el mismo modo de fallo que ya había tenido el panel de Filtros (sección 6
   * de las notas de decisiones del proyecto), y lo encontró la auditoría del 2026-08-26 sobre la Ficha,
   * donde la grilla de parecidos tiene tarjetas igual de angostas.
   *
   * POR QUÉ EN JAVASCRIPT Y NO EN CSS: hay que saber dónde quedó el menú
   * DESPUÉS de posicionarlo, y eso CSS no lo puede consultar. Un ancho máximo
   * no alcanza, porque el problema no es el ancho sino el anclaje.
   *
   * Se mide una vez al abrir. No hace falta seguir el scroll: el menú se
   * cierra al hacer click afuera, y al cambiar el tamaño de la ventana
   * también se vuelve a montar.
   */
  useEffect(() => {
    if (!abierto) {
      setCorrimiento(0);
      return;
    }
    const caja = menuRef.current?.getBoundingClientRect();
    if (!caja) return;

    const margen = 8;
    if (caja.left < margen) setCorrimiento(margen - caja.left);
    else if (caja.right > window.innerWidth - margen) setCorrimiento(window.innerWidth - margen - caja.right);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;

    function alTeclado(e) {
      if (e.key === 'Escape') {
        setAbierto(false);
        botonRef.current?.focus();
      }
    }
    function alClickAfuera(e) {
      if (!contenedorRef.current?.contains(e.target)) setAbierto(false);
    }

    document.addEventListener('keydown', alTeclado);
    document.addEventListener('mousedown', alClickAfuera);
    return () => {
      document.removeEventListener('keydown', alTeclado);
      document.removeEventListener('mousedown', alClickAfuera);
    };
  }, [abierto]);

  if (!puedeUsarListas) return null;

  const enAlguna = LISTAS.some((l) => estaEn(l.clave, item));

  async function alAlternar(lista) {
    setError('');
    try {
      const { sugerirVisto } = await alternar(lista, item);

      /* EL ORDEN DE ESTAS TRES LÍNEAS IMPORTA, y salió de la auditoría con
         lector de pantalla del 2026-08-26.

         Antes el menú quedaba abierto y el foco se perdía: al agregar algo a
         Favoritas se abre el modal que pregunta si marcarlo como visto, y al
         cerrarlo el foco terminaba en el <body> (medido: apretando Tab se iba
         a la barra del navegador). Cerrando el menú y devolviendo el foco al
         "+" ANTES de disparar la sugerencia, el modal encuentra un elemento
         estable al que volver cuando se cierre.

         En el error NO se cierra: el mensaje vive adentro del menú, así que
         cerrarlo lo haría desaparecer antes de que se lea. */
      setAbierto(false);
      botonRef.current?.focus();

      /**
       * Sin un `onSugerirVisto` propio se usa el modal global del contexto,
       * que es el comportamiento por defecto de las tarjetas.
       */
      if (sugerirVisto) (onSugerirVisto ?? pedirSugerenciaVisto)(item);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div ref={contenedorRef} className="relative">
      <button
        ref={botonRef}
        type="button"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        aria-label={enAlguna ? `${item.titulo}: editar en qué listas está` : `Agregar ${item.titulo} a una lista`}
        onClick={() => setAbierto((x) => !x)}
        className={`flex items-center justify-center rounded-full font-semibold transition ${
          compacto ? 'h-8 w-8 text-lg' : 'h-9 w-9 text-xl'
        } ${
          enAlguna
            ? 'bg-manteca text-noche'
            : 'border border-linea-control bg-noche/80 text-crema backdrop-blur-sm hover:border-linea-activa'
        }`}
      >
        <span aria-hidden="true">{enAlguna ? '✓' : '+'}</span>
      </button>

      {abierto && (
        <div
          id={idMenu}
          ref={menuRef}
          style={corrimiento ? { transform: `translateX(${corrimiento}px)` } : undefined}
          className="panel-flotante absolute right-0 z-30 mt-2 w-52 max-w-[calc(100vw-1rem)] p-1.5"
        >
          {LISTAS.map((lista) => {
            const dentro = estaEn(lista.clave, item);
            return (
              <button
                key={lista.clave}
                type="button"
                onClick={() => alAlternar(lista.clave)}
                /* El nombre accesible va en aria-label y NO como un texto
                   escondido más, que es como estaba: el nombre salía de sumar
                   el texto visible y el escondido, así que se escuchaba
                   "Favoritas, agregar a Favoritas" (medido con NVDA). Acá el
                   aria-label reemplaza al nombre en vez de sumarse, y el texto
                   visible ("Favoritas") queda contenido en él, que es lo que
                   pide el criterio 2.5.3. */
                aria-label={dentro ? `Quitar de ${lista.etiqueta}` : `Agregar a ${lista.etiqueta}`}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-crema/5"
              >
                <span className={dentro ? 'font-semibold text-manteca' : 'text-crema/80'}>
                  {lista.etiqueta}
                </span>
                <span aria-hidden="true" className={dentro ? 'text-manteca' : 'text-crema/40'}>
                  {dentro ? '✓' : '+'}
                </span>
              </button>
            );
          })}
          {error && (
            <RegionViva rol="alert"  className="mensaje-error px-3 py-2">
              {error}
            </RegionViva>
          )}
        </div>
      )}
    </div>
  );
}
