import { ID_EXTENSION } from '../config/sitio.js';

/**
 * LO QUE EL SITIO LE PUEDE DECIR A LA EXTENSIÓN DE POCHOCLO. Agregado el
 * 2026-09-29.
 *
 * `chrome.runtime.sendMessage` existe en esta página solo porque el manifest de
 * la extensión declara pochoclo.ar en `externally_connectable`. En Firefox, en
 * Safari, o en un Chrome sin ninguna extensión que lo declare, ni siquiera
 * existe, y ahí todo esto contesta que no hay extensión.
 *
 * DEL OTRO LADO ESCUCHAN DOS RUTAS NADA MÁS, `hola` y `abrir-opciones`, y
 * ninguna devuelve ni cambia nada de la persona (ver `onMessageExternal` al
 * final de `extension/service-worker.js`). Si alguna vez se suma una, tiene que
 * sumarse allá y decidirse allá, no acá.
 *
 * LA RESPUESTA SE COMPARA CONTRA `true` Y NUNCA SE DIBUJA. Cualquier extensión
 * puede declarar pochoclo.ar en su propio `externally_connectable`, pero no
 * puede contestar con el ID de la nuestra, así que en la práctica el que
 * responde es siempre la extensión real. Igual no cuesta nada tratar lo que
 * vuelve como dato de afuera, que es lo que es.
 *
 * NO HAY NINGUNA LLAMADA A LA RED. El pedido va del sitio a la extensión
 * dentro del mismo navegador, así que que alguien tenga la extensión no sale de
 * su máquina, y por eso no hace falta declararlo en `/privacidad`.
 */

/**
 * Tiempo máximo de espera. Despertar el service worker de la extensión tarda
 * mucho menos, así que esto solo corta el caso raro en que nadie conteste y el
 * botón quedaría esperando para siempre.
 */
const ESPERA_MAXIMA_MS = 3000;

export const ENLACE_EXTENSION = ID_EXTENSION
  ? `https://chromewebstore.google.com/detail/${ID_EXTENSION}`
  : null;

function hablarConExtension(mensaje) {
  return new Promise((resolver) => {
    const runtime = globalThis.chrome?.runtime;
    if (!ID_EXTENSION || typeof runtime?.sendMessage !== 'function') {
      resolver(null);
      return;
    }
    const corte = setTimeout(() => resolver(null), ESPERA_MAXIMA_MS);
    try {
      runtime.sendMessage(ID_EXTENSION, mensaje, (respuesta) => {
        clearTimeout(corte);
        // Leer `lastError` no es decorado. Sin leerlo, Chrome registra en la
        // consola un error no atrapado cada vez que la extensión no está
        // instalada, que es el caso más común.
        resolver(runtime.lastError ? null : respuesta ?? null);
      });
    } catch {
      clearTimeout(corte);
      resolver(null);
    }
  });
}

export async function extensionInstalada() {
  const respuesta = await hablarConExtension({ tipo: 'hola' });
  return respuesta?.instalada === true;
}

export async function abrirOpcionesDeExtension() {
  const respuesta = await hablarConExtension({ tipo: 'abrir-opciones' });
  return respuesta?.ok === true;
}
