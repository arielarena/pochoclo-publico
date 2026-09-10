import { resolverIdsDeKeywords } from '../services/tmdb.js';
import { leerAgregados } from '../repositories/agregados.js';
import { obtenerCandidatosCompletos, especificacionesDeComplejidad } from '../buscador/motorBusqueda.js';
import { aplicarFiltros, ordenar as ordenarResultados, JITTER_ORDEN_NATURAL } from '../logic/resultados.js';
import { ESTADOS_ANIMO } from '../data/estadosAnimo.js';
import {
  generosParaTaxonomia,
  GENERO_ANCLA_SERIE,
  KEYWORDS_DE_GENERO_SERIE,
  CORRECCIONES_POR_GENERO,
  excluidoPorFiltroDeGenero,
} from '../data/genres.js';

const TIPOS_TMDB = ['pelicula', 'tv'];

/**
 * Una spec por endpoint, con los géneros traducidos a la taxonomía de cada uno.
 *
 * Esto arreglaba un bug silencioso: los IDs de la tabla de estados de ánimo son
 * de la taxonomía de PELÍCULAS, y se le mandaban tal cual a los dos endpoints.
 * TMDb ignora sin chistar un género que no existe en su lista, así que **6 de
 * los 11 botones eran de hecho solo-películas**: Suspenso (53), Enamorarme
 * (10749), Acción y Velocidad (28), Asustarme (27) y la mitad de Reflexionar
 * (36) pedían a /discover/tv un género que ahí no existe y la spec devolvía
 * cero. Nadie se enteraba porque la otra spec (la de películas) sí traía.
 *
 * Donde hay equivalente en TV, `generosParaTaxonomia` lo traduce. Donde no lo
 * hay y tampoco es recreable (ver abajo), **la spec de tv no se genera**: es
 * más honesto que pedir algo que devuelve cero, y ahorra la llamada.
 *
 * **Desde el 2026-09-03, Acción/Aventura/Ciencia Ficción/Fantasía dejaron de
 * traducir por `EQUIVALENTE_EN_SERIE`** (TMDb los funde de a pares en TV, y
 * eso se resolvió con más precisión en otro lado — ver `GENERO_ANCLA_SERIE`
 * en genres.js). Sin el bloque de acá abajo, "accion" (que no lleva ninguna
 * keyword propia) se quedaba sin rama de serie en absoluto — regresión real,
 * detectada corriendo `buscarPorEstadoAnimo('accion')` después del cambio
 * (pasó de ~80 a 40 resultados, perdiendo toda la mitad de serie).
 *
 * Dos casos, según si `extra` ya trae una keyword propia del botón:
 *
 * - **Con keyword propia** (modo AND, ej. "velocidad" con `chase`/`motorcycle`):
 *   alcanza con sustituir el género que no tradujo por su ancla
 *   (`GENERO_ANCLA_SERIE`) — la keyword del botón ya hace el trabajo de
 *   precisión, no hace falta además la lista calibrada del género.
 * - **Sin keyword propia** (modo 'genero', ej. "accion"): se arma una spec
 *   por cada keyword calibrada del género (mismo mecanismo que
 *   `motorBusqueda.js::buscar()` y `gustosPorGenero.js`), con su propia
 *   corrección (`sortBy`/`sinGenerosRamaGenero.tv`) — sin esto la rama nueva
 *   iría en `popularity.desc` sin excluir Animación.
 */
async function specsPorTipo(generos, extra = {}) {
  const specs = [];
  for (const tipo of TIPOS_TMDB) {
    if (!generos?.length) {
      specs.push({ tipo, ...extra });
      continue;
    }
    const traducidos = generosParaTaxonomia(generos, tipo);
    if (traducidos.length) {
      specs.push({ tipo, generos: traducidos, ...extra });
      continue;
    }
    if (tipo !== 'tv') continue;

    if (extra.keywords?.length) {
      const anclas = [...new Set(generos.map((g) => GENERO_ANCLA_SERIE[g]).filter(Boolean))];
      for (const ancla of anclas) specs.push({ tipo, generos: [ancla], ...extra });
      continue;
    }

    for (const g of generos) {
      const ancla = GENERO_ANCLA_SERIE[g];
      const nombresKeyword = KEYWORDS_DE_GENERO_SERIE[g];
      if (!ancla || !nombresKeyword) continue;
      const correccion = CORRECCIONES_POR_GENERO[g];
      const idsKeyword = await resolverIdsDeKeywords(nombresKeyword);
      for (const id of idsKeyword) {
        specs.push({
          tipo,
          generos: [ancla],
          keywords: [id],
          ...(correccion?.sortBy ? { sortBy: correccion.sortBy } : {}),
          ...(correccion?.sinGenerosRamaGenero?.tv ? { sinGeneros: correccion.sinGenerosRamaGenero.tv } : {}),
          ...extra,
        });
      }
    }
  }
  return specs;
}

/**
 * Le cuelga a cada especificación las exclusiones que declare el botón:
 * `sinGeneros` (por taxonomía) y `vetoKeywords` (resueltas a ID).
 *
 * **Las dos son necesarias y ninguna reemplaza a la otra**, que es lo que
 * enseñó "Quiero llorar" (ver data/estadosAnimo.js). La exclusión por género
 * saca a los que llegan por una keyword ambigua desde otro vecindario (Batman
 * Begins por `loss of loved one`), pero no puede tocar a los que TMDb clasifica
 * como Drama de verdad, y los géneros que traen a esos son también los de La
 * lista de Schindler y After Life. Ahí entra el veto por keyword, que es
 * quirúrgico: medido, saca a Bruja Escarlata y Visión sin costar un solo título
 * legítimo.
 *
 * **SOLO SE APLICAN A LAS SPECS QUE LLEVAN KEYWORD**, y esa es la regla que
 * hace que el mismo mecanismo sirva para los dos modos. En AND todas la llevan,
 * así que alcanzan a todo el botón. En OR, la rama de género pelado queda
 * intacta a propósito: esa rama ya está anclada por su género y no necesita que
 * la corrijan, mientras que la de keyword va sin género y es la que se llena de
 * intrusos (medido el 2026-08-29: "Quiero reflexionar" tenía 150 de 195
 * resultados fuera de Documental e Historia, encabezados por Spider-Man y El
 * rey león, todos de `coming of age`). Excluir géneros en la rama de género
 * sería contradecir lo que el botón pide.
 *
 * Un botón sin ninguno de los dos campos sale de acá igual que entró.
 *
 * **Excepción: en modo 'genero' no hay ninguna rama de keyword de la que
 * distinguir la de género**, así que ahí `vetoKeywords` se aplica directo a
 * la única rama que el botón tiene. Es el caso de "accion" (ver su comentario
 * en data/estadosAnimo.js): sin esto, ponerle `vetoKeywords` a un botón en
 * modo 'genero' sería el mismo no-op silencioso que ya describe la sección
 * 4.2 del las notas de decisiones del proyecto para 'CLASICOS'.
 *
 * **`config.sortBy` se aplica acá, a la rama de género pelado, sin importar
 * el modo** (2026-09-02). Antes solo lo leía la creación de specs de modo
 * 'genero' (`accion`); los botones OR (reirme, suspenso, enamorarme,
 * reflexionar, asustarme) tienen exactamente la misma rama de género pelado
 * sin ninguna keyword que la acote, y quedaba en el `popularity.desc` por
 * omisión de `traerCandidatosLivianos` — el mismo defecto que ya se había
 * corregido para "accion" en 4.15.5b, sin que nadie lo hubiera generalizado.
 * Medido: "suspenso" traía "La señal del apocalipsis" (2026, 46 votos) y
 * "enamorarme" traía "Sunrise. El último amanecer" (2026, 37 votos) en el
 * top 12 final. Ver 4.29.2.
 */
async function conRestricciones(especificaciones, config) {
  const idsVeto = config.vetoKeywords ? await resolverIdsDeKeywords(config.vetoKeywords) : [];
  if (!config.sinGeneros && !config.sinGenerosRamaGenero && !config.sortBy && !idsVeto.length) {
    return especificaciones;
  }
  return especificaciones.map((spec) => {
    /**
     * La rama de género pelado de un botón OR: por omisión no lleva nada, salvo
     * que el botón declare `sinGenerosRamaGenero` o `sortBy`. Ver el comentario
     * de arriba.
     */
    if (!spec.keywords?.length) {
      const propias = config.sinGenerosRamaGenero?.[spec.tipo];
      const vetoDirecto = config.modo === 'genero' && idsVeto.length ? { sinKeywords: idsVeto } : {};
      const sortBy = config.sortBy ? { sortBy: config.sortBy } : {};
      return propias?.length || Object.keys(vetoDirecto).length || Object.keys(sortBy).length
        ? { ...spec, ...sortBy, ...(propias?.length ? { sinGeneros: propias } : {}), ...vetoDirecto }
        : spec;
    }
    return {
      ...spec,
      ...(config.sinGeneros?.[spec.tipo]?.length ? { sinGeneros: config.sinGeneros[spec.tipo] } : {}),
      ...(idsVeto.length ? { sinKeywords: idsVeto } : {}),
    };
  });
}

/**
 * Resuelve una clave de Opción 4 (sección 5) a resultados. `filtros` y
 * `ordenar` opcionales se combinan con lo que ya define el estado de ánimo
 * (ej. "pasarElTiempo" ya trae su propio filtro de Complejidad). `lote`
 * funciona igual que en buscar(): 1 son las primeras páginas de discover.
 *
 * Devuelve { resultados, hayMas }.
 */
export async function buscarPorEstadoAnimo(clave, { filtros = {}, ordenar, lote = 1 } = {}) {
  const config = ESTADOS_ANIMO[clave];
  if (!config) throw new Error(`Estado de ánimo desconocido: ${clave}`);

  const agregados = await leerAgregados();
  if (!agregados) {
    throw new Error('No hay agregados calculados todavía. Corré "npm run seed" y "npm run recalcular" primero.');
  }

  let especificaciones;
  let filtrosFinales = filtros;

  if (config.modo === 'complejidad') {
    /**
     * **Reusa las ramas de discover de la Complejidad como Preferencia** (ver
     * motorBusqueda.js y 4.15), en vez de pedir populares y filtrar
     * después, que es lo que hacía hasta el 2026-08-29. La diferencia no era
     * chica: de los 80 candidatos que devolvían dos specs de populares,
     * sobrevivían 35 al filtro de Complejidad, y encabezaban Spider-Man y
     * Vengadores porque eran simplemente los más populares del momento que
     * resultaban ser "para relajar". Con las ramas propias son 134 resultados
     * buscados a propósito. Es el mismo error que la sección 4.15 describe para
     * la Preferencia: "relajar" como filtro sobre populares daba 16 títulos y
     * como rama propia da 104.
     */
    especificaciones = (
      await Promise.all(
        TIPOS_TMDB.map((tipo) =>
          especificacionesDeComplejidad({ tipo }, config.complejidad, {
            sinKeywordsDeSpec: config.sinKeywordsDeSpec,
          })
        )
      )
    ).flat();
    filtrosFinales = { ...filtros, complejidad: config.complejidad };
  } else if (config.modo === 'genero') {
    /**
     * El `sortBy` (si el botón lo declara) lo aplica conRestricciones() más
     * abajo, junto con el de los botones OR — es la misma rama de género
     * pelado en los dos casos, así que hay un solo lugar que decide el orden.
     */
    especificaciones = await specsPorTipo(config.generos);
  } else if (config.modo === 'genero-y-keyword') {
    const idsKeywords = await resolverIdsDeKeywords(config.keywords);
    especificaciones = (
      await Promise.all(idsKeywords.map((id) => specsPorTipo(config.generos, { keywords: [id] })))
    ).flat();
  } else if (config.modo === 'genero-o-keyword') {
    const idsKeywords = await resolverIdsDeKeywords(config.keywords);
    especificaciones = [
      ...(await specsPorTipo(config.generos)),
      /**
       * La rama de keyword no lleva género POR DEFECTO, así que va a los dos
       * endpoints sin traducir: las keywords de TMDb son las mismas para
       * película y serie. Es necesario para suspenso/enamorarme/reflexionar/
       * asustarme, porque sus géneros (Thriller, Romance, Historia, Terror)
       * no existen en la taxonomía de TV — sin esto esos botones se quedarían
       * sin series (ver el comentario de cada uno en data/estadosAnimo.js).
       *
       * **`keywordRequiereGenero` (2026-09-03) es la excepción**: cuando el
       * botón lo declara, la rama de keyword SÍ lleva `generos`. Solo tiene
       * sentido si el género del botón existe en las dos taxonomías (si no,
       * volvería a dejar sin series al botón, igual que pasaría si se le
       * pusiera a los otros cuatro). Hoy la usa únicamente "reirme": medido
       * en vivo, sin esto la rama de `satire` traía Ella (Her), Belleza
       * Americana y Sector 9 (District 9) — dramas serios sin género Comedia,
       * que entraban solo porque TMDb usa `satire` para cualquier crítica
       * social, no para lo cómico. Con el género exigido, esos tres
       * desaparecen y CERO títulos canónicos se pierden (Office, Friends, Ted
       * Lasso, Futurama, Community, Zombieland, Ted, South Park, Modern
       * Family sobreviven los siete): los sitcoms y comedias de verdad ya
       * llevan Comedia en TMDb, así que exigirlo no les cuesta nada.
       */
      ...(
        await Promise.all(
          idsKeywords.map((id) =>
            specsPorTipo(config.keywordRequiereGenero ? config.generos : null, { keywords: [id] })
          )
        )
      ).flat(),
    ];
  } else {
    throw new Error(`Modo de combinación desconocido: ${config.modo}`);
  }

  especificaciones = await conRestricciones(especificaciones, config);

  /**
   * obtenerCandidatosCompletos dedupea candidatos entre especificaciones —
   * por eso pasarle varias specs distintas ya le da semántica de OR
   * (género-o-keyword) sin lógica extra acá.
   *
   * **UNA SPEC POR KEYWORD, no una sola con todas juntas** (cambiado el
   * 2026-08-24, al ampliar las listas). Las dos formas dan el mismo OR, pero
   * el reparto del tope de candidatos es por turnos entre especificaciones, y
   * eso cambia todo cuando las keywords son de tamaños muy distintos: metidas
   * en un solo `with_keywords`, TMDb devuelve la unión ordenada por
   * popularidad y la keyword más grande se come el cupo entero. Medido en
   * "Quiero reflexionar", donde 'coming of age' tiene 1119 títulos contra los
   * 8 de 'human nature': con una sola spec el botón devolvía Spider-Man:
   * Homecoming y Harry Potter, y no aparecía ni Rashomon ni Ladrón de
   * bicicletas. Es el mismo argumento por el que País y Año arman una spec por
   * valor en vez de una sola con todos.
   */
  const { candidatos: completos, hayMas } = await obtenerCandidatosCompletos(especificaciones, agregados, { lote });
  /**
   * excluidoPorFiltroDeGenero (data/genres.js) es la misma función que usan
   * motorBusqueda.js::buscar() y gustosPorGenero.js — un botón de género
   * hereda la corrección de su género automáticamente (mismo mecanismo que ya
   * usa "accion" con CORRECCIONES_POR_GENERO[28]), sin que este archivo sepa
   * nada de "dramedias de prestigio". Ver 4.29.8/4.29.9.
   */
  const filtrados = aplicarFiltros(completos, filtrosFinales).filter(
    (t) => !excluidoPorFiltroDeGenero(t, config.generos)
  );
  return {
    resultados: ordenarResultados(
      filtrados,
      ordenar ?? { campo: 'popularidad', direccion: 'desc', jitter: JITTER_ORDEN_NATURAL }
    ),
    hayMas,
  };
}
