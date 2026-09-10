import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { estadoTerminos, aceptarTerminos } from '../api/cliente.js';
import { useSesion } from './ContextoSesion.jsx';

const ContextoTerminos = createContext(null);

/**
 * Si esta persona tiene que volver a aceptar los Términos.
 *
 * Lo pide el punto 9 de /terminos: a quien ya tiene cuenta se le vuelve a
 * pedir la aceptación ante un cambio que le imponga algo nuevo, en vez de
 * darla por hecha. Quien navega sin cuenta los acepta por uso y no ve nada de
 * esto.
 *
 * **QUIÉN DECIDE ES EL SERVIDOR.** Acá no hay ninguna fecha escrita ni ninguna
 * comparación: se pregunta por `GET /terminos/estado` y se muestra lo que
 * conteste. La fecha vigente vive en un solo lugar (`backend/src/config/
 * terminos.js`), y ese es el punto: con una copia de este lado, actualizar una
 * sola de las dos le pediría la aceptación a gente que ya aceptó, o peor, no
 * se la pediría a quien no.
 *
 * ES UN CONTEXTO Y NO UN `useEffect` EN CADA PANTALLA porque hay dos
 * consumidores que tienen que coincidir siempre: el aviso que aparece arriba
 * de todas las pantallas y la pantalla que registra la aceptación. Con un
 * pedido por consumidor, aceptar en una no apagaría el aviso de la otra hasta
 * recargar.
 */
export function ProveedorTerminos({ children }) {
  const { usuario, cargando: cargandoSesion } = useSesion();

  const [pendiente, setPendiente] = useState(false);
  const [consultado, setConsultado] = useState(false);

  useEffect(() => {
    /**
     * Sin sesión no se pregunta nada. El endpoint contesta igual (siempre
     * `pendiente: false`), pero el uso sin cuenta es el normal en esta app y
     * no tiene por qué pagar un pedido para que le digan que no le toca.
     */
    if (cargandoSesion || !usuario) {
      setPendiente(false);
      setConsultado(!cargandoSesion);
      return;
    }

    let vigente = true;
    estadoTerminos()
      .then((datos) => {
        if (vigente) setPendiente(datos.pendiente === true);
      })
      .catch((err) => {
        /**
         * Si esto falla se sigue como si no hubiera nada pendiente, y es la
         * decisión importante de este archivo. El costo de equivocarse para el
         * otro lado es tapar la app entera con un pedido legal por un backend
         * caído; el de equivocarse para este es que la aceptación se pida en
         * la próxima visita. Nadie pierde nada mientras tanto: la fila de la
         * base sigue diciendo la verdad, y el script de administración también.
         */
        console.warn('[terminos] no se pudo consultar el estado:', err.message);
        if (vigente) setPendiente(false);
      })
      .finally(() => {
        if (vigente) setConsultado(true);
      });

    return () => {
      vigente = false;
    };
  }, [usuario, cargandoSesion]);

  const aceptar = useCallback(async () => {
    await aceptarTerminos();
    setPendiente(false);
  }, []);

  const valor = { pendiente, consultado, aceptar };

  return <ContextoTerminos.Provider value={valor}>{children}</ContextoTerminos.Provider>;
}

export function useTerminos() {
  const contexto = useContext(ContextoTerminos);
  if (!contexto) {
    throw new Error('useTerminos tiene que usarse dentro de <ProveedorTerminos>');
  }
  return contexto;
}
