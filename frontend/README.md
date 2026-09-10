# Pochoclo | frontend

Aplicación en React 19 con Vite y Tailwind CSS 4, más un poco de Cloudflare Functions que corren en el borde.

La visión general del proyecto está en el README de la raíz, y las decisiones de ingeniería con sus mediciones en `DECISIONES.md`.

## Setup

Necesita el backend andando (ver `../backend/README.md`).

```bash
npm install
cp .env.example .env     # VITE_API_URL=http://localhost:3000
npm run dev              # http://localhost:5173
```

`npm run build` y `npm run preview` construyen y sirven la versión de producción en el 4173. Conviene probar ahí lo que dependa del build, ya que el complemento que saca los comentarios de la salida y la política de seguridad de contenido solo existen en el build.

## Variables de entorno

| Variable       | Cuándo se lee                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL` | Al compilar. Se hornea en el paquete, y también alimenta la CSP. Si falta, el build corta a propósito, ya que sin ese corte, el sitio se publicaba apuntando a localhost sin que nada avisara               |
| `API_URL`      | En cada pedido, y solo desde las Cloudflare Functions. Es distinta de la anterior. Si falta, las funciones quedan sin efecto en silencio, y las fichas compartidas muestran la tarjeta genérica de la marca |

## Estructura

```
src/
  paginas/       una por ruta
  components/    reutilizables, incluidos los efectos visuales
  utils/         espejo en cliente de los filtros del backend, caché corta
  auth/          cliente de Better Auth, contexto de sesión
  api/           cliente HTTP
  config/        metadatos por pantalla, constantes del sitio
functions/       Cloudflare Functions: metadatos para rastreadores sin JS
public/          fuentes, imágenes, robots.txt, sitemap.xml, _headers
```

## El sistema de diseño

Las clases de botones, paneles, campos, títulos y contenedores viven como `@utility` en `src/index.css`. No se escriben a mano. Antes de existir esa capa había ocho variantes del botón primario y el mismo input copiado literal en seis archivos.

Tres reglas que no son de estilo sino de cómo sale ordenada la cascada, todas verificadas compilando:

1. Ningún `@utility` puede declarar `margin`. Las utilidades de margen de Tailwind salen antes en el CSS final, así que un margen declarado adentro no se podría sobrescribir desde el JSX. Los márgenes de layout van en el JSX.
2. `ring-*` y `shadow-*` de Tailwind borran cualquier `box-shadow` de un `@utility`. Por eso el sistema usa `border` y no `ring`.
3. Una clase mal escrita genera cero CSS y el build pasa limpio, sin ningún error. No hay red de seguridad del compilador. Si un encabezado pierde su clase, se pierde entero y en silencio.

Los `hover:` propios van envueltos a mano en `@media (hover: hover)`. El de Tailwind lo hace solo; un `&:hover` crudo no, y en pantalla táctil el estado queda pegado después del tap.

## Auditorías

Necesitan Chrome instalado y `npm install --no-save puppeteer-core axe-core`. Son de control de calidad, no dependencias del proyecto.

| Script                             | Qué hace                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `auditoria-a11y.mjs`               | axe-core sobre las pantallas, navegando entre ellas                                                                    |
| `auditoria-responsive.mjs`         | Geometría a ocho tamaños, dos apaisados                                                                                |
| `auditoria-responsive-estados.mjs` | Lo mismo, sobre estados interactivos                                                                                   |
| `lector-simulado.mjs`              | La biblioteca. Le pide a Chrome el árbol de accesibilidad por DevTools Protocol y lo transcribe a lo que se escucharía |
| `recorrido-lector*.mjs`            | Tres recorridos sobre esa biblioteca: anónimo, con sesión y móvil                                                      |

Los `recorrido-lector*.mjs` imprimen un transcripto además del veredicto, y esa es la parte que hay que leer. El veredicto dice si el rol y el estado están, y el transcripto dice si la frase se entiende al escucharla.

`auditoria-a11y.mjs` está desactualizado: da por hecho que crear una cuenta navega a otra pantalla, y desde que la verificación de correo es obligatoria el alta termina en una pantalla de “revisá tu correo”. Las pantallas anónimas se auditan bien, pero las que necesitan sesión, no. Está sin arreglar.

## Dos cosas que se ven arbitrarias y no lo son

`overflow-x-clip` en el contenedor raíz. El fondo de rayos del inicio va a sangre completa con `w-screen`, y `100vw` incluye el ancho de la barra de desplazamiento, así que sin eso aparece una barra horizontal en toda pantalla con scroll. Va `clip` y no `hidden` ya que `hidden` crea un scrollport y rompe el `sticky` del encabezado.

Toda región viva usa `components/RegionViva.jsx`, nunca un `<p role="alert">` suelto. Un lector de pantalla no lee el contenido inicial de una región viva, lee sus cambios, así que el patrón natural de React (`{error && <p role="alert">{error}</p>}`) monta el elemento y su texto a la vez y no se anuncia nada. `RegionViva` monta el elemento vacío y pone el texto 100 ms después. Eran 32 de las 41 regiones del proyecto, y ni axe-core ni NVDA lo marcan. NVDA sobre Chrome lo perdona, VoiceOver en iOS no.
