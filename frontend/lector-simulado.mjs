/**
 * Simulador de lector de pantalla.
 *
 * QUÉ ES Y QUÉ NO ES. No es NVDA. Lo que hace es pedirle a Chrome, por su
 * protocolo de depuración, EL MISMO árbol de accesibilidad que Chrome le
 * entrega a un lector de pantalla de verdad a través de UI Automation, y
 * transcribirlo a lo que un lector diría. O sea que el rol, el nombre, la
 * descripción, el estado y la posición de cada cosa no se adivinan leyendo el
 * JSX: los calcula el navegador, igual que en la corrida real.
 *
 * Lo que NO cubre: la voz, el diccionario de pronunciación, los atajos propios
 * de cada lector, y las diferencias entre NVDA, JAWS y VoiceOver. Sirve para
 * contestar "qué se anuncia y en qué orden", que era la parte que quedó sin
 * verificar de los arreglos del 2026-08-26; no reemplaza escucharlo.
 */

import fs from 'node:fs';

export const CANDIDATOS = [
  process.env.NAVEGADOR,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

export function buscarNavegador() {
  const encontrado = CANDIDATOS.find((ruta) => fs.existsSync(ruta));
  if (!encontrado) throw new Error(`No encontré navegador. Probé: ${CANDIDATOS.join(', ')}`);
  return encontrado;
}

/**
 * Cómo nombra cada rol un lector de pantalla en español. Son los nombres de
 * NVDA en español, no los de ARIA, porque lo que se quiere leer acá es la
 * frase que escucha la persona.
 */
const ROLES = {
  button: 'botón',
  link: 'vínculo',
  heading: 'encabezado',
  checkbox: 'casilla',
  radio: 'botón de opción',
  textbox: 'cuadro de edición',
  searchbox: 'cuadro de búsqueda',
  combobox: 'cuadro combinado',
  listbox: 'cuadro de lista',
  option: 'opción',
  list: 'lista',
  listitem: 'elemento de lista',
  image: 'gráfico',
  img: 'gráfico',
  navigation: 'navegación',
  main: 'contenido principal',
  banner: 'banner',
  contentinfo: 'información de contenido',
  region: 'región',
  form: 'formulario',
  group: 'agrupación',
  dialog: 'diálogo',
  alertdialog: 'diálogo de alerta',
  status: 'región de estado',
  alert: 'alerta',
  separator: 'separador',
  table: 'tabla',
  spinbutton: 'campo numérico',
  slider: 'deslizador',
  progressbar: 'barra de progreso',
  menu: 'menú',
  menuitem: 'elemento de menú',
  paragraph: '',
  StaticText: '',
  generic: '',
  none: '',
  presentation: '',
  LineBreak: '',
  InlineTextBox: '',
  RootWebArea: 'documento',
};

/**
 * Roles cuyo nombre accesible YA es todo su contenido. Bajar a sus hijos
 * duplica el texto: un lector lee "Que cambio, encabezado de nivel 2" una vez,
 * no tres. Sin esto la transcripcion parece tartamudear y deja de servir para
 * juzgar si se entiende.
 */
const HOJAS = new Set([
  'heading',
  'button',
  'link',
  'checkbox',
  'radio',
  'option',
  'switch',
  'menuitem',
  'tab',
]);

function prop(nodo, nombre) {
  const p = (nodo.properties ?? []).find((x) => x.name === nombre);
  return p ? p.value?.value : undefined;
}

/**
 * Traduce un nodo del árbol a la frase que diría el lector. Devuelve null si
 * el nodo no aporta nada que anunciar (contenedores sin nombre, texto vacío).
 */
export function frase(nodo, { conDescripcion = true } = {}) {
  if (nodo.ignored) return null;
  const rol = nodo.role?.value ?? '';
  const nombre = (nodo.name?.value ?? '').replace(/\s+/g, ' ').trim();
  const partes = [];

  if (rol === 'StaticText' || rol === 'InlineTextBox') {
    return nombre ? nombre : null;
  }

  const rolEs = ROLES[rol] ?? rol;
  if (nombre) partes.push(nombre);

  if (rol === 'heading') {
    const nivel = prop(nodo, 'level');
    partes.push(nivel ? `encabezado de nivel ${nivel}` : 'encabezado');
  } else if (rolEs) {
    partes.push(rolEs);
  }

  // Estados, en el orden en que los dice NVDA.
  const presionado = prop(nodo, 'pressed');
  if (presionado === 'true' || presionado === true) partes.push('presionado');
  else if (presionado === 'false' || presionado === false) partes.push('no presionado');

  const marcado = prop(nodo, 'checked');
  if (marcado === 'true' || marcado === true) partes.push('marcada');
  else if (marcado === 'false' || marcado === false) partes.push('sin marcar');
  else if (marcado === 'mixed') partes.push('parcialmente marcada');

  const expandido = prop(nodo, 'expanded');
  if (expandido === true || expandido === 'true') partes.push('expandido');
  else if (expandido === false || expandido === 'false') partes.push('contraído');

  const seleccionado = prop(nodo, 'selected');
  if (seleccionado === true || seleccionado === 'true') partes.push('seleccionado');

  if (prop(nodo, 'disabled') === true) partes.push('no disponible');
  if (prop(nodo, 'required') === true) partes.push('requerido');
  if (prop(nodo, 'invalid') === 'true') partes.push('inválido');

  const valor = nodo.value?.value;
  if (valor && rol !== 'heading' && String(valor).trim()) partes.push(`"${String(valor).trim()}"`);

  const enConjunto = prop(nodo, 'posinset');
  const tamConjunto = prop(nodo, 'setsize');
  if (enConjunto && tamConjunto) partes.push(`${enConjunto} de ${tamConjunto}`);

  const desc = (nodo.description?.value ?? '').replace(/\s+/g, ' ').trim();
  if (conDescripcion && desc && desc !== nombre) partes.push(desc);

  if (partes.length === 0) return null;
  if (!nombre && !rolEs) return null;
  return partes.join(', ');
}

export async function arbol(cdp) {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  return nodes;
}

/**
 * El recorrido de "modo exploración": lo que se escucha bajando con la flecha
 * abajo, línea por línea. Se salta lo que no aporta.
 */
export function transcripcionExploracion(nodos, { limite = 500 } = {}) {
  const porId = new Map(nodos.map((n) => [n.nodeId, n]));
  const lineas = [];
  const visto = new Set();

  function recorrer(id) {
    if (visto.has(id) || lineas.length >= limite) return;
    visto.add(id);
    const nodo = porId.get(id);
    if (!nodo) return;
    if (nodo.role?.value === 'ListMarker') return;
    const f = frase(nodo);
    if (f) lineas.push(f);
    if (HOJAS.has(nodo.role?.value)) return;
    for (const hijo of nodo.childIds ?? []) recorrer(hijo);
  }

  const raiz = nodos.find((n) => n.role?.value === 'RootWebArea') ?? nodos[0];
  if (raiz) recorrer(raiz.nodeId);
  return lineas;
}

export function nodoEnfocado(nodos) {
  return nodos.find((n) => prop(n, 'focused') === true) ?? null;
}

export function propiedad(nodo, nombre) {
  return prop(nodo, nombre);
}

export function esHoja(nodo) {
  return HOJAS.has(nodo?.role?.value);
}

/**
 * Instala el espía de regiones vivas. Hay que llamarlo después de cada
 * navegación, porque el observador vive en el documento.
 */
export async function espiarAnuncios(page) {
  await page.evaluate(() => {
    if (window.__espiaPuesta) return;
    window.__espiaPuesta = true;
    window.__anuncios = [];
    const ultimoTexto = new WeakMap();

    function region(el) {
      let n = el instanceof Element ? el : el.parentElement;
      while (n) {
        const vivo = n.getAttribute('aria-live');
        const rol = n.getAttribute('role');
        if (vivo === 'polite' || vivo === 'assertive' || rol === 'status' || rol === 'alert') {
          return { el: n, cortesia: vivo ?? (rol === 'alert' ? 'assertive' : 'polite') };
        }
        if (vivo === 'off') return null;
        n = n.parentElement;
      }
      return null;
    }

    function revisar(nodo) {
      const r = region(nodo);
      if (!r) return;
      const texto = (r.el.textContent ?? '').replace(/\s+/g, ' ').trim();
      /**
       * Vaciarse no se anuncia, pero SI hay que olvidar lo anterior: si no, un
       * texto identico que vuelve a aparecer despues de un vaciado queda
       * deduplicado y parece silencio, cuando un lector lo lee de nuevo.
       */
      if (!texto) {
        ultimoTexto.set(r.el, '');
        return;
      }
      if (ultimoTexto.get(r.el) === texto) return;
      ultimoTexto.set(r.el, texto);
      window.__anuncios.push({ cortesia: r.cortesia, texto, en: Date.now() });
    }

    /**
     * Lo que ya está en pantalla al instalar la espía no se anuncia: un lector
     * solo lee los CAMBIOS de una región viva, no su contenido inicial.
     */
    for (const el of document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')) {
      ultimoTexto.set(el, (el.textContent ?? '').replace(/\s+/g, ' ').trim());
    }

    new MutationObserver((mutaciones) => {
      for (const m of mutaciones) {
        revisar(m.target);
        for (const agregado of m.addedNodes) revisar(agregado);
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  });
}

export async function drenarAnuncios(page) {
  return page.evaluate(() => {
    const a = window.__anuncios ?? [];
    window.__anuncios = [];
    return a;
  });
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
