import { useEffect, useRef, useState } from 'react';
import { ID_EXTENSION } from '../config/sitio.js';
import {
  ENLACE_EXTENSION,
  abrirOpcionesDeExtension,
  extensionInstalada,
} from '../utils/extension.js';
import RegionViva from './RegionViva.jsx';

/**
 * LA EXTENSIÓN DE CHROME, en "Acerca de". Agregada el 2026-09-29.
 *
 * Con la extensión instalada ofrece abrir sus opciones, y sin ella ofrece
 * instalarla. Mientras no esté publicada (`ID_EXTENSION` en null) no se dibuja
 * nada, así que la página se ve exactamente como antes.
 *
 * MIENTRAS SE PREGUNTA NO SE MUESTRA NINGUNA DE LAS DOS SALIDAS. Contesta en
 * milisegundos, y mostrar "Instalar" para cambiarlo enseguida por "Abrir las
 * opciones" sería ofrecerle instalar algo a quien ya lo tiene, justo al lado de
 * donde está por apretar.
 *
 * EL BOTÓN NO SE DESHABILITA MIENTRAS ESPERA, con el mismo criterio que la
 * pantalla de opciones de la extensión: deshabilitar el control enfocado manda
 * el foco al `body` y el lector de pantalla arranca a leer la página de nuevo.
 * Alcanza con una bandera.
 *
 * EL RESULTADO SE ANUNCIA, porque `openOptionsPage` pasa al frente otra
 * pestaña y quien vuelve a esta no tiene otra forma de saber qué pasó. La
 * región se monta con cada intento (la `key`), así que un segundo intento con
 * el mismo resultado se vuelve a anunciar (ver 4.25.2 de las notas de decisiones del proyecto).
 */
export default function SeccionExtension() {
  const [estado, setEstado] = useState('consultando');
  const [resultado, setResultado] = useState(null);
  const ocupado = useRef(false);

  useEffect(() => {
    if (!ID_EXTENSION) return undefined;
    let vigente = true;
    extensionInstalada().then((si) => {
      if (vigente) setEstado(si ? 'instalada' : 'ausente');
    });
    return () => {
      vigente = false;
    };
  }, []);

  if (!ID_EXTENSION) return null;

  async function abrir() {
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      const ok = await abrirOpcionesDeExtension();
      setResultado((anterior) => ({ ok, vez: (anterior?.vez ?? 0) + 1 }));
    } finally {
      ocupado.current = false;
    }
  }

  return (
    <section id="extension" className="scroll-mt-24">
      <h2 className="titulo-seccion">Extensión para Chrome</h2>
      <p className="mt-2 leading-relaxed">
        Estando en Netflix, Prime Video, Disney+, HBO Max o Apple TV, la extensión de Pochoclo te
        recomienda un título disponible en esa misma plataforma. Si iniciaste sesión acá, tiene en
        cuenta tus Gustos Registrados y te deja guardarlo en tus listas.
      </p>

      {estado === 'instalada' && (
        <>
          <button type="button" onClick={abrir} className="boton-secundario mt-5">
            Abrir las opciones de la extensión
          </button>
          {resultado && (
            <RegionViva
              key={resultado.vez}
              rol={resultado.ok ? 'status' : 'alert'}
              className={`mt-3 text-sm ${resultado.ok ? 'text-crema/60' : 'mensaje-error'}`}
            >
              {resultado.ok
                ? 'Las opciones de la extensión se abrieron en otra pestaña.'
                : 'No se pudieron abrir las opciones. También se abren con el botón derecho sobre el ícono de Pochoclo en la lista de extensiones.'}
            </RegionViva>
          )}
        </>
      )}

      {estado === 'ausente' && (
        <>
          <p className="mt-3 text-sm leading-relaxed text-crema/60">
            Funciona en Chrome de computadora, no en el teléfono.
          </p>
          <a
            href={ENLACE_EXTENSION}
            target="_blank"
            rel="noopener noreferrer"
            className="boton-secundario mt-5"
          >
            Instalar la extensión
          </a>
        </>
      )}
    </section>
  );
}
