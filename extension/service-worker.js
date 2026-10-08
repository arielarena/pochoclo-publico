/**
 * EL SERVICE WORKER. Todo lo que habla con la API vive acá.
 *
 * ESA ES LA REGLA DE LA SECCIÓN 6.1 DEL ANÁLISIS Y NO ES NEGOCIABLE. La API no
 * le contesta a un origen de extensión (no le manda `access-control-allow-origin`,
 * medido el 2026-09-04), pero el service worker está exento del CORS cuando hay
 * `host_permissions`, y además la cookie de sesión le viaja sola (medido el
 * 2026-09-12, ver 7.1). Desde un content script no pasa ninguna de las dos
 * cosas. El panel y la pantalla de opciones solo preguntan y dibujan.
 *
 * LOS PERMISOS, que es lo que decide la forma de este archivo (sección 8):
 *
 *  - `activeTab` alcanza para el camino normal, o sea apretar el ícono estando
 *    en una plataforma. Chrome da el permiso sobre esa pestaña en ese momento
 *    porque la persona invocó la extensión, así que **no hay ningún cartel de
 *    permisos ni al instalar ni al usarla**.
 *  - `optional_host_permissions` hace falta solo para la **aparición
 *    automática**, que es la preferencia apagada por omisión de la sección 21:
 *    ahí el panel entra sin que nadie apriete nada, y eso Chrome no lo regala.
 *    Ese permiso se pide desde la pantalla de opciones, y por qué desde ahí
 *    está explicado en `opciones.js`.
 *  - Lo único que se pide al instalar es `https://api.pochoclo.ar/*`, o sea
 *    nuestro propio dominio, que es de donde salen las recomendaciones.
 *
 * El experimento del paso 1 sigue vivo, en `correrExperimento`, pero ya no lo
 * dibuja nadie. Ver el comentario de esa función.
 */

/**
 * El mismo catálogo que usa el panel y la pantalla de opciones, cargado con
 * `importScripts` porque este service worker no está declarado como módulo.
 * De ahí salen los dominios, los números de proveedor y los patrones de
 * permiso, o sea que los tres viven en un solo archivo.
 */
importScripts('plataformas.js');
const { esProveedorConocido, patronesDe, patronesDePermiso } =
  globalThis.pochoclo.plataformas;

const API = 'https://api.pochoclo.ar';

/**
 * LEE EL CUERPO SIN DAR POR HECHO QUE ES JSON.
 *
 * `respuesta.json()` lanza cuando lo que llegó no lo es, y eso pasa de verdad:
 * si el túnel se cae, quien contesta es Cloudflare con una página de error en
 * HTML. Sin esto la excepción sale por el `catch` de cada función y la persona
 * termina leyendo "SyntaxError: Unexpected token <", que no dice nada sobre lo
 * que pasó ni sobre qué puede hacer al respecto.
 */
async function leerCuerpo(respuesta) {
  const texto = await respuesta.text().catch(() => '');
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

/**
 * QUÉ DECIR CUANDO LA API NO CONTESTÓ 2xx.
 *
 * MIRAR EL CÓDIGO DE ESTADO NO ES OPCIONAL, y este archivo lo aprendió tarde:
 * `unTitulo` leía el cuerpo directamente, así que un 429 y un 500 llegaban al
 * panel como "sin resultado", indistinguibles de una búsqueda que no encontró
 * nada. El servidor manda el motivo escrito en castellano y a veces un
 * `Retry-After`; tirarlos es fabricar un misterio con la respuesta puesta.
 *
 * EL 429 ES EL QUE MÁS SE VA A VER, y no es un caso raro. El límite de
 * `/buscar` son 30 pedidos por minuto por IP
 * (`backend/src/middleware/limitePedidos.js`), compartidos con el sitio abierto
 * en otra pestaña, y "Otro título" es la única forma que tiene este panel de
 * mostrar algo más. O sea que alguien entusiasmado lo alcanza sin hacer nada
 * raro, y merece que se lo digan con las palabras del servidor y no con un
 * encogimiento de hombros.
 */
/**
 * LA MISMA FRASE QUE `MENSAJE_GENERICO` de `backend/src/utils/responder.js`,
 * que es la que manda el servidor con un 500. Estaban escritas dos veces con un
 * final distinto ("en un rato" acá, "en un momento" allá), así que la persona
 * leía una u otra según si el servidor había llegado a mandar cuerpo.
 */
const FALLA_NUESTRA = 'Algo falló de nuestro lado. Probá de nuevo en un momento.';

/**
 * EL 426 QUIERE DECIR "ESTA VERSIÓN DE LA EXTENSIÓN QUEDÓ VIEJA" (2026-10-07).
 *
 * Es lo que contesta el backend el día que una ruta de las que usa la
 * extensión tenga que cambiar de forma. El cambio va en una ruta nueva y la
 * vieja pasa a contestar 426, así que las instalaciones que todavía no se
 * actualizaron dicen esto en vez de romperse con un error que no explica nada.
 * Hoy el backend no lo manda nunca. Tiene que estar desde la 1.0.0, porque a
 * una versión que no lo entiende no hay forma de avisarle (sección 10 del
 * análisis).
 *
 * NO VIAJA NINGUNA VERSIÓN. El backend no necesita saber cuál tiene cada uno,
 * alcanza con que la ruta vieja deje de contestar. Así lo único que la
 * extensión le manda al servidor sigue siendo el número de plataforma, que es
 * lo que dicen la ficha de la tienda y `/privacidad`.
 *
 * El texto es nuestro y no el del servidor, porque la que sabe qué puede hacer
 * la persona es la extensión.
 */
const DESACTUALIZADA =
  'Esta versión de Pochoclo quedó vieja y Chrome la va a actualizar sola. Si el aviso sigue en un rato, cerrá Chrome y volvé a abrirlo.';

/**
 * LE PIDE A CHROME QUE BUSQUE LA VERSIÓN NUEVA YA, en vez de esperar a su
 * próxima vuelta, que puede tardar horas. Si la encuentra, la instala cuando el
 * service worker queda inactivo. No pide ningún permiso, y si Chrome contesta
 * que ya preguntamos hace poco (`throttled`) o que no hay nada nuevo, no pasa
 * nada.
 *
 * NO SE PUDO MEDIR ANTES DE PUBLICAR. En una extensión cargada a mano no hay
 * tienda contra la cual buscar, así que es lo primero que hay que mirar el día
 * que alguien vea el aviso de verdad.
 */
function buscarActualizacion() {
  try {
    Promise.resolve(chrome.runtime.requestUpdateCheck())
      .then((r) => console.warn('[pochoclo] versión vieja, búsqueda de actualización:', r))
      .catch((error) => console.warn('[pochoclo] no se pudo buscar actualización:', error));
  } catch (error) {
    console.warn('[pochoclo] no se pudo buscar actualización:', error);
  }
}

/**
 * `error` Y `mensaje` NO SON LO MISMO (2026-10-06). `error` es el diagnóstico,
 * y lo leen las pruebas y la consola. `mensaje` es lo único que el panel le
 * muestra a la persona, y existe solo en las respuestas que se escribieron
 * para leer. Antes el panel pegaba `error` tal cual después de "No se pudo
 * guardar.", y por ahí se colaban "clave inválida" o "lista desconocida: x".
 *
 * EL 400 NO SE MUESTRA CON LAS PALABRAS DEL SERVIDOR. Los 400 de `/listas`
 * están escritos para quien programa ("tmdb_id tiene que ser numérico"), y
 * desde acá solo pueden salir si este archivo armó mal el pedido, o sea que
 * para la persona es una falla nuestra.
 *
 * EL 426 ES LA EXCEPCIÓN A TODO LO ANTERIOR, ver `DESACTUALIZADA`.
 */
function problemaDe(respuesta, cuerpo) {
  if (respuesta.status === 426) {
    buscarActualizacion();
    return {
      estado: 426,
      error: 'extensión desactualizada (426)',
      mensaje: DESACTUALIZADA,
      esperarSegundos: null,
    };
  }
  const delServidor =
    cuerpo && typeof cuerpo.error === 'string' ? cuerpo.error : null;
  const espera = Number(respuesta.headers.get('Retry-After'));
  return {
    estado: respuesta.status,
    error: delServidor || FALLA_NUESTRA,
    mensaje:
      respuesta.status !== 400 && delServidor ? delServidor : FALLA_NUESTRA,
    // El tope está para que un encabezado absurdo no deje un botón apagado
    // media hora. Cinco minutos es mucho más de lo que dura cualquier ventana.
    esperarSegundos:
      Number.isFinite(espera) && espera > 0 ? Math.min(espera, 300) : null,
  };
}

/**
 * Un fallo de red no es lo mismo que una respuesta con error, y hay que
 * decirlo distinto: en el primer caso el servidor ni se enteró.
 */
function problemaDeRed(error, queHacia) {
  // El detalle técnico va a la consola del service worker, que es donde uno lo
  // busca, y no a la pantalla, donde "TypeError: Failed to fetch" solo asusta.
  console.warn(`[pochoclo] falló ${queHacia}:`, error);
  const mensaje =
    'No se pudo conectar con Pochoclo. Puede ser tu conexión, o que el servidor no esté contestando.';
  return { error: mensaje, mensaje };
}

async function medir(nombre, tarea) {
  const arranque = Date.now();
  try {
    const valor = await tarea();
    return { nombre, ok: true, ms: Date.now() - arranque, ...valor };
  } catch (error) {
    // Un fallo de CORS o de red llega acá como TypeError sin más detalle.
    return {
      nombre,
      ok: false,
      ms: Date.now() - arranque,
      error: `${error.name}: ${error.message}`,
    };
  }
}

/** Pregunta 1. La única línea que importa es `credentials: 'include'`. */
function probarSesion() {
  return medir('sesion', async () => {
    const respuesta = await fetch(`${API}/api/auth/get-session`, {
      credentials: 'include',
    });
    const texto = await respuesta.text();
    let cuerpo = null;
    try {
      cuerpo = texto ? JSON.parse(texto) : null;
    } catch {
      cuerpo = null;
    }
    const hayUsuario = Boolean(cuerpo && cuerpo.user);
    return {
      estado: respuesta.status,
      // Better Auth devuelve null, o `{ session, user }`.
      hayUsuario,
      correo: hayUsuario ? cuerpo.user.email : null,
      /**
       * LA RESPUESTA CRUDA SOLO VIAJA CUANDO NO HAY SESIÓN, que es el único
       * caso en que la pantalla la muestra.
       *
       * Habiendo sesión, ese texto es el objeto entero de Better Auth, y ahí
       * adentro van el token de la sesión, la IP y el navegador con el que se
       * abrió. Nada de eso sale de la extensión (el destinatario es nuestra
       * propia pantalla de opciones), pero tampoco hace falta para nada: es una
       * credencial viva dando vueltas por un canal de mensajes y por cualquier
       * consola que alguien deje abierta.
       */
      crudo: hayUsuario ? null : texto.slice(0, 200),
    };
  });
}

/** Pregunta 2. Netflix es el proveedor 8 (medido, sección 8 del análisis). */
function probarBusqueda() {
  return medir('busqueda', async () => {
    const respuesta = await fetch(`${API}/buscar?conSuerte=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferencias: { plataformas: [8] } }),
    });
    const cuerpo = await respuesta.json();
    const titulo = cuerpo && cuerpo.resultado ? cuerpo.resultado : null;
    return {
      estado: respuesta.status,
      titulo: titulo ? `${titulo.titulo} (${titulo.anio})` : null,
      tipo: titulo ? titulo.tipoContenido : null,
    };
  });
}

/**
 * LAS DOS PREGUNTAS JUNTAS. Es una herramienta nuestra y no una pantalla.
 *
 * Hasta el 2026-09-25 lo dibujaba la pantalla de opciones, y se sacó de ahí
 * porque lo que devuelve está escrito para nosotros y esa pantalla se abre sola
 * al instalar (el motivo largo está en `opciones.js`). Se corre desde la consola
 * del service worker, en `chrome://extensions`, con `await
 * correrExperimento()`, y desde una prueba con `evaluate`, que es lo que hace
 * `probar-extension.mjs`.
 *
 * NO QUEDÓ COMO RUTA DE MENSAJE, y no alcanzaba con dejarla: `sendMessage` no
 * dispara el `onMessage` del propio contexto que lo mandó, así que desde la
 * consola del service worker no habría contestado nadie. Llamar a la función
 * derecho funciona porque este archivo no es un módulo, o sea que sus
 * declaraciones de arriba son globales.
 */
async function correrExperimento() {
  // En serie y no en paralelo, para que los tiempos se puedan leer sueltos.
  const sesion = await probarSesion();
  const busqueda = await probarBusqueda();
  return { idExtension: chrome.runtime.id, sesion, busqueda };
}

/**
 * LO QUE VUELVE AL PANEL ES SOLO LO QUE EL PANEL DIBUJA, y es el mismo
 * criterio con el que `estadoDeListas` devuelve tres booleanos en vez de las
 * listas enteras. La API contesta 23 campos por título (reparto, directores,
 * keywords, certificaciones), y el content script corre **dentro del proceso
 * de Netflix**. Nada de eso se ve en pantalla, así que no tiene por qué pasar
 * por la página de un tercero.
 */
function paraElPanel(t) {
  if (!t) return null;
  return {
    tmdb_id: t.tmdb_id,
    tipo: t.tipo,
    tipoContenido: t.tipoContenido,
    titulo: t.titulo,
    anio: t.anio,
    poster: t.poster,
    // Puede venir en null, y el panel lo dibuja como "S/D", igual que el sitio.
    puntuacion: t.puntuacion ?? null,
  };
}

/** Un título disponible en la plataforma pedida. Es el corazón del panel. */
async function unTitulo(plataforma) {
  // Es la segunda cerradura y no la primera, porque hoy el único que puede
  // mandar este mensaje es nuestro propio content script (no hay
  // `externally_connectable`). Igual cuesta una línea y cierra el paso a que la
  // extensión se use de intermediaria para consultar cualquier proveedor.
  if (!esProveedorConocido(plataforma)) {
    return { resultado: null, error: `proveedor desconocido: ${plataforma}` };
  }
  try {
    const respuesta = await fetch(`${API}/buscar?conSuerte=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferencias: { plataformas: [plataforma] } }),
      credentials: 'include',
    });
    const cuerpo = await leerCuerpo(respuesta);
    if (!respuesta.ok)
      return { resultado: null, ...problemaDe(respuesta, cuerpo) };

    const elegido = paraElPanel(cuerpo && cuerpo.resultado);
    // Que la búsqueda salga bien y no encuentre nada es un resultado legítimo,
    // no un error, así que se dice como lo que es.
    if (!elegido) {
      const mensaje = 'No se encontró nada disponible acá en este momento.';
      return { resultado: null, error: mensaje, mensaje };
    }
    return { resultado: elegido };
  } catch (error) {
    return { resultado: null, ...problemaDeRed(error, 'la búsqueda') };
  }
}

/**
 * EL RODEO PARA LA CSP DEL ANFITRIÓN (sección 6.4).
 *
 * Un `<img>` inyectado en la página de otro obedece la `img-src` de ESA
 * página, y el shadow DOM no ayuda, porque la CSP no es cosa del árbol.
 * Medido el 2026-09-12, de las cinco plataformas la única que la aplica y
 * además acota los dominios es Apple TV. El service worker no pasa por esa
 * CSP, así que baja la imagen él y la entrega como `data:`, que es un esquema
 * que hasta la más cerrada de las cinco permite.
 */
const ORIGEN_POSTERS = 'https://image.tmdb.org';

/** 3 MB. El póster más grande que sirve TMDb en w342 no llega a 200 kB. */
const TOPE_POSTER = 3 * 1024 * 1024;

async function posterEnDataUri(url) {
  /**
   * LA LISTA BLANCA ES LO PRIMERO, y no es simetría con `esProveedorConocido`:
   * acá lo que se está acotando es un `fetch` que la extensión hace por cuenta
   * de quien se lo pida. Sin ella, esta ruta es un proxy de propósito general
   * que devuelve el cuerpo de cualquier dirección, en bytes, a quien mandó el
   * mensaje. El service worker no pasa por la CSP de ninguna página y tiene
   * permiso sobre nuestro propio dominio, así que es la pieza con más alcance
   * de la extensión, y la única razón por la que existe es traer una imagen de
   * TMDb cuando la CSP del anfitrión no la deja pasar.
   *
   * Hoy el único que puede hablarle es nuestro propio panel, así que esto no
   * tapa un agujero abierto. Tapa el que se abriría el día que se agregue un
   * `externally_connectable`, o que un `executeScript` termine corriendo en una
   * página que no esperábamos. Un permiso amplio que nadie usa es exactamente
   * el tipo de cosa por la que una revisión de la tienda rebota, y con razón.
   *
   * Se compara el `origin` ya parseado y no el principio de la cadena, porque
   * ahí es donde este tipo de comprobación se rompe: barras invertidas,
   * arrobas y puertos hacen que dos direcciones que empiezan igual apunten a
   * hosts distintos.
   */
  let destino;
  try {
    destino = new URL(String(url));
  } catch {
    return { dataUri: null, error: 'dirección inválida' };
  }
  if (destino.origin !== ORIGEN_POSTERS) {
    return { dataUri: null, error: `origen no permitido: ${destino.origin}` };
  }

  try {
    const respuesta = await fetch(destino.href);
    if (!respuesta.ok)
      return { dataUri: null, error: `HTTP ${respuesta.status}` };

    // Sin esto, un 404 con cuerpo de texto se convertía igual en un `data:` que
    // el panel intentaba dibujar como imagen.
    const tipo = (respuesta.headers.get('content-type') || '')
      .split(';')[0]
      .trim();
    if (!tipo.startsWith('image/'))
      return { dataUri: null, error: `no es una imagen: ${tipo}` };

    const bytes = new Uint8Array(await respuesta.arrayBuffer());
    if (bytes.length > TOPE_POSTER)
      return { dataUri: null, error: 'la imagen es demasiado grande' };

    // De a bloques y no byte por byte: concatenar un millón de veces es lento y
    // pasarle el array entero a `apply` desborda la pila.
    let binario = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return { dataUri: `data:${tipo};base64,${btoa(binario)}` };
  } catch (error) {
    return { dataUri: null, ...problemaDeRed(error, 'la descarga del póster') };
  }
}

/**
 * LAS TRES LISTAS. Paso 6 del orden de trabajo.
 *
 * Las rutas son las mismas que usa la web (`backend/src/routes/listas.js`),
 * todas con `exigirSesion`, así que un 401 acá quiere decir "no hay sesión en
 * este navegador" y no "algo se rompió". El panel necesita distinguir esos dos
 * casos, porque en el primero ofrece entrar y en el segundo no puede prometer
 * nada.
 */
const LISTAS = ['favoritas', 'visto', 'ver_mas_tarde'];

/** Lo mismo que hace `leerClave` del lado del backend, antes de salir. */
function claveValida(clave) {
  return Boolean(
    clave &&
    Number.isInteger(clave.tmdb_id) &&
    (clave.tipo === 'pelicula' || clave.tipo === 'tv'),
  );
}

/**
 * En qué listas está ESTE título.
 *
 * SE PIDE `GET /listas` ENTERO Y SE FILTRA ACÁ, y esa es la parte que conviene
 * entender. No hay una ruta que conteste por un solo título, así que llega la
 * pertenencia completa de la persona. Se resuelve en el service worker y al
 * content script le vuelven tres booleanos, nunca la lista. **El content
 * script corre dentro del proceso de Netflix**, así que sacar de ahí las
 * favoritas de alguien no es prolijidad, es la diferencia entre que esos datos
 * pasen o no por la página de un tercero.
 *
 * El costo es el tamaño. Con el tope de 1000 por lista el peor caso son unos
 * 90 kB, y un perfil normal está tres órdenes de magnitud abajo. Si algún día
 * molesta, las dos salidas son una ruta angosta en el backend o guardar la
 * respuesta en `chrome.storage.session`.
 */
async function estadoDeListas(clave) {
  if (!claveValida(clave)) return { sesion: null, error: 'clave inválida' };
  try {
    const respuesta = await fetch(`${API}/listas`, { credentials: 'include' });
    // 401 es la respuesta de `exigirSesion`, o sea anónimo, no un fallo.
    if (respuesta.status === 401) return { sesion: false };

    const cuerpo = await leerCuerpo(respuesta);
    if (!respuesta.ok)
      return { sesion: null, ...problemaDe(respuesta, cuerpo) };

    const listas = cuerpo && cuerpo.listas;
    const en = {};
    for (const lista of LISTAS) {
      en[lista] = (listas?.[lista] || []).some(
        (i) => i.tmdb_id === clave.tmdb_id && i.tipo === clave.tipo,
      );
    }
    return { sesion: true, en };
  } catch (error) {
    // Un `sesion: null` NO es lo mismo que `false`. Sin red no se puede saber
    // si hay sesión, y ofrecerle entrar a alguien que ya entró sería mentirle.
    return { sesion: null, ...problemaDeRed(error, 'la consulta de listas') };
  }
}

/**
 * Agrega o saca, según dónde esté hoy.
 *
 * `sugerirVisto` lo decide el backend y viene en la respuesta del POST. Es la
 * pregunta inmediata de Favoritas a Visto de la sección 18, y llega hasta acá
 * sin que la extensión tenga que deducir nada.
 */
async function alternarLista({ lista, clave, dentro }) {
  if (!LISTAS.includes(lista))
    return { ok: false, error: `lista desconocida: ${lista}` };
  if (!claveValida(clave)) return { ok: false, error: 'clave inválida' };

  try {
    const respuesta = dentro
      ? await fetch(`${API}/listas/${lista}/${clave.tipo}/${clave.tmdb_id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
      : await fetch(`${API}/listas/${lista}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clave),
          credentials: 'include',
        });

    const cuerpo = await leerCuerpo(respuesta);
    if (respuesta.status === 401) return { ok: false, sinSesion: true };
    // El 409 es la lista llena y el 429 el límite de pedidos. Los dos vienen
    // con su mensaje ya escrito para leer, así que `problemaDe` los cubre.
    if (!respuesta.ok) return { ok: false, ...problemaDe(respuesta, cuerpo) };

    return {
      ok: true,
      dentro: !dentro,
      sugerirVisto: Boolean(cuerpo && cuerpo.sugerirVisto),
    };
  } catch (error) {
    return { ok: false, ...problemaDeRed(error, 'el cambio de lista') };
  }
}

// ============================================================================
// CUÁNDO APARECE EL PANEL. Sección 21 del Definitivo, paso 7 del orden.
// ============================================================================

/** Los dos archivos y en este orden, para las dos formas de inyectarlo. */
const ARCHIVOS_DEL_PANEL = ['plataformas.js', 'panel.js'];

/**
 * Dibuja el panel en una pestaña.
 *
 * EL `tabId` VIENE DEL CLICK Y NO DE UNA CONSULTA, cuando lo hay.
 * `chrome.action.onClicked` entrega la pestaña sobre la que se apretó, que es
 * exactamente la que `activeTab` acaba de habilitar. Preguntar por la activa
 * en vez de usar esa abriría una ventana chiquita para inyectar en la pestaña
 * equivocada si la persona cambia de pestaña en el medio.
 *
 * Sin `tabId` cae a la pestaña activa, que es lo que necesitan las pruebas
 * automatizadas. El ícono de la barra es interfaz del navegador y no se puede
 * clickear desde el protocolo de depuración.
 */
async function inyectarPanel(tabId, diagnostico = false) {
  let destino = tabId;
  if (destino == null) {
    const [pestania] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!pestania) return { ok: false, error: 'no hay pestaña activa' };
    destino = pestania.id;
  }
  try {
    /**
     * EL MODO DIAGNÓSTICO EXISTE PARA LAS PRUEBAS Y SE PRENDE DESDE ACÁ, nunca
     * desde la página. Con él, el panel publica lo que dibujó en un atributo
     * del elemento anfitrión, que es la única forma que tiene una prueba de
     * leer adentro de un shadow root cerrado. Sin él no publica nada.
     *
     * La marca se escribe en el MUNDO AISLADO del content script, que es un
     * contexto de JavaScript aparte al que la página anfitriona no llega. O sea
     * que Netflix no puede prenderlo para hacerle contar al panel lo que sabe.
     */
    /**
     * Y SIEMPRE SE MARCA QUE ESTO LO PIDIÓ ALGUIEN (2026-10-07). El guión de
     * la aparición automática no pasa por acá, así que el panel sabe cuál de
     * los dos caminos lo trajo y solo el automático respeta que la persona lo
     * haya cerrado en esta pestaña. Ver `MARCA_CERRADO` en `panel.js`.
     */
    await chrome.scripting.executeScript({
      target: { tabId: destino },
      func: (conDiagnostico) => {
        globalThis.__pochocloPedido = true;
        if (conDiagnostico) globalThis.__pochocloDiagnostico = true;
      },
      args: [Boolean(diagnostico)],
    });
    // `panel.js` busca el catálogo en `globalThis`, así que sin su compañero se
    // queda sin saber en qué plataforma está.
    await chrome.scripting.executeScript({
      target: { tabId: destino },
      files: ARCHIVOS_DEL_PANEL,
    });
    return { ok: true, tabId: destino };
  } catch (error) {
    return { ok: false, error: `${error.name}: ${error.message}` };
  }
}

/**
 * APRETAR EL ÍCONO ES EL CAMINO NORMAL, y no cuesta ningún permiso.
 *
 * `activeTab` le da a la extensión acceso a ESA pestaña en ESE momento porque
 * la persona la invocó. Es lo que permite que instalar no pida nada sobre
 * netflix.com y que usarla tampoco muestre ningún cartel, que es lo que pide
 * la sección 21. El precio es que el acceso se vence al navegar, y no molesta:
 * el panel ya está dibujado, y lo que sigue hablando con la API es este
 * archivo, no la página.
 *
 * Se inyecta sin mirar en qué sitio estamos, a propósito. El panel reconoce
 * solo las cinco plataformas y, en cualquier otra, dice dónde funciona. Un
 * click que no hace absolutamente nada se lee como que la extensión está rota.
 */
/**
 * QUÉ SE LE DICE A LA PERSONA CUANDO CHROME SE NIEGA A INYECTAR.
 *
 * El motivo que devuelve Chrome está en inglés y nombra cosas que no son de
 * nadie más que nuestras ("Cannot access a chrome:// URL"), así que va a la
 * consola, que es donde lo buscamos nosotros, y no al globito del ícono.
 *
 * LA CLASIFICACIÓN ES POR EL MENSAJE Y NO POR LA DIRECCIÓN DE LA PESTAÑA, y no
 * es por gusto. Medido el 2026-09-25 en las ocho clases de página donde alguien
 * puede apretar el ícono, **la pestaña llega sin `url` en todas**, salvo en las
 * que ya tenemos permiso de host. Sin el permiso `tabs` no hay dirección que
 * mirar, y ese permiso Chrome lo anuncia como "leer tu historial de
 * navegación", así que está descartado desde la sección 8.
 *
 * Los tres mensajes que contesta, medidos el mismo día:
 *
 *   la pestaña nueva (la del buscador), las opciones de Chrome, sus extensiones
 *     -> "Cannot access a chrome:// URL"
 *   la tienda de extensiones
 *     -> "The extensions gallery cannot be scripted."
 *   about:blank, view-source: y cualquier sitio sin permiso ni `activeTab`
 *     -> "Cannot access contents of the page. Extension manifest must..."
 *
 * LOS TRES QUIEREN DECIR LO MISMO PARA QUIEN APRETÓ, o sea que ahí el panel no
 * puede aparecer y no hay nada que arreglar de este lado. El más común es el
 * primero, porque la pestaña nueva de Chrome muestra el buscador de Google y se
 * parece a un sitio cualquiera.
 *
 * Y EL RESPALDO NO ADIVINA. Si Chrome cambia alguno de los tres textos, o si el
 * fallo es otro, el aviso no afirma de qué lado está el problema y ofrece
 * recargar. Es la misma regla que el panel ya sigue con los errores del
 * servidor, o sea decir lo que se sabe y nada más.
 */
const MOTIVOS_SIN_ACCESO = [
  /chrome:\/\/ URL/i,
  /extensions gallery/i,
  /Cannot access contents of the page/i,
];

/**
 * El color de la insignia dice el tono, y el `!` es el mismo en los dos casos.
 *
 * Manteca para "acá no se puede", que es información y no una falla, y
 * terciopelo para lo inesperado, que es la misma pareja de colores con la que
 * el sitio separa lo accionable de lo que salió mal (sección 5.1 de
 * las notas de decisiones del proyecto).
 *
 * EL COLOR DEL `!` NO SE DECLARA, a propósito. Chrome lo elige para que
 * contraste con el fondo que le damos, y verificado el 2026-09-25
 * `getBadgeTextColor` devuelve alfa 0, o sea que sigue sin declarar y lo resuelve
 * él. Es lo único de la extensión cuyo contraste no podemos medir, porque la
 * insignia es interfaz del navegador y no de la página, así que conviene dejarlo
 * en manos de quien la dibuja antes que fijar un color a ciegas.
 */
const SIN_ACCESO = {
  titulo:
    'No podés usar Pochoclo en esta página. Probá en una plataforma de streaming.',
  color: '#f2a317',
};
const INESPERADO = {
  titulo: 'No se pudo mostrar Pochoclo. Probá recargando la página.',
  color: '#c22036',
};

function avisoDeFallo(error) {
  const texto = String(error);
  return MOTIVOS_SIN_ACCESO.some((patron) => patron.test(texto))
    ? SIN_ACCESO
    : INESPERADO;
}

/**
 * AVISA CUANDO LA INYECCIÓN NO SE PUDO HACER.
 *
 * ESTE AVISO EXISTE PORQUE EL CLICK ERA MUDO, y ese es el peor modo de fallo
 * posible. `inyectarPanel` devuelve `{ok:false, error}` con el motivo ya
 * escrito, y el oyente lo tiraba sin mirarlo. O sea que apretar el ícono y que
 * Chrome se negara a inyectar se veía **exactamente igual** que apretar el
 * ícono y que no pasara nada, sin una sola línea en ninguna consola.
 *
 * Y es un caso que ocurre de verdad, no hipotético. Sin `activeTab` concedido,
 * `chrome.scripting.executeScript` contesta "Cannot access contents of the
 * page" (medido el 2026-09-15 cargando la extensión real, con su manifest sin
 * tocar, sobre netflix.com). Ahí se cae también quien dejó la extensión con un
 * service worker viejo después de editar archivos, que en este proyecto ya
 * mordió una vez con un síntoma que no se parecía en nada a la causa.
 *
 * EL AVISO VA A LA INSIGNIA Y NO SOLO A LA CONSOLA. La consola del service
 * worker hay que saber que existe y hay que ir a buscarla a
 * `chrome://extensions`; quien apretó el ícono está mirando el ícono. Se borra
 * sola a los ocho segundos, porque informa de un intento y no de un estado.
 *
 * EL TEXTO CRUDO DE CHROME NO SALE AL GLOBITO, y hasta el 2026-09-25 salía. El
 * globito decía "Pochoclo no pudo dibujar el panel. Error: Cannot access a
 * chrome:// URL", que está en inglés, nombra un esquema de direcciones y hace
 * parecer roto algo que funciona. La traducción a algo que se pueda leer la hace
 * `avisoDeFallo`, y el crudo se sigue registrando en la consola.
 */
async function avisarFalloDeInyeccion(tabId, error) {
  console.warn('[pochoclo] no se pudo dibujar el panel:', error);
  const aviso = avisoDeFallo(error);
  try {
    /**
     * EL GLOBITO DE SIEMPRE, PARA DEVOLVÉRSELO A ESTA PESTAÑA DESPUÉS.
     *
     * Antes el reloj lo dejaba en cadena vacía, y eso no es "sin aviso", es un
     * globito vacío pisando el del manifest **en esa pestaña** (medido el
     * 2026-09-25: `getTitle` devuelve la cadena vacía a los ocho segundos,
     * mientras el global sigue entero). Se pregunta sin `tabId` a propósito, así
     * lo que vuelve es el del manifest aunque esta pestaña ya tuviera un aviso
     * encima de otro.
     */
    const titulo = await chrome.action.getTitle({});
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: aviso.color });
    await chrome.action.setTitle({ tabId, title: aviso.titulo });
    setTimeout(() => {
      // Para cuando se cumple el reloj la pestaña puede no existir, y ahí estas
      // dos llamadas rechazan sin que importe.
      chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
      chrome.action.setTitle({ tabId, title: titulo }).catch(() => {});
    }, 8000);
  } catch (fallo) {
    console.warn('[pochoclo] tampoco se pudo avisar del fallo:', fallo);
  }
}

chrome.action.onClicked.addListener(async (pestania) => {
  const resultado = await inyectarPanel(pestania.id);
  if (!resultado.ok) await avisarFalloDeInyeccion(pestania.id, resultado.error);
});

/**
 * LA APARICIÓN AUTOMÁTICA DE LA SECCIÓN 21, apagada por omisión.
 *
 * NO HAY NINGUNA PREFERENCIA GUARDADA: el interruptor es el permiso sobre cada
 * sitio. Está encendida en las plataformas cuyo permiso opcional la persona
 * concedió, y apagada en las demás, que al instalar son todas. Con una
 * preferencia aparte habría dos estados diciendo lo mismo, y el día que se
 * contradijeran (permiso dado y preferencia apagada, o al revés) la pantalla
 * afirmaría una cosa y el navegador haría otra. El razonamiento largo está en
 * `opciones.js`, que es donde se prende.
 */
const ID_GUION_AUTOMATICO = 'panel-automatico';

/** Los patrones del catálogo cuyo permiso está concedido HOY. */
async function patronesConcedidos() {
  const concedidos = [];
  for (const patron of patronesDePermiso()) {
    if (await chrome.permissions.contains({ origins: [patron] }))
      concedidos.push(patron);
  }
  return concedidos;
}

/**
 * PONE EL GUIÓN AUTOMÁTICO A TONO CON LA PREFERENCIA Y CON LOS PERMISOS.
 *
 * Es una sola función y se la llama desde los tres lados que pueden cambiar el
 * resultado (instalar, arrancar, y dar o sacar un permiso). Con una rama por
 * cada evento, el día que alguien saque el permiso desde `chrome://extensions`
 * el guión quedaría registrado apuntando a un sitio al que ya no se puede
 * entrar, y `registerContentScripts` no avisa de eso, porque falla al
 * registrar y no al quedar viejo.
 *
 * SOLO SE REGISTRAN LOS PATRONES CONCEDIDOS. Registrar uno sin permiso lanza y
 * se lleva puestos a los demás, así que alcanza con que falte uno de los cinco
 * para que no ande ninguno.
 */
async function sincronizarAparicionAutomatica() {
  const registrados = await chrome.scripting
    .getRegisteredContentScripts({ ids: [ID_GUION_AUTOMATICO] })
    .catch(() => []);
  const matches = await patronesConcedidos();

  if (matches.length === 0) {
    if (registrados.length) {
      await chrome.scripting.unregisterContentScripts({
        ids: [ID_GUION_AUTOMATICO],
      });
    }
    return { registrado: false, matches: [] };
  }

  const definicion = {
    id: ID_GUION_AUTOMATICO,
    matches,
    js: ARCHIVOS_DEL_PANEL,
    runAt: 'document_idle',
  };
  if (registrados.length)
    await chrome.scripting.updateContentScripts([definicion]);
  else await chrome.scripting.registerContentScripts([definicion]);
  return { registrado: true, matches };
}

/**
 * AL INSTALAR SE ABRE LA PANTALLA DE OPCIONES, UNA SOLA VEZ.
 *
 * ES LA ÚNICA INTERRUPCIÓN DE TODA LA EXTENSIÓN, y vale la pena entender por
 * qué se acepta justo acá. El resto del diseño evita molestar de forma
 * deliberada, o sea que instalar no pide ningún permiso y usarla no muestra
 * ningún cartel. El costo de eso es que **instalar no produce ninguna señal**:
 * la extensión queda ahí y nada le dice a nadie que el panel sale apretando el
 * ícono estando en una plataforma. Alguien puede instalarla y no descubrir
 * nunca para qué sirve.
 *
 * Esa pantalla dice exactamente las dos cosas que hacen falta en ese momento,
 * o sea cómo se usa y que se puede hacer automática. Y es el único instante en
 * que se sabe que la persona está mirando, porque acaba de apretar "Agregar a
 * Chrome".
 *
 * SOLO CON `reason === 'install'`. Una actualización de la tienda y una
 * recarga desde `chrome://extensions` también disparan `onInstalled`, y abrir
 * una pestaña cada vez que se publica una versión sería exactamente el tipo de
 * cosa que hace que la gente desinstale.
 */
chrome.runtime.onInstalled.addListener(async (detalle) => {
  await sincronizarAparicionAutomatica();
  if (detalle && detalle.reason === 'install') {
    // No puede tumbar la sincronización de arriba, que es lo que de verdad
    // importa que corra, así que va después y con su propio catch.
    chrome.runtime.openOptionsPage().catch((error) => {
      console.warn(
        '[pochoclo] no se pudo abrir la pantalla de opciones:',
        error,
      );
    });
  }
});
chrome.runtime.onStartup.addListener(() => sincronizarAparicionAutomatica());
chrome.permissions.onAdded.addListener(() => sincronizarAparicionAutomatica());
chrome.permissions.onRemoved.addListener(() =>
  sincronizarAparicionAutomatica(),
);

/**
 * PRENDER Y APAGAR LA APARICIÓN AUTOMÁTICA DESDE EL PANEL.
 *
 * EL INTERRUPTOR ESTÁ PARTIDO EN DOS MITADES Y NO ES CAPRICHO NUESTRO, es
 * dónde deja Chrome llamar a cada cosa. Medido el 2026-09-15 con la extensión
 * real:
 *
 *  - `chrome.permissions.request` desde este archivo contesta **"This function
 *    must be called during a user gesture"**. Y desde el panel no se puede ni
 *    intentar, porque en un content script `chrome.permissions` es `undefined`.
 *    O sea que prender exige una página de la extensión y un click encima, que
 *    es donde Chrome abre su propio cartel.
 *  - `chrome.permissions.remove` desde acá **resuelve sin ningún gesto**.
 *  - `chrome.runtime.openOptionsPage` también.
 *
 * Así que apagar se puede hacer desde donde la persona está mirando y prender
 * no. La asimetría queda a la vista en el panel, y está bien que quede: prender
 * es el momento en que Chrome insiste en preguntar, porque le está dando a la
 * extensión acceso permanente a ese sitio.
 *
 * NO HACE FALTA LLAMAR A `sincronizarAparicionAutomatica` DESPUÉS DE APAGAR.
 * Sacar el permiso dispara `chrome.permissions.onRemoved`, que ya la llama. Es
 * la propiedad que se buscaba al hacer que el permiso fuera el interruptor.
 */
async function patronesValidos(clave) {
  const patrones = patronesDe(clave);
  return patrones.length ? patrones : null;
}

async function estadoAparicion(clave) {
  const origins = await patronesValidos(clave);
  if (!origins) return { error: `plataforma desconocida: ${clave}` };
  return { prendida: await chrome.permissions.contains({ origins }) };
}

async function apagarAparicion(clave) {
  const origins = await patronesValidos(clave);
  if (!origins) return { error: `plataforma desconocida: ${clave}` };
  await chrome.permissions.remove({ origins });
  // Se vuelve a preguntar en vez de dar por hecho que salió, porque el permiso
  // puede estar concedido de una forma que `remove` no alcanza.
  return { prendida: await chrome.permissions.contains({ origins }) };
}

/**
 * ABRE LA PANTALLA DE OPCIONES YA POSICIONADA EN UNA PLATAFORMA.
 *
 * QUIÉN LLEGÓ Y DESDE DÓNDE VIAJA EN MEMORIA DE ESTE ARCHIVO, no en la
 * dirección ni en ningún almacenamiento, y las dos alternativas se descartaron
 * con motivo.
 *
 * `chrome.runtime.openOptionsPage` no acepta parámetros, así que lo primero que
 * uno intenta es abrir la página a mano con `?plataforma=netflix`. Se probó y
 * cuesta la propiedad que hace falta: `openOptionsPage` **reusa la pestaña de
 * opciones si ya está abierta** y abrirla a mano no, así que apretar el enlace
 * tres veces dejaba tres pestañas iguales. Reusarla a mano pide
 * `chrome.tabs.query` con filtro de dirección, y medido el 2026-09-15 **sin el
 * permiso `tabs` esa consulta devuelve `url: null` hasta para nuestra propia
 * página**, o sea que el filtro no puede acertar nunca. Y `tabs` es un permiso
 * que Chrome le anuncia a la gente como "leer tu historial de navegación", que
 * es carísimo para acomodar una pestaña.
 *
 * La otra alternativa era `chrome.storage.session`, y también cuesta un permiso
 * que hoy la extensión no tiene. Vale la pena no perderlo: que no haya ningún
 * almacenamiento es una de las cosas que la revisión de seguridad dio por
 * buenas, y es una línea menos que explicar en la ficha de la tienda.
 *
 * SE LEE UNA SOLA VEZ, así que recargar la pantalla de opciones no vuelve a
 * resaltar nada. Lo que se resalta es de dónde venís, y eso pasa una vez.
 *
 * Si el service worker se muere entre que se abre la pestaña y que la pantalla
 * pregunta, la marca se pierde y la pantalla se dibuja sin resaltar nada. Es el
 * peor caso y es exactamente lo que se veía antes de todo esto, así que no hace
 * falta protegerlo más.
 */
let plataformaPedida = null;

async function abrirOpciones(clave) {
  plataformaPedida = patronesDe(clave).length ? clave : null;
  await chrome.runtime.openOptionsPage();

  /**
   * HAY QUE AVISARLE A LA PESTAÑA QUE YA ESTABA ABIERTA, y este fue el punto
   * que costó medir. `openOptionsPage` la **enfoca sin recargarla**, que es
   * justamente lo que la hace valiosa, pero implica que su código no vuelve a
   * correr y que la pregunta de arriba no la hace nadie. Sin este aviso, la
   * segunda vez que alguien aprieta el enlace la pantalla pasa al frente sin
   * resaltar nada, que desde afuera se ve como que el enlace dejó de andar.
   *
   * Si nadie contesta es que la pestaña es nueva, y ahí va a preguntar sola al
   * cargar. Se limpia la marca únicamente cuando llegó a destino, o si no queda
   * ahí colgada y la próxima recarga resalta algo que nadie pidió.
   */
  try {
    await chrome.runtime.sendMessage({
      tipo: 'destacar-plataforma',
      clave: plataformaPedida,
    });
    plataformaPedida = null;
  } catch {
    // Nadie escuchando todavía.
  }
  return { ok: true };
}

function tomarPlataformaPedida() {
  const clave = plataformaPedida;
  plataformaPedida = null;
  return { clave };
}

const RUTAS = {
  'un-titulo': (m) => unTitulo(m.plataforma),
  'estado-listas': (m) => estadoDeListas(m.clave),
  'alternar-lista': (m) => alternarLista(m),
  'poster-en-data-uri': (m) => posterEnDataUri(m.url),
  'inyectar-panel': (m) => inyectarPanel(m && m.tabId, m && m.diagnostico),
  'estado-automatico': () => sincronizarAparicionAutomatica(),
  'estado-aparicion': (m) => estadoAparicion(m && m.clave),
  'apagar-aparicion': (m) => apagarAparicion(m && m.clave),
  'abrir-opciones': (m) => abrirOpciones(m && m.clave),
  'plataforma-pedida': async () => tomarPlataformaPedida(),
};

/**
 * LAS ÚNICAS RUTAS QUE PUEDE PEDIR EL PANEL, o sea un content script.
 *
 * Las demás quedan para las páginas de la extensión (hoy, la de opciones), y
 * el motivo es dónde corre cada una. El panel corre **dentro del proceso de la
 * plataforma**, así que un renderizador comprometido ahí puede mandar
 * cualquier mensaje que pueda mandar el panel. Medido el 2026-09-28 en la
 * revisión de seguridad: desde el contexto del panel en Netflix, pedir
 * `inyectar-panel` con el `tabId` de otra pestaña y `diagnostico: true` dibujaba
 * el panel en HBO Max con el resultado colgado del DOM, y esa página leía el
 * título, la Puntuación y si había sesión.
 *
 * Es una lista de lo permitido y no de lo prohibido, a propósito. Una ruta
 * nueva queda cerrada para el panel hasta que alguien decida abrirla, y si se
 * olvida, el panel recibe un error con nombre en vez de un canal cerrado.
 */
const RUTAS_DEL_PANEL = new Set([
  'un-titulo',
  'estado-listas',
  'alternar-lista',
  'poster-en-data-uri',
  'estado-aparicion',
  'apagar-aparicion',
  'abrir-opciones',
]);

/**
 * Si el mensaje salió de una página de la extensión y no de un content script.
 *
 * Se mira `url` y no `tab`, porque la pantalla de opciones se abre en una
 * pestaña y ahí `tab` también viene. En un content script, `url` es la
 * dirección de la página donde corre, que nunca empieza con la nuestra.
 */
const esPaginaDeLaExtension = (emisor) =>
  typeof emisor.url === 'string' &&
  emisor.url.startsWith(chrome.runtime.getURL(''));

chrome.runtime.onMessage.addListener((mensaje, emisor, responder) => {
  /**
   * SOLO CONTESTAN NUESTROS PROPIOS CONTEXTOS.
   *
   * Hoy esto no puede fallar: `onMessage` no lo alcanzan ni las páginas web ni
   * otras extensiones. El manifest declara `externally_connectable` para
   * pochoclo.ar desde el 2026-09-29, pero lo que manda una página va a
   * `onMessageExternal`, que tiene su propio oyente y solo dos rutas (ver más
   * abajo).
   *
   * Va igual porque es una línea y porque cierra el paso a que un cambio de
   * Chrome o un oyente mal puesto dejen estas rutas expuestas sin que nadie lo
   * haya decidido. Ahí `un-titulo` pasaría a ser una búsqueda gratis con la
   * sesión de quien tenga la extensión, y `alternar-lista`, una forma de
   * escribirle las listas.
   */
  if (!emisor || emisor.id !== chrome.runtime.id) return false;

  // Todos los mensajes son un objeto con `tipo`. Acá se admitía además un
  // string pelado, que era como lo mandaba el diagnóstico y no lo manda nadie
  // más desde que se sacó de la pantalla de opciones.
  const clave = mensaje && mensaje.tipo;
  const manejar = RUTAS[clave];
  if (!manejar) return false;
  if (!esPaginaDeLaExtension(emisor) && !RUTAS_DEL_PANEL.has(clave)) {
    responder({ error: `ruta no disponible desde una página: ${clave}` });
    return false;
  }
  /**
   * EL `.catch` NO ES DECORADO. Si el manejador rechaza, `responder` no se
   * llama nunca y Chrome cierra el canal con "The message port closed before a
   * response was received", que no dice absolutamente nada sobre qué falló.
   * Devolver el error como respuesta convierte un misterio en un mensaje.
   */
  manejar(mensaje)
    .then(responder)
    .catch((error) => responder({ error: `${error.name}: ${error.message}` }));
  // true mantiene vivo el canal para la respuesta asincrónica.
  return true;
});

/**
 * LO ÚNICO QUE PUEDE PEDIR EL SITIO. Agregado el 2026-09-29.
 *
 * pochoclo.ar llega hasta acá porque el manifest lo declara en
 * `externally_connectable`, y es la única página que llega. Sirve para que el
 * sitio sepa si la extensión está instalada (y así ofrezca instalarla o abrir
 * sus opciones) y para abrir esa pantalla desde un botón del sitio.
 *
 * SON DOS RUTAS Y NINGUNA TOCA NADA DE LA PERSONA, a propósito. Ninguna
 * devuelve un título, las listas, si hay sesión ni qué plataformas tienen la
 * aparición automática, y ninguna cambia un permiso. O sea que un script
 * inyectado en el sitio, en el peor caso, se entera de que la extensión existe
 * y abre una pestaña de opciones, que es lo mismo que ya puede hacer un enlace.
 * Prender la aparición automática desde el sitio tampoco se podría aunque se
 * quisiera, porque `chrome.permissions.request` exige un gesto sobre una
 * página de la extensión (ver `apagarAparicion`).
 *
 * `hola` NO DEVUELVE LA VERSIÓN, aunque sería gratis. El sitio no la usa, y
 * cada dato de más que contesta este oyente es un dato que cualquier página
 * con un script en pochoclo.ar puede leer.
 *
 * Se vuelve a comparar el origen aunque Chrome ya filtre por `matches`, por el
 * mismo motivo que el `emisor.id` de arriba, y porque `onMessageExternal` es
 * también por donde hablan otras extensiones, que acá no tienen nada que pedir.
 */
const ORIGEN_SITIO = 'https://pochoclo.ar';

chrome.runtime.onMessageExternal.addListener((mensaje, emisor, responder) => {
  if (!emisor || emisor.origin !== ORIGEN_SITIO) return false;
  const tipo = mensaje && mensaje.tipo;

  if (tipo === 'hola') {
    responder({ instalada: true });
    return false;
  }
  if (tipo === 'abrir-opciones') {
    chrome.runtime
      .openOptionsPage()
      .then(() => responder({ ok: true }))
      .catch((error) =>
        responder({ error: `${error.name}: ${error.message}` }),
      );
    return true;
  }
  return false;
});
