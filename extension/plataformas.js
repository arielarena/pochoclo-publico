/**
 * EL MAPEO DOMINIO -> PROVEEDOR DE TMDb. Paso 5 del orden de trabajo.
 *
 * VIVE ACÁ Y NO EN EL BACKEND, y esa es la decisión de la sección 8 del
 * análisis. Al servidor le viaja **únicamente el número de proveedor**, nunca
 * la dirección de lo que la persona está mirando ni el título. No es solo
 * higiene. Con el mapeo del lado del servidor habría que declarar en la ficha
 * de la tienda y en `/privacidad` que recibimos la dirección de lo que estás
 * viendo, que es una afirmación mucho más pesada por un beneficio nulo. La
 * regla de la sección 4.26 de las notas de decisiones del proyecto es que cada promesa de esas páginas
 * sea comprobable en el código, y este archivo es la comprobación.
 *
 * SE CARGA EN LOS DOS MUNDOS, el content script y el service worker, así que
 * no puede usar ni `import` ni `chrome.*`. Se cuelga de `globalThis` en vez de
 * declarar nombres sueltos arriba de todo, porque `chrome.scripting` puede
 * inyectar el mismo archivo dos veces en la misma pestaña y un `const`
 * repetido ahí revienta el script entero.
 *
 * Los IDs están medidos contra `GET /proveedores` el 2026-09-04 y los dominios
 * cargando cada sitio el 2026-09-12 (tabla de la sección 8).
 */
(() => {
  const PLATAFORMAS = [
    { clave: 'netflix', nombre: 'Netflix', proveedor: 8, dominios: ['netflix.com'] },
    { clave: 'prime', nombre: 'Prime Video', proveedor: 119, dominios: ['primevideo.com'] },
    { clave: 'disney', nombre: 'Disney+', proveedor: 337, dominios: ['disneyplus.com'] },
    {
      clave: 'hbomax',
      nombre: 'HBO Max',
      proveedor: 1899,
      // `max.com` contesta 301 hacia hbomax.com, así que el bueno es el
      // segundo y el primero está para atajar a quien llegue por el viejo.
      dominios: ['hbomax.com', 'max.com'],
    },
    { clave: 'appletv', nombre: 'Apple TV', proveedor: 350, dominios: ['tv.apple.com'] },
  ];

  /**
   * OJO CON LA COMPARACIÓN, que es donde este tipo de mapeo se rompe.
   *
   * Un `includes` sobre el host daría por buena a `netflix.com.otrositio.ar`,
   * que es un dominio de cualquiera con nuestro nombre adentro, y un `===`
   * pelado dejaría afuera a `www.netflix.com`. Tiene que ser el dominio exacto
   * o un subdominio suyo, o sea con el punto de separación adelante.
   */
  const esDelDominio = (host, dominio) => host === dominio || host.endsWith(`.${dominio}`);

  /** Devuelve la plataforma de ese host, o null si no es ninguna de las cinco. */
  function plataformaDeHost(host) {
    if (!host) return null;
    const limpio = String(host).toLowerCase();
    return PLATAFORMAS.find((p) => p.dominios.some((d) => esDelDominio(limpio, d))) || null;
  }

  /**
   * Le sirve al service worker para no mandarle a la API un número que no
   * salió de esta tabla. Hoy nadie de afuera puede hablarle (no hay
   * `externally_connectable`), así que es una segunda cerradura y no la
   * primera, pero es una línea y cierra el paso a que la extensión se use de
   * intermediaria para consultar cualquier proveedor.
   */
  const esProveedorConocido = (id) => PLATAFORMAS.some((p) => p.proveedor === id);

  /**
   * LOS PATRONES DEL MANIFEST SALEN DE ESTA MISMA TABLA, y no es adorno.
   *
   * Los dominios estaban escritos dos veces, acá y en `manifest.json`, que es
   * el modo de fallo que este proyecto ya conoce de memoria (el `TAGLINE` en
   * `index.html`, el `VALIDACION_POCHOCLO` entre backend y frontend). Un
   * dominio agregado en un solo lado no falla: la extensión simplemente no
   * hace nada en ese sitio, o pide un permiso que después no usa.
   *
   * El manifest no puede leer código, así que la duplicación no se puede
   * borrar. Lo que sí se puede es **comprobarla**, y eso lo hace
   * `probar-plataformas.mjs` cruzando las dos listas.
   *
   * `https://*.netflix.com/*` alcanza también a `netflix.com` pelado, así que
   * el patrón dice exactamente lo mismo que `esDelDominio`: el dominio o un
   * subdominio suyo. Para Apple TV queda `*.tv.apple.com`, que sigue dejando
   * afuera al resto de Apple.
   */
  const patronesDePermiso = () =>
    PLATAFORMAS.flatMap((p) => p.dominios.map((d) => `https://*.${d}/*`));

  /** Los patrones de UNA plataforma, que es lo que se pide al primer uso. */
  const patronesDe = (clave) => {
    const p = PLATAFORMAS.find((x) => x.clave === clave);
    return p ? p.dominios.map((d) => `https://*.${d}/*`) : [];
  };

  globalThis.pochoclo = globalThis.pochoclo || {};
  globalThis.pochoclo.plataformas = {
    PLATAFORMAS,
    plataformaDeHost,
    esProveedorConocido,
    patronesDePermiso,
    patronesDe,
  };
})();
