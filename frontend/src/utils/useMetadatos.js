import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { METADATOS, TITULO_POR_OMISION, DESCRIPCION_POR_OMISION } from '../config/metadatos.js';
import { DOMINIO_SITIO } from '../config/sitio.js';
import { recortar } from './texto.js';

/**
 * Pone el título, la descripción, la dirección canónica y, si corresponde, el
 * noindex de la pantalla actual.
 *
 * LO LLAMA CADA PÁGINA, UNA VEZ, Y NO App.jsx. Parece que centralizarlo en
 * App sería más prolijo, y no funciona: los efectos de los hijos corren ANTES
 * que los del padre, así que un hook puesto arriba le pisaría a la Ficha el
 * título real justo después de que ella lo escribe. Una llamada por pantalla
 * también deja ver de un vistazo, abriendo el archivo, qué dice esa pantalla.
 *
 * La canónica se arma con DOMINIO_SITIO y no con location.origin a propósito:
 * tiene que apuntar a la dirección pública aunque se esté mirando en
 * localhost o en una vista previa, que es justo para lo que sirve.
 *
 * @param {keyof METADATOS} clave  Entrada de config/metadatos.js.
 * @param {{titulo?: string, descripcion?: string}} [propios]
 *   Valores que la pantalla calcula sola. Hoy solo los usa la Ficha, que
 *   recién sabe su título cuando llegan los datos. Lo que venga vacío cae en
 *   el valor de la tabla.
 */
export default function useMetadatos(clave, propios = {}) {
  const { pathname } = useLocation();

  /**
   * Se desarma acá para que las dependencias sean textos y no un objeto
   * nuevo en cada render, que haría correr el efecto siempre.
   */
  const { titulo: tituloPropio, descripcion: descripcionPropia } = propios;

  useEffect(() => {
    const base = METADATOS[clave] ?? {};

    const titulo = tituloPropio || base.titulo || TITULO_POR_OMISION;
    const descripcion = recortar(descripcionPropia || base.descripcion || DESCRIPCION_POR_OMISION);
    const indexable = base.indexable ?? true;

    document.title = titulo;
    ponerMeta('description', descripcion);
    ponerCanonica(`https://${DOMINIO_SITIO}${pathname}`);

    /**
     * Se saca cuando la pantalla SÍ es indexable, no solo se pone cuando no lo
     * es: sin eso, ir de /perfil al inicio dejaría el inicio marcado noindex.
     */
    if (indexable) sacarMeta('robots');
    else ponerMeta('robots', 'noindex, nofollow');
  }, [clave, tituloPropio, descripcionPropia, pathname]);
}

function ponerMeta(nombre, contenido) {
  let etiqueta = document.head.querySelector(`meta[name="${nombre}"]`);
  if (!etiqueta) {
    etiqueta = document.createElement('meta');
    etiqueta.setAttribute('name', nombre);
    document.head.appendChild(etiqueta);
  }
  etiqueta.setAttribute('content', contenido);
}

function sacarMeta(nombre) {
  document.head.querySelector(`meta[name="${nombre}"]`)?.remove();
}

function ponerCanonica(href) {
  let etiqueta = document.head.querySelector('link[rel="canonical"]');
  if (!etiqueta) {
    etiqueta = document.createElement('link');
    etiqueta.setAttribute('rel', 'canonical');
    document.head.appendChild(etiqueta);
  }
  etiqueta.setAttribute('href', href);
}
