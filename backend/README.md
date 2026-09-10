# Pochoclo | backend

API en Node.js + Express sobre PostgreSQL. Resuelve las búsquedas en vivo contra TMDb, guarda las cuentas y las listas, y cachea el detalle de cada título ya consultado.

La visión general del proyecto está en el README de la raíz, y las decisiones de ingeniería con sus mediciones en `DECISIONES.md`.

## Setup

Requiere Node 18 o superior, una base PostgreSQL (sirve el plan gratuito de [Neon](https://neon.tech/)) y un token de lectura de la [API de TMDb](https://www.themoviedb.org/settings/api).

```bash
npm install
cp .env.example .env     # completar DATABASE_URL y TMDB_API_TOKEN
npm run migrate          # crea el esquema
npm run seed             # ~2000 títulos de arranque
npm run recalcular       # agregados del catálogo
npm run dev              # http://localhost:3000
```

`npm run seed-tvmaze` es opcional y tarda unos diez minutos. Espeja el catálogo de TVMaze (unas 48.000 filas, 8 MB) para poder responder por duración total de una serie. Sin él, ese filtro simplemente no tiene datos.

## Variables de entorno

Solo las dos primeras son obligatorias para levantar el servidor.

| Variable                          | Para qué                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                    | Cadena de conexión de PostgreSQL                                                                                                                                                              |
| `TMDB_API_TOKEN`                  | Token de lectura de la API de TMDb                                                                                                                                                            |
| `PORT`                            | Puerto del servidor (3000 por omisión)                                                                                                                                                        |
| `BETTER_AUTH_SECRET`              | Clave de 32 bytes para firmar las sesiones                                                                                                                                                    |
| `BETTER_AUTH_URL`                 | URL pública de esta API. Obligatoria: sin ella el proceso no arranca, porque de ella dependen si la cookie de sesión sale con “Secure” y si los enlaces de recuperación se imprimen en el log |
| `URL_FRONTEND`                    | Lista separada por comas de orígenes permitidos (CORS)                                                                                                                                        |
| `PROXIES_CONFIABLES`              | Cuántos proxies hay adelante. Con 0 en producción, el límite de intentos de login queda como un solo balde compartido por todos                                                               |
| `SMTP_*`, `CORREO_*`              | Envío de correo. Sin configurar, los envíos se saltean sin fallar                                                                                                                             |
| `EXIGIR_CORREO_VERIFICADO`        | En producción va en `true`. Apagarla reabre la enumeración de cuentas, así que el arranque lo exige explícitamente con `PERMITIR_ENUMERACION_DE_CUENTAS`                                      |
| `HSTS_*`                          | Cabecera HSTS, apagada por omisión                                                                                                                                                            |
| `VERIFICAR_CONTRASENAS_FILTRADAS` | Consulta a Have I Been Pwned con k-anonimato al elegir contraseña. Falla abierta                                                                                                              |

## Scripts

| Comando                       | Para qué                                                          |
| ----------------------------- | ----------------------------------------------------------------- |
| `npm run dev`                 | Servidor con recarga                                              |
| `npm run migrate`             | Crea o actualiza el esquema                                       |
| `npm run seed`                | Carga los títulos de arranque                                     |
| `npm run seed-tvmaze`         | Espeja el catálogo de TVMaze                                      |
| `npm run recalcular`          | Recalcula los agregados del catálogo (ver abajo)                  |
| `npm run probar`              | Comprueba las fórmulas de puntuación y clasificación              |
| `npm run verificar-auth`      | Compara el esquema que Better Auth espera con las columnas reales |
| `npm run respaldo`            | Respaldo de los datos de usuario                                  |
| `npm run respaldo-simulacro`  | Respalda, borra todo, restaura y vuelve a iniciar sesión          |
| `npm run precalentar`         | Calienta el caché de los puntos de entrada fijos                  |
| `npm run mantenimiento`       | Orquesta respaldo, precalentado, latido de correo y recálculo     |
| `npm run vigilancia`          | Trece chequeos de salud, con aviso por correo                     |
| `npm run cuentas-de-prueba`   | Borra las cuentas que crean las auditorías                        |
| `npm run terminos-pendientes` | Lista quién tiene la aceptación de términos atrasada              |

## Estructura

```
src/
  buscador/      motor de búsqueda y armado de candidatos
  opciones/      los cinco flujos, "parecido a", prioridades, cruce de tipos
  logic/         puntuación, clasificación, complejidad, límite de edad
  data/          géneros, keywords, estados de ánimo, certificaciones
  services/      clientes de TMDb y TVMaze
  repositories/  acceso a PostgreSQL
  auth/          Better Auth, validaciones, correo
  routes/        las rutas HTTP
  scripts/       mantenimiento, respaldos, vigilancia, calibración
  jobs/          recálculo de agregados
```

## Dos cosas que conviene saber antes de tocar nada

Los agregados del catálogo se recalculan, no se acumulan. “C” (la constante bayesiana de la fórmula de puntuación) y los tres máximos salen de muestrear TMDb, no de las filas locales. La tabla local es un caché de detalle y crece de forma orgánica. La app busca sobre el catálogo entero de TMDb en vivo, no sobre las filas que tenga guardadas.

Al cambiar lo que se pide o lo que se guarda del detalle, hay que invalidar el caché, o se siguen sirviendo detalles viejos sin el campo nuevo:

```sql
UPDATE titulos SET detalle_actualizado_en = NULL;
```

## Avisos de consola esperables

- `sslmode` ignorado. `config/db.js` lo saca de la cadena a propósito y decide el SSL en JavaScript, verificando el certificado. Es deliberado.
- Sin SMTP configurado, los envíos se saltean y se registran en consola. Es el estado normal en desarrollo.
- Algún candidato descartado durante una búsqueda. TMDb falló el detalle de ese título y se sigue sin él, en vez de frenar la búsqueda entera.
