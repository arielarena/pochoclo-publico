/**
 * Piezas compartidas por las dos auditorías de diseño adaptable:
 * `auditoria-responsive.mjs` recorre las pantallas en reposo y
 * `auditoria-responsive-estados.mjs` los estados que solo existen después de
 * una interacción.
 *
 * Están acá y no copiadas en los dos archivos porque los criterios de
 * medición TIENEN que ser los mismos: si uno cuenta como cortado algo que el
 * otro perdona, los dos informes dejan de ser comparables.
 */

export function buscarNavegador(fs) {
  /**
   * En esta máquina el headless de Edge no arranca (falla incluso desde su
   * propia línea de comandos), así que se prueban varias rutas en vez de una
   * fija. Se puede forzar una con la variable de entorno NAVEGADOR.
   */
  const CANDIDATOS = [
    process.env.NAVEGADOR,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  const encontrado = CANDIDATOS.find((r) => fs.existsSync(r));
  if (!encontrado) throw new Error(`Sin navegador. Probé: ${CANDIDATOS.join(", ")}`);
  return encontrado;
}
/**
 * Anchos reales, no redondos. 320 es el piso que todavía existe (iPhone SE de
 * primera generación, y el modo de texto agrandado de Android, que reduce el
 * ancho efectivo en px de CSS). 360 es el más común del mundo Android.
 */
export const VIEWPORTS = [
  { nombre: '320 (SE / piso)', ancho: 320, alto: 568, movil: true },
  { nombre: '360 (Android)', ancho: 360, alto: 740, movil: true },
  { nombre: '390 (iPhone 14)', ancho: 390, alto: 844, movil: true },
  { nombre: '768 (tablet vert.)', ancho: 768, alto: 1024, movil: true },
  { nombre: '1024 (tablet horiz.)', ancho: 1024, alto: 768, movil: false },
  { nombre: '1280 (escritorio)', ancho: 1280, alto: 800, movil: false },
  /**
   * Apaisado: lo que cambia no es el ancho sino el ALTO, y es el caso que se
   * escapa de mirar solo teléfonos verticales. Con la barra del navegador, un
   * teléfono acostado deja unos 320-360px de alto, y ahí es donde un panel
   * centrado con `position: fixed` puede quedar más alto que la pantalla sin
   * forma de llegar a lo de abajo.
   */
  { nombre: '740x360 (teléfono apaisado)', ancho: 740, alto: 360, movil: true },
  { nombre: '568x320 (SE apaisado)', ancho: 568, alto: 320, movil: true },
];

/** Se ejecuta DENTRO de la página. Devuelve los hallazgos de geometría. */
export function medir() {
  const anchoVista = document.documentElement.clientWidth;
  const desbordes = [];
  const cortados = [];
  const chicos = [];
  const objetivos = [];
  const inalcanzables = [];
  const letraChica = [];
  const vistos = new Set();

  const describir = (el) => {
    const clases = (typeof el.className === 'string' ? el.className : '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
      .join('.');
    const texto = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${clases ? '.' + clases : ''}${texto ? ` "${texto}"` : ''}`;
  };

  for (const el of document.querySelectorAll('body *')) {
    const estilo = getComputedStyle(el);
    if (estilo.display === 'none' || estilo.visibility === 'hidden') continue;
    /**
     * Lo que está solo para lectores de pantalla vive fuera de la pantalla a
     * propósito (1x1px, clip). Medirle la geometría no dice nada.
     */
    if (el.closest('.solo-lector')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    /**
     * 1. Desborde horizontal. Se ignora lo que está deliberadamente a sangre
     * completa (el fondo de rayos del inicio, que se recorta a propósito).
     */
    const aSangre = Math.abs(r.width - window.innerWidth) < 2 && el.closest('[aria-hidden="true"]');
    if (!aSangre && (r.right > anchoVista + 1 || r.left < -1)) {
      /**
       * Solo el elemento más externo de cada cadena: si un contenedor se pasa,
       * todos sus hijos también, y listarlos a todos es ruido.
       */
      let padreCulpable = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const pr = p.getBoundingClientRect();
        if (pr.right > anchoVista + 1 || pr.left < -1) {
          padreCulpable = true;
          break;
        }
      }
      if (!padreCulpable) {
        desbordes.push({ que: describir(el), izq: Math.round(r.left), der: Math.round(r.right) });
      }
    }

    /**
     * 2. Contenido cortado adentro de una caja que no scrollea.
     *
     * OJO CON LOS DECORADOS: `scrollWidth` cuenta también a los hijos
     * absolutos que se salen a propósito. Los dos casos del proyecto son el
     * resplandor de BorderGlow (`inset: -22px`) y el fondo de rayos del
     * inicio (`w-screen`), y los dos están contenidos por el
     * `overflow-x-clip` de App.jsx. Así que solo cuenta como cortado lo que
     * se sale estando EN FLUJO, que es lo único que el usuario iba a leer.
     */
    const scrolleable = ['auto', 'scroll'].includes(estilo.overflowX);
    if (!scrolleable && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      const borde = r.left + el.clientLeft + el.clientWidth;
      const enFlujo = [...el.children].some((h) => {
        const eh = getComputedStyle(h);
        if (eh.position === 'absolute' || eh.position === 'fixed') return false;
        if (eh.display === 'none') return false;
        /**
         * Solo el rectángulo propio del hijo. Mirarle TAMBIÉN el scrollWidth
         * propagaba el caso decorativo hacia arriba: el envoltorio del botón de
         * "Me siento con suerte" quedaba marcado porque adentro tenía el
         * BorderGlow, cuyo resplandor se sale a propósito.
         */
        return h.getBoundingClientRect().right > borde + 1;
      });
      /**
       * Sin hijos elementos, el desborde es del texto propio y sí cuenta...
       * salvo que salga de un pseudo-elemento absoluto con inset negativo,
       * que es como el sistema agranda el área táctil de la "x" de los chips
       * sin agrandar el círculo visible (`before:-inset-0.5`). Ahí el
       * scrollWidth crece 2px y no hay nada cortado.
       */
      const pseudoQueSobresale = ['::before', '::after'].some((p) => {
        const ep = getComputedStyle(el, p);
        if (ep.content === 'none' || ep.position !== 'absolute') return false;
        return parseFloat(ep.left) < 0 || parseFloat(ep.right) < 0;
      });
      const soloTexto = el.children.length === 0 && !pseudoQueSobresale;
      if (enFlujo || soloTexto) {
        const clave = describir(el);
        if (!vistos.has(clave)) {
          vistos.add(clave);
          cortados.push({ que: clave, contenido: el.scrollWidth, caja: el.clientWidth });
        }
      }
    }

    /**
     * 2b. Capas fijas más altas que la pantalla y sin forma de desplazarse.
     *
     * Este es el modo de fallo del teléfono apaisado y no tiene equivalente
     * horizontal: la página normal siempre puede scrollear hacia abajo, pero
     * una capa `position: fixed` centrada no, así que lo que se pase del alto
     * de la pantalla queda inalcanzable. En un modal eso puede ser el botón
     * que lo cierra.
     */
    if (estilo.position === 'fixed') {
      const scrolleaY = ['auto', 'scroll'].includes(estilo.overflowY);
      const alto = document.documentElement.clientHeight;
      const contenido = el.scrollHeight;
      if (!scrolleaY && contenido > alto + 1) {
        inalcanzables.push({ que: describir(el), contenido, pantalla: alto });
      }
    }

    /**
     * 2c. Campos de texto con letra menor a 16px.
     *
     * Safari en iOS hace zoom sobre el campo al enfocarlo si su font-size es
     * menor a 16px, y después NO vuelve solo: el usuario queda con la página
     * agrandada y corrida, y tiene que salir del zoom a mano. Es el defecto
     * de diseño adaptable más común que no se ve en el emulador de Chrome,
     * porque Chrome no hace ese zoom.
     *
     * No aplica a los <select> ni a las casillas: el zoom lo dispara la
     * edición de texto.
     *
     * Y solo se mira con puntero grueso, que es la condición bajo la cual el
     * proyecto sube la letra de `CampoNumero` a 16px. En escritorio ese campo
     * se queda a propósito en 14 para alinear con los de al lado, y sin este
     * filtro el informe lo marcaba en los anchos de mouse para siempre, que
     * es justo el ruido que hace que un informe se deje de leer.
     */
    const editable =
      (el.tagName === 'INPUT' &&
        !['checkbox', 'radio', 'range', 'color', 'button', 'submit'].includes(el.type)) ||
      el.tagName === 'TEXTAREA';
    const punteroGrueso = matchMedia('(pointer: coarse)').matches;
    if (punteroGrueso && editable && parseFloat(estilo.fontSize) < 16) {
      letraChica.push({ que: describir(el), px: parseFloat(estilo.fontSize) });
    }

    // 3. Objetivos táctiles (WCAG 2.2, criterio 2.5.8: 24x24 CSS px).
    const interactivo =
      ['BUTTON', 'A', 'SELECT', 'INPUT', 'TEXTAREA'].includes(el.tagName) ||
      ['button', 'checkbox', 'radio', 'link'].includes(el.getAttribute('role'));
    /**
     * El criterio exime explícitamente a los enlaces EN LÍNEA dentro de un
     * bloque de texto: no se pueden agrandar sin romper el interlineado del
     * párrafo. Se detectan por `display: inline`, que es justo lo que los
     * distingue de un botón o de un enlace tratado como bloque.
     */
    const enLinea = estilo.display === 'inline';
    if (interactivo && !enLinea && !el.disabled) {
      /**
       * El área efectiva puede venir de un pseudo-elemento (el sistema usa
       * `before:-inset-*` para agrandar la "x" de los chips sin agrandar el
       * círculo visible), así que se mide también el ::before.
       */
      const antes = getComputedStyle(el, '::before');
      let ancho = r.width;
      let alto = r.height;
      if (antes.content !== 'none' && antes.position === 'absolute') {
        const inset = (v) => (v === 'auto' ? 0 : parseFloat(v) || 0);
        ancho -= inset(antes.left) + inset(antes.right);
        alto -= inset(antes.top) + inset(antes.bottom);
      }
      /**
       * Una casilla envuelta en su <label> se activa tocando la etiqueta
       * entera, así que el objetivo real es la etiqueta y no el cuadradito.
       */
      if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type)) {
        const etiqueta = el.closest('label');
        if (etiqueta) {
          const re = etiqueta.getBoundingClientRect();
          ancho = Math.max(ancho, re.width);
          alto = Math.max(alto, re.height);
        }
      }
      /**
       * Solo cuentan los objetivos que de verdad se pueden tocar. Un botón
       * tapado por el fondo de un modal, o por un desplegable abierto, sigue
       * estando en el DOM y con su rectángulo intacto, pero el dedo nunca lo
       * alcanza. Sin este filtro el informe emparejaba el "Cancelar" del modal
       * con una tarjeta que estaba detrás del overlay, y decía que estaban
       * pegados.
       */
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dentroDeLaVista =
        cx >= 0 && cy >= 0 && cx <= anchoVista && cy <= document.documentElement.clientHeight;
      const arriba = dentroDeLaVista ? document.elementFromPoint(cx, cy) : null;
      if (!arriba || !(el === arriba || el.contains(arriba))) continue;

      const esChico = (ancho < 23.5 || alto < 23.5) && ancho > 0 && alto > 0;
      /**
       * Se guardan TODOS los objetivos, no solo los chicos: la excepción de
       * separación del criterio se evalúa contra los objetivos vecinos, así
       * que hace falta la lista completa para poder aplicarla.
       */
      objetivos.push({ rect: r, esChico, que: describir(el), ancho, alto });
    }
  }

  /**
   * Excepción de separación de WCAG 2.5.8: un objetivo chico igual cumple si
   * un círculo de 24px de diámetro centrado en él no toca ni a otro objetivo
   * ni al círculo de otro objetivo chico. Sin esto el informe marca como falla
   * cosas que no lo son (los cinco enlaces del pie, por ejemplo, que son de
   * 20px de alto pero están separados de sobra), y el ruido tapa a las que sí.
   */
  const centroDe = (t) => ({ x: t.rect.left + t.rect.width / 2, y: t.rect.top + t.rect.height / 2 });
  const distanciaAlRect = (c, rect) => {
    const dx = Math.max(rect.left - c.x, 0, c.x - rect.right);
    const dy = Math.max(rect.top - c.y, 0, c.y - rect.bottom);
    return Math.hypot(dx, dy);
  };

  for (const t of objetivos) {
    if (!t.esChico) continue;
    const c = centroDe(t);
    const chocaCon = objetivos.find((otro) => {
      if (otro === t) return false;
      if (otro.esChico) {
        const co = centroDe(otro);
        return Math.hypot(c.x - co.x, c.y - co.y) < 24;
      }
      return distanciaAlRect(c, otro.rect) < 12;
    });
    if (chocaCon) {
      chicos.push({
        que: t.que,
        ancho: Math.round(t.ancho),
        alto: Math.round(t.alto),
        vecino: chocaCon.que,
      });
    }
  }

  return {
    anchoVista,
    desbordes,
    cortados: cortados.slice(0, 12),
    inalcanzables: inalcanzables.slice(0, 6),
    letraChica: letraChica.slice(0, 8),
    chicos: chicos.slice(0, 12),
    /**
     * Los chicos que zafan por separación no son una falla del criterio, pero
     * 20px de alto sigue siendo incómodo en un teléfono, así que se cuentan
     * aparte en vez de desaparecer del informe.
     */
    chicosConEspacio: objetivos
      .filter((t) => t.esChico)
      .map((t) => ({ que: t.que, ancho: Math.round(t.ancho), alto: Math.round(t.alto) }))
      .slice(0, 12),
  };
}

