import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Encabezado from './components/Encabezado.jsx';
import Pie from './components/Pie.jsx';
import Cargando from './components/Cargando.jsx';
import RutaPrivada from './components/RutaPrivada.jsx';
import LimiteDeError from './components/LimiteDeError.jsx';
import AvisoTerminos, { RUTA_ACEPTAR_TERMINOS } from './components/AvisoTerminos.jsx';
import DesplazarAlNavegar from './components/DesplazarAlNavegar.jsx';
import Inicio from './paginas/Inicio.jsx';

/**
 * Cada pantalla en su propio chunk (2026-09-01), en vez de las 25 adentro de
 * un solo bundle. Antes, entrar a "/" bajaba y parseaba también el código de
 * `/perfil`, `/crear-cuenta`, las tres páginas legales, etc., aunque nadie
 * fuera a tocarlas. Medido: el bundle único pesaba 496 kB (150 kB gzip).
 *
 * Lo que se queda arriba SIN lazy es el marco que se usa en cada render
 * (Encabezado, Pie, el aviso de Términos, el límite de error) — separarlo no
 * ahorra nada porque siempre hace falta. Lo que se lazy-carga es lo que
 * cambia según la ruta.
 *
 * `Inicio` se sacó del lazy loading el mismo día que se agregó (ver el aviso
 * de arriba en las notas de decisiones del proyecto, sección 5): es la puerta de entrada casi universal
 * del sitio (cualquiera que llega desde Google, un enlace compartido, o
 * escribiendo el dominio cae ahí primero), así que lazy-cargarla no ahorraba
 * nada en la práctica — su chunk se termina pidiendo en casi todas las
 * visitas igual — y sí garantizaba el destello del Suspense fallback en el
 * caso más común de todos. Las otras 24 pantallas sí se benefician: a esas
 * se llega navegando, así que su código nunca se pide si nadie las visita.
 *
 * No hace falta tocar la CSP de vite.config.js: los chunks son archivos del
 * mismo origen, y `script-src 'self'` ya los permite — es el mismo caso que
 * cualquier `<script type="module">` propio, solo que Vite lo divide en más
 * de un archivo.
 */
const Ficha = lazy(() => import('./paginas/Ficha.jsx'));
const PaginaTipo = lazy(() => import('./paginas/PaginaTipo.jsx'));
const PaginaEstadoAnimo = lazy(() => import('./paginas/PaginaEstadoAnimo.jsx'));
const PaginaQuienEstaViendo = lazy(() => import('./paginas/PaginaQuienEstaViendo.jsx'));
const PaginaBuscar = lazy(() => import('./paginas/PaginaBuscar.jsx'));
const PaginaResultados = lazy(() => import('./paginas/PaginaResultados.jsx'));
const PaginaAcercaDe = lazy(() => import('./paginas/PaginaAcercaDe.jsx'));
const PaginaPrivacidad = lazy(() => import('./paginas/PaginaPrivacidad.jsx'));
const PaginaTerminos = lazy(() => import('./paginas/PaginaTerminos.jsx'));
const PaginaAceptarTerminos = lazy(() => import('./paginas/PaginaAceptarTerminos.jsx'));
const PaginaAccesibilidad = lazy(() => import('./paginas/PaginaAccesibilidad.jsx'));
const PaginaIniciarSesion = lazy(() => import('./paginas/PaginaIniciarSesion.jsx'));
const PaginaCrearCuenta = lazy(() => import('./paginas/PaginaCrearCuenta.jsx'));
const PaginaRecuperarContrasena = lazy(() => import('./paginas/PaginaRecuperarContrasena.jsx'));
const PaginaRestablecerContrasena = lazy(() => import('./paginas/PaginaRestablecerContrasena.jsx'));
const PaginaPerfil = lazy(() => import('./paginas/PaginaPerfil.jsx'));
const PaginaLista = lazy(() => import('./paginas/PaginaLista.jsx'));
const PaginaMisPlataformas = lazy(() => import('./paginas/PaginaMisPlataformas.jsx'));
const PaginaGustos = lazy(() => import('./paginas/PaginaGustos.jsx'));
const PaginaNoEncontrada = lazy(() => import('./paginas/PaginaNoEncontrada.jsx'));

/**
 * El "saltar al contenido" desplaza a mano, en vez de dejar que el navegador
 * resuelva el fragmento.
 *
 * POR QUÉ: index.css pone `scroll-behavior: smooth` en `html` para que los
 * enlaces internos (los de /privacidad, el "Donar" del pie) se muevan de
 * forma visible en vez de saltar de golpe. Este enlace es el único que no
 * quiere eso: existe para que quien navega con teclado o con lector de
 * pantalla se saltee el encabezado de una, y animar ese salto es hacerlo
 * esperar justo donde se le prometió velocidad. Con Shift+Tab desde el fondo
 * de una página larga como /privacidad, además, el recorrido animado es de
 * varias pantallas.
 *
 * `behavior: 'instant'` le gana al CSS, y es la única forma de excluir un
 * enlace suelto: `scroll-behavior` lo lee el contenedor que desplaza, no el
 * <a>. De paso el foco se mueve a mano, porque al cancelar el salto nativo se
 * cancela también el traslado del punto de partida del tabulador; es lo mismo
 * que hace DesplazarAlNavegar.jsx y por el mismo motivo.
 */
function saltarAlContenido(evento) {
  const destino = document.getElementById('contenido');
  // Sin destino no se cancela nada: que el navegador haga lo que pueda.
  if (!destino) return;

  evento.preventDefault();
  destino.scrollIntoView({ behavior: 'instant', block: 'start' });
  if (!destino.hasAttribute('tabindex')) destino.setAttribute('tabindex', '-1');
  destino.focus({ preventScroll: true });
}

export default function App() {
  const { pathname } = useLocation();

  /**
   * `overflow-x-clip` corta lo que se pase de ancho, sin habilitar scroll
   * horizontal. Hace falta porque el fondo de rayos del inicio va a sangre
   * completa con `w-screen`, y 100vw INCLUYE el ancho de la barra de
   * desplazamiento vertical: sin esto la página se pasa unos 15px y aparece
   * una barra horizontal en todas las pantallas con scroll.
   *
   * Va `clip` y no `hidden` a propósito: `hidden` crea un contenedor de
   * scroll y eso rompe el `position: sticky` del encabezado. `clip` recorta
   * sin crear scrollport, así que el encabezado sigue pegado arriba.
   */
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-noche text-crema">
      <a href="#contenido" className="solo-lector" onClick={saltarAlContenido}>
        Saltar al contenido principal
      </a>
      <DesplazarAlNavegar />
      <Encabezado />
      <AvisoTerminos />
      <div className="flex-1">
        {/* El límite de error atrapa los fallos de render y muestra la
            pantalla de error en vez de dejar la app en blanco. Va acá
            adentro y no envolviendo a App entera para que el encabezado y
            el pie sigan en pantalla: sin ellos el usuario no tiene ni
            navegación ni forma de contactarnos.

            La `key` es la ruta a propósito: un límite que ya atrapó se
            queda en estado de error para siempre, así que sin esto los
            enlaces de la propia pantalla de error no llevarían a ningún
            lado. Cambiando la key, React lo monta de nuevo y se limpia. */}
        <LimiteDeError key={pathname}>
          {/* El landmark y el ancla del skip link tienen que existir también
              mientras se baja el chunk de la ruta — mismo motivo que el
              estado "cargando" de Ficha.jsx: sin esto, quien navega con
              lector de pantalla se queda sin punto de entrada durante esa
              espera. En una red normal es imperceptible (el chunk pesa unos
              KB); se nota más en la primera visita o con conexión lenta. */}
          <Suspense
            fallback={
              <main id="contenido" className="pagina-ancho">
                <h1 className="solo-lector">Cargando la página</h1>
                {/* Mensaje propio y no el default de Cargando ("Buscando algo
                    bueno…"): este fallback se ve en CUALQUIER pantalla, no
                    solo en una búsqueda, y decir que se está buscando algo
                    cuando la persona recién está abriendo su perfil o una
                    página legal no tiene sentido. */}
                <Cargando mensaje="Cargando…" />
              </main>
            }
          >
            <Routes>
                <Route path="/" element={<Inicio />} />
                <Route path="/buscar" element={<PaginaBuscar />} />
                <Route path="/tipo" element={<PaginaTipo />} />
                <Route path="/estado-animo" element={<PaginaEstadoAnimo />} />
                <Route path="/quien-esta-viendo" element={<PaginaQuienEstaViendo />} />
                <Route path="/resultados" element={<PaginaResultados />} />
                <Route path="/titulo/:tipo/:id" element={<Ficha />} />
                <Route path="/iniciar-sesion" element={<PaginaIniciarSesion />} />
                <Route path="/crear-cuenta" element={<PaginaCrearCuenta />} />
                <Route path="/recuperar-contrasena" element={<PaginaRecuperarContrasena />} />
                <Route path="/restablecer-contrasena" element={<PaginaRestablecerContrasena />} />
                <Route
                  path="/perfil"
                  element={
                    <RutaPrivada>
                      <PaginaPerfil />
                    </RutaPrivada>
                  }
                />
                <Route
                  path="/listas/:lista"
                  element={
                    <RutaPrivada>
                      <PaginaLista />
                    </RutaPrivada>
                  }
                />
                <Route
                  path="/mis-plataformas"
                  element={
                    <RutaPrivada>
                      <PaginaMisPlataformas />
                    </RutaPrivada>
                  }
                />
                <Route
                  path="/mis-gustos"
                  element={
                    <RutaPrivada>
                      <PaginaGustos />
                    </RutaPrivada>
                  }
                />
                <Route path="/acerca-de" element={<PaginaAcercaDe />} />
                <Route path="/privacidad" element={<PaginaPrivacidad />} />
                <Route path="/terminos" element={<PaginaTerminos />} />
                {/* La re-aceptación NO va envuelta en RutaPrivada: sin sesión se
                    manda al inicio, no a /iniciar-sesion. Pedirle una cuenta a
                    quien no la tiene para que acepte algo que sin cuenta se acepta
                    por uso no tendría sentido (ver la propia pantalla). */}
                <Route path={RUTA_ACEPTAR_TERMINOS} element={<PaginaAceptarTerminos />} />
                <Route path="/accesibilidad" element={<PaginaAccesibilidad />} />

                {/* Comodín: cualquier dirección que no coincidió con las de arriba.
                    Va última porque React Router elige la ruta más específica, pero
                    dejarla al final igual la hace obvia al leer. */}
                <Route path="*" element={<PaginaNoEncontrada />} />
              </Routes>
          </Suspense>
        </LimiteDeError>
      </div>
      <Pie />
    </div>
  );
}
