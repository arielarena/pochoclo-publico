import {
  obtenerCandidatosCompletos,
  tiposDiscoverNecesarios,
  tipoTmdbParaDiscover,
  especificacionesDeClasicos,
  acotarCombinaciones,
} from '../buscador/motorBusqueda.js';
import { resolverIdsDeKeywords } from '../services/tmdb.js';
import { generosParaTaxonomia, generosRecreablesEnSerie, KEYWORDS_DE_GENERO_SERIE, GENERO_ANCLA_SERIE, CORRECCIONES_POR_GENERO, excluidoPorFiltroDeGenero } from '../data/genres.js';
import { normalizarTramosAnio, ordenar as ordenarResultados } from '../logic/resultados.js';

/**
 * Keywords de marca/franquicia que, aunque cumplen de verdad el género
 * pedido, ahogan cualquier búsqueda de VARIOS géneros anchos a la vez: para
 * TMDb, Vengadores es Acción Y Ciencia Ficción al mismo tiempo, así que en un
 * OR de los dos termina arriba de todo, dos veces. Medido el 2026-09-02
 * sobre "Acción + Ciencia Ficción + Thriller": sin este veto el top 20 tenía
 * 4 títulos de estas franquicias; con él, 2 (los que quedan son ajenos a
 * Marvel/DC/Star Wars y son populares igual, como Juego de Tronos).
 *
 * `dc extended universe` y `dc comics` NO son los nombres reales en TMDb —
 * `buscarIdKeyword` exige coincidencia exacta y esos dos no resuelven a
 * nada; el que sí existe es `dc extended universe (dceu)`.
 *
 * Va SOLO acá, no en `services/tmdb.js::KEYWORDS_EXCLUIDAS`, porque esa lista
 * es censura real (`hentai`) aplicada a TODA la app; esto es una preferencia
 * de UNA sola pantalla (evitar monocultivo de franquicia cuando se combinan
 * géneros), y mezclarlas haría desaparecer Spider-Man de una búsqueda de
 * "parecido a" o de Preferencias con un solo género, donde no hay nada que
 * ahogar.
 */
const KEYWORDS_VETO_MARCA = [
  'marvel cinematic universe (mcu)', 'dc extended universe (dceu)',
  'superhero', 'based on comic', 'star wars',
];

/**
 * El mismo defecto que ya se corrigió en "Quiero acción" (Estado de ánimo,
 * ver 4.15.5b), y por el mismo motivo: el género Acción(28) de TMDb
 * también agarra la épica de fantasía y la space-opera (Mad Max, Matrix,
 * Avatar y El señor de los anillos son, los cuatro, también Ciencia Ficción o
 * Aventura), y esas tienen más votos que el cine de acción de a pie. Sin
 * esto, alguien que marcó Acción en Mis Gustos recibía LOTR y Avatar en vez
 * de Duro de matar y Fuego contra fuego — el mismo síntoma que reportó el
 * usuario para el botón, medido acá el 2026-09-02 con el mismo resultado.
 *
 * `KEYWORDS_VETO_MARCA` no alcanza para esto porque apunta a franquicias
 * puntuales (Marvel, DC, Star Wars): saca esas tres pero no toca El señor de
 * los anillos, Piratas del Caribe ni Avatar, que no llevan esas keywords.
 *
 * Va SOLO en la spec de Acción/Acción y aventura, no en las de los demás
 * géneros: si el usuario también marcó Ciencia Ficción o Aventura como
 * gusto, esas siguen trayendo lo suyo por su propia spec — acá no se pierde
 * nada, se reparte mejor. Por el mismo motivo que en TV (10759) TMDb funde
 * Acción con Aventura, ahí solo se puede excluir Ciencia ficción y fantasía
 * (10765) y Animación, no Aventura por separado.
 *
 * La lista de géneros a excluir y el `sortBy` salen de
 * `CORRECCIONES_POR_GENERO[28]` (data/genres.js) — es la misma corrección
 * que usa el botón "Quiero acción" de Estado de ánimo. Vivía duplicada acá
 * con su propio nombre (`GENEROS_EXCLUIDOS_DE_ACCION`); ahora es una fuente
 * sola.
 */

/**
 * "Bloque 1: Gustos Registrados" (sección 19), la versión que reemplaza a un
 * `buscar()` con `preferencias.generos` combinados desde el 2026-09-02.
 *
 * **Con un solo género, no cambia nada**: se manda una especificación con
 * ese género, igual que hacía `buscar()`. **Con más de uno, en vez de un
 * solo `with_genres=A|B|C` se arma UNA ESPECIFICACIÓN POR GÉNERO**, con el
 * veto de marca puesto en todas. `obtenerCandidatosCompletos()` reparte por
 * turnos entre especificaciones (ver motorBusqueda.js), así que cada género
 * se queda con su propio lugar en vez de competir por el ranking de
 * popularidad GLOBAL del combinado, que es lo que dejaba a Thriller
 * invisible detrás de Acción y Ciencia Ficción.
 *
 * Medido: de 197 candidatos únicos (con_genres combinado) a 268 (specs
 * separadas), con el mismo costo de fondo una vez la caché de detalle está
 * tibia (que es el estado normal de la app: la caché dura una semana).
 *
 * No hace falta país/actor/director/complejidad acá: `gustos_usuario` solo
 * guarda género, tipo, año y "Ver clásicos" (sección 19), así que es lo
 * único que esta función necesita saber traducir.
 *
 * **`clasicos` es un criterio aparte de `generos`, no un valor sintético
 * mezclado en el array** (a diferencia de cómo viaja en Preferencias/Filtros,
 * ver 4.2): `gustos_usuario.generos` es `INTEGER[]` y no puede
 * llevar el string `'CLASICOS'`.
 *
 * **Y a propósito NO usa la misma semántica de OR que `buscar()`** (2026-09-03).
 * En `/buscar`, "Comedia O Clásicos" es correcto porque es una búsqueda de un
 * solo uso: el usuario arma una consulta puntual y no pierde nada si de paso
 * aparece algún clásico ajeno al género. Acá es distinto: "Mis Gustos" es un
 * perfil persistente, y alguien que marcó Acción, Ciencia Ficción y Thriller
 * más "Ver clásicos" espera clásicos DE esos géneros, no cualquier clásico
 * querido sin relación (medido: así entraban Toy Story y El Rey León, sin un
 * solo género en común con lo marcado). Por eso, cuando hay géneros
 * marcados, cada spec de Clásicos lleva el género correspondiente en su
 * `base` — `especificacionesDeClasicos` ya sabe combinarlo, no hizo falta
 * tocar esa función. Solo si NO hay ningún género marcado (alguien que activó
 * "Ver clásicos" sin marcar ningún género) se mantiene la spec sin
 * restricción de género.
 *
 * **En TV esto puede dar cero para géneros anchos** (medido: Clásicos AND
 * Acción y Clásicos AND Ciencia Ficción dan 0 resultados) — las series
 * clásicas con suficientes votos relativos al máximo simplemente no alcanzan
 * el umbral en esos géneros. Es un cero honesto, no un bug: mismo criterio
 * que ya documenta 4.11.1 ("un cero honesto es mejor que ocho
 * falsos").
 */
export async function buscarGustosPorGenero({ generos = [], tipo, anio, clasicos = false, ordenar, agregados, lote = 1 }) {
  const tipos = tiposDiscoverNecesarios(tipo);
  const tramosAnio = normalizarTramosAnio(anio);
  const aniosPedidos = tramosAnio.length ? tramosAnio : [undefined];

  /**
   * **La misma cota que `buscar()`, y acá hace MÁS falta** (2026-09-08). El
   * bucle de abajo es `tipos × años × géneros × keywords`, y los años salen de
   * Mis Gustos, que **no tiene tope de tramos** y además es PERSISTENTE: una
   * vez guardado, cada búsqueda de "No sé qué ver" y de "Quiero..." de esa
   * persona vuelve a pagarlo.
   *
   * Medido el 2026-09-08 con lo máximo que ofrece el selector de esa pantalla
   * (5 géneros, que sí tienen tope, más las 13 décadas y los años sueltos):
   * **8670 especificaciones, 8363 llamadas a discover y 134 segundos** — el
   * doble de lo que costaba el peor caso de la búsqueda por Preferencias antes
   * de acotarla (4.9.3). Solo con las 13 décadas ya son 804 specs y 19 s.
   *
   * `acotarCombinaciones` recibe el tipo como primera lista porque son dos o
   * tres y siempre entran enteros: lo que se recorta es la de años.
   */
  const [, anios] = acotarCombinaciones(tipos, aniosPedidos);

  /**
   * También se calcula con un solo género si ese género tiene una corrección
   * conocida en CORRECCIONES_POR_GENERO (Acción o Ciencia Ficción): sin
   * combinarlo con nada más, `sinGeneros` (abajo) no alcanza para sacar a
   * Batman (la trilogía de Nolan es Acción+Crimen+Drama+Suspense, sin
   * Ciencia Ficción ni Fantasía, a diferencia de Marvel), así que hace falta
   * el mismo veto por keyword que ya usa "Quiero acción" en Estado de ánimo.
   * Medido el 2026-09-02: sin esto, "Acción" sola como único gusto traía a
   * El caballero oscuro y las dos Batman de Nolan en el top 5.
   */
  const idsVeto =
    generos.length > 1 || CORRECCIONES_POR_GENERO[generos[0]]
      ? await resolverIdsDeKeywords(KEYWORDS_VETO_MARCA)
      : [];

  /**
   * `CORRECCIONES_POR_GENERO[g].vetoKeywords` es un veto DISTINTO al de
   * arriba: `KEYWORDS_VETO_MARCA` es genérico (evita que una franquicia se
   * coma la cabecera al combinar VARIOS géneros anchos), mientras que el de
   * cada género es específico de ESE género (ej. `witch` en Ciencia Ficción,
   * por la fusión de taxonomía con Fantasía en TV — ver genres.js). Los dos
   * se resuelven y se suman, no se reemplazan entre sí: sacado a propósito de
   * la spread de `base` (que solo lleva el de marca) porque acá hace falta
   * por género, no por toda la búsqueda.
   */
  const idsVetoPorGenero = new Map(
    await Promise.all(
      generos
        .filter((g) => CORRECCIONES_POR_GENERO[g]?.vetoKeywords)
        .map(async (g) => [g, await resolverIdsDeKeywords(CORRECCIONES_POR_GENERO[g].vetoKeywords)])
    )
  );

  const especificaciones = [];
  for (const t of tipos) {
    for (const a of anios) {
      const base = {
        tipo: t,
        anio: a,
        sinKeywords: idsVeto,
        conTipo: t === 'tv' ? tipoTmdbParaDiscover(tipo) : undefined,
      };

      /**
       * Ningún género: una spec sin `with_genres` (trae cualquier género) —
       * salvo que lo único pedido sea Clásicos, en cuyo caso esa spec sin
       * restricción sería traer el catálogo entero para después descartarlo,
       * y no se manda (mismo guard que `hayRamaPropia` en buscar()).
       */
      if (!generos.length) {
        if (!clasicos) especificaciones.push({ ...base });
      } else {
        /**
         * Uno o más géneros: una spec por cada uno, traducido a la taxonomía
         * del endpoint (con un solo género esto es exactamente lo mismo que
         * antes, solo que ya no vive en un bloque aparte — ver el punto 2
         * más abajo). El que no tenga equivalente en TV (Terror, Thriller,
         * Historia, Romance, Música, y desde el 2026-09-03 también Ciencia
         * Ficción/Fantasía/Acción/Aventura, fundidas de a pares) se recrea
         * con su rama de keywords, UNA SPEC POR KEYWORD — mismo argumento de
         * reparto que en motorBusqueda.js.
         *
         * **Unificar el caso de 1 género con el de varios arregla un bug
         * (2026-09-03):** antes, el bloque de 1 solo género no tenía rama de
         * género recreado, así que alguien con SOLO "Terror" (o, desde ahora,
         * SOLO "Ciencia Ficción") marcado como único gusto se quedaba sin
         * series ahí, en silencio — el mismo género funcionaba perfecto
         * combinado con otro. Con Ciencia Ficción/Acción sumadas al
         * mecanismo esto se volvía más visible, así que se arregló de paso.
         */
        for (const g of generos) {
          const generosDelEndpoint = generosParaTaxonomia([g], t);
          const vetoPropio = idsVetoPorGenero.get(g);
          const correccion = CORRECCIONES_POR_GENERO[g];
          if (generosDelEndpoint.length) {
            especificaciones.push({
              ...base,
              generos: generosDelEndpoint,
              /**
               * Ver CORRECCIONES_POR_GENERO: solo la spec del género que tiene
               * una corrección conocida se recorta y se ordena distinto. Las
               * de los demás géneros del usuario siguen como estaban, así que
               * no se pierde nada, se reparte mejor.
               */
              ...(correccion
                ? {
                    sortBy: correccion.sortBy,
                    sinGeneros: correccion.sinGenerosRamaGenero?.[t],
                    ...(vetoPropio?.length ? { sinKeywords: [...idsVeto, ...vetoPropio] } : {}),
                  }
                : {}),
            });
          } else if (t === 'tv') {
            const [recreable] = generosRecreablesEnSerie([g]);
            if (recreable) {
              const idsKeyword = await resolverIdsDeKeywords(KEYWORDS_DE_GENERO_SERIE[recreable]);
              /**
               * `GENERO_ANCLA_SERIE` y la corrección del propio género se
               * suman acá desde el 2026-09-03, mismo motivo que en
               * motorBusqueda.js: Ciencia Ficción/Fantasía/Acción/Aventura sí
               * tienen un género real al que anclarse (a diferencia de los
               * cinco originales), y sin el `sortBy`/veto de marca la rama
               * nueva iría en `popularity.desc` sin filtrar superhéroes.
               */
              const ancla = GENERO_ANCLA_SERIE[recreable];
              for (const idKeyword of idsKeyword) {
                especificaciones.push({
                  ...base,
                  keywords: [idKeyword],
                  ...(ancla ? { generos: [ancla] } : {}),
                  ...(correccion?.sortBy ? { sortBy: correccion.sortBy } : {}),
                  ...(correccion?.sinGenerosRamaGenero?.tv ? { sinGeneros: correccion.sinGenerosRamaGenero.tv } : {}),
                  sinKeywords: vetoPropio?.length ? [...idsVeto, ...vetoPropio] : idsVeto,
                });
              }
            }
          }
        }
      }

      /**
       * "Ver clásicos": sumada a las de género de este mismo tipo×año.
       *
       * **Con géneros marcados, una spec de clásicos POR GÉNERO** (no una
       * sola sin restricción) — ver el comentario de arriba del archivo, es
       * lo que evita que Toy Story o El Rey León entren solo por ser
       * clásicos queridos sin relación con lo que el usuario marcó. Reusa la
       * misma traducción de taxonomía que ya usa el bloque de "varios
       * géneros" de acá arriba. Si un género no tiene equivalente en esta
       * taxonomía (Thriller/Historia/Romance/Música en TV, que se recrean
       * por keyword), no se genera spec de clásicos para esa combinación: no
       * hay una forma limpia de combinar "clásico" con la rama de keyword sin
       * un mecanismo nuevo, y lo que se perdería ahí es marginal.
       *
       * Sin géneros marcados, sigue siendo una spec sola sin restricción
       * (nada que exigir). Cuesta como mucho `generos.length` especificaciones
       * extra por combinación de tipo×año (tope 5, sección 19) — sigue siendo
       * barato frente a los casos de 40 specs que ya maneja el motor (ver
       * 4.9.1) — y ninguna llamada de más:
       * `agregados.votos_totales_max_clasicos` ya viene resuelto.
       */
      if (clasicos) {
        if (!generos.length) {
          especificaciones.push(...especificacionesDeClasicos(base, agregados.votos_totales_max_clasicos));
        } else {
          for (const g of generos) {
            const [traducido] = generosParaTaxonomia([g], t);
            if (traducido) {
              especificaciones.push(
                ...especificacionesDeClasicos({ ...base, generos: [traducido] }, agregados.votos_totales_max_clasicos)
              );
            }
          }
        }
      }
    }
  }

  if (!especificaciones.length) return { resultados: [], hayMas: false };

  const { candidatos, hayMas } = await obtenerCandidatosCompletos(especificaciones, agregados, { lote });

  /**
   * Mismo cierre que buscar(): si además se pidió un Tipo puntual (viene de
   * preferenciasBase, ej. Opción 3), se filtra sobre el ya clasificado.
   */
  const porTipoSolicitado = tipo?.length ? candidatos.filter((c) => tipo.includes(c.tipoContenido)) : candidatos;
  const sinDramediasDePrestigio = porTipoSolicitado.filter((c) => !excluidoPorFiltroDeGenero(c, generos));
  return { resultados: ordenarResultados(sinDramediasDePrestigio, ordenar), hayMas };
}
