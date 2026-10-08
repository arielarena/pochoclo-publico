# Pochoclo | extensión

Extensión de Chrome, en Manifest V3 y sin dependencias. Estando en Netflix, Prime Video, Disney+, HBO Max o Apple TV, muestra un título disponible en esa misma plataforma, con su póster, año, puntuación y tipo, las tres listas, un botón para pedir otro, el enlace a la ficha en pochoclo.ar y la atribución a TMDb. Aparece al apretar el ícono, y la aparición automática se prende por plataforma en las opciones.

Está publicada en la [Chrome Web Store](https://chromewebstore.google.com/detail/llmocniicbbceghmhomohkcgnfndlodf). La visión general del proyecto está en el README de la raíz, y las decisiones de ingeniería con sus mediciones en `DECISIONES.md`.

## Instalación

Desde la [Chrome Web Store](https://chromewebstore.google.com/detail/llmocniicbbceghmhomohkcgnfndlodf), con "Agregar a Chrome". Funciona en Chrome de computadora.

- Para que tenga en cuenta los gustos registrados y deje guardar en las listas, hay que tener la sesión iniciada en [pochoclo.ar](https://pochoclo.ar/) en ese mismo Chrome. Sin sesión recomienda igual.
- Para que el panel aparezca automáticamente al entrar a una plataforma, sin apretar el ícono, se tilda esa plataforma en las opciones de la extensión, y Chrome pide el permiso en ese momento.

## Qué hay acá

| Archivo                                        | Qué hace                                                                                                                                                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                                | Un solo permiso de host fijo, sobre `api.pochoclo.ar`, más `activeTab` y los cinco sitios como permisos opcionales. `externally_connectable` deja que pochoclo.ar, y ninguna otra página, le hable al service worker |
| `service-worker.js`                            | Todo lo que habla con la API, que es el único que puede. También el click en el ícono, el registro de la aparición automática y las dos únicas rutas que acepta del sitio                                            |
| `plataformas.js`                               | El mapeo de dominio a proveedor de TMDb y los patrones de permiso. Lo cargan el panel, el service worker y las opciones                                                                                              |
| `opciones.html`, `opciones.css`, `opciones.js` | La aparición automática por plataforma, si el ícono está fijado en la barra, y el aviso de TMDb                                                                                                                      |
| `panel.js`                                     | El panel, en un shadow root cerrado colgado de `document.body`. Es lo único que corre dentro de la página de la plataforma                                                                                           |
| `iconos/`, `tmdb.svg`                          | El ícono en cuatro tamaños, el mismo dibujo que el favicon del sitio, y el logo oficial de TMDb sin tocar                                                                                                            |
| `pruebas-comun.mjs`                            | Lo que comparten las pruebas con navegador                                                                                                                                                                           |
| `probar-extension.mjs`                         | La extensión tal como se instala: qué permisos tiene, qué guiones registró y qué pasa al entrar a Netflix                                                                                                            |
| `probar-icono.mjs`                             | El click real sobre el ícono, con la extensión tal cual se publica                                                                                                                                                   |
| `probar-plataformas.mjs`                       | El mapeo de dominios, sin navegador. Es el único que prueba los casos negativos                                                                                                                                      |
| `probar-panel.mjs`                             | Dibuja el panel en las cinco plataformas y mide por qué vía cargó el póster                                                                                                                                          |
| `probar-panel-listas.mjs`                      | Los botones de listas y la accesibilidad del panel, y los clicks de verdad con una página que los corta, como hace Netflix                                                                                           |
| `probar-cookie.mjs`, `probar-csp-mundos.mjs`   | Dos mediciones que sostienen el diseño: que la cookie de sesión viaja desde el service worker, y que la CSP de la plataforma no alcanza al panel                                                                     |
| `diagnosticar-panel.mjs`                       | Una sola plataforma, con la consola de la página a la vista                                                                                                                                                          |
| `empaquetar.mjs`                               | Arma el `.zip` para la tienda, solo con lo que va. Corta si aparece en la carpeta un archivo sin clasificar                                                                                                          |

## Cinco cosas que conviene saber antes de tocar nada

1. Instalarla no pide ningún permiso sobre las plataformas. Apretar el ícono corre con `activeTab`, que Chrome concede sobre esa pestaña en ese momento. La aparición automática sí necesita permiso permanente, y se pide desde las opciones. Ahí el permiso es el interruptor, sin ninguna preferencia guardada al lado, así que lo que muestra `chrome://extensions` y lo que muestran las opciones no se pueden contradecir. Por eso `panel.js` no está declarado como content script en el manifest, porque eso obligaría a pedir el permiso al instalar. Lo inyecta el service worker con `chrome.scripting`.

2. Todo lo que habla con la API vive en el service worker. Desde ahí la cookie de sesión de pochoclo.ar viaja sola, y desde el panel no, porque ahí manda el CORS de la plataforma. Eso incluye filtrar las listas. Llega `GET /listas` entero, se resuelve en el service worker y al panel le vuelven tres booleanos, porque el panel corre dentro de la página de un tercero.

3. Al backend le viaja el número de proveedor y nada más. El mapeo de dominio a proveedor vive acá, así que la dirección de la pestaña y lo que la persona estaba mirando no salen del navegador.

4. Lo que la extensión lee del backend es un contrato. Una extensión instalada no se actualiza cuando se despliega el backend. Agregar campos a una respuesta no rompe nada, pero renombrarlos o sacarlos sí. Un cambio incompatible va en una ruta nueva, y la vieja contesta 426, que el service worker muestra como "esta versión quedó vieja" y le pide a Chrome que busque la actualización.

5. Esta carpeta no puede terminar adentro de `frontend/public/`. Todo lo que cae ahí se copia al build y queda servido en el sitio.

## Cargarla desde el código

A mano, en `chrome://extensions`, con el modo de desarrollador prendido y "Cargar descomprimida" apuntando a esta carpeta. Es lo que conviene cuando hace falta una sesión iniciada de verdad. La copia cargada así tiene el mismo ID que la de la tienda, porque lo fija el `key` del manifest, así que las dos no pueden convivir en el mismo perfil de Chrome. Para probar el código teniendo la de la tienda instalada, se usa otro perfil.

Las pruebas automáticas necesitan [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/) y `npm install --no-save puppeteer-core`. Con el Chrome normal no sirven, y sin ningún error. Desde hace varias versiones el canal estable ignora `--load-extension`, así que el navegador abre normal y la extensión simplemente no está.

```bash
# Una vez, en una carpeta de descarte
npx @puppeteer/browsers install chrome@stable --path /tmp/navegadores

cd extension
CHROME=/tmp/navegadores/chrome/<version>/<plataforma>/chrome \
  PERFIL_PRUEBA=/tmp/perfil node probar-extension.mjs

# El mapeo de dominios no necesita navegador
node probar-plataformas.mjs

# Las cinco plataformas
CHROME=... PERFIL_PRUEBA=... node probar-panel.mjs

# Las listas, con las rutas contestadas por el propio script, sin cuenta
CHROME=... PERFIL_PRUEBA=... node probar-panel-listas.mjs --simular

# El ícono, con la extensión tal cual se publica
CHROME=... node probar-icono.mjs
```

## Cosas a tener en cuenta al probar

1. Las pruebas cargan una copia de la extensión con los permisos opcionales ya concedidos. Las dos formas de conseguirlos de verdad, apretar el ícono y contestar el cartel de Chrome, son interfaz del navegador y el protocolo de depuración no las alcanza. Lo único que cambia es de dónde sale el permiso. En la copia la aparición automática arranca prendida, y las pruebas la apagan antes de medir. `probar-extension.mjs` y `probar-icono.mjs` cargan la extensión real.

2. El perfil de prueba se ensucia. Chrome conserva el service worker registrado en la carpeta del perfil, así que después de agregar una ruta puede seguir corriendo la versión anterior. Las rutas viejas andan y las nuevas contestan "The message port closed before a response was received". Se arregla borrando la carpeta del perfil.

3. Ninguna prueba reemplaza una vuelta a mano con sesión en la plataforma. Las pruebas corren en la portada de Netflix sin cuenta, y la parte de Netflix que corta los clicks solo se carga con sesión (caso 20 de `DECISIONES.md`). Y al probar a mano, después de recargar la extensión hay que cerrar y volver a abrir la pestaña de la plataforma, porque si no el panel que aparece solo es el que se dibujó con el código anterior.
