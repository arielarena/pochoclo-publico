-- Pochoclo — esquema inicial (v1, milestone 1)
-- Corré esto una vez contra tu base de Neon antes de correr el seed.

CREATE TABLE IF NOT EXISTS titulos (
  tmdb_id        INTEGER NOT NULL,
  tipo           TEXT NOT NULL CHECK (tipo IN ('pelicula', 'tv')),
  titulo         TEXT,
  anio           INTEGER,
  vote_count     INTEGER NOT NULL DEFAULT 0,
  vote_average   NUMERIC,
  popularity     NUMERIC,
  generos        INTEGER[] NOT NULL DEFAULT '{}',
  keywords       TEXT[] NOT NULL DEFAULT '{}',
  es_clasico     BOOLEAN,
  -- El "OR complejidad IS NULL" es técnicamente redundante (un CHECK ya deja
  -- pasar NULL solo, por cómo Postgres evalúa "NULL IN (...)"), pero lo dejo
  -- explícito para que la intención quede clara a simple vista.
  complejidad    TEXT CHECK (complejidad IN ('relajar', 'pensar') OR complejidad IS NULL),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tmdb_id, tipo)
);

-- Nota sobre "tipo": acá solo distinguimos pelicula/tv (los dos media types
-- reales de TMDb). El split miniserie/serie de la sección 11 del Definitivo
-- depende de status + number_of_seasons, que esta tabla no guarda (está
-- pensada para agregados y flags de scoring, no para el detalle completo de
-- cada título) — se resuelve en la capa de búsqueda/ficha, en una milestone
-- futura.

-- Caching del detalle de TMDb (v2). El detalle de un título (duración,
-- temporadas, episodios, estado, certificaciones, plataformas, país,
-- poster) no entra en las columnas de arriba, que están pensadas para
-- agregados y scoring: va como JSONB, tal como anticipa la sección 2 del
-- Definitivo ("soporte de JSONB para cachear respuestas crudas de TMDb sin
-- romper el esquema relacional"). Sin esto, cada búsqueda le vuelve a
-- pedir a TMDb el detalle de cada uno de sus candidatos.
--
-- Van como ALTER y no dentro del CREATE TABLE para que "npm run migrate"
-- también actualice una base que ya existe, no solo una vacía.
ALTER TABLE titulos ADD COLUMN IF NOT EXISTS detalle JSONB;
ALTER TABLE titulos ADD COLUMN IF NOT EXISTS detalle_actualizado_en TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_titulos_anio ON titulos (anio);
CREATE INDEX IF NOT EXISTS idx_titulos_generos ON titulos USING GIN (generos);
CREATE INDEX IF NOT EXISTS idx_titulos_keywords ON titulos USING GIN (keywords);

-- Tabla de una sola fila (id fijo = 1): C y los tres máximos del catálogo
-- que usan las fórmulas de Puntuación, Popularidad y Clásicos.
CREATE TABLE IF NOT EXISTS agregados_catalogo (
  id                          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  c                           NUMERIC,
  popularity_max              NUMERIC,
  votos_totales_max           INTEGER,
  votos_totales_max_clasicos  INTEGER,
  calculado_en                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Espejo del catálogo de series de TVMaze (v2). TVMaze publica su índice
-- completo paginado, así que en vez de consultarle un título por vez (y
-- chocar con su límite de ~20 llamadas cada 10 segundos en cada búsqueda),
-- se importa entero una vez con "npm run seed-tvmaze" y las búsquedas
-- consultan esta tabla. Medido: 48.011 filas y ~8 MB, en 10 minutos de
-- importación. (TVMaze tiene ~89.000 shows, pero casi la mitad no trae
-- IMDb ID y sin ese puente no se pueden cruzar con nuestros títulos, así
-- que no se guardan.)
--
-- Lo único que aporta de verdad es `duracion_episodio`: TMDb devuelve la
-- cantidad de episodios pero su `episode_run_time` viene vacío en buena
-- parte del catálogo, así que sin esto no hay forma de saber cuánto lleva
-- ver una serie entera. El resto de los campos se guardan porque vienen en
-- la misma respuesta y sirven para verificar el cruce.
--
-- Los géneros de TVMaze NO se guardan a propósito: la app usa los de TMDb
-- en todos lados (son IDs numéricos, con su propia tabla de equivalencias),
-- así que serían una segunda taxonomía sin consumidor.
CREATE TABLE IF NOT EXISTS series_tvmaze (
  tvmaze_id          INTEGER PRIMARY KEY,
  imdb_id            TEXT,
  nombre             TEXT,
  estado             TEXT,
  duracion_episodio  INTEGER,
  tipo               TEXT,
  anio_inicio        INTEGER,
  anio_fin           INTEGER,
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El cruce con nuestros títulos es por imdb_id, no por la clave primaria:
-- sin este índice, cada búsqueda haría un scan de 90.000 filas.
CREATE INDEX IF NOT EXISTS idx_series_tvmaze_imdb ON series_tvmaze (imdb_id);

-- ---------------------------------------------------------------------------
-- Autenticación (v3, milestone 18)
--
-- Estas cuatro tablas y sus índices los define Better Auth, no nosotros: se
-- generaron con "npx @better-auth/cli generate" a partir de src/auth/auth.js
-- y se pegaron acá para que sigan corriendo con el mismo "npm run migrate"
-- que el resto. Meter un segundo sistema de migraciones en paralelo sería la
-- clase de complejidad que el proyecto viene evitando.
--
-- Si alguna vez se cambia la configuración de auth.js (se agrega un campo al
-- usuario, o un plugin), hay que volver a generar y actualizar esto a mano.
-- Ojo: los identificadores van entre comillas dobles porque Better Auth los
-- escribe en camelCase, y sin comillas Postgres los pasaría a minúsculas.
--
-- El "password" de la tabla account guarda un hash, nunca la contraseña.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "user" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "name"            TEXT NOT NULL,
  "email"           TEXT NOT NULL UNIQUE,
  "emailVerified"   BOOLEAN NOT NULL,
  "image"           TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Campo propio (no de Better Auth): la sección 17 del Definitivo aplica el
  -- límite de edad automáticamente según la edad del perfil. También es lo
  -- que verifica la edad mínima de 13 años para tener cuenta, que se aplica
  -- en el servidor (src/auth/validaciones.js).
  "fechaNacimiento" TIMESTAMPTZ NOT NULL,
  -- Campos propios: aceptación de los Términos y Condiciones.
  --
  -- El booleano solo va a valer TRUE en las cuentas creadas desde que existe
  -- la verificación (sin aceptar no hay alta). El DEFAULT FALSE es para las
  -- cuentas anteriores, y es la respuesta correcta para ellas: se crearon
  -- cuando el documento no existía, así que efectivamente no lo aceptaron.
  --
  -- La fecha es la que sirve de verdad: comparada contra la última
  -- actualización de los Términos dice si esa persona aceptó la versión
  -- vigente o una anterior, sin tener que guardar una copia del documento
  -- por usuario.
  "aceptoTerminos"      BOOLEAN NOT NULL DEFAULT FALSE,
  "terminosAceptadosEn" TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "token"     TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId"    TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                    TEXT NOT NULL PRIMARY KEY,
  "issuer"                TEXT NOT NULL,
  "accountId"             TEXT NOT NULL,
  "providerId"            TEXT NOT NULL,
  "userId"                TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope"                 TEXT,
  "password"              TEXT,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- El "issuer" de arriba lo pide el runtime de Better Auth pero su propio
-- generador de esquema (npx @better-auth/cli generate, versión 1.7.1) lo
-- omite: sin esta columna, el registro falla con 'column "issuer" of
-- relation "account" does not exist'. Este ALTER es para las bases que
-- alcanzaron a crearse con el esquema incompleto; en una base nueva la
-- columna ya viene del CREATE de arriba y esto no hace nada.
--
-- Moraleja para la próxima vez que se toque auth.js: no confiar en el
-- generador. La fuente autoritativa es getAuthTables(auth.options), que
-- devuelve las tablas que el runtime realmente va a usar. El script
-- "npm run verificar-auth" compara esa definición contra las columnas
-- reales de la base y avisa si se desincronizaron.
ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" TEXT;

-- Mismo caso que el ALTER de arriba, para las bases que ya existían antes de
-- que hubiera Términos y Condiciones. En una base nueva las columnas ya
-- vienen del CREATE TABLE y estos dos ALTER no hacen nada.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "aceptoTerminos" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "terminosAceptadosEn" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

-- ---------------------------------------------------------------------------
-- Listas y plataformas del usuario (v3, milestone 19; sección 18 del
-- Definitivo).
--
-- Una sola tabla para las tres listas, con el nombre de la lista como
-- columna, en vez de tres tablas iguales. Las tres tienen exactamente la
-- misma forma y las consultas que importan las cruzan entre sí ("los de Ver
-- más tarde que además están en Visto", "las últimas 15 de Favoritas y las
-- últimas 10 de Visto"), que con tres tablas serían uniones y acá son un
-- WHERE.
--
-- No se guarda ni el título ni el póster: eso se resuelve en el momento con
-- el caché de detalle de la milestone 15, igual que en las búsquedas. Un
-- snapshot acá quedaría viejo y sería un segundo lugar donde vive el mismo
-- dato.
--
-- El ON DELETE CASCADE no es decorativo: es lo que hace que el botón de
-- borrar cuenta de la milestone 18 se lleve de verdad todos los datos, tal
-- como promete la página de Privacidad.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS items_lista (
  usuario_id  TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  lista       TEXT NOT NULL CHECK (lista IN ('favoritas', 'visto', 'ver_mas_tarde')),
  tmdb_id     INTEGER NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('pelicula', 'tv')),
  agregado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, lista, tmdb_id, tipo)
);

-- El orden por agregado_en descendente no es un detalle de presentación: la
-- fórmula de "gustos resultantes" (sección 16) usa las últimas M=15 de
-- Favoritas y las últimas N=10 de Visto, así que es la consulta caliente de
-- la milestone 21.
CREATE INDEX IF NOT EXISTS idx_items_lista_usuario
  ON items_lista (usuario_id, lista, agregado_en DESC);

CREATE TABLE IF NOT EXISTS plataformas_usuario (
  usuario_id   TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  proveedor_id INTEGER NOT NULL,
  agregado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, proveedor_id)
);

-- ---------------------------------------------------------------------------
-- Gustos Registrados (v3, milestone 20; sección 19 del Definitivo).
--
-- Una fila por usuario, con los tres campos y nada más. El Definitivo es
-- explícito en que NO se guarda una lista de títulos precalculada a partir
-- de estos gustos: se ejecuta un /discover en vivo en cada búsqueda. Es más
-- barato en espacio (tres campos livianos por usuario en vez de listas que
-- crecen), mantiene la misma arquitectura "calculado en vivo" que el bloque
-- hermano de Favoritas/Visto, y evita depender de jobs periódicos, que son
-- poco viables en hosting gratuito.
--
-- Las tres columnas guardan exactamente las formas que el motor ya entiende,
-- para que la milestone 21 pueda pasarlas tal cual a `preferencias` sin
-- traducir nada:
--   generos -> preferencias.generos (IDs numéricos de TMDb)
--   tipos   -> preferencias.tipo    ('pelicula' | 'miniserie' | 'serie')
--   anios   -> preferencias.anio    (lista de tramos { exacto } o
--                                    { desde, hasta }, que es lo que
--                                    normalizarTramosAnio ya sabe leer)
--
-- El tope de 5 géneros de la sección 19 se valida en la ruta, no acá: un
-- CHECK sobre el largo del array daría un error de Postgres en vez de un
-- mensaje que el usuario pueda entender.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gustos_usuario (
  usuario_id     TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  generos        INTEGER[] NOT NULL DEFAULT '{}',
  tipos          TEXT[] NOT NULL DEFAULT '{}',
  anios          JSONB NOT NULL DEFAULT '[]',
  clasicos       BOOLEAN NOT NULL DEFAULT false,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mismo caso que los ALTER de arriba: para las bases que ya existían antes de
-- que "Clásicos" fuera un campo de Gustos Registrados. Va aparte de
-- `generos` (que es INTEGER[]) porque 'CLASICOS' es un valor sintético, no
-- un ID de TMDb (ver 4.2 y 4.9).
ALTER TABLE gustos_usuario ADD COLUMN IF NOT EXISTS clasicos BOOLEAN NOT NULL DEFAULT false;
