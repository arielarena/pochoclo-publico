/**
 * LA PANTALLA DE OPCIONES. Paso 7 del orden de trabajo.
 *
 * Hace tres cosas. Prende y apaga la aparición automática por plataforma, dice
 * si el ícono está fijado en la barra y lleva a los ajustes de Chrome (ver la
 * sección "En Chrome", al final), y lleva el aviso de atribución a TMDb que no
 * entra en el panel.
 *
 * ACÁ VIVÍA TAMBIÉN EL DIAGNÓSTICO, y se sacó el 2026-09-25. Hablaba nuestro
 * idioma y no el de la persona (códigos HTTP, milisegundos, la respuesta cruda
 * del servidor, el ID de la extensión), en una pantalla que desde el paso 8.6 se
 * abre sola al instalar, y gastaba un pedido de los 30 por minuto que `/buscar`
 * comparte con el panel y con el sitio abierto en otra pestaña. La razón que lo
 * justificaba tampoco seguía en pie: el panel ya repite el estado y el mensaje
 * del servidor, el ícono avisa con una insignia cuando no puede dibujarlo, y si
 * la sesión llega o no ya se ve en que aparezcan los botones de listas.
 * `correrExperimento` sigue en `service-worker.js`, para correrlo desde su
 * consola.
 *
 * EL PERMISO ES EL INTERRUPTOR, y no hay ninguna preferencia guardada al lado.
 *
 * Es la decisión que más forma le da a este archivo. La aparición automática
 * necesita permiso permanente sobre el sitio, porque el panel entra sin que
 * nadie apriete nada y `activeTab` solo alcanza cuando la persona invoca la
 * extensión. Con una preferencia aparte habría dos estados que decir lo mismo
 * y podrían contradecirse, con el permiso dado y la preferencia apagada o al
 * revés, y la pantalla afirmando una cosa mientras el navegador hace otra.
 * Leyendo el permiso de verdad no hay nada que sincronizar, y de paso lo que
 * muestra `chrome://extensions` en el acceso a sitios coincide siempre con lo
 * que dice esta pantalla.
 *
 * LA CONTRACARA, que la página dice para que no sorprenda. Alguien que le dé
 * acceso permanente a la extensión desde `chrome://extensions` está prendiendo
 * la aparición automática sin pasar por acá. Es una lectura razonable de
 * "permitir en este sitio", y es reversible desde los dos lados.
 *
 * Y POR QUÉ EL PEDIDO DE PERMISO SE HACE DESDE ACÁ y no desde el service
 * worker al primer uso, que era el plan de la sección 8 del análisis.
 * `chrome.permissions.request` exige un gesto de la persona, y una pantalla de
 * opciones es el único lugar donde ese gesto es indudable y donde el cartel de
 * Chrome aparece al lado de la casilla que uno acaba de tocar. Con `activeTab`
 * resolviendo el camino normal, no queda ningún momento en que haga falta
 * interrumpir a alguien que está mirando Netflix.
 */
const { PLATAFORMAS, patronesDe } = globalThis.pochoclo.plataformas;

const lista = document.querySelector('[data-plataformas]');
const aviso = document.querySelector('[data-aviso]');

let temporizadorAviso;

/**
 * La región viva se dibujó vacía en el HTML. Poner texto acá ES el anuncio.
 *
 * `tipo` decide cómo se ve. `exito` es un cambio que quedó guardado de verdad, y
 * es el único que lleva el titular de "Cambios guardados correctamente". Antes el
 * aviso era un renglón en la letra chica de ayuda, debajo de la lista, y quien
 * tildaba una casilla no tenía forma evidente de saber si el cambio se aplicó.
 * Los otros dos son `info` (una indicación, o un permiso que la persona no dio)
 * y `error`.
 *
 * SE VACÍA Y SE ESCRIBE 100 ms DESPUÉS, por dos motivos. Si alguien prende y
 * apaga la misma plataforma dos veces, el texto nuevo es idéntico al anterior, y
 * sin vaciar antes un lector de pantalla puede no anunciarlo y el ojo no nota
 * que cambió nada. Con el hueco, el lector ve un cambio y la animación de entrada
 * vuelve a arrancar, porque sacar `data-tipo` le quita la regla que la dispara.
 *
 * NO SE ESCONDE LA REGIÓN CON `display: none` cuando está vacía, aunque parezca
 * lo prolijo: eso la saca del árbol de accesibilidad y el lector deja de tenerla
 * registrada, que es el defecto de la 4.25.2. Vacía no ocupa lugar igual.
 */
function avisar(texto, tipo = 'info') {
  clearTimeout(temporizadorAviso);
  aviso.textContent = '';
  delete aviso.dataset.tipo;
  temporizadorAviso = setTimeout(() => {
    aviso.dataset.tipo = tipo;
    if (tipo === 'exito') {
      const titular = document.createElement('strong');
      titular.textContent = 'Cambios guardados correctamente.';
      aviso.append(titular, ' ', texto);
    } else {
      aviso.textContent = texto;
    }
  }, 100);
}

const casillas = new Map();
let ocupado = false;

/**
 * Pone las casillas a tono con los permisos que hay AHORA.
 *
 * No toca el foco ni redibuja nada, solo el `checked`, porque también corre
 * cuando el permiso cambió desde `chrome://extensions` y ahí la persona no
 * está mirando esta pantalla.
 */
async function refrescar() {
  for (const [clave, casilla] of casillas) {
    casilla.checked = await chrome.permissions.contains({
      origins: patronesDe(clave),
    });
  }
}

async function cambiar(casilla, plataforma) {
  if (ocupado) return;
  ocupado = true;
  const origins = patronesDe(plataforma.clave);
  const nombre = plataforma.nombre;

  /**
   * NO SE DESHABILITA LA CASILLA MIENTRAS SE ESPERA, aunque sea el reflejo
   * normal. Deshabilitar el elemento que tiene el foco lo manda al `body`, y
   * ahí un lector de pantalla arranca a leer la página desde arriba. Es el
   * defecto que más se repitió en la auditoría del sitio. El cartel de Chrome
   * ya bloquea la pantalla, así que la bandera alcanza.
   */
  try {
    if (casilla.checked) {
      const dio = await chrome.permissions.request({ origins });
      casilla.checked = dio;
      if (dio)
        avisar(
          `El panel va a aparecer automáticamente al entrar a ${nombre}.`,
          'exito',
        );
      else
        avisar(
          `No diste el permiso, así que en ${nombre} el panel sigue apareciendo únicamente cuando apretás el ícono.`,
        );
    } else {
      await chrome.permissions.remove({ origins });
      // Se confirma leyendo el permiso de nuevo y no dando por hecho que
      // `remove` funcionó: "guardado" tiene que ser verdad.
      const sigue = await chrome.permissions.contains({ origins });
      casilla.checked = sigue;
      if (sigue)
        avisar(
          `No se pudo cambiar. Sigue apareciendo automáticamente en ${nombre}. Probá sacarle el acceso al sitio desde la página de extensiones de Chrome.`,
          'error',
        );
      else
        avisar(
          `En ${nombre} el panel aparece únicamente al apretar el ícono.`,
          'exito',
        );
    }
  } catch (error) {
    casilla.checked = await chrome.permissions.contains({ origins });
    // El detalle a la consola y no a la pantalla, que se lee en castellano.
    console.warn('[pochoclo] no se pudo cambiar el permiso:', error);
    avisar(
      'No se pudo cambiar. Probá de nuevo, o hacelo desde el acceso a sitios de Pochoclo en la página de extensiones de Chrome.',
      'error',
    );
  } finally {
    ocupado = false;
  }
}

const filas = new Map();

for (const plataforma of PLATAFORMAS) {
  const fila = document.createElement('li');
  const etiqueta = document.createElement('label');
  const casilla = document.createElement('input');
  casilla.type = 'checkbox';
  const texto = document.createElement('span');
  texto.textContent = `Aparecer automáticamente al entrar a ${plataforma.nombre}`;

  etiqueta.append(casilla, texto);
  fila.append(etiqueta);
  lista.append(fila);

  filas.set(plataforma.clave, fila);
  casillas.set(plataforma.clave, casilla);
  casilla.addEventListener('change', () => cambiar(casilla, plataforma));
}

/**
 * QUIEN LLEGA DESDE EL PANEL CAE SOBRE SU CASILLA Y NO SOBRE UNA LISTA DE CINCO.
 *
 * Sin esto, alguien que vino desde el panel de Netflix aterriza en una lista
 * donde tiene que buscar cuál de las cinco es la suya, que es justo la fricción
 * que el enlace venía a sacar. De dónde viene se lo pregunta al service worker
 * en vez de leerlo de la dirección, y el motivo largo está en `abrirOpciones`,
 * ahí adentro. En resumen, la dirección obligaba a abrir la pestaña a mano y
 * con eso se perdía que `openOptionsPage` reuse la que ya está abierta.
 *
 * SE RESALTA Y SE ENFOCA, las dos cosas. El resalte es para quien mira y el
 * foco es para quien no, y además deja la casilla correcta a un espacio de
 * distancia. Mover el foco al cargar suele ser una mala idea, y acá no lo es
 * porque la persona apretó algo para llegar hasta este punto exacto.
 *
 * `scrollIntoView` no hace falta hoy, porque las cinco entran sin desplazar,
 * pero lo hace el propio `focus()` si algún día la lista crece.
 */
async function recibirDelPanel() {
  const respuesta = await new Promise((res) => {
    chrome.runtime.sendMessage({ tipo: 'plataforma-pedida' }, (r) =>
      res(chrome.runtime.lastError ? null : r),
    );
  });
  destacar(respuesta && respuesta.clave);
}

/** Resalta y enfoca la casilla de una plataforma. Sirve para los dos caminos. */
function destacar(clave) {
  const fila = clave && filas.get(clave);
  if (!fila) return;

  const plataforma = PLATAFORMAS.find((p) => p.clave === clave);
  // Solo una a la vez. Llegando desde otra plataforma, la anterior ya no es
  // de dónde venís y dejarla resaltada sería señalar dos lugares.
  for (const otra of filas.values()) otra.classList.remove('destacada');
  fila.classList.add('destacada');
  casillas.get(clave).focus();
  avisar(
    `Tildá la casilla para que el panel aparezca automáticamente al entrar a ${plataforma.nombre}. Chrome te va a pedir permiso sobre ese sitio.`,
  );
}

// También cambian desde chrome://extensions, así que hay que escuchar los dos.
chrome.permissions.onAdded.addListener(refrescar);
chrome.permissions.onRemoved.addListener(refrescar);
refrescar().then(recibirDelPanel);

/**
 * Y si esta pestaña ya estaba abierta, el service worker avisa por mensaje,
 * porque `openOptionsPage` la enfoca sin recargarla y `recibirDelPanel` no
 * vuelve a correr. Ver `abrirOpciones` en `service-worker.js`.
 */
chrome.runtime.onMessage.addListener((mensaje) => {
  if (mensaje && mensaje.tipo === 'destacar-plataforma')
    destacar(mensaje.clave);
  // Sin respuesta asincrónica, así que el canal se cierra enseguida.
  return false;
});

/**
 * LA SECCIÓN "EN CHROME". Agregada el 2026-09-29.
 *
 * FIJAR EL ÍCONO EN LA BARRA ES LO QUE MÁS CAMBIA EL USO, y no se puede hacer
 * desde acá. Sin fijarlo, el ícono vive adentro del menú de extensiones (la
 * pieza de rompecabezas), así que abrir el panel son dos clicks y uno de ellos
 * en un lugar que mucha gente no sabe que existe. Chrome deja LEER si está
 * fijado (`chrome.action.getUserSettings`) y no deja cambiarlo, así que lo que
 * se hace es decir cómo está y cómo se cambia.
 *
 * EL TEXTO SE ESCRIBE EN UN PÁRRAFO COMÚN Y NO EN UNA REGIÓN VIVA. Al cargar,
 * es parte de la página y se lee en orden. Si cambia con la pantalla abierta
 * (la persona lo fijó siguiendo las instrucciones), el anuncio va por `avisar`,
 * que es la región viva que ya estaba registrada, y no por un rol puesto sobre
 * un párrafo que se llena ya escrito, que es el defecto de la 4.25.2.
 *
 * `onUserSettingsChanged` existe recién desde Chrome 130 y `getUserSettings`
 * desde el 91. Sin la primera, el texto se queda con lo que había al abrir.
 * Sin la segunda, el párrafo queda vacío en vez de afirmar algo que no se sabe.
 */
const parrafoFijado = document.querySelector('[data-fijado]');

function describirFijado(fijado) {
  parrafoFijado.textContent = fijado
    ? 'El ícono de Pochoclo está fijado en la barra del navegador, así que el panel se abre con un solo click.'
    : 'El ícono de Pochoclo no está fijado en la barra, así que para abrir el panel primero hay que apretar el ícono de extensiones, que tiene forma de pieza de rompecabezas. Para tenerlo siempre a mano, apretá esa pieza y después el alfiler que está al lado de Pochoclo.';
}

if (chrome.action && typeof chrome.action.getUserSettings === 'function') {
  chrome.action
    .getUserSettings()
    .then((ajustes) => describirFijado(Boolean(ajustes && ajustes.isOnToolbar)))
    .catch(() => {});

  if (chrome.action.onUserSettingsChanged) {
    chrome.action.onUserSettingsChanged.addListener((ajustes) => {
      const fijado = Boolean(ajustes && ajustes.isOnToolbar);
      describirFijado(fijado);
      avisar(
        fijado
          ? 'El ícono de Pochoclo quedó fijado en la barra.'
          : 'El ícono de Pochoclo ya no está fijado en la barra.',
      );
    });
  }
}

/**
 * EL BOTÓN ABRE `chrome://extensions` EN LA FICHA DE POCHOCLO. Una página web
 * no puede abrir una dirección `chrome://`, y una de la extensión sí, con
 * `chrome.tabs.create`, que no pide ningún permiso (medido el 2026-09-29, sin
 * el permiso `tabs`). La dirección se arma con el ID de la propia extensión y
 * nada más, así que no hay ninguna entrada de afuera que pueda desviarla.
 */
document
  .querySelector('[data-abrir-chrome]')
  .addEventListener('click', async () => {
    try {
      await chrome.tabs.create({
        url: `chrome://extensions/?id=${chrome.runtime.id}`,
      });
    } catch (error) {
      console.warn('[pochoclo] no se pudo abrir chrome://extensions:', error);
      avisar(
        'No se pudo abrir la página de extensiones de Chrome. Se llega escribiendo chrome://extensions en la barra de direcciones.',
        'error',
      );
    }
  });
