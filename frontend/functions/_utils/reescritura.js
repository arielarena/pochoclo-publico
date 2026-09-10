/**
 * Handlers chicos de HTMLRewriter, compartidos por las Pages Functions que
 * reescriben el HTML estático para crawlers. Ninguno toca nada si el valor
 * que recibe es vacío, así que un dato faltante deja el original tal cual
 * en vez de romper la etiqueta.
 */

export class ReemplazarTexto {
  constructor(texto) {
    this.texto = texto;
  }
  element(el) {
    if (this.texto) el.setInnerContent(this.texto);
  }
}

export class ReemplazarHtml {
  constructor(html) {
    this.html = html;
  }
  element(el) {
    if (this.html) el.setInnerContent(this.html, { html: true });
  }
}

export class ReemplazarAtributo {
  constructor(nombre, valor) {
    this.nombre = nombre;
    this.valor = valor;
  }
  element(el) {
    if (this.valor) el.setAttribute(this.nombre, this.valor);
  }
}

export class EliminarElemento {
  element(el) {
    el.remove();
  }
}

/** Agrega HTML crudo justo antes de </head> (canónica, JSON-LD). */
export class AgregarAlHead {
  constructor(html) {
    this.html = html;
  }
  element(el) {
    if (this.html) el.append(this.html, { html: true });
  }
}

export function escaparHtml(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
