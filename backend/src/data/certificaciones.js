/**
 * Sección 17 del Definitivo — cascada de fallback por país y equivalencias
 * ATP / +14 / +17.
 *
 * Validado contra TMDb real el 2026-08-20, de dos formas: contra las listas
 * oficiales (/certification/movie/list y /certification/tv/list) y contra
 * los códigos que realmente aparecen en release_dates/content_ratings de
 * una muestra de 240 títulos de la base. Eso mostró que TMDb NO usa una
 * grafía única por código: conviven "13" y "+13" (AR), "PG-12" y "PG12"
 * (JP), "R15+" y "R-15" (JP), "ALL" y "All" (KR). Por eso la comparación
 * no se hace nunca contra el string crudo, sino contra su forma
 * normalizada (ver normalizarCodigo), y las tablas de acá abajo conservan
 * la grafía del Definitivo por legibilidad.
 */

/**
 * **ARGENTINA VA PRIMERO, y esto se apartó del Definitivo a propósito**
 * (2026-08-29). Su tabla fija EEUU -> Argentina -> ..., pero las etiquetas que
 * esta cascada produce son las argentinas (ATP, +14, +17) y el público es
 * argentino, así que la clasificación local es la que corresponde aplicar
 * cuando existe.
 *
 * No es cosmético: el límite de edad se aplica **solo a los menores** (sección
 * 17), y medido sobre el caché, de 729 títulos con las dos certificaciones
 * **133 no coinciden y en 94 Estados Unidos es más estricto que Argentina**.
 * Con EE.UU. primero, a alguien de 15 años le escondíamos Matrix, Sueño de
 * fuga y El resplandor, que acá están calificadas 13. Y tampoco era una
 * política conservadora coherente: en los otros 39 Estados Unidos es MÁS
 * permisivo que Argentina.
 *
 * Los cuatro últimos (Alemania, Francia, Italia y Canadá) no están en el
 * Definitivo y se sumaron el mismo día. Van al final porque son los menos
 * pertinentes acá; su razón de ser es de cobertura: 518 títulos sin límite de
 * edad tenían certificación solo de países que no mirábamos, encabezados por
 * Alemania (138), Francia (91), Italia (47) y Canadá (32).
 */
export const ORDEN_CASCADA = ['AR', 'US', 'GB', 'ES', 'BR', 'KR', 'JP', 'MX', 'DE', 'FR', 'IT', 'CA'];

/**
 * Deja el código en una forma comparable: mayúsculas y solo caracteres
 * alfanuméricos. Con eso, "+13"/"13", "PG-12"/"PG12", "R-15"/"R15+" y
 * "All"/"ALL" colapsan al mismo valor. Se verificó que dentro de cada país
 * no hay dos códigos de significado distinto que colapsen entre sí.
 */
export function normalizarCodigo(codigo) {
  if (!codigo) return null;
  /**
   * **Conserva cualquier letra Unicode, no solo A-Z**, y eso no es un detalle:
   * Corea del Sur manda sus códigos en hangul ("전체관람가" es "apta para todo
   * público" y "청소년 관람불가" es "prohibida para menores"). Con `[^A-Z0-9]`
   * esos códigos quedaban en cadena vacía, o sea que se trataban como si no
   * hubiera dato y **era imposible reconocerlos aunque estuvieran en la tabla**.
   */
  const limpio = String(codigo).toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
  return limpio || null;
}

/**
 * Códigos que significan explícitamente "nunca se sometió a clasificación"
 * (no es lo mismo que un código ambiguo dentro de un sistema conocido). Se
 * tratan igual que si no hubiera dato: la cascada sigue al próximo país.
 */
export const SIN_CALIFICAR = {
  US: ['NR', 'UR', 'Not Rated', 'Unrated'],
  // "No rating information", tal como lo describe la lista oficial de TMDb.
  ES: ['NR'],
  /**
   * Exclusivo de game shows y programas de estilo de vida: no es una
   * clasificación por edad, es una exención.
   */
  KR: ['Exempt'],
  /**
   * "NR" es el "no rating" de los cuatro países nuevos, y en Canadá además
   * están "Exempt" y su forma corta "E" (material exento de clasificar).
   */
  FR: ['NR'],
  IT: ['NR'],
  DE: ['NR'],
  CA: ['NR', 'Exempt', 'E'],
};

export const EQUIVALENCIAS = {
  US: { ATP: ['G', 'PG', 'TV-Y', 'TV-Y7', 'TV-G'], '+14': ['PG-13', 'TV-PG', 'TV-14'], '+17': ['R', 'TV-MA', 'NC-17'] },
  /**
   * "SAM 13" y "+13" son la misma clasificación escrita distinto; ambas
   * formas colapsan en la normalizada, igual que "13" del Definitivo.
   * "C" es el condicionado argentino (salas habilitadas), o sea adultos.
   * "12" no existe en el sistema argentino, pero aparece cargado en TMDb;
   * se mapea a +14 con el criterio conservador (es lo que significa "12"
   * en todos los demás países de la cascada). Sin esto, la cascada saltea
   * Argentina entera y puede terminar en un país más permisivo.
   * "PM18" es "prohibida para menores de 18", que TMDb trae en algunos títulos.
   */
  AR: { ATP: ['ATP'], '+14': ['12', '13', 'SAM 13'], '+17': ['16', '18', 'SAM 16', 'SAM 18', 'C', 'PM18'] },
  GB: { ATP: ['U', 'PG'], '+14': ['12', '12A'], '+17': ['15', '18', 'R18'] },
  /**
   * El sistema español es de recomendación, no de admisión: "A"/"APTA"/
   * "Ai"/"ERI" son variantes de apta para todo público, y "7i"/"10" son
   * "no recomendada para menores de 7/10", que caen del mismo lado que el
   * "7" que ya estaba. "13" acompaña a "12" en +14.
   */
  ES: { ATP: ['TP', '7', '7i', 'A', 'Ai', 'APTA', 'ERI', '10'], '+14': ['12', '13'], '+17': ['16', '18', 'X'] },
  /**
   * Brasil: "6" es la franja nueva de ClassInd (2025), va con "10" y "L".
   * **Las formas largas son las que TMDb usa de verdad** y faltaban todas:
   * "Livre", "e Livre", "12 anos", "e 12"... Sin ellas la cascada saltaba
   * Brasil entero y la consola avisaba en cada búsqueda.
   */
  BR: {
    ATP: ['L', '6', '10', 'Livre', 'e Livre', '6 anos', 'e 6', '10 anos', 'e 10'],
    '+14': ['12', '14', '12 anos', 'e 12', '14 anos', 'e 14'],
    '+17': ['16', '18', '16 anos', 'e 16', '18 anos', 'e 18'],
  },
  /**
   * "Restricted Screening" es el equivalente coreano a exhibición
   * restringida (adultos). "18" no está en la lista oficial pero aparece
   * en datos reales; se mapea con el criterio conservador.
   * Los dos códigos en hangul son los que TMDb devuelve más seguido:
   * "전체관람가" es apta para todo público y "청소년 관람불가" es prohibida para
   * menores. Reconocerlos exigió que el normalizador dejara de tirar las letras
   * no latinas (ver normalizarCodigo).
   */
  KR: {
    ATP: ['ALL', '7', '전체관람가'],
    '+14': ['12', '12세 이상 관람가'],
    '+17': ['15', '18', '19', 'Restricted Screening', '청소년 관람불가', '15세 이상 관람가', '15세 관람가'],
  },
  /**
   * TMDb escribe estos códigos de las dos maneras según el título; las dos
   * grafías quedan documentadas acá y colapsan al normalizar.
   * "15" a secas aparece en datos reales y es R15+; va a +17 como el resto de
   * la franja japonesa de 15.
   */
  JP: { ATP: ['G'], '+14': ['PG-12', 'PG12'], '+17': ['R15+', 'R-15', 'R-18+', 'R18+', '15'] },
  MX: { ATP: ['AA', 'A'], '+14': ['B'], '+17': ['B-15', 'C', 'D'] },

  /**
   * ===== LOS CUATRO QUE NO ESTÁN EN EL DEFINITIVO (2026-08-29) =====
   * Todos los códigos salen de contar los que TMDb devuelve de verdad en el
   * caché, no de la descripción oficial de cada sistema.
   *
   * Se sigue el mismo criterio de redondeo conservador del Definitivo, y de
   * paso el que ya aplican España y Brasil: las franjas de 6, 9 y 10 años van a
   * ATP, y la de 12 va a +14.
   */

  // Alemania (FSK): 0, 6, 12, 16, 18. El sistema más limpio de los cuatro.
  DE: { ATP: ['0', '6'], '+14': ['12'], '+17': ['16', '18'] },

  // Francia: "TP"/"U" son tous publics.
  FR: { ATP: ['TP', 'U', '10'], '+14': ['12'], '+17': ['16', '18'] },

  /**
   * Italia: "T" es per tutti y "BA" es bambini accompagnati (apta con adulto).
   * "VM14"/"VM18" son las viejas (vietato ai minori) y "6+"/"14+"/"18+" las
   * nuevas; conviven en los datos.
   */
  IT: {
    ATP: ['T', 'BA', '6+', '10+'],
    '+14': ['VM12', '12+', 'VM14', 'VM 14', '14', '14+', 'Kids+13', '13+'],
    '+17': ['VM18', '18', '18+'],
  },

  /**
   * Canadá: conviven el sistema de cine de Ontario (G, PG, 14A, 18A, R, A) y el
   * de televisión (C, C8, G, PG, 14+, 18+).
   */
  CA: { ATP: ['G', 'PG', 'C', 'C8'], '+14': ['14A', '14+', '13+'], '+17': ['18A', '18+', 'R', 'A'] },
};

/**
 * Índices derivados, en forma normalizada, que son los que se consultan en
 * runtime (logic/edad.js). Se arman una sola vez al cargar el módulo.
 */
export const INDICE_EQUIVALENCIAS = {};
for (const [pais, tabla] of Object.entries(EQUIVALENCIAS)) {
  const mapa = new Map();
  for (const [limite, codigos] of Object.entries(tabla)) {
    for (const codigo of codigos) mapa.set(normalizarCodigo(codigo), limite);
  }
  INDICE_EQUIVALENCIAS[pais] = mapa;
}

export const INDICE_SIN_CALIFICAR = {};
for (const [pais, codigos] of Object.entries(SIN_CALIFICAR)) {
  INDICE_SIN_CALIFICAR[pais] = new Set(codigos.map(normalizarCodigo));
}
