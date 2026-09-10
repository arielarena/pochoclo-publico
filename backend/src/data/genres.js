/**
 * IDs de género de TMDb. Son estables (no cambian con el tiempo ni entre
 * idiomas), así que clasificamos por ID en vez de por el nombre que
 * devuelve la API — evita depender de que el string traducido matchee
 * exactamente contra las listas del Definitivo.
 *
 * ================== OJO: TMDb TIENE DOS TAXONOMÍAS ==================
 *
 * `/genre/movie/list` devuelve 19 géneros y `/genre/tv/list` devuelve 16, y
 * solo comparten 8 IDs. Mandarle a `/discover/tv` un ID que solo existe para
 * películas NO da error: TMDb lo ignora, así que el `with_genres` queda con
 * ramas muertas y el `without_genres` no excluye lo que uno cree.
 *
 * Esto estuvo mal hasta el 2026-08-24: había una sola lista mezclada con la
 * separación apenas en comentarios, y de los 11 géneros de "relajar" 5 no
 * existían en TV. El síntoma fue que buscar una miniserie para relajar
 * devolvía talk shows, telenovelas y anime adulto.
 *
 * Verificado contra la API el 2026-08-24: los 27 IDs de acá son exactamente
 * la unión de las dos listas, y los tres subconjuntos de abajo coinciden con
 * lo que devuelve cada endpoint.
 */

export const GENEROS_TMDB = {
  // Compartidos entre película y serie (mismo ID, mismo significado)
  16: 'Animación',
  35: 'Comedia',
  18: 'Drama',
  80: 'Crimen',
  99: 'Documental',
  10751: 'Familia',
  9648: 'Misterio',
  37: 'Western',

  // Exclusivos de película
  28: 'Acción',
  12: 'Aventura',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  10749: 'Romance',
  878: 'Ciencia Ficción',
  10770: 'Película de TV',
  53: 'Thriller',
  10752: 'Bélica',

  /**
   * Exclusivos de serie (TMDb combina algunos géneros distinto en TV)
   * **10759 ("Acción y aventura") y 10765 ("Ciencia ficción y fantasía") NO
   * están acá a propósito, desde el 2026-09-03.** Eran los IDs fundidos que
   * TMDb usa cuando junta dos géneros de película en uno solo de serie.
   * Se separaron: Acción(28)/Aventura(12) y Ciencia Ficción(878)/Fantasía(14)
   * ahora se buscan en serie por separado, vía `KEYWORDS_DE_GENERO_SERIE` +
   * `GENERO_ANCLA_SERIE` (ver más abajo), así que ya no hacen falta como
   * chips propios — dejarlos habría sido la misma redundancia que se le
   * sacó a "Ciencia ficción y fantasía" al separarla (dos chips finos más
   * uno ancho que los contiene). Los IDs numéricos SIGUEN vivos en
   * `GENEROS_SERIE`, `GENEROS_AMBIVALENTES`, `EQUIVALENTE_EN_PELICULA` y las
   * listas de Complejidad: TMDb los sigue asignando de verdad a los títulos,
   * solo dejaron de ser algo que el selector ofrezca.
   */
  10762: 'Infantil',
  10763: 'Noticias',
  10764: 'Reality',
  10766: 'Telenovela',
  10767: 'Talk Show',
  10768: 'Bélica y Política',
};

/** Los 8 que valen en las dos taxonomías. */
export const GENEROS_COMPARTIDOS = new Set([16, 35, 18, 80, 99, 10751, 9648, 37]);

/** Los 19 que acepta `/discover/movie`. */
export const GENEROS_PELICULA = new Set([
  ...GENEROS_COMPARTIDOS,
  28, 12, 14, 36, 27, 10402, 10749, 878, 10770, 53, 10752,
]);

/** Los 16 que acepta `/discover/tv`. */
export const GENEROS_SERIE = new Set([
  ...GENEROS_COMPARTIDOS,
  10759, 10762, 10763, 10764, 10765, 10766, 10767, 10768,
]);

/**
 * Traducción de un género de película al de serie que significa lo mismo.
 *
 * **Diez conceptos no tienen equivalente DIRECTO en TV y no están acá**:
 * Historia (36), Terror (27), Thriller (53), Música (10402), Romance
 * (10749), Acción (28), Aventura (12), Ciencia Ficción (878), Fantasía (14)
 * y Película de TV (10770, que por definición es de películas).
 *
 * **Nueve de esos diez igual se pueden buscar en series**, con una rama de
 * keywords en vez de `with_genres` (ver KEYWORDS_DE_GENERO_SERIE más abajo),
 * así que siguen apareciendo en el selector. El único que desaparece al
 * elegir Miniserie o Serie es Película de TV.
 *
 * **Acción/Aventura y Ciencia Ficción/Fantasía SALIERON de acá el
 * 2026-09-03** (antes traducían a 10759 y 10765, los IDs fundidos de TMDb).
 * No es que hayan dejado de tener relación con la serie — es que esa
 * relación pasó a resolverse con más precisión: `EQUIVALENTE_EN_SERIE`
 * traduce 1 a 1 sin margen para elegir, y TMDb funde los dos pares en un
 * solo ID cada uno, así que "traducir" 878 acá significaba en la práctica
 * "traducir 878 O 14 indistintamente". La keyword sí puede elegir un lado.
 * Ver `KEYWORDS_DE_GENERO_SERIE` y `GENERO_ANCLA_SERIE`, y 4.29.7.
 *
 * Bélica(10752) se queda: 10768 ("Bélica y Política") no es una fusión de
 * dos géneros de película, es Bélica sola con otro nombre en TV — no hay
 * género "Política" en la taxonomía de película de TMDb del que separarla.
 */
export const EQUIVALENTE_EN_SERIE = {
  10752: 10768, // Bélica -> Bélica y Política
};

/** El inverso: un género de serie puede corresponder a varios de película. */
export const EQUIVALENTE_EN_PELICULA = {
  10759: [28, 12],
  10765: [14, 878],
  10768: [10752],
};

/**
 * ============ GÉNEROS RECREADOS CON KEYWORDS (2026-08-30, ampliado 2026-09-03) ============
 *
 * Nueve de los diez géneros sin equivalente DIRECTO en TV **sí se pueden
 * buscar en series**, con una rama de keywords en vez de `with_genres`. Es
 * el mismo mecanismo que usa "Quiero asustarme" desde siempre (ver
 * estadosAnimo.js, modo genero-o-keyword), y es justamente lo que le
 * permite a ese botón traer series cuando el género Terror no existe para TV.
 *
 * **POR QUÉ HACÍA FALTA (los primeros cinco, 2026-08-30).** Hasta entonces
 * estos géneros desaparecían del selector al elegir Miniserie o Serie, y si
 * el Tipo no estaba fijado la búsqueda devolvía **40 películas y cero
 * series, sin decir nada**. Medido: los seis daban 0 series, y además
 * desperdiciaban la mitad del tope de candidatos, porque corría una sola
 * especificación.
 *
 * **LA REGLA PARA AGREGAR UNA KEYWORD ACÁ: la que se llama igual que el
 * género es la que ensucia.** Se repitió en los primeros cinco. `romance`
 * ordenada por votos encabeza con **Better Call Saul** y **Prodigiosa:
 * Ladybug**; sacándola y dejando `first love`, `love triangle` y
 * `soulmates`, la lista queda limpia. `music` es la única genérica que se
 * conservó: su cola es buena y sin ella el género se quedaba corto. Es la
 * misma lección de 4.15.3b: la genérica nombra la decoración, las
 * específicas nombran la experiencia.
 *
 * Descartadas por medición: `based on true story` y `biography` para
 * Historia (traen Dahmer, Orange Is the New Black y Mi reno de peluche, que
 * son historias reales pero no cine histórico), y `singer` para Música
 * (trae Hijos del Tercer Reich, donde alguien canta).
 *
 * **Los otros cuatro (Acción/Aventura/Ciencia Ficción/Fantasía, 2026-09-03)
 * son un caso distinto: no faltan en TV, TMDb los funde de a pares en un
 * solo ID (10759, 10765).** Acá la keyword no reemplaza a `with_genres`,
 * lo AFINA: cada spec pide `with_genres=<ancla> & with_keywords=<término>`
 * (ver `GENERO_ANCLA_SERIE`), así que la keyword elige un lado del par en
 * vez de traer el balde entero. Calibradas contra TMDb en vivo el
 * 2026-09-03, con el mismo criterio de siempre (una keyword ambigua bleedea
 * al otro lado del par, o a una franquicia ajena, y hay que medirla para
 * verlo):
 *
 * - **Ciencia Ficción(878)**: se descartó `parallel world` — es la única
 *   que traía a Stranger Things acá (a pedido del usuario), pero medida
 *   sola trae 3 de 4 resultados de anime isekai de fantasía pura (Casa
 *   Búho, InuYasha, Shield Hero). El usuario decidió dejarla afuera:
 *   Stranger Things queda solo del lado de Fantasía.
 * - **Fantasía(14)**: se descartaron `prophecy` y `quest` — contaminadas al
 *   revés, su cabecera es Fundación, Star Trek: Espacio Profundo Nueve,
 *   Babylon 5 y The Mandalorian: ciencia ficción dura, no fantasía.
 * - **Aventura(12)**: la lista quedó corta a propósito. Se descartaron
 *   `survival` (trae The Walking Dead y El juego del calamar: horror/
 *   thriller, no aventura), `quest` (Mandalorian/Battlestar Galactica:
 *   ciencia ficción), `journey` (isekai de fantasía, mismo problema que
 *   `parallel world`) y `expedition`/`desert island` (2 y 0 resultados).
 *
 * Detalle completo de la calibración, con los números de cada keyword
 * descartada, en 4.29.7.
 *
 * **Película de TV (10770) NO está acá y no tiene que estar**: es un
 * formato, no un tema. Una película hecha para TV, por definición, no es una
 * serie. Es el único de los diez que sigue sin poder buscarse en series.
 */
export const KEYWORDS_DE_GENERO_SERIE = {
  27: ['horror', 'slasher', 'possession', 'haunting', 'paranormal', 'zombie'],
  53: ['suspense', 'whodunit', 'conspiracy', 'paranoia', 'stalker', 'manhunt'],
  36: ['historical', 'period drama', 'world war ii', 'ancient rome', 'middle ages', 'monarchy'],
  10749: ['first love', 'love triangle', 'soulmates', 'forbidden love', 'unrequited love', 'falling in love'],
  10402: ['music', 'band', 'rock music', 'k-pop', 'music industry', 'concert'],
  878: [
    'space travel', 'space opera', 'space station', 'space colony',
    'artificial intelligence (a.i.)', 'robot', 'android', 'cyborg',
    'time travel', 'dystopia', 'post-apocalyptic future', 'cyberpunk',
    'near future', 'virtual reality', 'alien',
  ],
  14: [
    'dragon', 'kingdom', 'magic', 'fantasy world', 'dark fantasy', 'witch',
    'sorcery', 'wizard', 'mythical creature', 'supernatural', 'monster',
    'vampire', 'werewolf', 'ghost',
  ],
  28: ['gunfight', 'spy', 'assassin', 'martial arts', 'heist', 'military', 'special forces', 'fight', 'combat', 'war', 'crime fighter', 'vigilante'],
  12: ['treasure hunt', 'pirate', 'exploration', 'road trip', 'jungle'],
};

/**
 * El género "ancla" que se combina con `with_genres` cuando la keyword de
 * arriba afina un par fundido por TMDb, en vez de reemplazar el filtro de
 * género entero (que es lo que hacen los primeros cinco, que no tienen
 * ningún género real al que anclarse). Sin el ancla, una keyword como
 * `robot` traería cualquier serie con esa keyword, sin que le importe si es
 * ciencia ficción — con `generos:[10765]` de por medio, se queda adentro
 * del vecindario correcto.
 *
 * Reusable para cualquier fusión futura de TMDb: hoy cubre los dos pares
 * medidos (4.29.7). Bélica(10752) no tiene entrada acá porque no
 * es una fusión — ver el comentario de `EQUIVALENTE_EN_SERIE`.
 */
export const GENERO_ANCLA_SERIE = {
  878: 10765, // Ciencia Ficción -> ancla en "Ciencia ficción y fantasía"
  14: 10765, // Fantasía -> ancla en "Ciencia ficción y fantasía"
  28: 10759, // Acción -> ancla en "Acción y aventura"
  12: 10759, // Aventura -> ancla en "Acción y aventura"
};

/**
 * Lo que el selector de Género puede ofrecer cuando el Tipo elegido es
 * Miniserie o Serie: los 16 que TMDb acepta de verdad, más los nueve que
 * sabemos recrear con keywords. El único que queda afuera es Película de TV.
 */
export const GENEROS_SERIE_BUSCABLES = new Set([
  ...GENEROS_SERIE,
  ...Object.keys(KEYWORDS_DE_GENERO_SERIE).map(Number),
]);

/**
 * Índice inverso de KEYWORDS_DE_GENERO_SERIE, armado una vez al cargar el
 * módulo: inferirGenerosDeSerie() corre una vez por título de cada búsqueda.
 */
const GENERO_POR_KEYWORD = new Map();
for (const [id, keywords] of Object.entries(KEYWORDS_DE_GENERO_SERIE)) {
  for (const keyword of keywords) {
    if (!GENERO_POR_KEYWORD.has(keyword)) GENERO_POR_KEYWORD.set(keyword, []);
    GENERO_POR_KEYWORD.get(keyword).push(Number(id));
  }
}

/**
 * Los géneros que una SERIE cumple sin que TMDb se los asigne, deducidos de
 * sus keywords. Devuelve [] si no cumple ninguno.
 *
 * **SOLO PARA SERIES.** En película los cinco géneros existen de verdad y los
 * asigna TMDb, así que no hay nada que inferir y quien llama no debe llamarla.
 *
 * **SE CALCULA PARA TODA SERIE, NO SOLO PARA LAS QUE VIENEN DE UNA BÚSQUEDA DE
 * ESE GÉNERO**, y ahí está el motivo de que exista. Antes la marca se ponía en
 * tres lugares distintos (el motor al armar sus ramas, "Parecido a" sobre sus
 * candidatos, y el panel de Filtros del cliente), y todas dependían de CÓMO
 * habías buscado: la misma serie era de terror o no según por dónde llegaras.
 * Calculándolo del propio título, es una respuesta sola y siempre la misma.
 *
 * **OJO: ESTO NO ENTRA EN complejidad(), Y NO ES UN OLVIDO** (ver 4.15.9). Se
 * midió contra el género real en películas, donde existen las dos señales:
 * el proxy acierta el 41% en Historia y el 68-72% en Romance y Música. Alcanza
 * para BUSCAR, donde solo importa la cabeza del ranking, y no para CLASIFICAR,
 * que toca todos los títulos. Metiendo esto en la Complejidad, La familia
 * Ingalls y La maravillosa Sra. Maisel se van a "pensar" por ser de época.
 * Por eso el campo va aparte y NO se mezcla con `generos`: mezclarlos haría
 * que la Complejidad los tomara sola, en silencio.
 */
export function inferirGenerosDeSerie(keywords) {
  if (!keywords?.length) return [];
  const salida = new Set();
  for (const keyword of keywords) {
    for (const id of GENERO_POR_KEYWORD.get(keyword) ?? []) salida.add(id);
  }
  return [...salida];
}

/**
 * De una lista de géneros pedidos, cuáles hay que recrear con keywords para
 * poder buscarlos en `/discover/tv`: los que no existen en esa taxonomía,
 * no tienen equivalente, y sí tienen una lista de keywords.
 *
 * Devuelve [] para película: ahí todos los géneros existen de verdad.
 */
export function generosRecreablesEnSerie(ids) {
  return [...new Set(ids ?? [])].filter(
    (id) => !GENEROS_SERIE.has(id) && EQUIVALENTE_EN_SERIE[id] == null && KEYWORDS_DE_GENERO_SERIE[id]
  );
}

/**
 * Pasa una lista de géneros a la taxonomía del endpoint que se va a llamar.
 *
 * Los que ya son válidos ahí quedan igual, los que tienen equivalente se
 * traducen, y **los que no tienen equivalente se descartan**. Devuelve la
 * lista traducida sin repetidos.
 *
 * Quien la llame tiene que mirar si el resultado quedó vacío: pedirle a
 * discover un `with_genres` vacío no es "sin filtro de género", es traer
 * todo, y "serie de terror" devolvería todas las series.
 */
export function generosParaTaxonomia(ids, tipoDiscover) {
  const validos = tipoDiscover === 'pelicula' ? GENEROS_PELICULA : GENEROS_SERIE;
  const equivalencias = tipoDiscover === 'pelicula' ? EQUIVALENTE_EN_PELICULA : EQUIVALENTE_EN_SERIE;
  const salida = new Set();

  for (const id of ids ?? []) {
    if (validos.has(id)) {
      salida.add(id);
      continue;
    }
    const eq = equivalencias[id];
    if (Array.isArray(eq)) eq.forEach((e) => validos.has(e) && salida.add(e));
    else if (eq != null && validos.has(eq)) salida.add(eq);
  }
  return [...salida];
}

/**
 * Sección 15 del Definitivo — GENEROS_RELAJAR y GENEROS_PENSAR, ahora una
 * lista por taxonomía.
 *
 * Dos decisiones sobre la lista de series que no salen del Definitivo (que
 * fue escrito pensando en una sola taxonomía) y conviene tener anotadas:
 *
 *  - **Telenovela (10766) y Talk Show (10767) NO están en "relajar".** Son
 *    formatos, no historias, y eran exactamente lo que encabezaba los
 *    resultados de "miniserie para relajar" (The Tonight Show, Watch What
 *    Happens Live). La app recomienda algo para ver, no un formato de aire.
 *  - **Infantil (10762) SÍ está en "relajar".** Es donde corresponde, y antes
 *    quedaba excluido sin querer: el `without_genres` se calculaba como "todo
 *    lo que no está del lado pedido" sobre el diccionario completo, así que un
 *    dibujito etiquetado Animación + Infantil, el caso más puro de relajar,
 *    se caía.
 */
export const GENEROS_RELAJAR_PELICULA = new Set([
  35, // Comedia
  28, // Acción
  12, // Aventura
  16, // Animación
  10751, // Familia
  14, // Fantasía
  10402, // Música
  10749, // Romance
]);

export const GENEROS_RELAJAR_SERIE = new Set([
  35, // Comedia
  16, // Animación
  10751, // Familia
  10759, // Acción y aventura
  10762, // Infantil
  /**
   * Telenovela, agregada el 2026-08-30. Estaba neutra por omisión, no por
   * decisión: es el 9º género más frecuente de la taxonomía de TV (240 series
   * del caché) y ninguna de las dos listas lo nombraba. Una telenovela es la
   * definición de mirar algo liviano, así que no votar era perder la señal más
   * clara que da TMDb sobre ese tipo de serie.
   */
  10766,
]);

export const GENEROS_PENSAR_PELICULA = new Set([
  18, // Drama
  9648, // Misterio
  878, // Ciencia Ficción
  99, // Documental
  36, // Historia
  10752, // Bélica
  80, // Crimen
]);

export const GENEROS_PENSAR_SERIE = new Set([
  18, // Drama
  9648, // Misterio
  99, // Documental
  80, // Crimen
  10765, // Ciencia ficción y fantasía
  10768, // Bélica y Política
]);

/**
 * ================= GÉNEROS AMBIVALENTES =================
 *
 * Seis géneros describen el TEMA de un título, no su peso: los mismos géneros
 * sostienen una película para pensar y una para pasar el rato. Drama es el caso
 * testigo (una comedia dramática y un drama judicial comparten el género y no
 * comparten nada más), y Ciencia Ficción, Misterio, Crimen y Aventura tienen
 * exactamente la misma forma: Interstellar y Los Vengadores son las dos de
 * ciencia ficción y de aventura.
 *
 * Estar acá no saca al género de su lado: sigue **inclinando** hacia donde
 * está listado (los cinco están del lado "pensar"), pero deja de **vetar** el
 * otro. Antes la regla exigía pureza (`generos.every(...)`), así que un solo
 * género ambivalente mandaba el título a "Sin clasificar" y lo sacaba de las
 * dos búsquedas. Medido contra TMDb el 2026-08-24 sobre 320 títulos por
 * taxonomía: quedaban sin clasificar el 71% de las películas y el 48% de las
 * series, y el combo más frecuente entre los perdidos era justamente
 * Comedia+Drama.
 *
 * Cómo se resuelve ahora está en `logic/clasificacion.js::complejidad()`:
 * cada género vota por su lado, gana el que tiene más votos, y si empatan
 * desempata el lado con más géneros NO ambivalentes. Verificado sobre esa
 * misma muestra: **ningún título cambia del lado que ya tenía**, los que se
 * suman caen donde uno esperaría (Los Vengadores, Matrix y Titanic a relajar;
 * Interstellar, Joker, Seven y El juego del calamar a pensar), y lo que queda
 * sin clasificar es el terror y los formatos que no son historias.
 */
export const GENEROS_AMBIVALENTES = new Set([
  18, // Drama
  878, // Ciencia Ficción (película)
  10765, // Ciencia ficción y fantasía (serie)
  9648, // Misterio
  80, // Crimen
  12, // Aventura (película). Ver la nota de abajo: NO va su par de serie.
]);

/**
 * **Aventura (12) está y "Acción y aventura" (10759) no**, y la asimetría no es
 * un olvido: TMDb fusiona Acción con Aventura en un solo ID para series, y
 * Acción es una señal fuerte de "relajar". Medido sobre 320 series, marcar
 * 10759 como ambivalente mandaba 11 títulos de "relajar" a Sin clasificar,
 * todos correctamente livianos (The Boys, The Mandalorian, Falcon y el Soldado
 * de Invierno). En película, donde Aventura viaja sola, el saldo es al revés.
 *
 * Consecuencia a tener presente: la rama de discover de "pensar" para series
 * sigue sin poder traer a Juego de tronos, que lleva Acción y aventura. Se
 * clasifica bien cuando llega por cualquier otro camino, pero esa rama no lo
 * alcanza. Es una limitación de la taxonomía de TMDb, no nuestra.
 */

/**
 * ================= CORRECCIONES POR GÉNERO =================
 *
 * Un género amplio ordenado por `vote_count.desc` puede quedar tomado por
 * franquicias de otro género vecino con más votos (medido para Acción(28) el
 * 2026-09-02, 4.15.5b: Aventura/Fantasía/Ciencia Ficción — El Señor
 * de los Anillos, Avatar, Star Wars — se comían la cabecera y no dejaban
 * lugar a Duro de Matar ni Fuego contra fuego). Esta tabla es la fuente
 * ÚNICA de esa corrección: antes vivía duplicada a mano en
 * `data/estadosAnimo.js` (config `accion`) y en
 * `opciones/gustosPorGenero.js` (`GENEROS_EXCLUIDOS_DE_ACCION`), cada una con
 * su propio chequeo de `=== 28`.
 *
 * Se calibra con `scripts/calibrarGenero.js` (mide, para un género G, qué
 * géneros/keywords co-ocurrentes están sobrerrepresentados en la cabecera de
 * `vote_count.desc` respecto de su peso real en TMDb — ver el comentario al
 * principio de ese script para la metodología completa). **No es automático,
 * y no conviene que lo sea**: el script mide un `lift`, pero decidir si ese
 * lift es "franquicia contaminando el género" o "el género es
 * legítimamente así" es un juicio de producto. Medido el 2026-09-02 contra
 * cuatro candidatos (mismo patrón que Acción: género amplio + franquicia de
 * taquilla):
 *
 * - **Ciencia Ficción(878)**: confirmado y APLICADO, con un matiz importante.
 *   Excluir Acción(28) entero (calcando la receta de Acción) SACA a Matrix y
 *   Mad Max de su propia búsqueda — son Ciencia Ficción de verdad, y también
 *   Acción. Vetar solo las keywords de Marvel/superhéroes (sin excluir ningún
 *   género) alcanza: sobre una lista de control de 18 títulos de ciencia
 *   ficción "dura" + 4 clásicos de acción-ciencia ficción (Matrix, Terminator
 *   2, Alien, Mad Max: Furia en la carretera), pasa de 3/18 y 2/4 (solo
 *   `vote_count.desc`) a 6/18 y 4/4 (con el veto), sin perder ninguno de los
 *   4 clásicos. Por eso, a diferencia de Acción, no lleva exclusión de género
 *   en Acción/Aventura/Fantasía: acá el veto de keyword solo ya alcanza y
 *   excluirlos sería puro costo.
 *
 *   **Sí ganó una exclusión de Animación(16), el 2026-09-03.** Reportado por
 *   el usuario contra "Por tus gustos" con Ciencia Ficción marcada — WALL·E
 *   (2008, no es clásico, así que solo podía entrar por acá) encabezaba sin
 *   que nada lo filtrara. Medido en vivo sobre el top 60 de `vote_count.desc`
 *   en película: excluir Animación **solo saca WALL·E y Gru: Mi villano
 *   favorito**, nada más se mueve (Interstellar, Origen, Avatar, Matrix,
 *   Star Wars, Regreso al futuro, Jurassic Park quedan iguales).
 *
 *   **Y la MISMA exclusión se sumó a `tv` el mismo día, a pedido explícito
 *   del usuario, sabiendo el costo.** Sacar Animación de "Ciencia ficción y
 *   fantasía"(10765) en TV se lleva puesto TODO el anime, no solo lo
 *   infantil: Ataque a los Titanes, Death Note, Naruto, Arcane, Fullmetal
 *   Alchemist Brotherhood, Futurama, Rick y Morty, Cowboy Bebop, Neon Genesis
 *   Evangelion — más de 60 títulos medidos, porque TMDb usa el mismo género
 *   para dibujo animado infantil y para anime serio, sin forma de separar uno
 *   de otro con `with_genres`. Se aceptó igual: quien elige el chip "Ciencia
 *   Ficción" específicamente no espera anime ("alguien que quiere ver ciencia
 *   ficción no creo que quiera ver anime", palabras del usuario), y **existe
 *   una salida sin filtrar** para quien sí lo quiere — el chip "Ciencia
 *   ficción y fantasía"(10765) es una opción DISTINTA y seleccionable por su
 *   cuenta (`GET /generos` sin `tipo` devuelve los 27 IDs únicos de las dos
 *   taxonomías, así que los dos chips conviven en el selector), y no lleva
 *   ninguna exclusión de género propia (ver la entrada `10765` más abajo). Es
 *   el mismo patrón que Acción arriba, un paso más allá: ahí la asimetría
 *   película/TV es forzosa (no hay un chip "Acción y aventura" que el
 *   usuario pueda elegir aparte); acá el usuario tiene control real sobre
 *   cuál de las dos quiere.
 *
 *   **Y la keyword `witch` se sumó al veto, también el 2026-09-03**, para un
 *   problema distinto y exclusivo de TV: la taxonomía de series funde Ciencia
 *   Ficción y Fantasía en el mismo ID (10765, ver `EQUIVALENTE_EN_SERIE`), así
 *   que pedir una es indistinguible de pedir la otra con `with_genres`. Un
 *   veto amplio (`witch`, `dark fantasy`, `magic`, `fantasy world`) se
 *   descartó por costoso: esas keywords las lleva también Juego de Tronos (el
 *   título N°1 de toda la rama por votos), La casa del dragón y The Witcher.
 *   `witch` sola es precisa: medido sobre los primeros 100 candidatos, saca
 *   exactamente Miércoles (Wednesday), Crónicas vampíricas, Sobrenatural, Los
 *   Originales, Legacies, Embrujadas y La materia oscura — fantasía/
 *   sobrenatural juvenil sin relación con ciencia ficción — y deja intactos
 *   Juego de Tronos, La casa del dragón, The Witcher, Stranger Things, The
 *   Walking Dead, The Mandalorian, Naruto, Dark, Ataque a los Titanes, Black
 *   Mirror y American Horror Story, verificado posición por posición.
 * - **Aventura(12)**: el único género que se roba su cabecera con un lift
 *   por encima del umbral es Ciencia Ficción (3,4). Acción(28) y Fantasía(14)
 *   quedan justo por debajo (1,9 y 1,3) — Aventura se solapa con esos dos por
 *   definición del género (Piratas del Caribe, Harry Potter, El Señor de los
 *   Anillos son, los tres, Acción/Fantasía Y Aventura de verdad), así que
 *   excluirlos sería gutear el género, no limpiarlo.
 * - **Fantasía(14)**: NO aplica. Aventura(12) y Acción(28) salen con lift
 *   alto (2,9 y 2,2), pero la cabecera medida (Harry Potter, El Señor de los
 *   Anillos, Piratas del Caribe, Shrek) es exactamente lo que alguien espera
 *   de "Fantasía" — excluirlos sacaría los títulos más canónicos del género,
 *   no una franquicia ajena colándose.
 * - **Comedia(35)**: medido, no aplicado. Aventura/Familia/Animación salen
 *   con lift alto (7,0 / 3,8 / 3,7: Pixar, Zootopia, Toy Story, Shrek), pero
 *   a diferencia de Acción/Ciencia Ficción acá no hay una franquicia ajena
 *   coincidiendo con otro género — son comedias infantiles genuinas. Excluir
 *   esos géneros sería una decisión de producto ("las comedias infantiles no
 *   cuentan"), no una corrección de un error de clasificación, y no se tomó
 *   sin que alguien la pida explícitamente.
 *
 * O sea: el script mide, una persona decide, y "lift alto" no es sinónimo de
 * "hay que excluirlo" — Fantasía y Comedia son la prueba de que aplicar la
 * receta a ciegas rompe más de lo que arregla.
 *
 * **Combinada con otro género en Preferencias** (`preferencias.generos` con
 * más de un ID): `motorBusqueda.js::buscar()` NO le aplica `sinGeneros` a un
 * `with_genres` combinado (A|B) — sacaría también títulos del OTRO género que
 * el usuario sí pidió (a Interstellar, que es Drama Y Ciencia Ficción, lo
 * sacaría una corrección de Acción si Acción y Drama se combinaran). Cuando
 * al menos uno de los géneros pedidos tiene una entrada acá, `buscar()` arma
 * UNA SPEC POR GÉNERO en vez de una combinada (mismo mecanismo que ya usaba
 * `gustosPorGenero.js` para que Thriller no quedara invisible detrás de
 * Acción y Ciencia Ficción combinados) y aplica la corrección solo a la spec
 * del género que la tiene — los demás géneros de la combinación se buscan
 * exactamente igual que si esta tabla no existiera.
 */
export const CORRECCIONES_POR_GENERO = {
  28: {
    /**
     * Acción. Medido el 2026-09-02 contra un control de 18 títulos
     * canónicos (Duro de Matar, Arma Mortal, Máxima Velocidad...): con solo
     * el veto de superhéroes entraban 6/18 al lote 1; sacando además estos
     * cuatro géneros de la rama, sube a los 18/18 esperados. Ver las notas de decisiones del proyecto
     * 4.15.5b para el detalle completo, con los números por variante.
     */
    sortBy: 'vote_count.desc',
    vetoKeywords: ['superhero', 'based on comic'],
    sinGenerosRamaGenero: {
      pelicula: [12, 14, 878, 16], // Aventura, Fantasía, Ciencia Ficción, Animación
      /**
       * Del lado tv, desde el 2026-09-03 esta corrección ya no se aplica a
       * un `with_genres=10759` sin acotar (Acción dejó de traducir a ese ID,
       * ver EQUIVALENTE_EN_SERIE): se aplica a la rama de keyword angosta
       * (GENERO_ANCLA_SERIE), que no necesita excluir 10765 entera porque
       * ninguna keyword de Acción aparece en las de Juego de Tronos/The
       * Witcher — verificado. Solo queda Animación.
       */
      tv: [16], // Animación
    },
  },
  878: {
    /**
     * Ciencia Ficción. Ver 4.29 (veto de marca, 2026-09-02) y
     * 4.29.5/4.29.7 (Animación y la separación de Fantasía, 2026-09-03).
     */
    sortBy: 'vote_count.desc',
    /**
     * `witch` salió del veto el 2026-09-03: existía para limpiar la rama
     * vieja `with_genres=10765` sin acotar (que traía Fantasía entera).
     * Esa rama ya no se construye — la keyword nueva por sí sola no trae
     * fantasía pura, así que vetar `witch` acá no tiene nada que hacer.
     */
    vetoKeywords: ['superhero', 'based on comic', 'marvel cinematic universe (mcu)'],
    sinGenerosRamaGenero: {
      pelicula: [16], // Animación — WALL·E, Gru: Mi villano favorito
      tv: [16], // Animación — todo el anime, a propósito (ver 4.29.5)
    },
  },
  /**
   * Fantasía y Aventura: nacen acá el 2026-09-03, junto con la separación de
   * Ciencia Ficción/Acción de sus pares fundidos en TV. Solo corrigen el
   * orden (mismo argumento de siempre: `popularity.desc` sube estrenos de la
   * semana con pocos votos) — **sin `vetoKeywords` ni `sinGenerosRamaGenero`
   * a propósito**: nadie pidió sacar el anime de Fantasía ni de Aventura (a
   * diferencia de Ciencia Ficción, donde sí se pidió explícitamente), y
   * Kimetsu no Yaiba/Jujutsu Kaisen/Dragon Ball son, ahí, contenido legítimo
   * del género. Si se reporta como problema, el mecanismo ya lo soporta sin
   * tocar código nuevo — ver 4.29.7.
   */
  14: {
    sortBy: 'vote_count.desc',
  },
  12: {
    sortBy: 'vote_count.desc',
  },
  35: {
    /**
     * Comedia. Ver 4.29.8 (el filtro en sí, calibrado para el botón
     * "Quiero reírme") y 4.29.9 (por qué se movió acá). **A propósito NO
     * lleva `sortBy`, `vetoKeywords` ni `sinGenerosRamaGenero`**: excluir
     * Animación/Familia/Aventura y ordenar por votos es una decisión de UX
     * del botón "reirme" (esa emoción puntual implica "no una de Pixar"), no
     * una corrección de género — alguien que filtra por Preferencias con
     * Género=Comedia puede querer Shrek de sobra. `filtroTono` es lo único
     * que sí generaliza: un título con Comedia Y Drama a la vez donde el peso
     * real es dramático (Forrest Gump, El Show de Truman, La La Land) no
     * representa bien "Comedia" en NINGÚN contexto, sea Preferencias, Gustos
     * Registrados o Estado de Ánimo.
     */
    filtroTono: {
      generoSerio: 18, // Drama
      keywordsPositivas: new Set([
        'hilarious', 'joyous', 'cheerful', 'amused', 'sarcastic', 'sarcasm',
        'absurd', 'whimsical', 'satirical', 'satire', 'parody', 'farce',
        'black humor', 'slapstick', 'deadpan', 'witty', 'comic', 'funny',
        'screwball', 'wisecrack',
      ]),
      keywordsPesadas: new Set([
        'war', 'vietnam war', 'world war ii', 'holocaust (shoah)',
        'concentration camp', 'post-traumatic stress disorder (ptsd)',
        'drug addiction', 'dystopia', 'paranoia', 'video surveillance',
        'depression', 'mental illness', 'mental institution',
        'dying and death', 'suicide', 'racism', 'genocide', 'illness',
        'obsessive compulsive disorder (ocd)', 'child with illness', 'cancer',
      ]),
      umbralVotos: 15000,
    },
  },
};

/**
 * "Dramedia de prestigio": un candidato que cumple el género `generoSerio` a
 * la vez que el amplio (`filtroTono` vive en la entrada del amplio, ver
 * arriba) y suma al menos dos de tres señales débiles de que el peso real
 * está del lado serio: sin ninguna keyword de tono liviano, con alguna
 * keyword de contenido pesado, o votado por encima del umbral. Ninguna señal
 * sola separa bien (medido en 4.29.8: las keywords de tono de TMDb
 * cubren solo una fracción pareja del catálogo), pero juntas sí.
 *
 * Corre sobre el candidato YA con detalle — género, keywords y vote_count ya
 * viajan en el objeto que arma motorBusqueda.js, así que no cuesta ninguna
 * llamada nueva a TMDb. Ver `scripts/calibrarTono.js` para recalibrar esto o
 * un caso nuevo.
 */
function cumpleFiltroTono(candidato, filtro) {
  if (!(candidato.generos ?? []).includes(filtro.generoSerio)) return false;
  const keywords = (candidato.keywords ?? []).map((k) => k.toLowerCase());
  const sinTonoPositivo = !keywords.some((k) => filtro.keywordsPositivas.has(k));
  const conContenidoPesado = keywords.some((k) => filtro.keywordsPesadas.has(k));
  const muyVotado = (candidato.vote_count ?? 0) > filtro.umbralVotos;
  return Number(sinTonoPositivo) + Number(conContenidoPesado) + Number(muyVotado) >= 2;
}

/**
 * Corre después de completarDetalle, sin importar por qué camino (Preferencias,
 * Gustos Registrados, Estado de Ánimo) haya entrado el candidato: se aplica un
 * `filtroTono` de `generosPedidos` si el candidato cumple ESE género con su
 * propio ID (no alcanza con que lo haya traído una spec de otro género), así
 * que nunca excluye algo que el usuario no pidió por esta vía.
 */
export function excluidoPorFiltroDeGenero(candidato, generosPedidos) {
  for (const g of generosPedidos ?? []) {
    const filtro = CORRECCIONES_POR_GENERO[g]?.filtroTono;
    if (filtro && (candidato.generos ?? []).includes(g) && cumpleFiltroTono(candidato, filtro)) {
      return true;
    }
  }
  return false;
}

/**
 * Formatos de TV que no son una historia para ver. No tienen lado (no votan),
 * pero se excluyen de las ramas de discover de Complejidad, que es lo que
 * hacían de hecho cuando el `without_genres` era "todo lo demás". Noticias,
 * Reality y Talk Show además ya mueren en `tipoContenido()`; Telenovela no,
 * porque TMDb la marca como Scripted.
 */
export const GENEROS_FORMATO_SERIE = [10763, 10764, 10766, 10767];

/**
 * Las dos listas que corresponden a una taxonomía. Lo usan tanto el motor
 * (para armar las ramas de discover) como la clasificación (para decidir la
 * complejidad de un título ya traído), así que no pueden separarse: si una
 * mira una lista y la otra otra, el discover trae bien y el filtro descarta.
 */
export function listasDeComplejidad(tipoDiscover) {
  return tipoDiscover === 'pelicula'
    ? { relajar: GENEROS_RELAJAR_PELICULA, pensar: GENEROS_PENSAR_PELICULA, todos: GENEROS_PELICULA }
    : { relajar: GENEROS_RELAJAR_SERIE, pensar: GENEROS_PENSAR_SERIE, todos: GENEROS_SERIE };
}

/**
 * Neutros a propósito (ni relajar ni pensar): Terror(27), Thriller(53),
 * Western(37), y los formatos de TV que no son historias. Un género neutro no
 * vota: no manda el título a ningún lado, pero tampoco lo veta. Por eso una
 * comedia de terror queda en "relajar" por su Comedia, y el terror a secas
 * sigue quedando Sin clasificar, que es lo que corresponde.
 */
