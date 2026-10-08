/**
 * EL PANEL, EN SHADOW DOM CERRADO. Pasos 4, 5, 6 y 7 del orden de trabajo.
 *
 * Reconoce la plataforma por el dominio de la pestaña (`plataformas.js`), le
 * pide a la API un título disponible ahí, y muestra lo que enumera la sección
 * 21 del Definitivo, o sea el título, el póster, el año, la Puntuación, el tipo, los
 * botones de las tres listas, un botón para pedir otro, el enlace a la Ficha y
 * la atribución a TMDb. Al backend le viaja el número de proveedor y nada más.
 *
 * LO INYECTA EL SERVICE WORKER con `chrome.scripting`, al apretar el ícono
 * (`activeTab`, sin ningún permiso de instalación) o como guión registrado si
 * la persona encendió la aparición automática en las opciones. Ya no está
 * declarado como `content_scripts` en el manifest, porque eso obligaría a
 * pedirle a la gente el permiso sobre las cinco plataformas al instalar.
 *
 * DOS REGLAS DE DISEÑO QUE NO SE NEGOCIAN, las dos de la sección 13:
 *
 *  - **Nada de depender del DOM del anfitrión.** El panel se cuelga de
 *    `document.body` en posición fija. Netflix cambia su marcado cuando
 *    quiere y no hay contrato; la única dependencia es el dominio.
 *  - **Shadow root cerrado.** Sin él, el CSS de la plataforma deforma el
 *    panel y el nuestro puede romperles algo a ellos.
 *
 * El resultado se anota en el `dataset` del elemento anfitrión, o sea FUERA
 * del shadow root, porque uno cerrado no se puede leer desde afuera y la
 * prueba automatizada necesita leerlo.
 */
(async () => {
  const ID_HOST = 'pochoclo-panel';
  const SITIO = 'https://pochoclo.ar';

  /**
   * CERRADO QUEDA CERRADO HASTA QUE SE CIERRA LA PESTAÑA (2026-10-07, pedido de
   * Ariel). La aparición automática corre en cada carga entera de la página, y
   * en Netflix ir a la cuenta es una, así que cerrar el panel y entrar a
   * /account lo volvía a abrir.
   *
   * La marca va en el `sessionStorage` de la plataforma, que Chrome borra al
   * cerrar la pestaña. No pide ningún permiso, y es exactamente el alcance
   * elegido: otra pestaña de la misma plataforma lo vuelve a mostrar. El costo
   * aceptado es que la plataforma puede leerla, y lo único que dice es que el
   * panel se cerró.
   *
   * SOLO LA RESPETA LA APARICIÓN AUTOMÁTICA. El ícono es un pedido explícito,
   * así que dibuja igual y borra la marca, porque lo último que hizo la persona
   * fue abrirlo. `__pochocloPedido` lo pone el service worker en el mundo
   * aislado, al que la página no llega, y se consume acá para que no le quede
   * puesto a una inyección posterior.
   *
   * `sessionStorage` puede tirar (almacenamiento bloqueado en el sitio), y ahí
   * el panel se comporta como antes.
   */
  const MARCA_CERRADO = 'pochoclo-cerrado';

  /**
   * `tipoContenido` llega como clave del motor (`pelicula`, sin tilde), igual
   * que en el sitio, que la traduce con su propio `ETIQUETA_TIPO`. Se mostraba
   * tal cual hasta el 2026-10-07, cuando apareció en una captura para la tienda.
   */
  const ETIQUETA_TIPO = { pelicula: 'película', miniserie: 'miniserie', serie: 'serie' };
  const enLaSesion = (accion) => {
    try {
      return accion(window.sessionStorage);
    } catch {
      return null;
    }
  };
  const pedido = globalThis.__pochocloPedido === true;
  delete globalThis.__pochocloPedido;
  if (pedido) enLaSesion((s) => s.removeItem(MARCA_CERRADO));
  else if (enLaSesion((s) => s.getItem(MARCA_CERRADO)) === '1') return;

  const previo = document.getElementById(ID_HOST);
  if (previo) previo.remove();

  /**
   * Apretando el ícono, `activeTab` deja inyectar esto en cualquier documento,
   * y no todos tienen `body`: un XML servido crudo, por ejemplo, no tiene.
   * Sin esta línea, ahí el panel muere con un TypeError.
   */
  if (!document.body) return;

  /**
   * EL RESULTADO SE PUBLICA EN EL DOM SOLO CUANDO UNA PRUEBA LO PIDIÓ.
   *
   * Un shadow root cerrado no se puede leer desde afuera, así que la única
   * forma que tiene una prueba automatizada de ver qué dibujó el panel es que
   * el panel lo escriba en un atributo del elemento anfitrión, que vive en el
   * documento de la plataforma. **Y ahí lo lee cualquiera**, incluida la
   * plataforma: el título que recomendamos, la Puntuación, y sobre todo si la
   * persona tiene sesión abierta en pochoclo.ar.
   *
   * Eso contradice de frente la regla que ordena el resto del diseño, que es
   * que los datos de la persona no pasen por la página de un tercero. Por eso
   * el service worker filtra las listas y le manda al panel tres booleanos en
   * vez de la lista entera; dejar el estado de sesión colgado de un atributo
   * regalaba por otra puerta lo que se cuidó por la principal.
   *
   * La marca vive en el mundo aislado del content script, que es un contexto de
   * JavaScript separado del de la página, así que la plataforma no la puede
   * prender. La prende el service worker al inyectar, y solo si se lo pidieron.
   */
  const DIAGNOSTICO = globalThis.__pochocloDiagnostico === true;
  const anotar = (datos) => {
    if (DIAGNOSTICO) host.dataset.resultado = JSON.stringify(datos);
  };

  /**
   * LA DETECCIÓN ES TODO EL PASO 5, y es una línea. El dominio de la pestaña ya
   * dice en qué plataforma está la persona, sin mirar el DOM del anfitrión ni
   * la dirección completa. El catálogo vive en `plataformas.js`, que se carga
   * antes que este archivo.
   *
   * El `&&` no es defensivo de más, porque `chrome.scripting` puede inyectar
   * este archivo solo, sin su compañero, y ahí `globalThis.pochoclo` no
   * existe.
   */
  const catalogo = globalThis.pochoclo && globalThis.pochoclo.plataformas;
  const plataforma = catalogo
    ? catalogo.plataformaDeHost(location.hostname)
    : null;

  /**
   * El título viene de nuestra API, no de la página anfitriona, pero igual es
   * texto de afuera dibujado con `innerHTML`, y alcanza un `&` para romperle el
   * marcado. Escaparlo sale más barato que acordarse de no equivocarse.
   *
   * LA COMILLA SIMPLE ESTÁ EN LA LISTA aunque hoy todos los atributos de este
   * archivo se escriban con comillas dobles. Sin ella, la protección depende de
   * una convención de estilo: el día que alguien escriba `atributo='${esc(x)}'`
   * el escape deja de alcanzar, y nada lo avisa.
   */
  const esc = (texto) =>
    String(texto).replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );

  const host = document.createElement('div');
  host.id = ID_HOST;
  host.style.cssText = [
    // VA PRIMERO Y NO ÚLTIMO. `all` reinicia TODAS las propiedades, así que
    // puesto al final se lleva puesto el posicionamiento de las líneas de
    // abajo y el panel queda suelto en el flujo de la página anfitriona.
    //
    // Y DE PASO HACE ALGO QUE IMPORTA PARA LA ACCESIBILIDAD. El valor inicial
    // de `font-size` es `medium`, que en Chrome es el tamaño de letra que la
    // persona configuró en el navegador. O sea que el panel arranca de la
    // preferencia de quien lo usa y no del CSS de Netflix, y todo lo de
    // adentro se mide en `em` para crecer con ella.
    'all:initial',
    'position:fixed',
    'top:1em',
    'right:1em',
    // El máximo de z-index. El panel vive encima de la página de otro.
    'z-index:2147483647',
  ].join(';');
  document.body.appendChild(host);

  const raiz = host.attachShadow({ mode: 'closed' });
  const estilos = new CSSStyleSheet();
  estilos.replaceSync(`
    :host, * { box-sizing: border-box; }

    /*
     * NO HAY UN SOLO PÍXEL EN TODO ESTE BLOQUE, y no es estilo, es el criterio
     * 1.4.4 de WCAG. Con medidas en px el panel ignora el tamaño de letra que
     * la persona eligió en el navegador. Con em sobre el "medium" del
     * anfitrión (ver all:initial acá arriba), crece con ella.
     */
    .panel {
      font: 0.875em/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      /*
       * EL ANCHO SE ACOTA CONTRA LA VENTANA, y no porque haya celulares.
       * Chrome para Android no soporta extensiones, así que esto corre siempre
       * en escritorio. Lo que sí pasa en escritorio es el zoom. Al 400% sobre
       * una ventana de 1280, el área visible queda en 320 px de CSS, que es
       * exactamente el ancho que pide el criterio 1.4.10. Sin el min() el
       * panel se sale de la pantalla justo para quien más lo agrandó.
       */
      width: min(19em, calc(100vw - 2em));
      max-height: calc(100vh - 2em);
      overflow-y: auto;
      padding: 1em;
      border: 1px solid rgba(250, 240, 222, 0.15);
      border-radius: 0.85em;
      background: #241a2e;
      color: #faf0de;
      box-shadow: 0 0.85em 2.3em rgba(0, 0, 0, 0.5);
    }

    /*
     * EL FOCO VA HACIA ADENTRO (outline-offset negativo) por el mismo motivo
     * que la clase .recorta-foco del sitio. El contorno se dibuja por fuera del
     * elemento, y .panel tiene overflow-y auto, así que en un control pegado al
     * borde quedaría recortado y se vería media línea.
     *
     * Manteca sobre superficie mide 7.94:1, muy por encima de los 3:1 que pide
     * el criterio 1.4.11.
     */
    .panel :focus-visible {
      outline: 2px solid #f2a317;
      outline-offset: -2px;
    }

    .cabecera { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5em; }
    /*
     * LA MARCA PROPIA MANDA EN EL PANEL, y no es vanidad. Es media condición de
     * la licencia de TMDb, que exige que su logo quede menos prominente que la
     * marca de la aplicación. Acá arriba, en manteca y en negrita, contra un
     * logo de 11 px al pie, en la zona de la letra chica. Ver el bloque .tmdb.
     */
    .marca { font-size: 1em; color: #f2a317; font-weight: 700; letter-spacing: .04em; }
    /*
     * LA MARCA LLEVA A pochoclo.ar, y se ve igual que antes de ser enlace, sin
     * subrayado. Es la convención del logo de cualquier sitio, y el propio
     * encabezado de pochoclo.ar hace lo mismo con su imagotipo. El subrayado
     * aparece al pasar el mouse, y con teclado alcanza el contorno de foco.
     *
     * EL RELLENO VERTICAL ES POR EL TAMAÑO DEL BLANCO. Con la línea sola mide
     * unos 17 px de alto, abajo de los 24 del criterio 2.5.8, y el margen
     * negativo le devuelve a la cabecera exactamente el alto que tenía.
     */
    a.marca {
      display: inline-block;
      padding: 0.3em 0;
      margin: -0.3em 0;
      text-decoration: none;
    }
    @media (hover: hover) {
      a.marca:hover { text-decoration: underline; }
    }

    .cerrar {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      /* 2em sobre 14px son 28, arriba de los 24x24 del criterio 2.5.8. */
      width: 2em;
      height: 2em;
      margin: -0.4em -0.4em 0 0;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 0.5em;
      background: transparent;
      color: #faf0de;
      font: inherit;
      font-size: 1.1em;
      line-height: 1;
      cursor: pointer;
    }
    @media (hover: hover) {
      .cerrar:hover { border-color: rgba(250, 240, 222, 0.4); }
    }

    /*
     * EL TÍTULO Y LA PUNTUACIÓN VAN EN LA MISMA FILA, con la medalla a la
     * derecha, que es la forma que ya tiene la Ficha del sitio. El min-width en 0
     * del texto no es decorativo. Sin él, un título largo empuja la medalla
     * fuera del panel, porque el mínimo de una caja flexible es su contenido y
     * no cero.
     */
    .encabezado-titulo { display: flex; align-items: flex-start; gap: 0.6em; margin-top: 0.5em; }
    .encabezado-titulo .texto { flex: 1 1 auto; min-width: 0; }
    .titulo { margin: 0 0 0.15em; font-size: 1.15em; font-weight: 700; }
    .datos { margin: 0; color: rgba(250, 240, 222, 0.6); font-size: 0.85em; }

    /*
     * LA MEDALLA USA EL MISMO DEGRADÉ QUE LA ACCIÓN DESTACADA DEL SITIO, con el
     * corte en 125% incluido. No es copiar un valor de más. Con terciopelo puro
     * el número en noche mide 4.56:1, que pasa AA por 0.06, y cortando el
     * recorrido antes el color del borde es una mezcla y sube a 5.05:1. Está
     * explicado en el token --degradado-destacado de index.css.
     */
    .medalla {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.9em;
      height: 2.9em;
      border-radius: 50%;
      background-image: linear-gradient(120deg, #f2a317 0%, #e63950 125%);
      color: #150e1b;
      font-size: 0.85em;
      font-weight: 700;
    }
    /* Sin Puntuación no se dibuja una medalla vacía, dice S/D como en el sitio. */
    .medalla.sin-dato {
      background-image: none;
      border: 2px solid rgba(250, 240, 222, 0.4);
      color: rgba(250, 240, 222, 0.6);
      font-size: 0.72em;
      font-weight: 600;
    }
    /*
     * En alto contraste el sistema aplasta cualquier fondo, así que la medalla
     * llena se quedaría sin forma. El borde la deja siendo un círculo.
     */
    @media (forced-colors: active) {
      .medalla { border: 1px solid ButtonText; }
    }

    .poster { margin-top: 0.7em; }
    .poster img {
      width: 100%;
      aspect-ratio: 2 / 3;
      object-fit: cover;
      border-radius: 0.4em;
      background: rgba(250, 240, 222, .08);
      display: block;
    }

    /*
     * SE PARTEN EN DOS RENGLONES CUANDO NO ENTRAN, y no hay ninguna consulta de
     * medios. Una fila flexible se corta sola solo si el contenido no entra,
     * así que donde entra se dibuja igual, y el largo depende del texto de los
     * botones y no del ancho de la ventana. Es el mismo criterio con el que se
     * arregló la fila de etiquetas de las tarjetas del sitio.
     */
    .listas, .salidas { display: flex; flex-wrap: wrap; gap: 0.45em; margin-top: 0.8em; }

    /*
     * LA LÍNEA SEPARA DOS FAMILIAS DE CONTROL, no adorna.
     *
     * Arriba hay tres interruptores, que se quedan marcados y describen en qué
     * listas está el título. Abajo hay dos acciones, que hacen algo y se van.
     * Son dos cosas distintas y hasta el 2026-09-26 se dibujaban iguales.
     *
     * VA SOLO CUANDO HAY ALGO ARRIBA QUE SEPARAR. En el panel de un fallo las
     * salidas son lo único que hay ("Probar de nuevo"), así que ahí no existe
     * [data-acciones] y la línea no se dibuja.
     */
    [data-acciones] + .salidas {
      margin-top: 0.9em;
      padding-top: 0.9em;
      border-top: 1px solid rgba(250, 240, 222, 0.15);
    }

    .boton {
      display: inline-flex;
      align-items: center;
      gap: 0.35em;
      /* 2.4em sobre 12.6px son 30, otra vez arriba de los 24 del 2.5.8. */
      min-height: 2.4em;
      padding: 0.35em 0.7em;
      /* crema al 40% sobre superficie mide 3.48:1, arriba de los 3 del 1.4.11. */
      border: 1px solid rgba(250, 240, 222, 0.4);
      border-radius: 0.55em;
      background: transparent;
      color: #faf0de;
      font: inherit;
      font-size: 0.9em;
      /* La clase la comparten los <button> y el enlace a la Ficha. */
      text-decoration: none;
      cursor: pointer;
    }
    .boton[disabled] { opacity: 0.5; cursor: default; }
    @media (hover: hover) {
      .boton:not([disabled]):hover { border-color: rgba(242, 163, 23, 0.7); }
    }

    /*
     * LA MARCA NO ES SOLO EL COLOR, y por eso el tilde está siempre dibujado.
     * Es el criterio 1.4.1, y además es lo único que sobrevive al modo de alto
     * contraste de Windows, que aplasta cualquier fondo que pongamos.
     *
     * EL RELLENO MANTECA ES EXCLUSIVO DE "ESTÁ EN LA LISTA", y por eso ningún
     * otro botón del panel lo puede usar. Un "Otro título" relleno se leería
     * como un interruptor marcado. Las salidas se distinguen por lo contrario,
     * o sea sacándoles el contorno. Ver la clase .salida de acá abajo.
     */
    .boton[aria-pressed="true"] {
      border-color: #f2a317;
      background: #f2a317;
      color: #150e1b;
      font-weight: 600;
    }
    /*
     * El hover general cambia solo el borde, y sobre un fondo manteca eso no
     * se ve. El marcado oscurece entero a manteca-fuerte, igual que en la
     * Ficha del sitio. El texto noche encima mide 6,63:1.
     */
    @media (hover: hover) {
      .boton[aria-pressed="true"]:not([disabled]):hover {
        border-color: #d9860a;
        background: #d9860a;
      }
    }
    @media (forced-colors: active) {
      .boton { border-color: ButtonText; }
      .boton[aria-pressed="true"] { border-width: 2px; }
    }

    /*
     * LAS DOS SALIDAS: "Otro título" y "Ver la ficha".
     *
     * NO SE DISTINGUEN POR UN RELLENO PROPIO, porque el único relleno que el
     * panel puede permitirse es el manteca de un interruptor marcado, y
     * cualquier otro se le va a parecer. Se distinguen al revés, sacándoles el
     * contorno y pasando el texto a manteca, que es como el sitio pinta lo
     * accionable. Contra el fondo del panel, la manteca mide 6,10:1, muy por
     * encima de los 4,5 que pide el criterio 1.4.3, y ES lo que identifica al
     * control, igual que en el enlace del pie del panel: el relleno de abajo no
     * llega a 3:1 contra la superficie y no pretende ser un límite.
     *
     * EL CONTORNO SE VUELVE TRANSPARENTE EN VEZ DE DESAPARECER. Con border 0
     * el botón mide 2 px menos de alto que sus vecinos y la fila queda
     * despareja, además de acercar los 24x24 del criterio 2.5.8.
     *
     * Y EN ALTO CONTRASTE VUELVE, porque ahí el sistema aplasta el relleno y
     * el color del texto, así que sin el contorno no quedaría nada que diga
     * dónde termina el botón.
     */
    .salida {
      border-color: transparent;
      background: rgba(250, 240, 222, 0.1);
      color: #f2a317;
      font-weight: 600;
    }
    @media (hover: hover) {
      .boton.salida:not([disabled]):hover {
        border-color: rgba(242, 163, 23, 0.7);
        background: rgba(250, 240, 222, 0.16);
      }
    }
    @media (forced-colors: active) {
      .salida { border-color: ButtonText; }
    }

    .glifo { font-size: 0.95em; }

    .pregunta {
      margin-top: 0.8em;
      padding: 0.7em;
      border: 1px solid rgba(242, 163, 23, 0.7);
      border-radius: 0.55em;
    }
    .pregunta p { margin: 0 0 0.55em; font-size: 0.9em; }
    .pregunta .acciones { display: flex; flex-wrap: wrap; gap: 0.45em; }

    .entrar {
      display: inline-block;
      margin-top: 0.8em;
      color: #f2a317;
      font-size: 0.9em;
      text-decoration: underline;
    }
    /*
     * Texto que lee el lector de pantalla y no se ve, como el aviso de que un
     * enlace abre otra pestaña. Es la receta de siempre: un pixel recortado, y
     * no display none ni visibility hidden, que lo sacarían también del lector.
     */
    .solo-lector {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /*
     * LA REGIÓN VIVA SE MONTA VACÍA Y NUNCA SE ESCONDE.
     *
     * Un lector de pantalla no lee el contenido inicial de una región viva,
     * lee sus cambios, y para notarlos tiene que haberla registrado antes. Es
     * el mismo motivo por el que existe RegionViva.jsx en el sitio, donde 32
     * de las 41 regiones vivas estaban mal por entrar con su texto puesto.
     *
     * Y POR ESO NO LLEVA display:none NI :empty, que es la trampa que sigue
     * después. Esconderla la saca del árbol de accesibilidad y el lector deja
     * de tenerla registrada. Vacía no ocupa alto, así que no hace falta. El
     * margen se agrega recién con el texto.
     */
    .aviso { margin: 0; font-size: 0.85em; color: rgba(250, 240, 222, 0.75); }
    .aviso.con-texto { margin-top: 0.7em; }

    .fuente { margin: 0.8em 0 0; font-size: 0.8em; color: rgba(250, 240, 222, 0.6); }

    /*
     * EL CONTROL DE LA APARICIÓN AUTOMÁTICA, en la zona de la letra chica.
     *
     * VA COMO ENLACE Y NO COMO BOTÓN, a propósito. Es un ajuste y no lo que la
     * persona vino a hacer, y el panel ya tiene dos familias de control (los
     * tres interruptores de listas y las dos salidas) que no conviene ensuciar
     * con una sexta caja compitiendo por la mirada. Es el mismo criterio de un
     * solo botón destacado por pantalla que sigue el sitio.
     *
     * EL RELLENO VERTICAL NO ES ESTÉTICO, es el criterio 2.5.8. A 0,8em sobre
     * el 0,875em del panel el texto mide unos 11 px, así que sin los 0,5em de
     * arriba y abajo el blanco del click quedaría por debajo de los 24x24 que
     * pide WCAG. Con ellos ronda los 27.
     */
    .ajuste {
      display: block;
      width: 100%;
      margin-top: 0.6em;
      padding: 0.5em 0;
      border: 0;
      background: none;
      color: rgba(250, 240, 222, 0.6);
      font: inherit;
      font-size: 0.8em;
      text-align: left;
      text-decoration: underline;
      cursor: pointer;
    }

    @media (hover: hover) {
      .ajuste:hover { color: rgba(250, 240, 222, 0.85); }
    }

    /*
     * EL LOGO DE TMDb ES OBLIGATORIO, NO DECORATIVO. Sus condiciones de uso
     * dicen textualmente "You shall use the TMDB logo to identify your use of
     * the TMDB APIs". Tres reglas al tocar esto, las mismas que respeta el pie
     * del sitio:
     *
     *  - MENOS PROMINENTE QUE LA MARCA PROPIA. Acá son 11,2 px de alto contra
     *    los 14 de POCHOCLO, que además va en manteca, en negrita y arriba de
     *    todo, mientras que el logo va al pie, en la zona de la letra chica.
     *  - NI RECOLOREADO NI DEFORMADO. Es el SVG oficial, con su degradé y su
     *    viewBox intactos, así que la proporción la fija el propio archivo y
     *    acá solo se declara el alto.
     *  - EL AVISO DE QUE NO NOS RESPALDAN va en la pantalla de opciones, que es
     *    la sección de créditos de la extensión. En el panel no entra sin tapar
     *    lo que la persona vino a ver, y la línea de arriba ya nombra a TMDb
     *    como fuente del dato de disponibilidad.
     */
    .tmdb { display: block; height: 0.8em; width: auto; margin-top: 0.5em; }
  `);
  raiz.adoptedStyleSheets = [estilos];

  /**
   * `role="region"` con nombre es un landmark, o sea la forma en que alguien
   * con lector de pantalla puede saltar hasta acá sin recorrer Netflix entero.
   *
   * DELIBERADAMENTE NO LLEVA NINGÚN ENCABEZADO. Un `h2` adentro del shadow root
   * igual aparece en el árbol de accesibilidad de la página anfitriona, así que
   * se colaría en su esquema de encabezados. Un landmark alcanza para llegar y
   * no le ensucia el documento a nadie.
   */
  const caja = document.createElement('div');
  caja.className = 'panel';
  caja.setAttribute('role', 'region');
  caja.setAttribute('aria-label', 'Pochoclo');
  /**
   * EL IDIOMA SE DECLARA ACÁ Y NO SE HEREDA (2026-10-06). El panel vive adentro
   * de la página de la plataforma, y sin esto toma su `lang`: con Netflix en
   * inglés, un lector de pantalla leía "Otro título" con pronunciación inglesa.
   * Es el criterio 3.1.2 de WCAG. `es-AR` es el mismo que declara el sitio.
   */
  caja.setAttribute('lang', 'es-AR');

  const saludo = plataforma
    ? `Buscando algo en ${esc(plataforma.nombre)}...`
    : 'La extensión funciona en Netflix, Prime Video, Disney+, HBO Max y Apple TV.';

  caja.innerHTML = `
    <div class="cabecera">
      <a class="marca" href="${SITIO}" target="_blank" rel="noopener noreferrer"
         aria-label="Pochoclo, ir a pochoclo.ar, se abre en una pesta&ntilde;a nueva">POCHOCLO</a>
      <button type="button" class="cerrar" data-cerrar aria-label="Cerrar el panel de Pochoclo">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
    <div data-cuerpo><p class="datos">${saludo}</p></div>
    <p class="aviso" role="status" data-aviso></p>`;
  raiz.appendChild(caja);

  /**
   * LOS CLICKS DEL PANEL SE ATAJAN EN `window`, ANTES QUE LA PLATAFORMA.
   *
   * Medido el 2026-09-27 en netflix.com/browse con sesión de Netflix, a mano
   * desde la consola: `pointerdown` y `pointerup` llegan enteros hasta el
   * panel, pero el `click` pasa por la captura de `window` y nunca vuelve en la
   * burbuja. O sea que Netflix lo corta en el camino, antes de que llegue a
   * nuestro botón, y de un modo que tampoco deja abrir el enlace a la Ficha.
   * Los botones quedaban de adorno, sin un solo aviso, porque el código de
   * cada botón ni se enteraba.
   *
   * LAS PRUEBAS NO LO VEÍAN, y por dos motivos que se suman. Corren sobre la
   * portada de Netflix sin cuenta, donde esa parte de su aplicación no se
   * carga. Y clickean con `click()`, que es un evento sintético y no pasa por
   * donde pasa el dedo de la persona.
   *
   * POR QUÉ `window` Y EN CAPTURA. Es el primer lugar por donde pasa un click,
   * antes que `document`, que `body` y que cualquier contenedor de la página.
   * Los oyentes de un mismo nodo corren en el orden en que se registraron, y
   * los de la plataforma se registraron antes que este, pero la medición de
   * arriba muestra que el que corta no es uno de esos: un oyente puesto desde
   * la consola, o sea después que todos los de Netflix, recibió el click igual.
   *
   * SOLO SE ATAJAN LOS CLICKS QUE CAEN SOBRE UN CONTROL NUESTRO. A esos se les
   * corta el paso hacia la página, que de todos modos no tenía por qué
   * enterarse de lo que la persona hace en el panel. El resto del panel, y
   * toda la página, siguen exactamente como antes.
   *
   * SOLO LOS CLICKS DE VERDAD (`isTrusted`). Uno sintético, como el de las
   * pruebas, sigue su camino normal hasta el oyente del botón, así que no hay
   * dos caminos que puedan disparar la misma acción dos veces.
   *
   * CÓMO SE SABE QUÉ SE APRETÓ, si desde `window` el destino del click es el
   * anfitrión y no el botón (el shadow root cerrado lo esconde). Con el mouse,
   * `elementFromPoint` del propio shadow root, en el punto del click. Con el
   * teclado, que genera el click con `detail` en 0 y sin coordenadas, el
   * control enfocado.
   */
  const acciones = new WeakMap();

  function alClick(elemento, accion) {
    acciones.set(elemento, accion);
    elemento.addEventListener('click', accion);
  }

  function atajarClick(evento) {
    // Un panel reemplazado por otro, o cerrado, se lleva su oyente al primer
    // click que ve, en vez de dejarlo colgado de `window` para siempre.
    if (!host.isConnected) {
      window.removeEventListener('click', atajarClick, true);
      return;
    }
    if (!evento.isTrusted || evento.target !== host) return;

    const origen =
      evento.detail === 0
        ? raiz.activeElement
        : raiz.elementFromPoint(evento.clientX, evento.clientY);
    const control = origen && origen.closest('button, a[href]');
    if (!control || control.disabled) return;

    evento.stopImmediatePropagation();
    const accion = acciones.get(control);
    if (accion) {
      accion(evento);
    } else if (control.tagName === 'A' && evento.defaultPrevented) {
      // Si alguien de la página alcanzó a anular la acción del enlace antes
      // que nosotros, se abre a mano, con el mismo destino y las mismas
      // precauciones que el enlace declara.
      window.open(control.href, '_blank', 'noopener,noreferrer');
    }
  }
  window.addEventListener('click', atajarClick, true);

  /**
   * QUIÉN TENÍA EL FOCO ANTES DE QUE EXISTIERA EL PANEL, para devolvérselo al
   * cerrarlo. El panel no se lo roba al aparecer, justamente porque puede
   * inyectarse solo cuando la aparición automática está encendida, y mover el
   * foco sin que nadie lo haya pedido es de las cosas más molestas que puede
   * hacer una extensión.
   */
  const focoPrevio = document.activeElement;

  function cerrar() {
    // Solo en las plataformas, que es donde corre la aparición automática. En
    // cualquier otro sitio el panel sale por el ícono y no hay nada que callar.
    if (plataforma) enLaSesion((s) => s.setItem(MARCA_CERRADO, '1'));
    host.remove();
    window.removeEventListener('click', atajarClick, true);
    if (
      focoPrevio &&
      focoPrevio.isConnected &&
      typeof focoPrevio.focus === 'function'
    ) {
      focoPrevio.focus();
    }
  }

  alClick(raiz.querySelector('[data-cerrar]'), cerrar);

  /**
   * ESCAPE SE ESCUCHA EN EL SHADOW ROOT Y NO EN `document`, y la diferencia no
   * es de estilo. Netflix usa Escape para salir del reproductor. Un oyente
   * global se lo comería aunque el foco estuviera del otro lado de la pantalla,
   * o sea que el panel le rompería un atajo a la plataforma para ganar el suyo.
   */
  raiz.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      cerrar();
    }
  });

  const cuerpo = raiz.querySelector('[data-cuerpo]');
  const aviso = raiz.querySelector('[data-aviso]');

  /** Lo único que se anuncia. Poner texto acá ES el anuncio. */
  function avisar(texto) {
    aviso.textContent = texto;
    aviso.classList.toggle('con-texto', Boolean(texto));
  }

  /**
   * `chrome.runtime` deja de existir si la extensión se recarga con la página
   * abierta, y ahí `sendMessage` lanza en vez de contestar. Pasa todo el tiempo
   * mientras se desarrolla, y sin esto el panel queda mudo sin decir por qué.
   */
  /**
   * `error` es el diagnóstico y `mensaje` lo que se le muestra a la persona,
   * igual que en las respuestas del service worker (ver `problemaDe` ahí). Fuera
   * de desarrollo esto pasa cuando Chrome actualiza la extensión con el panel
   * abierto, y lo que sirve es volver a apretar el ícono.
   */
  const SIN_CONEXION =
    'Se perdió la conexión con Pochoclo. Cerrá el panel y volvé a apretar el ícono.';
  const pedir = (mensaje) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(mensaje, (respuesta) =>
          resolve(
            chrome.runtime.lastError
              ? {
                  error: chrome.runtime.lastError.message,
                  mensaje: SIN_CONEXION,
                }
              : respuesta,
          ),
        );
      } catch (error) {
        resolve({
          error: `${error.name}: ${error.message}`,
          mensaje: SIN_CONEXION,
        });
      }
    });

  /** "No se pudo guardar." más el motivo, solo si hay uno escrito para leer. */
  const conMotivo = (texto, r) =>
    r && r.mensaje ? `${texto} ${r.mensaje}` : texto;

  // A esta salida se llega apretando el ícono en cualquier otro sitio, que
  // ahora es posible porque el panel ya no está atado a un `content_scripts`
  // acotado a las cinco. Decir dónde funciona es mejor que un click que no
  // hace nada, que se lee como que la extensión está rota.
  if (!plataforma) {
    anotar({ error: 'plataforma no reconocida', host: location.hostname });
    return;
  }

  /**
   * Carga una imagen DENTRO DEL DOCUMENTO y dice si el navegador la dejó
   * pasar.
   *
   * QUE EL ELEMENTO ESTÉ YA COLGADO DEL DOCUMENTO ANTES DE PONERLE EL `src`
   * NO ES UN DETALLE, y la primera versión de esta prueba lo tenía mal. Con
   * un `new Image()` suelto, el pedido lo inicia el mundo aislado del content
   * script y no pasa por la CSP de la página, así que daba que cargaba
   * siempre. Un falso negativo perfecto, porque decía justo lo que uno quería
   * escuchar.
   */
  const cargar = (src, donde) =>
    new Promise((resolve) => {
      const img = document.createElement('img');
      // EL PÓSTER VA CON `alt` VACÍO A PROPÓSITO. No aporta nada que el título
      // de al lado no diga ya, así que un lector de pantalla lo saltea. Con el
      // nombre de la película adentro se escucharía dos veces seguidas.
      img.alt = '';
      // SIN REFERER, porque el pedido sale desde el documento de la plataforma
      // y hereda su política. Hoy las cinco mandan solo el origen, pero con
      // `unsafe-url` a TMDb le llegaría la dirección entera de lo que la
      // persona está mirando (medido el 2026-09-28, `/watch/80100172?trkid=...`).
      // TMDb sirve las imágenes igual sin referer.
      img.referrerPolicy = 'no-referrer';
      donde.appendChild(img);
      img.onload = () => resolve({ ok: true, img });
      img.onerror = () => resolve({ ok: false, img });
      img.src = src;
    });

  /**
   * LA API DEVUELVE LA RUTA DEL PÓSTER, NO LA DIRECCIÓN COMPLETA, y hay que
   * componerla igual que hace la web en `frontend/src/utils/imagenes.js`.
   *
   * OJO CON LA DUPLICACIÓN, que es el modo de fallo que este proyecto ya
   * conoce (el `TAGLINE` en `index.html`, el `VALIDACION_POCHOCLO` entre
   * backend y frontend). Acá no se puede importar ese archivo, porque la
   * extensión no comparte el build con el frontend. Cuando la extensión tenga
   * el suyo, esto tiene que leer el mismo módulo y no una copia.
   */
  const urlPoster = (ruta, tamano = 'w342') =>
    ruta ? `https://image.tmdb.org/t/p/${tamano}${ruta}` : null;

  /**
   * EL SVG OFICIAL DE TMDb, EL MISMO DIBUJO QUE `frontend/public/tmdb.svg`.
   *
   * VA INCRUSTADO Y NO COMO UN ARCHIVO DE LA EXTENSIÓN, por dos motivos. Uno
   * servido con `chrome.runtime.getURL` hay que declararlo en
   * `web_accessible_resources`, y eso le regala el identificador de la
   * extensión a cualquier página que quiera saber si la tenés instalada. Y
   * además pasaría por la `img-src` del anfitrión, que es justo lo que la
   * sección 6.4 tuvo que salir a medir para el póster.
   *
   * LO ÚNICO QUE CAMBIA RESPECTO DEL ARCHIVO ORIGINAL es que el relleno pasó de
   * una clase con `<style>` a un atributo, y que el degradé cambió de nombre.
   * No toca ni el color ni la proporción, porque son el mismo degradé, los
   * mismos tres pasos y el mismo `viewBox`. El `<style>` se saca porque un bloque de estilo
   * incrustado es lo que más chances tiene de chocar con la CSP de la página
   * anfitriona, y el nombre se cambia porque "linear-gradient" es demasiado
   * genérico para confiar en que sea único.
   */
  const LOGO_TMDB = `
    <svg class="tmdb" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 273.42 35.52" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="pochoclo-tmdb" y1="17.76" x2="273.42" y2="17.76" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#90cea1"/>
          <stop offset="0.56" stop-color="#3cbec9"/>
          <stop offset="1" stop-color="#00b3e5"/>
        </linearGradient>
      </defs>
      <path fill="url(#pochoclo-tmdb)" d="M191.85,35.37h63.9A17.67,17.67,0,0,0,273.42,17.7h0A17.67,17.67,0,0,0,255.75,0h-63.9A17.67,17.67,0,0,0,174.18,17.7h0A17.67,17.67,0,0,0,191.85,35.37ZM10.1,35.42h7.8V6.92H28V0H0v6.9H10.1Zm28.1,0H46V8.25h.1L55.05,35.4h6L70.3,8.25h.1V35.4h7.8V0H66.45l-8.2,23.1h-.1L50,0H38.2ZM89.14.12h11.7a33.56,33.56,0,0,1,8.08,1,18.52,18.52,0,0,1,6.67,3.08,15.09,15.09,0,0,1,4.53,5.52,18.5,18.5,0,0,1,1.67,8.25,16.91,16.91,0,0,1-1.62,7.58,16.3,16.3,0,0,1-4.38,5.5,19.24,19.24,0,0,1-6.35,3.37,24.53,24.53,0,0,1-7.55,1.15H89.14Zm7.8,28.2h4a21.66,21.66,0,0,0,5-.55A10.58,10.58,0,0,0,110,26a8.73,8.73,0,0,0,2.68-3.35,11.9,11.9,0,0,0,1-5.08,9.87,9.87,0,0,0-1-4.52,9.17,9.17,0,0,0-2.63-3.18A11.61,11.61,0,0,0,106.22,8a17.06,17.06,0,0,0-4.68-.63h-4.6ZM133.09.12h13.2a32.87,32.87,0,0,1,4.63.33,12.66,12.66,0,0,1,4.17,1.3,7.94,7.94,0,0,1,3,2.72,8.34,8.34,0,0,1,1.15,4.65,7.48,7.48,0,0,1-1.67,5,9.13,9.13,0,0,1-4.43,2.82V17a10.28,10.28,0,0,1,3.18,1,8.51,8.51,0,0,1,2.45,1.85,7.79,7.79,0,0,1,1.57,2.62,9.16,9.16,0,0,1,.55,3.2,8.52,8.52,0,0,1-1.2,4.68,9.32,9.32,0,0,1-3.1,3A13.38,13.38,0,0,1,152.32,35a22.5,22.5,0,0,1-4.73.5h-14.5Zm7.8,14.15h5.65a7.65,7.65,0,0,0,1.78-.2,4.78,4.78,0,0,0,1.57-.65,3.43,3.43,0,0,0,1.13-1.2,3.63,3.63,0,0,0,.42-1.8A3.3,3.3,0,0,0,151,8.6a3.42,3.42,0,0,0-1.23-1.13A6.07,6.07,0,0,0,148,6.9a9.9,9.9,0,0,0-1.85-.18h-5.3Zm0,14.65h7a8.27,8.27,0,0,0,1.83-.2,4.67,4.67,0,0,0,1.67-.7,3.93,3.93,0,0,0,1.23-1.3,3.8,3.8,0,0,0,.47-1.95,3.16,3.16,0,0,0-.62-2,4,4,0,0,0-1.58-1.18,8.23,8.23,0,0,0-2-.55,15.12,15.12,0,0,0-2.05-.15h-5.9Z"/>
    </svg>`;

  // ==========================================================================
  // LAS TRES LISTAS. Paso 6 del orden de trabajo.
  // ==========================================================================

  const LISTAS = [
    { clave: 'favoritas', etiqueta: 'Favoritas' },
    { clave: 'visto', etiqueta: 'Visto' },
    { clave: 'ver_mas_tarde', etiqueta: 'Ver más tarde' },
  ];
  const etiquetaDe = (clave) => LISTAS.find((l) => l.clave === clave).etiqueta;

  /**
   * EL TÍTULO QUE SE ESTÁ MOSTRANDO, y por qué es una variable de arriba y no
   * un parámetro que se pasa por todos lados. "Otro título" redibuja el panel
   * entero, así que los manejadores de las listas y de la pregunta de Visto
   * tienen que estar mirando el título de AHORA y no el de cuando se
   * engancharon. Con una sola variable no hay forma de que se desincronicen.
   */
  let resultado = null;
  let clave = null;
  let botones = null;
  let buscando = false;

  function pintar(boton, dentro) {
    boton.setAttribute('aria-pressed', String(dentro));
    boton.querySelector('.glifo').textContent = dentro ? '✓' : '+';
  }

  /**
   * SON TRES BOTONES A LA VISTA Y NO EL MENÚ DEL "+" QUE USA EL SITIO.
   *
   * Allá el menú existe porque hay decenas de tarjetas en una grilla y no
   * entran tres botones en cada una. Acá hay un título solo. Y de paso se evita
   * el problema que ese menú tuvo que resolver con JavaScript, que es un
   * desplegable anclado a un borde quedando fuera de la pantalla. Un panel
   * flotante adentro de otro panel flotante encima de la página de un tercero
   * es un lugar difícil de acertar.
   *
   * `aria-pressed`, y no un nombre que cambie de "Agregar" a "Quitar". Los tres
   * estados están a la vista al mismo tiempo, así que estar en la lista es una
   * propiedad del control y no una descripción de la acción, que es
   * exactamente para lo que existe `aria-pressed`. El nombre queda en
   * "Favoritas", o sea el texto visible, y eso cumple el criterio 2.5.3.
   */
  function dibujarListas(acciones, en) {
    acciones.innerHTML = `
      <div class="listas">
        ${LISTAS.map(
          (l) => `
          <button type="button" class="boton" data-lista="${l.clave}" aria-pressed="${Boolean(en[l.clave])}">
            <span class="glifo" aria-hidden="true">${en[l.clave] ? '✓' : '+'}</span>
            <span>${esc(l.etiqueta)}</span>
          </button>`,
        ).join('')}
      </div>
      <div data-pregunta></div>`;

    botones = new Map();
    for (const boton of acciones.querySelectorAll('[data-lista]')) {
      botones.set(boton.dataset.lista, boton);
      alClick(boton, () => alternar(boton));
    }
  }

  async function alternar(boton) {
    const lista = boton.dataset.lista;
    const dentro = boton.getAttribute('aria-pressed') === 'true';
    const etiqueta = etiquetaDe(lista);

    boton.disabled = true;
    const r = await pedir({ tipo: 'alternar-lista', lista, clave, dentro });
    boton.disabled = false;

    if (r && r.sinSesion) {
      avisar('Se cerró tu sesión de Pochoclo. Volvé a entrar en pochoclo.ar.');
      return;
    }
    if (!r || !r.ok) {
      // El mensaje del 409 (la lista llena) ya viene escrito para leer.
      avisar(conMotivo('No se pudo guardar.', r));
      return;
    }

    pintar(boton, r.dentro);
    avisar(r.dentro ? `Agregado a ${etiqueta}.` : `Quitado de ${etiqueta}.`);

    if (r.sugerirVisto) preguntarVisto(boton);
    // La pregunta de Visto nace de haber agregado a Favoritas, así que deja de
    // tener sentido si se saca de ahí o si se marca Visto con su propio botón.
    // Dejarla abierta permitía contestar "Sí" con Favoritas ya sin marcar.
    else if (
      lista === 'favoritas' ? !r.dentro : lista === 'visto' && r.dentro
    ) {
      cerrarPregunta(boton);
    }
  }

  /**
   * Cierra la pregunta de Visto si está abierta. Si el foco estaba adentro, lo
   * deja en `destino` antes de borrarla, por el mismo motivo que `terminar`.
   */
  function cerrarPregunta(destino) {
    const cajaPregunta = raiz.querySelector('[data-pregunta]');
    if (!cajaPregunta || !cajaPregunta.firstChild) return;
    if (cajaPregunta.contains(raiz.activeElement)) destino.focus();
    cajaPregunta.innerHTML = '';
  }

  /**
   * LA PREGUNTA INMEDIATA DE FAVORITAS A VISTO (sección 18).
   *
   * El sitio la hace con un modal, y acá va dentro del panel. La sección define
   * dos formas, un modal en las tarjetas y algo no bloqueante en el buscador de
   * las listas, y esta situación se parece a la segunda. Atrapar el foco en un
   * modal encima de Netflix, para preguntar algo que se puede no contestar, es
   * mucho más de lo que la pregunta pesa.
   *
   * EL FOCO SE MUEVE AL GRUPO, y ahí hay una decisión. Dejarlo en el botón de
   * Favoritas obligaría a adivinar que apareció algo nuevo más abajo. Llevarlo
   * directo al "Sí" empujaría hacia una de las dos respuestas. El grupo lleva
   * la pregunta como nombre, así que al recibir el foco se lee entera y las dos
   * respuestas quedan a un tabulador, sin favorecer a ninguna.
   */
  function preguntarVisto(botonFavoritas) {
    const cajaPregunta = raiz.querySelector('[data-pregunta]');
    const pregunta = `¿Ya viste ${resultado.titulo}?`;

    cajaPregunta.innerHTML = `
      <div class="pregunta" role="group" tabindex="-1" aria-label="${esc(pregunta)}" data-grupo>
        <p>${esc(pregunta)}</p>
        <div class="acciones">
          <button type="button" class="boton" data-si>S&iacute;, marcarlo como visto</button>
          <button type="button" class="boton" data-no>Ahora no</button>
        </div>
      </div>`;

    const grupo = cajaPregunta.querySelector('[data-grupo]');

    /**
     * Al sacar del DOM el elemento que tiene el foco, el foco se va al `body` y
     * el lector empieza a leer el documento desde arriba. Es el defecto que más
     * se repitió en la auditoría del sitio, así que acá se decide a dónde va
     * antes de borrar nada.
     */
    function terminar(mensaje) {
      cajaPregunta.innerHTML = '';
      botonFavoritas.focus();
      avisar(mensaje);
    }

    alClick(grupo.querySelector('[data-si]'), async () => {
      const r = await pedir({
        tipo: 'alternar-lista',
        lista: 'visto',
        clave,
        dentro: false,
      });
      if (r && r.ok) {
        pintar(botones.get('visto'), true);
        terminar('Marcado como visto.');
      } else {
        terminar(
          conMotivo('No se pudo marcar como visto.', r),
        );
      }
    });

    alClick(grupo.querySelector('[data-no]'), () => terminar('No se marcó.'));

    grupo.focus();
  }

  // ==========================================================================
  // EL TÍTULO, LA PUNTUACIÓN, LA FICHA Y EL BOTÓN DE PEDIR OTRO. Sección 21.
  // ==========================================================================

  /**
   * LA PUNTUACIÓN SE DIBUJA COMO LA MEDALLA DEL SITIO, y con el mismo texto
   * para el lector de pantalla que `MedallaPuntaje.jsx`. El número va con
   * `aria-hidden` y el nombre lo pone el contenedor: "8.4" a secas no significa
   * nada leído en voz alta, y "Puntuación 8.4 de 10" sí.
   */
  function medalla(valor) {
    // `typeof` y no `!= null`, porque lo que sigue es un `toFixed`: si algún
    // día la API mandara la Puntuación como texto, la excepción rompería el
    // dibujado entero del panel y el síntoma no se parecería en nada a esto.
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      return (
        '<div class="medalla sin-dato" role="img" aria-label="Puntuación no disponible">' +
        '<span aria-hidden="true">S/D</span></div>'
      );
    }
    const texto = valor.toFixed(1);
    return (
      `<div class="medalla" role="img" aria-label="Puntuación ${texto} de 10">` +
      `<span aria-hidden="true">${texto}</span></div>`
    );
  }

  /**
   * HASTA CUÁNDO NO HAY QUE VOLVER A PEDIR, en milisegundos del reloj local.
   *
   * Lo fija el `Retry-After` que manda el servidor con un 429, y lo respetan
   * los dos botones que buscan, o sea "Otro título" y "Probar de nuevo".
   *
   * ES EL NÚMERO DEL SERVIDOR Y NO UNO NUESTRO, a propósito. Un intervalo
   * propio del lado del panel sería un segundo límite, con su propio valor,
   * que el día que el del backend cambie va a quedar diciendo otra cosa. Este
   * no se puede desincronizar porque no existe hasta que el servidor lo manda.
   */
  let esperarHasta = 0;

  /**
   * EL PANEL CUANDO LA BÚSQUEDA NO TRAJO UN TÍTULO.
   *
   * Antes acá se imprimía "No pude buscar." y lo que hubiera venido, que en la
   * práctica era casi siempre "Sin resultado.", porque el service worker no
   * miraba el código de estado. O sea que el límite de pedidos, un error del
   * servidor y una búsqueda que no encontró nada se veían exactamente iguales,
   * y ninguno de los tres decía qué hacer después.
   *
   * LA SALIDA SIEMPRE ES UN BOTÓN, y no una línea de texto. Sin él, quien se
   * topa con esto en el primer dibujado se queda sin ninguna forma de
   * reintentar desde el panel: tendría que cerrarlo y volver a apretar el
   * ícono, que es pedirle que adivine que eso es lo que sirve.
   */
  function mostrarProblema(respuesta, conFoco) {
    const partes = [respuesta.mensaje || 'No se pudo buscar ahora.'];

    if (respuesta.esperarSegundos) {
      esperarHasta = Date.now() + respuesta.esperarSegundos * 1000;
      partes.push(
        `Podés probar de nuevo en ${respuesta.esperarSegundos} segundos.`,
      );
    }
    const mensaje = partes.join(' ');

    cuerpo.innerHTML = `
      <p class="datos">${esc(mensaje)}</p>
      <div class="salidas">
        <button type="button" class="boton salida" data-otro>Probar de nuevo</button>
      </div>`;
    anotar({
      error: respuesta.error || null,
      estado: respuesta.estado ?? null,
    });

    /**
     * EL BOTÓN NO SE DESHABILITA MIENTRAS DURA LA ESPERA, aunque sea el reflejo
     * normal, y son dos motivos que apuntan al mismo lado. Deshabilitar el
     * elemento que acaba de recibir el foco lo manda al `body`, que es el
     * defecto que más se repitió en la auditoría del sitio. Y un botón que se
     * renombra solo cada segundo le cambia el nombre accesible en la cara a
     * quien lo tiene enfocado. Apretarlo antes de tiempo no gasta ningún
     * pedido: `mostrarUnTitulo` mira el reloj antes de salir a la red.
     */
    const boton = raiz.querySelector('[data-otro]');
    alClick(boton, () => mostrarUnTitulo({ conFoco: true }));
    if (conFoco) {
      boton.focus();
      avisar(mensaje);
    }
  }

  /**
   * PIDE UN TÍTULO Y DIBUJA TODO. Corre al abrir el panel y cada vez que
   * alguien aprieta "Otro título", que es el botón que pide la sección 21.
   *
   * `conFoco` lo manda solo el botón, y hace dos cosas que no se pueden
   * separar. Devuelve el foco al botón nuevo, porque el viejo se fue del DOM al
   * redibujar y sin esto el foco cae al `body` y el lector arranca a leer
   * Netflix desde arriba. Y anuncia el título que salió, porque quien no ve la
   * pantalla no tiene ninguna otra forma de enterarse de que cambió.
   */
  async function mostrarUnTitulo({ conFoco = false } = {}) {
    if (buscando) return;

    // El servidor pidió esperar y todavía no se cumplió. Se contesta sin salir
    // a la red, que es justo lo que un 429 está pidiendo que no hagamos.
    const faltan = Math.ceil((esperarHasta - Date.now()) / 1000);
    if (faltan > 0) {
      avisar(
        `Todavía no. Probá de nuevo en ${faltan} segundo${faltan === 1 ? '' : 's'}.`,
      );
      return;
    }

    buscando = true;
    if (conFoco) avisar('Buscando otro título...');

    // LO ÚNICO QUE SALE DE ACÁ HACIA EL BACKEND ES EL NÚMERO DE PROVEEDOR. Ni
    // la dirección de la pestaña, ni el título que estaba viendo la persona.
    const respuesta = await pedir({
      tipo: 'un-titulo',
      plataforma: plataforma.proveedor,
    });
    buscando = false;

    if (!respuesta || !respuesta.resultado) {
      mostrarProblema(respuesta || {}, conFoco);
      return;
    }

    resultado = respuesta.resultado;
    clave = { tmdb_id: resultado.tmdb_id, tipo: resultado.tipo };
    const ficha = `${SITIO}/titulo/${resultado.tipo}/${resultado.tmdb_id}`;

    /**
     * Se dibuja el panel PRIMERO y recién después se carga la imagen, para que
     * el `<img>` esté colgado del documento cuando le llegue el `src`.
     *
     * LA LÍNEA DE LA FUENTE NOMBRA LA PLATAFORMA Y DE DÓNDE SALE EL DATO, que
     * es lo que pide la sección 21: en qué plataforma está cada título lo
     * informa TMDb y a veces está viejo, así que la persona tiene que poder
     * entender de quién es el error.
     *
     * EL ENLACE A LA FICHA AVISA EN SU NOMBRE QUE ABRE UNA PESTAÑA NUEVA, y no
     * con una línea visible abajo como hace el enlace de "Entrá a Pochoclo" de
     * más adelante. La diferencia es la forma. Aquel es un renglón de texto y
     * este es un botón en una fila de dos, donde una segunda línea lo
     * deformaría. El texto visible sigue estando entero adentro del nombre
     * accesible, así que cumple el criterio 2.5.3.
     */
    cuerpo.innerHTML = `
      <div class="encabezado-titulo">
        <div class="texto">
          <p class="titulo">${esc(resultado.titulo)}</p>
          <p class="datos">${esc(resultado.anio)} &middot; ${esc(ETIQUETA_TIPO[resultado.tipoContenido] ?? resultado.tipoContenido)}</p>
        </div>
        ${medalla(resultado.puntuacion)}
      </div>
      <div class="poster" data-poster></div>
      <div data-acciones></div>
      <div class="salidas">
        <button type="button" class="boton salida" data-otro>Otro t&iacute;tulo</button>
        <a class="boton salida" data-ficha href="${esc(ficha)}" target="_blank" rel="noopener noreferrer"
           aria-label="Ver la ficha de ${esc(resultado.titulo)} en pochoclo.ar, se abre en una pesta&ntilde;a nueva">
          Ver la ficha
        </a>
      </div>
      <div data-ajuste></div>
      <p class="fuente">Disponible en ${esc(plataforma.nombre)} seg&uacute;n TMDb</p>
      ${LOGO_TMDB}`;

    const botonOtro = raiz.querySelector('[data-otro]');
    alClick(botonOtro, () => mostrarUnTitulo({ conFoco: true }));
    if (conFoco) {
      botonOtro.focus();
      avisar(`${resultado.titulo}, ${resultado.anio}.`);
    }

    const estrategia = await dibujarPoster();
    const sesion = await dibujarAcciones();
    const aparicion = await dibujarAjuste();

    anotar({
      plataforma: plataforma.clave,
      proveedor: plataforma.proveedor,
      titulo: resultado.titulo,
      puntuacion: resultado.puntuacion,
      ficha,
      estrategia,
      sesion,
      aparicion,
    });
  }

  /**
   * LA ESTRATEGIA DEL PÓSTER, en este orden y con este motivo.
   *
   * Primero la dirección de TMDb, derecho. Medido el 2026-09-12 en las cinco
   * plataformas: funciona en todas, Apple TV incluida, que es la única cuya
   * CSP enumera dominios y deja afuera a image.tmdb.org. Lo que la salva es
   * que **la CSP del anfitrión no alcanza a lo que inyecta un content
   * script**, comprobado con un control por el otro lado: la misma imagen, en
   * la misma página, cargada desde el mundo principal, SÍ se bloquea.
   *
   * Y si algún día eso cambia, cae al `data:` URI que baja el service worker,
   * que no pasa por ninguna CSP de página. Ese respaldo **no cuesta ningún
   * permiso de host**, porque image.tmdb.org contesta con
   * `Access-Control-Allow-Origin: *`.
   */
  async function dibujarPoster() {
    const cajaPoster = raiz.querySelector('[data-poster]');
    const directo = urlPoster(resultado.poster);
    if (!directo) return 'ninguna';

    const conUrl = await cargar(directo, cajaPoster);
    if (conUrl.ok) return 'directa';

    conUrl.img.remove();
    const { dataUri } = await pedir({
      tipo: 'poster-en-data-uri',
      url: directo,
    });
    if (dataUri && (await cargar(dataUri, cajaPoster)).ok) return 'data';
    return 'ninguna';
  }

  /**
   * TRES ESTADOS Y NO DOS, que es lo que obliga a que el service worker
   * distinga el 401 de un fallo de red. Ofrecerle entrar a alguien que ya
   * entró, solo porque se cortó internet, sería decirle algo falso sobre su
   * propia cuenta.
   */
  /**
   * EL CONTROL DE LA APARICIÓN AUTOMÁTICA (sección 21).
   *
   * POR QUÉ ESTÁ ACÁ Y NO SOLO EN LA PANTALLA DE OPCIONES. Esa pantalla se
   * abre con el botón derecho sobre el ícono, o desde `chrome://extensions`, y
   * las dos son cosas que alguien tiene que saber de antemano que existen. O
   * sea que la preferencia estaba escrita y no la iba a encontrar nadie. Acá
   * aparece donde la persona ya está mirando y justo cuando le puede servir,
   * que es después de haber usado el panel al menos una vez.
   *
   * APAGAR PASA ACÁ MISMO Y PRENDER ABRE LA PANTALLA DE OPCIONES, y la
   * asimetría la impone Chrome, no nosotros. Medido el 2026-09-15:
   * `chrome.permissions.remove` resuelve desde el service worker sin ningún
   * gesto, y `request` contesta "This function must be called during a user
   * gesture", porque acto seguido abre su propio cartel y exige una página de
   * la extensión con un click encima. En un content script como este la API ni
   * siquiera existe, así que las dos mitades pasan por el service worker.
   *
   * SI NO SE PUDO AVERIGUAR EL ESTADO NO SE DIBUJA NADA. Un control que no
   * sabe si está prendido o apagado es peor que ninguno, porque la primera
   * lectura de la persona va a ser la equivocada.
   */
  async function dibujarAjuste() {
    const cajaAjuste = raiz.querySelector('[data-ajuste]');
    const estado = await pedir({
      tipo: 'estado-aparicion',
      clave: plataforma.clave,
    });
    if (!estado || estado.error || typeof estado.prendida !== 'boolean')
      return null;

    let prendida = estado.prendida;
    // Una bandera y no `boton.disabled`, por el mismo motivo que en la pantalla
    // de opciones: deshabilitar el control que uno acaba de apretar le saca el
    // foco, y es el defecto que más se repitió en la auditoría del sitio.
    let ocupado = false;

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'ajuste';
    cajaAjuste.replaceChildren(boton);

    const pintarAjuste = () => {
      boton.textContent = prendida
        ? `No aparecer automáticamente en ${plataforma.nombre}`
        : `Que aparezca automáticamente en ${plataforma.nombre}`;
    };
    pintarAjuste();

    alClick(boton, async () => {
      if (ocupado) return;
      ocupado = true;
      try {
        if (prendida) {
          const r = await pedir({
            tipo: 'apagar-aparicion',
            clave: plataforma.clave,
          });
          if (!r || r.error || typeof r.prendida !== 'boolean') {
            avisar(conMotivo('No se pudo cambiar.', r));
            return;
          }
          prendida = r.prendida;
          pintarAjuste();
          avisar(
            prendida
              ? `Sigue apareciendo automáticamente en ${plataforma.nombre}. Probá sacarle el acceso al sitio desde Chrome.`
              : `Listo. En ${plataforma.nombre} el panel aparece únicamente cuando apretás el ícono.`,
          );
        } else {
          const r = await pedir({
            tipo: 'abrir-opciones',
            clave: plataforma.clave,
          });
          if (!r || r.error) {
            avisar(
              r && r.mensaje
                ? `No se pudieron abrir las opciones. ${r.mensaje}`
                : 'No se pudieron abrir las opciones. También se abren con el botón derecho sobre el ícono de Pochoclo en la lista de extensiones.',
            );
            return;
          }
          // NO se dice "listo": lo que se abrió es la pantalla donde hay que
          // tildar la casilla y contestarle el cartel a Chrome, así que la
          // persona todavía tiene dos pasos por delante y conviene decírselo.
          avisar(
            'Se abrieron las opciones de Pochoclo en otra pestaña para prenderlo.',
          );
        }
      } finally {
        ocupado = false;
      }
    });

    return prendida;
  }

  async function dibujarAcciones() {
    const acciones = raiz.querySelector('[data-acciones]');
    const estado = await pedir({ tipo: 'estado-listas', clave });

    if (estado && estado.sesion === true) {
      dibujarListas(acciones, estado.en || {});
    } else if (estado && estado.sesion === false) {
      // El sitio hace lo contrario y esconde el botón para quien no tiene
      // cuenta, porque ahí son decenas de tarjetas y un botón que solo avisa
      // que no se puede usar es ruido en cada una. Acá hay un panel y un
      // título, así que la sección 21 pide justamente lo otro.
      acciones.innerHTML = `
        <a class="entrar" href="${SITIO}/iniciar-sesion" target="_blank" rel="noopener noreferrer">
          Entr&aacute; a Pochoclo para guardarlo en tus listas
          <span class="solo-lector">Se abre en una pesta&ntilde;a nueva.</span>
        </a>`;
    } else {
      // El motivo lo trae el service worker ya escrito para leer, sea el
      // límite de pedidos, un error del servidor o la conexión caída.
      const detalle =
        (estado && estado.mensaje) ||
        'No se pudieron consultar tus listas ahora.';
      acciones.innerHTML = `<p class="datos">${esc(detalle)}</p>`;
    }
    return estado ? estado.sesion : null;
  }

  await mostrarUnTitulo();
})();
