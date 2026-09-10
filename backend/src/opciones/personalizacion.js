import { leerGustos } from '../repositories/gustos.js';
import { leerLista, leerPlataformas } from '../repositories/listas.js';
import { edadCumplida } from '../logic/edad.js';
import { claveDe } from '../utils/clave.js';

/**
 * Todo lo que la búsqueda necesita saber del usuario, leído de una sola
 * vez. Para un visitante sin cuenta devuelve el mismo objeto con todo
 * vacío, así que quien lo use no tiene que preguntar si hay sesión: la app
 * se sigue usando sin cuenta (sección 1 del Definitivo).
 *
 * Los topes M=15 y N=10 son los de la sección 16: hasta 15 de Favoritas y
 * hasta 10 de Visto.
 *
 * **Favoritas se lee al azar (`aleatorio: true`) y no "las últimas 15" como
 * pide al pie de la letra la sección 16** (2026-09-02, a pedido explícito:
 * con más de 15 favoritas, "Porque te gustaron" quedaba anclado siempre a
 * las mismas 15 más recientes, y quien tiene una lista grande no volvía a
 * ver esas referencias moverse salvo que agregara una favorita nueva). Se
 * resortea **en cada búsqueda** (no por sesión): es lo que no pide guardar
 * ningún estado nuevo, y alcanza para que la sección varíe con el tiempo. El
 * costo es despreciable porque `ORDER BY RANDOM()` ordena la lista de
 * Favoritas de ESE usuario, que son unas pocas decenas como mucho, no el
 * catálogo. Visto se deja como estaba (las últimas 10): no fue lo que se
 * pidió, y ahí sí importa que sea reciente, porque alimenta también la
 * exclusión de vistos de la sección 5.
 */
export const MAXIMO_FAVORITAS = 15;
export const MAXIMO_VISTO = 10;

/** Pesos de la sección 16 para el puntaje de gustos resultantes. */
export const PESO_FAVORITAS = 5;
export const PESO_VISTO = 3;

const CONTEXTO_ANONIMO = {
  hayUsuario: false,
  gustos: { generos: [], tipos: [], anios: [] },
  favoritas: [],
  visto: [],
  vistoCompleto: [],
  plataformas: [],
  clavesVisto: new Set(),
  franjasEdad: null,
};

export async function leerContextoDeUsuario(usuario) {
  if (!usuario) return CONTEXTO_ANONIMO;

  /**
   * Una sola consulta de Visto, no dos: `leerLista` ya ordena por
   * `agregado_en DESC`, así que los primeros MAXIMO_VISTO de la lista
   * completa son exactamente lo que devolvía la versión limitada — pedirla
   * aparte era el mismo viaje a Neon repetido en cada búsqueda personalizada.
   * La completa hace falta igual: la exclusión de la sección 5 aplica a todo
   * lo visto, no solo a lo más reciente (ver excluirVistos).
   */
  const [gustos, favoritas, vistoCompleto, plataformas] = await Promise.all([
    leerGustos(usuario.id),
    leerLista(usuario.id, 'favoritas', { limite: MAXIMO_FAVORITAS, aleatorio: true }),
    leerLista(usuario.id, 'visto'),
    leerPlataformas(usuario.id),
  ]);
  const visto = vistoCompleto.slice(0, MAXIMO_VISTO);

  return {
    hayUsuario: true,
    gustos,
    favoritas,
    visto,
    vistoCompleto,
    plataformas,
    clavesVisto: new Set(vistoCompleto.map((v) => claveDe(v))),
    franjasEdad: franjasPermitidas(usuario.fechaNacimiento),
  };
}

/**
 * Las franjas de edad que le corresponden a alguien, según la sección 17.
 * Devuelve null para mayores de 17, que es "sin restricción": pasarle las
 * tres al filtro no sería lo mismo, porque el filtro deja afuera a los
 * títulos sin clasificar, y a un adulto no hay por qué escondérselos.
 */
export function franjasPermitidas(fechaNacimiento) {
  if (!fechaNacimiento) return null;

  const edad = edadCumplida(fechaNacimiento);
  if (edad === null) return null;

  if (edad >= 17) return null;
  if (edad >= 14) return ['ATP', '+14'];
  return ['ATP'];
}

/**
 * Sección 5: "para cualquier búsqueda, los títulos que estén en Visto no se
 * incluyen en los resultados".
 *
 * La excepción que fija la sección 18 (el buscador para agregar títulos de
 * las páginas de lista) no pasa por acá: usa /buscar-titulo, que es
 * búsqueda por nombre contra TMDb y no un flujo de recomendación.
 */
export function excluirVistos(resultados, contexto) {
  if (!contexto?.clavesVisto?.size) return resultados;
  return resultados.filter((r) => !contexto.clavesVisto.has(claveDe(r)));
}

/**
 * Suma el límite de edad del perfil a los filtros que ya venían.
 *
 * Se puede desactivar (sección 17: "pudiendo desactivarse si se desea") con
 * `sinLimiteDeEdad`, y también cede si el usuario eligió un límite a mano
 * en el panel: lo explícito gana sobre lo automático.
 */
export function conLimiteDeEdad(filtros = {}, contexto, { sinLimiteDeEdad = false } = {}) {
  if (sinLimiteDeEdad) return filtros;
  if (!contexto?.franjasEdad) return filtros;
  if (filtros.limitesEdad?.length) return filtros;
  return { ...filtros, limitesEdad: contexto.franjasEdad };
}

/**
 * Los Gustos Registrados como Preferencias, listos para el motor.
 *
 * No hay traducción de campos porque `gustos_usuario` guarda exactamente
 * las formas que el motor ya entiende (ver milestone 20): los géneros son
 * IDs de TMDb, los tipos son los mismos tres valores, y los años son la
 * lista de tramos que `normalizarTramosAnio()` sabe leer.
 */
export function gustosComoPreferencias(gustos) {
  const preferencias = {};
  if (gustos.generos?.length) preferencias.generos = gustos.generos;
  if (gustos.tipos?.length) preferencias.tipo = gustos.tipos;
  if (gustos.anios?.length) preferencias.anio = gustos.anios;
  return preferencias;
}

export function tieneGustosCargados(gustos) {
  return Boolean(
    gustos?.generos?.length || gustos?.tipos?.length || gustos?.anios?.length || gustos?.clasicos
  );
}
