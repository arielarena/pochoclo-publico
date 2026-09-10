/**
 * Sección 5 del Definitivo — tabla de Opción 4 (¿Estado de ánimo?).
 * `modo` define cómo se combinan género y keyword para cada botón:
 *   'genero'           -> solo género, sin keyword.
 *   'genero-y-keyword' -> género AND (keyword1 OR keyword2 OR...).
 *   'genero-o-keyword' -> género OR keyword (unión de dos búsquedas separadas).
 *   'complejidad'      -> caso especial ("Quiero pasar el tiempo"): filtra
 *                         por Complejidad en vez de género/keyword.
 *
 * Dos campos opcionales, que hoy usa solo "Quiero llorar" (ver su comentario):
 *   `sinGeneros`   -> { pelicula: [ids], tv: [ids] } que se excluyen. Va POR
 *                     TAXONOMÍA y a mano, no traducido: las dos listas no son
 *                     la misma traducida, porque un género puede ser ruido en
 *                     un endpoint y señal en el otro.
 *   `vetoKeywords` -> nombres de keyword a excluir, para lo que sobrevive a la
 *                     exclusión por género. Se resuelven a ID igual que las
 *                     otras y viajan en `without_keywords`.
 *   `sinGenerosRamaGenero` -> lo mismo, pero para la rama de género pelado de un
 *                     botón OR, que por omisión no lleva ninguna exclusión. Hoy
 *                     lo usa solo "reirme", que es el caso donde el género de
 *                     TMDb no dice lo que el botón promete.
 * Los dos se aplican a TODAS las especificaciones del botón. Hoy eso es exacto,
 * porque el único que los usa está en modo AND y ahí todas llevan el género. Al
 * sumarlos a un botón en modo OR habrá que decidir si la rama de género pelado
 * también los lleva.
 *
 * IDs de género tomados de src/data/genres.js. Los nombres de keyword son
 * en inglés porque así los devuelve TMDb — se resuelven a ID en tiempo de
 * request (ver src/opciones/estadoAnimo.js).
 */
import { CORRECCIONES_POR_GENERO } from './genres.js';

export const ESTADOS_ANIMO = {
  /**
   * **Ganó rama de keyword y exclusiones el 2026-08-29.** Era el botón más
   * simple de todos (género Comedia y nada más) y tenía dos problemas que solo
   * se ven midiendo.
   *
   * 1. **El género Comedia de TMDb no es "para reírse".** Su top por
   *    popularidad arrancaba con Pulp Fiction, Forrest Gump, El lobo de Wall
   *    Street, The Rookie y Parásitos: todos llevan Comedia entre sus géneros y
   *    ninguno es lo que alguien busca al apretar este botón. Por eso es **el
   *    único botón cuya rama de género pelado lleva exclusiones**
   *    (`sinGenerosRamaGenero`): sacando Crimen, Thriller y Bélica de ahí, el
   *    top pasa a Los Simpson, Rick y Morty, Toy Story, Shrek y Regreso al
   *    futuro. Se probó sumarle Drama y se descartó: saca a Forrest Gump pero
   *    también a media comedia dramática, que sí es para reírse.
   * 2. **Con dos especificaciones el botón devolvía 70 resultados**, contra los
   *    ~200 de los demás, y ninguna de las series de comedia canónicas. La rama
   *    de keyword lo lleva a 190 y mete The Office, Friends, Ted Lasso, Futurama
   *    y Community. `sitcom` (796 series) y `workplace comedy` (168) son las que
   *    hacen ese trabajo; `mockumentary` quedó afuera porque aporta lo mismo con
   *    más ruido, y `dark comedy` (545 películas) quedó afuera **porque trae
   *    justo lo que el punto 1 saca**: encabeza con Pulp Fiction y Parásitos.
   *
   * Las dos listas de exclusión son distintas a propósito, y no es un descuido:
   * la de la rama de keyword es más dura (suma Terror, Acción y, en series,
   * Acción y aventura y Ciencia ficción y fantasía, que es lo que sacaba a The
   * Boys) porque ahí el título llega sin haber pasado por Comedia. Aplicarle esa
   * misma lista a la rama de género cuesta Rick y Morty, que es 16+35+10765.
   */
  reirme: {
    modo: 'genero-o-keyword',
    generos: [35], // Comedia
    /**
     * sortBy solo afecta la rama de género pelado (ver conRestricciones en
     * opciones/estadoAnimo.js) — el mismo defecto que tenía "accion" antes de
     * 4.15.5b: sin esto, esa rama es `popularity.desc` y queda a merced de
     * estrenos de la semana con pocos votos (medido el 2026-09-02, ver
     * 4.29.2).
     */
    sortBy: 'vote_count.desc',
    /**
     * **2026-09-03**: reirme es el único de los cinco botones OR que puede
     * exigirle género a su propia rama de keyword, porque Comedia existe en
     * las dos taxonomías de TMDb (a diferencia de Thriller/Romance/Historia/
     * Terror). Sin esto, `satire` traía Ella (Her), Belleza Americana y
     * Sector 9 — dramas serios que TMDb etiqueta con esa keyword por crítica
     * social, no por ser graciosos. Ver el comentario en
     * opciones/estadoAnimo.js (buscarPorEstadoAnimo) para la medición
     * completa: cero títulos canónicos perdidos, los tres intrusos afuera.
     */
    keywordRequiereGenero: true,
    keywords: ['satire', 'parody', 'spoof', 'farce', 'black humor', 'sitcom', 'workplace comedy'],
    sinGeneros: {
      pelicula: [80, 53, 10752, 27, 28], // Crimen, Thriller, Bélica, Terror, Acción
      tv: [80, 10768, 10759, 10765], // Crimen, Bélica y política, Acción y aventura, Ciencia ficción y fantasía
    },
    /**
     * **Animación/Familia/Aventura se suman acá el 2026-09-03, SOLO del lado
     * película**, a pedido del usuario ("hay mucho de animación como Toy
     * Story o Up, que no es lo que espera alguien que busca comedia... casi
     * no encuentro a Adam Sandler"). Medido: sin esto, `vote_count.desc` deja
     * la rama copada de Pixar/DreamWorks (Del revés, Up, Toy Story,
     * Monstruos S.A., Shrek), que tienen 2 a 4 veces más votos que la
     * comedia en vivo. Con la exclusión entran Resacón en Las Vegas, Ted,
     * Zombieland, El Club de los Cinco, Bitelchús, American Pie — y ahí sí
     * aparece Sandler (50 primeras citas).
     *
     * El costo medido es Familia: se lleva puesta Solo en casa (Home Alone,
     * comedia en vivo genuina), a cambio de El Club de los Cinco, Bitelchús
     * y American Pie — un saldo a favor. Es la misma clase de costo aceptado
     * ya en Acción (perder Matrix/Terminator para sacar a Marvel).
     *
     * **Del lado serie NO se toca.** Rick y Morty es el caso testigo: no
     * lleva ninguna de las keywords de este botón (ni 'satire' ni 'sitcom'),
     * así que hoy solo llega por esta misma rama sin filtrar. Excluir
     * Animación ahí lo sacaría sin ningún camino de rescate — 'adult
     * animation' sí lo trae de vuelta, junto con Simpsons/Padre de
     * Familia/South Park/Bob's Burgers, pero SOLO sirve del lado serie: la
     * misma keyword del lado película trae Akira, La Tumba de las
     * Luciérnagas y Perfect Blue, que no es lo que este botón busca. No hay
     * forma de mandar una keyword a un solo tipo hoy, así que se dejó afuera
     * en vez de arreglar mal los dos lados.
     */
    sinGenerosRamaGenero: {
      pelicula: [80, 53, 10752, 16, 10751, 12], // Crimen, Thriller, Bélica, Animación, Familia, Aventura
      tv: [80, 10768], // Crimen, Bélica y política
    },
    /**
     * **El filtro de "dramedia de prestigio" (Forrest Gump, El Show de
     * Truman, La La Land) NO vive acá.** Vivió acá una sesión (2026-09-04) y
     * se movió a `CORRECCIONES_POR_GENERO[35]` en `data/genres.js`, apenas se
     * notó que quedaba invisible para Preferencias y Gustos Registrados —
     * este botón siempre pide `generos: [35]`, así que lo hereda solo, igual
     * que "accion" hereda su corrección de `CORRECCIONES_POR_GENERO[28]`. Ver
     * el comentario completo (la calibración, los números, los costos
     * aceptados) en `genres.js`, y 4.29.8/4.29.9.
     */
  },
  suspenso: {
    modo: 'genero-o-keyword',
    generos: [53], // Thriller
    /**
     * Ver el comentario de "reirme": mismo defecto de `popularity.desc` en la
     * rama de género pelado. Acá era el más visible de los cinco: medido el
     * 2026-09-02, "La señal del apocalipsis" (2026, 46 votos) entraba en el
     * top 12 final. Ver 4.29.2.
     */
    sortBy: 'vote_count.desc',
    /**
     * 'cat and mouse' quedó afuera aunque suena perfecta: la mitad de lo que
     * trae es Tom y Jerry y Los pitufos, porque TMDb la aplica literal.
     * 'hostage' encabeza con Toy Story 3 y Enredados, por el mismo motivo.
     */
    keywords: ['suspense', 'whodunit', 'conspiracy', 'paranoia', 'stalker', 'manhunt'],
    /**
     * `conspiracy` es la que traía Zootrópolis y Kamen Rider, y `manhunt` la que
     * traía Los Juegos del Hambre y Escuadrón letal. Sacar Acción y Aventura de
     * la rama de keyword no le cuesta nada al botón: los thrillers de acción
     * llegan igual por la rama de género, que no lleva exclusiones.
     */
    sinGeneros: {
      pelicula: [16, 10751, 12, 28], // Animación, Familia, Aventura, Acción
      tv: [10762, 16, 10751, 10759], // Infantil, Animación, Familia, Acción y aventura
    },
    vetoKeywords: ['superhero', 'based on comic'],
  },
  /**
   * **Este es el único botón en modo AND, y el cambio es del 2026-08-29.** Era
   * 'genero-o-keyword' como suspenso o asustarme, y el problema no era el ruido
   * que se veía sino el alcance: contra una lista de control de 26 títulos
   * canónicos de llorar (La vida es bella, Titanic, Forrest Gump, Hachiko, This
   * Is Us...) el botón traía **5**. Ahora trae **17**.
   *
   * Las tres cosas que lo explican, todas medidas contra TMDb:
   *
   * 1. **La rama de Drama a secas era la que ensuciaba.** Drama OR cualquier
   *    cosa, ordenado por popularidad, es Breaking Bad, The Walking Dead y
   *    Anatomía de Grey: dramas populares, ninguno para llorar. Ordenarla por
   *    votos da peor (El club de la lucha, Django, Riverdale). En AND, Drama
   *    deja de ser una fuente y pasa a ser el filtro que limpia la keyword.
   * 2. **Las keywords "sucias" se limpian solas en AND.** `loss of loved one`
   *    (455 títulos) encabeza con tres Spider-Man y `dying and death` (166) con
   *    Avatar y cuatro Harry Potter, así que en OR son inservibles. Pero son
   *    ruidosas justamente porque se aplican a taquilleros de Acción, Aventura
   *    y Fantasía: cruzadas con Drama aportan alcance sin traer nada de eso.
   *    **La regla vieja ("la keyword tiene que nombrar el efecto y no el tema")
   *    vale para OR; en AND el tema es seguro**, y es lo que permite usar
   *    `cancer`, `funeral`, `widow` o `holocaust`.
   * 3. **Los canónicos no tienen keyword emocional.** Solo 7 de los 26 del
   *    control llevaban alguna de las seis originales: Schindler, Titanic,
   *    Forrest Gump, Hachiko y Cinema Paradiso no tienen ninguna. Por eso la
   *    lista se divide en dos mitades con criterios distintos: las de EFECTO,
   *    que son las que definen el botón, y las de RESCATE, elegidas una por una
   *    porque su título objetivo sale **primero o segundo** de esa keyword
   *    cruzada con Drama (`holocaust (shoah)` -> Schindler #1, `soulmates` ->
   *    Titanic #1, `mentally disabled` -> Forrest Gump #1, `homelessness` -> En
   *    busca de la felicidad #1, `unlikely friendship` -> Intocable #1,
   *    `human animal relationship` -> Hachiko #1). Esa posición importa y no es
   *    un detalle: el tope de candidatos se reparte POR TURNOS entre las
   *    especificaciones, así que con 54 de ellas cada una aporta unas 3 o 4. Una
   *    keyword cuyo objetivo está en el puesto 8 no lo rescata.
   *
   * Lo que se probó y quedó afuera: `world war ii` (651 títulos, encabeza con
   * Oppenheimer y Hasta el último hombre; `holocaust` trae a Schindler sin esa
   * cola), `coming of age` (832, Cinema Paradiso recién en el puesto 8),
   * `single parent` (rescata lo mismo que `homelessness` y mete Shameless),
   * `forbidden love` (trae Titanic igual que `soulmates` pero con Tres metros
   * sobre el cielo detrás), `dog` (163, Hachiko #1 pero con Click atrás;
   * `human animal relationship` lo trae más limpio) y `nostalgic`, que se dejó
   * pero es la más floja de las de efecto.
   *
   * **Lo que sigue sin poder traer, y no tiene arreglo por esta vía**: Up, Coco
   * y Marley y yo **no llevan el género Drama** (son Animación, Familia y
   * Comedia), así que ningún diseño anclado en Drama los alcanza. La tumba de
   * las luciérnagas y El niño con el pijama de rayas sí son Drama y sí tienen
   * `world war ii`, pero quedan fuera del cupo por popularidad.
   */
  llorar: {
    modo: 'genero-y-keyword',
    generos: [18], // Drama
    /**
     * POR TAXONOMÍA y explícito, no traducido: la lista de series NO lleva
     * 10765 (Ciencia ficción y fantasía) aunque la de películas lleve 878. Con
     * 10765 excluido se cae The Leftovers, que es exactamente lo que el botón
     * tiene que traer. Las de película sacan a Batman Begins, El truco final y
     * El precio del poder, que son Drama para TMDb.
     */
    sinGeneros: {
      pelicula: [28, 27, 878, 53, 80], // Acción, Terror, Ciencia ficción, Thriller, Crimen
      tv: [10759, 80], // Acción y aventura, Crimen
    },
    /**
     * Lo que sobrevive a la exclusión por género porque el título ES un drama.
     * Sacan a Bruja Escarlata y Visión y a El joven Sheldon, y no cuestan
     * ningún título legítimo (medido, ver services/tmdb.js::keywordsVetadas).
     */
    vetoKeywords: ['superhero', 'based on comic', 'sitcom'],
    keywords: [
      // De efecto: las que definen qué es "para llorar".
      'tearjerker', 'melodrama', 'sadness', 'melancholy', 'grief', 'loss',
      'loss of loved one', 'dying and death', 'dying', 'terminal illness',
      'terminal cancer', 'cancer', 'bereavement', 'depression', 'suicide',
      'funeral', 'widow', 'nostalgic',
      /**
       * De rescate: cada una entra por un canónico que no tiene keyword
       * emocional. No agregar ninguna sin medir en qué puesto sale su objetivo.
       */
      'holocaust (shoah)', 'human animal relationship', 'loyalty', 'soulmates',
      'homelessness', 'unlikely friendship', 'inspiring story',
      'mentally disabled', 'self sacrifice',
    ],
  },
  /**
   * Romance y Terror NO existen como género en la taxonomía de TV de TMDb, así
   * que la rama de género de estos dos es solo-películas por definición. La
   * keyword es lo que los hace llegar a las series, y llega bien: 'horror'
   * trae Stranger Things y The Walking Dead, 'romance' trae Los Bridgerton.
   * Sin esto los dos botones devolvían cero series y no había forma de saberlo.
   */
  enamorarme: {
    modo: 'genero-o-keyword',
    generos: [10749], // Romance
    /**
     * Ver el comentario de "reirme": mismo defecto de `popularity.desc` en la
     * rama de género pelado. Acá era el más visible de los cinco: medido el
     * 2026-09-02, "Sunrise. El último amanecer" (2026, 37 votos) entraba en
     * el top 12 final. Ver 4.29.2.
     */
    sortBy: 'vote_count.desc',
    /**
     * 'wedding' quedó afuera: 493 títulos encabezados por Star Wars Episodio II
     * y Armageddon, porque alcanza con que haya un casamiento en alguna escena.
     */
    keywords: [
      'romance', 'first love', 'love triangle', 'soulmates',
      'forbidden love', 'unrequited love', 'falling in love',
    ],
    /**
     * `falling in love` traía Gru 2 y La LEGO película, y `romance` (703
     * películas y 1948 series, la keyword más grande de todo el proyecto) traía
     * Spider-Man: Cruzando el Multiverso y Hotel Transilvania.
     *
     * **Se excluye Familia y NO Animación**, que es la diferencia que importa:
     * Animación se lleva puestas Your Name y La novia cadáver, que son
     * exactamente lo que el botón busca; Familia saca a Gru y a Hotel
     * Transilvania sin tocarlas. Medido: con esta lista el control sube de 7 a 8
     * sobre 12 y las series casi no bajan (91 a 89), que es lo que había que
     * cuidar porque acá las series salen solo de la rama de keyword.
     */
    sinGeneros: {
      pelicula: [10751, 28, 27], // Familia, Acción, Terror
      /**
       * Crimen(80) se suma el 2026-09-04, reportado por el usuario: Better
       * Call Saul (Crimen+Drama, sin Infantil ni Acción y aventura) entraba
       * por 'romance' solo, sin ninguna keyword de las de efecto (`first
       * love`, `love triangle`...). No es un caso aislado de este título:
       * 'romance' sola trae, ordenada por votos, dramas criminales antes que
       * romances (mismo patrón ya documentado para el género recreado de
       * Romance en 4.15.8, "la que se llama igual que el género es la que
       * ensucia" — ahí ya se había sacado `romance` de
       * `KEYWORDS_DE_GENERO_SERIE`, pero nunca de la lista propia de este
       * botón). Medido: con Crimen excluido, Better Call Saul desaparece y
       * el resto de la lista (Bridgerton, Outlander, Heartstopper, This Is
       * Us, Ginny y Georgia) no se mueve ni un lugar.
       */
      tv: [10762, 10759, 80], // Infantil, Acción y aventura, Crimen
    },
    /**
     * `sinGenerosRamaGenero` (2026-09-04, reportado por el usuario) es DISTINTO
     * de `sinGeneros` de arriba: ese solo corre en la rama de keyword,
     * `conRestricciones()` no lo aplica a la rama de género pelado (Romance
     * solo, `vote_count.desc`), que es por donde entraban La Bella y la
     * Bestia, Maléfica y Shrek 2. De los tres, solo Shrek 2 es ruido real (una
     * secuela de comedia, no una historia de amor); los otros dos son romances
     * de cuento de hadas genuinos. Excluir Familia sacaría los tres juntos;
     * Animación(16) es quirúrgico porque Shrek 2 la lleva y los otros dos, al
     * ser de acción real, no. Verificado en TMDb: géneros de Shrek 2 son
     * Animación+Comedia+Familia+Fantasía+Romance, los de La Bella y la Bestia
     * (2017) y Maléfica no incluyen Animación. Y no cuesta nada de Your Name
     * (que sí se excluye de Animación en esta rama): sigue entrando por la
     * rama de keyword, que tiene su propia lista de exclusión sin Animación
     * (ver el comentario de `sinGeneros` arriba) y donde Your Name entra por
     * la keyword `romance`.
     */
    sinGenerosRamaGenero: {
      pelicula: [16], // Animación
    },
    vetoKeywords: ['superhero', 'based on comic'],
  },
  /**
   * 'mind-bending' era la keyword obvia por el nombre y estaba muerta: con el
   * piso de 10 votos son CERO películas y una serie en todo TMDb. Las que la
   * reemplazan se eligieron midiendo el catálogo real el 2026-08-24: 'time
   * loop' (96 películas y 18 series, casi sin ruido: Al filo del mañana,
   * Código fuente, Palm Springs, Dark, Muñeca rusa, Steins;Gate) y
   * 'surrealism' (433 y 52, la más grande de las que apuntan bien: Mulholland
   * Drive, Donnie Darko, Enemy, Twin Peaks, The OA). Se descartó 'time travel'
   * (526 y 241) porque el viaje en el tiempo es un recurso de trama y no un
   * acertijo: lo que sube son Endgame, Harry Potter y Volver al futuro.
   *
   * **Pasó a AND el 2026-08-29, y es el único de los cinco botones en OR que
   * necesitaba eso en vez de exclusiones.** El motivo se ve al mirar de dónde
   * venían sus intrusos: no de la rama de keyword sino de la **rama de género**,
   * porque Ciencia ficción ordenado por popularidad es Marvel. Su top era
   * Spider-Man: Brand New Day, Vengadores, Juego de tronos, Vengadores: Infinity
   * War y The Walking Dead, y por eso las dos tandas de exclusiones que
   * arreglaron a los otros cuatro **no le cambiaron ni un título**: la rama de
   * género no las lleva, a propósito (ver `conRestricciones` en
   * opciones/estadoAnimo.js).
   *
   * En AND el género pasa a ser el ancla y las tres keywords originales quedan
   * cortas, así que se sumaron seis medidas una por una contra el catálogo
   * cruzado con Ciencia ficción o Misterio: `dream` (2 títulos, y uno es Origen),
   * `simulated reality` (5, encabeza Matrix), `nonlinear timeline` (10: Memento,
   * ¡Olvídate de mí!, 12 monos), `memory` (34: Origen, Memento, Dark City),
   * `unreliable narrator` (6: Contratiempo, La chica del tren) e `identity
   * crisis` (15: Carretera perdida, Primer). Sin ellas el botón perdía Origen y
   * Matrix, que son los dos títulos que cualquiera espera acá.
   *
   * Quedaron afuera `mind control` (75, encabeza con Spider-Man, Divergente y
   * Pacific Rim), `twist ending` (3, y son Destino final 5 y dos desconocidas) y
   * `parallel universe`, que rescata lo mismo que las otras pero mete Bleach y
   * la trilogía animada de la Liga de la Justicia.
   *
   * Resultado: de 7 a **10 sobre 12** del control, con Origen, Matrix, Memento y
   * ¡Olvídate de mí! encabezando. Los dos que faltan son Coherence y Devs, que
   * quedan fuera del cupo por popularidad.
   */
  volarMiMente: {
    modo: 'genero-y-keyword',
    generos: [878, 9648], // Ciencia Ficción, Misterio
    keywords: [
      'plot twist', 'time loop', 'surrealism',
      'memory', 'nonlinear timeline', 'unreliable narrator',
      'simulated reality', 'identity crisis', 'dream',
    ],
    vetoKeywords: ['superhero', 'based on comic'],
  },
  /**
   * El modo 'complejidad' no tiene ni género ni keyword propios: las
   * especificaciones las arma `especificacionesDeComplejidad` del motor, que es
   * la misma pieza que usa la Complejidad como Preferencia. **Eso cambió el
   * 2026-08-29**: antes pedía populares y filtraba después, y de 80 candidatos
   * quedaban 35, encabezados por Spider-Man y Vengadores. Ver el comentario en
   * opciones/estadoAnimo.js.
   */
  pasarElTiempo: {
    modo: 'complejidad',
    complejidad: 'relajar',
    /**
     * `sinKeywordsDeSpec` (2026-09-04, a pedido del usuario: "reducir pero no
     * eliminar" el cine de superhéroes) saca 'superhero' de las specs de
     * discover que arma `especificacionesDeComplejidad`, SIN sacarla de
     * `KEYWORDS_RELAJAR` (data/keywords.js): la clasificación de
     * `complejidad()` sigue viéndola, así que un título de superhéroes que
     * entre por cualquier otra vía se sigue clasificando "relajar" igual que
     * siempre (4.15.6). Lo único que cambia es que esta rama deja de salir a
     * buscarlos por esa keyword con una especificación propia.
     *
     * Medido contra TMDb el 2026-09-04, película, top 20 por especificación
     * (genero + 9 keywords, la misma forma que usa la rama real): sin la spec
     * dedicada, los títulos de superhéroes bajan de 24 a 14 sobre ~170
     * candidatos únicos. **No desaparecen**: los que además llevan Acción,
     * Aventura o Fantasía (Los Vengadores, El Caballero Oscuro, Deadpool,
     * Guardianes de la Galaxia, Iron Man, Black Panther, Spider-Man:
     * Homecoming) siguen entrando por la rama de género, que no se tocó. Lo
     * que se pierde es la cola que solo entraba por la keyword y no por
     * ningún género de relajar (Doctor Strange, Batman Begins, Thor, Iron Man
     * 2 y 3, las secuelas menos vistas).
     *
     * Es opt-in y no un cambio a `especificacionesDeComplejidad` en general:
     * la Preferencia "Complejidad: para relajar" de `/buscar`
     * (`motorBusqueda.js`) sigue con la lista completa, porque ahí alguien
     * pidió "para relajar" a secas y no la curaduría de este botón puntual.
     */
    sinKeywordsDeSpec: ['superhero'],
  },
  /**
   * Este es AND con Drama, así que una keyword ancha no hace tanto daño como en
   * los botones OR: el género ya acota. Pero "no tanto" no es "nada" (ver el
   * agregado del 2026-09-04 más abajo).
   */
  inspirador: {
    modo: 'genero-y-keyword',
    generos: [18], // Drama
    keywords: [
      'inspirational', 'based on true story', 'underdog', 'redemption',
      'mentor', 'hope', 'coach', 'perseverance',
    ],
    /**
     * El AND con Drama no alcanzaba: encabezaban El lobo de Wall Street y
     * Batman Begins, que son Drama y llevan `based on true story` y `mentor`
     * respectivamente. Sacando Acción y Crimen de la rama, el top pasa a
     * Titanic, El rey león, Intocable, La lista de Schindler, The Imitation
     * Game y Bohemian Rhapsody, y el control sube de 4 a 5 sobre 12.
     *
     * **Terror(27) y Ciencia ficción y fantasía(10765) se suman el
     * 2026-09-04**, reportado por el usuario a partir del mismo patrón que
     * "velocidad" (una keyword que suena bien pero es demasiado ancha). Acá el
     * culpable no era una keyword sino un género que faltaba excluir: del lado
     * serie, `inspirational` y `redemption` traían Black Mirror, The Expanse,
     * True Blood, El problema de los 3 cuerpos y Hazbin Hotel — dramas de
     * ciencia ficción/fantasía oscuros que TMDb etiqueta así por un arco de
     * personaje puntual, no por el tono general. Del lado película, `redemption`
     * traía Bone Tomahawk (western de terror con venganza).
     *
     * Medido: se van 7 de 20 de `inspirational` y 6 de 12 de `redemption` en
     * serie, 1 solo título en película, y el control de 12 títulos canónicos
     * (Rocky, En busca de la felicidad, Rudy...) no se mueve — nada de lo que
     * se pierde era "inspirador" para empezar.
     */
    sinGeneros: {
      pelicula: [28, 80, 27], // Acción, Crimen, Terror
      tv: [10759, 80, 10765], // Acción y aventura, Crimen, Ciencia ficción y fantasía
    },
    vetoKeywords: ['superhero', 'based on comic'],
  },
  /**
   * **Reportado el 2026-09-02: el botón traía Marvel y nada de lo que promete**
   * (Fuego contra fuego, Duro de matar, robos). El `popularity.desc` de la
   * medición del 2026-08-29 (Vengadores, El caballero oscuro, John Wick...) ya
   * no aguantaba: medido en vivo, la página 1 estaba tomada por estrenos de
   * 2026 con apenas 47 a 665 votos (Spider-Man: Brand New Day, La Odisea,
   * Batman: Knightfall...). Es el mismo defecto de `popularity.desc` que ya
   * motivó `vote_count.desc` en Clásicos y Complejidad (ver 4.9 y 4.15): sube
   * lo que está de moda esta semana, no lo que la gente de verdad vio. Acción
   * era el único botón que seguía en `popularity.desc`, y era una excepción
   * que dejó de estar justificada.
   *
   * **`vote_count.desc` solo no alcanza**, porque el género Acción de TMDb
   * incluye el cine de superhéroes, y con más votos que casi todo lo demás se
   * come las primeras 40 posiciones (page 1-2, lo único que trae el lote 1)
   * igual que le pasaba a "reirme" con Comedia. Sumado el veto de
   * `superhero`/`based on comic` (mismo mecanismo, pero sobre la ÚNICA rama del
   * botón: no hay rama de keyword de la que distinguirla, así que
   * `conRestricciones` en opciones/estadoAnimo.js lo aplica directo cuando
   * `modo === 'genero'`), la página 1 pasa a Origen, Avatar, Matrix, Mad Max,
   * Gladiator, John Wick, Kill Bill, Dunkerque, Baby Driver, Guerra Mundial Z,
   * El profesional (Léon), Skyfall, Terminator y Terminator 2 — sin un solo
   * Vengadores/Batman/Spider-Man. Del lado de TV pasa de basura (Jason y los
   * Argonautas con 77 votos, Kamen Rider, Doraemon) a Juego de tronos,
   * Stranger Things, The Walking Dead, Vikingos, Cobra Kai, Prison Break.
   *
   * **Y con eso todavía no alcanzaba: el usuario lo devolvió el mismo día**
   * ("como puede ser que esté El señor de los anillos, o Avatar, o Star Wars?
   * no es lo que alguien busca cuando busca acción"). Tenía razón, y el motivo
   * es que el veto de superhéroes no toca el problema real: el género Acción
   * de TMDb es tan amplio que también incluye la épica de fantasía y la
   * space-opera, que tienen MÁS votos todavía que el cine de acción molido a
   * tiros (Mad Max, Terminator, Matrix y Avatar son, los cuatro, también
   * Ciencia Ficción; El señor de los anillos y Piratas del Caribe son también
   * Aventura). Por `vote_count.desc` esos se comen las primeras 40 posiciones
   * igual que antes lo hacía Marvel.
   *
   * **Medido con un control de 18 títulos** (Duro de matar, Fuego contra
   * fuego, Arma Mortal, Máxima Velocidad, Terminator 2, Mad Max, John Wick,
   * Matrix, Kill Bill, Rápidos y Furiosos, Misión Imposible, León, Desafío
   * Total, Riesgo en el aire, Punto de Quiebre, Caracortada, Contracara, La
   * roca): con solo el veto de superhéroes, **6 de 18 entraban en el lote 1**,
   * y eran justo los que menos hacía falta explicar (Matrix, Terminator x2,
   * Mad Max, Kill Bill x2). **Sacando Aventura(12), Fantasía(14), Ciencia
   * Ficción(878) y Animación(16) de la rama de género** (mismo mecanismo que
   * "reirme" ya usa para su propio género pelado, `sinGenerosRamaGenero`, ver
   * el comentario de arriba), la página 1 pasa a John Wick x3, Kill Bill x2,
   * Dunkerque, Baby Driver, León, El francotirador, Caracortada, **Jungla de
   * cristal (Duro de matar)**, Venganza, Rápidos y Furiosos x4, Top Gun x2,
   * Sr. y Sra. Smith, Bourne x2, The Equalizer, Sicario, Ocean's Eight, Bad
   * Boys for Life, Train to Busan, Nadie, **Heat (Fuego contra fuego)** y Arma
   * fatal. Los 4 géneros son los mismos en las dos direcciones: son la fantasía
   * y la ciencia ficción las que sobraban, no el crimen ni el suspenso, que
   * siguen dentro y son los que traen Sicario, Caracortada y compañía.
   *
   * **El costo es perder lo genuinamente sci-fi**: Matrix, Terminator, Mad
   * Max y Avatar salen de este botón (siguen buscables por Género o Parecido
   * a). Es la misma clase de intercambio que ya hizo "reirme" con Rick y Morty
   * al excluir Ciencia ficción y fantasía de su rama de TV, y acá lo pide el
   * propio usuario: lo que sobraba era exactamente la épica de fantasía y
   * space-opera, y ahora no está.
   *
   * **Del lado de TV, la traducción es distinta porque TMDb funde Acción con
   * Aventura en un solo género (10759)** y no se puede separar ahí (ver
   * genres.js EQUIVALENTE_EN_SERIE): solo se excluyen Ciencia ficción y
   * fantasía (10765, que cubre Fantasía y Ciencia Ficción juntas) y Animación
   * (16). Con eso el top pasa de Mandalorian/Halo/Fallout/anime a El juego del
   * calamar, Vikingos, Cobra Kai, Prison Break, Jack Ryan, 24, SEAL Team,
   * NCIS: Los Ángeles, El agente nocturno, MacGyver. **The Walking Dead y
   * Stranger Things también salen** de esta rama porque TMDb las etiqueta con
   * Ciencia ficción y fantasía (zombis, criaturas): mismo intercambio que del
   * lado de película, y no hay forma de separar "zombi" de "fantasía" sin una
   * keyword propia, que reabriría el problema del reparto de cupo (ver abajo).
   *
   * **Sumar una rama de keyword de nuevo sigue sin ser la salida** (medido el
   * 2026-08-29: de 12 de control bajó a 2, por el reparto del tope de
   * candidatos entre más especificaciones, ver 4.15.5). Las exclusiones de
   * género sí sirven porque no agregan ninguna especificación nueva, solo
   * recortan la única que ya había.
   */
  accion: {
    modo: 'genero',
    generos: [28], // Acción
    /**
     * sortBy/vetoKeywords/sinGenerosRamaGenero salen de CORRECCIONES_POR_GENERO
     * (data/genres.js) — es la misma corrección que usa Gustos Registrados
     * para "Acción" (gustosPorGenero.js) y que motorBusqueda.js aplica a
     * Preferencias normales. Vivía triplicada a mano; ahora es una sola fuente.
     */
    ...CORRECCIONES_POR_GENERO[28],
  },
  /**
   * 'car chase' no existe como keyword en TMDb: la que más se le parece es
   * 'car crash', que son choques y no persecuciones. Las reales son 'chase'
   * y 'police chase'.
   */
  velocidad: {
    modo: 'genero-y-keyword',
    generos: [28], // Acción
    /**
     * 'heist' quedó afuera: un golpe es tensión, no velocidad, y traía Origen y
     * La casa de papel, que le corresponden a "suspenso".
     *
     * **`chase` y `police chase` se sacaron el 2026-09-04**, reportado por el
     * usuario: son demasiado genéricas, se aplican a cualquier película con
     * UNA escena de persecución sin que la velocidad sea el tema (El Quinto
     * Elemento, Assassin's Creed, Búsqueda Implacable 2 y 3, ¿Qué le pasó a
     * Lunes?, ninguna de las cinco tiene otra keyword de esta lista). Medido:
     * sacar las dos baja el total de 190 a 127 y deja una lista mucho más
     * pareja (Rápidos y Furiosos, Misión Imposible, Bourne, Rush, F1, Mad Max,
     * Death Race, Crank, Initial D), pero también se lleva puestos títulos que
     * sí tienen peso como acción vehicular y no tenían otra keyword: Heat,
     * Jack Reacher, Bad Boys For Life, Minority Report, Jason Bourne (2016),
     * Baby Driver y la trilogía de El Transportador.
     *
     * `getaway driver` (agregada el mismo día) recupera dos de esos sin
     * reabrir el problema: Baby Driver y El Transportador 1/2/3 llevan esa
     * keyword y ninguno de los cinco títulos reportados la tiene. Los otros
     * (Heat, Jack Reacher, Bad Boys For Life, Minority Report, Jason Bourne)
     * se quedan afuera a propósito: no tienen ninguna keyword de vehículos más
     * allá de una persecución genérica, así que no son más "de velocidad" que
     * los cinco que motivaron el cambio. Total final: 136.
     *
     * Se probaron alternativas más angostas (`car chase`, `motorcycle chase`,
     * `truck chase`, `helicopter chase`) para reemplazar a `chase` por algo
     * más específico: todas dieron 0 a 4 títulos, muy chicas para servir de
     * reemplazo (mismo problema que ya documenta 4.15.5.3, "MÁS
     * ESPECIFICACIONES NO ES MÁS ALCANCE" en sentido inverso: una keyword más
     * angosta no amplía nada).
     */
    keywords: [
      'racing', 'car race', 'getaway driver',
      'street racing', 'motorcycle', 'pursuit', 'high speed',
    ],
    /**
     * **Solo el veto, sin exclusiones de género**, y es a propósito. Lo único
     * que sobraba era el cine de superhéroes (Aquaman, Ant-Man y la Avispa,
     * Aves de Presa, Kamen Rider), que llega por `pursuit`; con el veto el top
     * pasa a Rápidos y Furiosos, Misión Imposible, Bourne y Mad Max. Se probó
     * además excluir Fantasía y Animación y no cambia el control (4 de 12) ni
     * el top, así que no se sumó: resultados de menos a cambio de nada.
     */
    vetoKeywords: ['superhero', 'based on comic'],
  },
  reflexionar: {
    modo: 'genero-o-keyword',
    generos: [99, 36], // Documental, Historia
    /**
     * Ver el comentario de "reirme": mismo defecto de `popularity.desc` en la
     * rama de género pelado. Acá pegaba más fuerte del lado de series: la
     * rama de TV quedaba copada por programas de bajísimo perfil (NOVA y
     * similares, 10 a 650 votos) en vez de series documentales de peso. Ver
     * 4.29.2.
     */
    sortBy: 'vote_count.desc',
    /**
     * 'biography' quedó afuera pese a sus 1636 títulos: acá la rama de keyword
     * va sin género, así que habría inundado el botón de biopics, y una biopic
     * no es por sí sola algo sobre lo que reflexionar.
     */
    keywords: ['philosophy', 'coming of age', 'social commentary', 'existentialism', 'society', 'human nature'],
    /**
     * **Era el botón más sucio de los once: 150 de 195 resultados fuera de
     * Documental e Historia**, encabezados por Matrix, Spider-Man: Homecoming,
     * Harry Potter, El rey león, It y Big Hero 6. La culpable es una sola,
     * `coming of age`, que con 1123 películas y 281 series es la keyword más
     * grande de todas las que usa el proyecto.
     *
     * **Se probó sacarla y NO se sacó**, porque las exclusiones ya la arreglan y
     * ella sola aporta 15 de las series del botón: sin ella el top se llena de
     * cine bélico (1917, Troya, Hasta el último hombre) que entra por Historia.
     * Con las exclusiones y con ella, el top arranca con Parásitos, La lista de
     * Schindler, The Imitation Game, No es país para viejos, Ex Machina y La
     * naranja mecánica, y el control se mantiene en 8 de 12.
     */
    sinGeneros: {
      pelicula: [28, 12, 14, 27, 10751], // Acción, Aventura, Fantasía, Terror, Familia
      tv: [10759, 10765, 10762, 10751], // Acción y aventura, Ciencia ficción y fantasía, Infantil, Familia
    },
    vetoKeywords: ['superhero', 'based on comic', 'sitcom'],
  },
  asustarme: {
    modo: 'genero-o-keyword',
    generos: [27], // Terror
    /**
     * Ver el comentario de "reirme": mismo defecto de `popularity.desc` en la
     * rama de género pelado (medido el 2026-09-02, ver 4.29.2).
     */
    sortBy: 'vote_count.desc',
    /**
     * Las keywords de criaturas quedaron todas afuera y por la misma razón:
     * nombran al monstruo, no al susto. 'ghost' encabeza con cinco Harry
     * Potter, 'demon' con El señor de los anillos y La princesa Mononoke,
     * 'monster' con Monstruos S.A., 'vampire' con la saga Crepúsculo y
     * 'supernatural' con Encanto. Las que quedaron nombran la experiencia.
     */
    keywords: ['horror', 'slasher', 'possession', 'haunting', 'paranormal', 'zombie'],
    /**
     * Lo que se colaba tenía dos orígenes distintos. Las **parodias y comedias
     * de terror** (Scary Movie por `slasher`, Cazafantasmas y Prácticamente
     * magia por `haunting`, Bienvenidos a Zombieland) se van con Comedia y con
     * el veto de `parody`. Y el **zombi de acción** (Soy leyenda, Guerra Mundial
     * Z), con Acción y Ciencia ficción.
     *
     * **La lista de series es más corta a propósito**, y no es una omisión: acá
     * Terror no existe en la taxonomía de TV, así que la rama de keyword es la
     * única fuente de series del botón. Excluir Acción y aventura ahí saca a The
     * Walking Dead, que es justamente de lo que se trata. Medido: con la lista
     * fuerte las series caían de 78 a 64 y el control perdía TWD.
     */
    sinGeneros: {
      pelicula: [35, 10751, 28, 878], // Comedia, Familia, Acción, Ciencia ficción
      tv: [10762, 10751, 35], // Infantil, Familia, Comedia
    },
    vetoKeywords: ['parody'],
  },
};
