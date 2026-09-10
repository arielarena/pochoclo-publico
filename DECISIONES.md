# Decisiones de ingeniería

Diecinueve casos del desarrollo de Pochoclo, con lo que se midió y lo que se decidió. Están los que salieron bien y también los que se implementaron, se midieron y se tiraron.

Es importante remarcar que casi ninguno se resolvió con la primera intuición, y que varios de los errores más caros eran código que funcionaba perfecto.

Sobre cómo se construyó el proyecto, ver la sección correspondiente del README.

---

## Rendimiento

### 1. El primer peor caso, que pasó de 86 segundos a 3

TMDb no sabe pedir “Argentina o México” en una sola llamada, así que una búsqueda por varios países arma una consulta por cada combinación de país, tipo y tramo de año. El peor caso documentado, cinco países y cuatro décadas, tardaba 86,5 segundos.

Las causas eran:

1. Consultas en serie: Ochenta llamadas una detrás de la otra, que resultaban en 19,5 segundos de puro esperar. Las mismas ochenta en paralelo tardan 2,9.
2. Detalle de todos los candidatos: Esas ochenta consultas juntaban 1530 títulos y se pedían 1530 detalles, que era lo que conformaba el tiempo restante.

Con un pool de concurrencia y un tope de 200 candidatos por lote quedó en 3,2 segundos. Una búsqueda normal, de una o dos consultas, no toca ninguno de los dos límites y devuelve exactamente lo mismo que antes.

`backend/src/buscador/motorBusqueda.js`, `backend/src/utils/concurrencia.js`

### 2. El tope de candidatos se reparte por turnos, y esa decisión no es un detalle

Con el tope de 200, la pregunta es cuáles 200. Lo intuitivo es “los 200 más populares del montón”, y está mal. El país con el cine más visto se come el cupo entero y los demás no aportan un solo título, aunque el usuario los haya pedido a todos por igual, que es lo que significa un OR.

El reparto es por turnos entre consultas, haciendo que sea el primer candidato de cada una, después el segundo, y así. Verificado: en la búsqueda de cinco países el reparto queda 41/41/41/41/40, y por década 51/50/50/49.

La misma aritmética decide cosas que parecen no tener relación. Cuando una categoría se busca con varias palabras clave, cada una va en su propia consulta en vez de todas juntas. Metidas en una sola, TMDb devuelve la unión ordenada por popularidad y la palabra clave más grande (con 1119 títulos asociados) se come el cupo de la más chica (con 8 títulos asociados). Con el reparto, entran las dos.

`repartirEntreEspecificaciones` en `backend/src/buscador/motorBusqueda.js`

### 3. Los nuevos peores casos

Probé armar una búsqueda compleja pero realista. Tardó más de 20 segundos a ojo. La búsqueda consistió de dos tipos, cuatro plataformas, nueve géneros, cinco países, tres décadas y dos años sueltos, todo elegido de las listas del propio formulario. Capaz un usuario promedio no realiza esta búsqueda tan compleja, pero alguien la iba a hacer tarde o temprano.

Medido: 1335 consultas a TMDb y 34 segundos. De esas 1335, solo 238 devolvieron algún candidato y 183 aportaron alguno al resultado final.

La causa no era un bug, era la aritmética del punto anterior. Con más consultas que cupo de candidatos, la primera vuelta del reparto ya lo llena y de todas las demás no se conserva ni un título. O sea que pedir más consultas que el tope de candidatos no trae más resultados, solo más espera. Ese es el techo del que sale el límite.

Quedó en 300 consultas y 6,5 segundos, con los mismos 200 resultados. El recorte también va por turnos, ya que cortar la lista plana habría dejado la búsqueda entera dentro de los primeros países y sin una sola consulta de los últimos.

Buscando ocurrencias similares, se encontró que combinar con gustos guardados, la situación empeora bastante

|                                        | Consultas | Tiempo |
| -------------------------------------- | --------- | ------ |
| Cinco países y cuatro décadas (caso 1) | 40        | 86,5 s |
| La búsqueda que probé                  | 1335      | 34 s   |
| Gustos guardados                       | 8670      | 134 s  |

Los gustos registrados ayudan con la búsqueda personalizada, y su bucle recorre tipos por años por géneros por palabras clave. Los géneros tenían tope de cinco. En cambio los años no tenían ninguno.

Es el peor de los tres. Es 6,5 veces más caro en consultas, se llega desde el propio formulario, eligiendo de sus listas, sin pedir nada raro, y queda guardado. Una búsqueda ancha se paga una vez. Unos gustos anchos se vuelven a pagar en cada búsqueda de esa persona, para siempre.

Quedó en 6,2 segundos, y con 200 resultados en vez de 198. Un perfil normal (dos géneros, dos décadas) no se movió, sigue en 58 consultas y las mismas respuestas.

Los arreglos consistieron en poner topes. El recorte se movió adentro del punto común por el que pasan los tres generadores y deduce los grupos de la propia consulta en vez de pedírselos a quien llama. Un generador nuevo hereda la protección sin hacer nada.

### 4. 600 consultas a la base convertidas en una

Guardar un lote de 200 títulos eran tres consultas por título, o sea 600 idas y vueltas a una base que está en otro país. Tardando 50 ms cada una, serían cerca de 4 segundos, casi enteramente latencia de red.

Hoy es un solo INSERT que recibe el lote entero como JSON y lo expande del lado del servidor con `jsonb_to_recordset`. Medido contra 200 filas reales: 200 ms.

`guardarLote` en `backend/src/repositories/titulos.js`

### 5. Dónde se degrada la API, medido en vez de supuesto

Subir la concurrencia hasta el límite de pedidos parece gratis hasta que deja de serlo. Medido con pedidos reales, no con una llamada liviana de prueba:

| Concurrencia | Mediana | p99     | Resultado                                 |
| ------------ | ------- | ------- | ----------------------------------------- |
| 80           | 823 ms  | 1414 ms | Limpio, cero errores 429                  |
| 100          | 2301 ms | 3833 ms | Sin errores, pero casi el triple de lento |
| 150          | 3148 ms | 3944 ms | 10 de 150 con error 429                   |

Con 200 candidatos, 80 de concurrencia son 2,5 tandas a 823 ms, unos 2,1 segundos. Con 100 son 2 tandas pero a 2301 ms cada una, unos 4,6 segundos, o sea más lento porque la degradación se lleva el ahorro de tener menos tandas.

Entre 80 y 100 hay un quiebre real del lado de la API, no del nuestro. Quedó en 80 y la conclusión quedó escrita para no volver a intentarlo sin una razón nueva.

---

## Calidad de las recomendaciones

### 6. La constante bayesiana estaba inflada, y favorecía a los títulos incorrectos

La puntuación usa una media bayesiana, que necesita “C”, el promedio del catálogo. C se calculaba sobre las filas locales, que son las que la app fue viendo, o sea una muestra sesgada hacia lo popular. Daba 7,22. Hay que tener en cuenta que esto existe para evitar que títulos con 15 votos por ejemplo, donde fue un grupo de 10 amigos a votar y darle un 1,0 o en contraparte un 10, no ensucie lo que podría ser la puntuación real del título.

El valor real es cercano a 6,2. Verificado sin muestreo: el año 1935 completo son 219 títulos con media exacta 6,217, mientras que su primera página sola da 6,650.

Como C es el ancla, un valor inflado favorece a los títulos con pocos votos:

| Votos | Nota real | Antes | Corregido |
| ----- | --------- | ----- | --------- |
| 10    | 8,0       | 7,4   | 6,6       |
| 100   | 8,0       | 7,8   | 7,6       |
| 2.000 | 8,0       | 8,0   | 8,0       |

Ahora se estima muestreando la API por año, con páginas al azar y no las primeras (las primeras son los más populares de ese año, que es justo el sesgo que se venía a corregir), ponderando por la cantidad real de títulos de cada año. Tres corridas seguidas dan 6,190, 6,229 y 6,208.

`backend/src/jobs/recalcularAgregados.js`

### 7. Dos taxonomías de género que no son intercambiables, y el fallo no avisa

TMDb tiene dos listas de género: 19 para películas, 16 para series, y comparten solo 8. Mandarle a la búsqueda de series un identificador que solo existe para películas no da error, lo ignora en silencio.

El proyecto tenía una sola lista mezclada. Consecuencias, todas medidas:

- “Serie de acción” devolvía TODAS las series, ya que el filtro de género se ignoraba entero.
- Seis de los once botones de estado de ánimo eran solo de películas, sin que nada lo indicara.
- Las exclusiones de género excluían cosas que no correspondían, porque se calculaban contra el diccionario equivocado.

Este fallo se repitió varias veces. Es un valor que se ignora, no falla, y todo sigue andando mal. Hoy hay una función que traduce entre taxonomías y descarta lo que no tiene equivalente, y quien la llama tiene que mirar si quedó vacía, ya que un filtro de género vacío no es “sin filtro”, es “traer todo”.

`backend/src/data/genres.js`

### 8. “Marco Terror y Serie, y se me deselecciona Terror”

Esto lo probé simulando ser un usuario casual. Terror no existe como género de series en TMDb, así que el formulario lo deseleccionaba. Que se deseleccione es peor que no encontrar nada, ya que pedís algo razonable, la app te lo saca, y no te deja ninguna alternativa.

El segundo caso, más silencioso y relacionado con el caso anterior, es que elegir Terror sin fijar el tipo devolvía 40 películas y ninguna serie, otra vez sin decir nada.

El botón “quiero asustarme” traía series de terror desde siempre, gracias a una rama de keywords en vez de género. Faltaba enchufar ese mecanismo al campo de género. Cinco géneros ahora traen esta cantidad de series:

| Género   | Antes | Ahora |
| -------- | ----- | ----- |
| Terror   | 0     | 120   |
| Thriller | 0     | 116   |
| Historia | 0     | 136   |
| Romance  | 0     | 171   |
| Música   | 0     | 77    |

El tema es que una serie de terror recreada así no lleva el género Terror, así que todo lo que filtre por género la descartaba igual. Eran tres lugares distintos y los tres estaban rotos. Se tapa con un campo aparte que dice qué géneros cumple una serie sin que TMDb se los asigne, deducido del propio título y no de cómo se llegó a él.

Se decidió no agregarlos al campo de géneros real, que sería más corto y haría andar todo sin tocar nada más. Es declarar un dato que la fuente no tiene, saldría en la ficha como si fuera cierto, y el clasificador de complejidad lo tomaría en silencio.

### 9. Las keywords que suenan perfectas son las peores

TMDb etiqueta por lo que aparece en el contenido, no por lo que la título realmente es. Medidas contra el catálogo, las candidatas más obvias:

| Keyword                  | Qué encabeza                      |
| ------------------------ | --------------------------------- |
| christmas (1822 títulos) | Harry Potter                      |
| ghost (662 títulos)      | Harry Potter, otra vez            |
| wedding                  | Star Wars Episodio II, Armageddon |
| supernatural             | Encanto                           |

Las que quedaron nombran la experiencia y no el decorado: “slasher” y “possession” en vez de “monster” y “demon”, o “grief” y “tearjerker” en vez de “orphan”.

El caso más instructivo se repitió cinco veces seguidas al recrear los géneros del punto anterior. La keyword que se llama igual que el género es la que ensucia. “romance” ordenada por votos encabeza con Better Call Saul y una serie infantil, y sacándola y dejando “first love”, “love triangle” y “soulmates”, la lista queda limpia.

Un caso especial es que en una búsqueda que cruza género y palabra clave, las ruidosas dejan de serlo. “loss of loved one” sola encabeza con tres Spider Man, y por eso mismo, cruzada con Drama, aporta alcance sin traer nada de eso.

`backend/src/data/keywords.js`, `backend/src/data/estadosAnimo.js`

### 10. “El Eternauta” se mostraba como “The Eternaut”

TMDb tiene un tema y es que si no existe traducción al idioma exacto que se pide, no cae a otro parecido, devuelve el original. Pedir todo en español de España producía dos problemas distintos:

- Títulos en otro alfabeto: Una película con póster y 53 votos llegaba con su nombre en malayalam. Eran 227 de 6404 títulos.
- El español equivocado: Marley y Yo llegaba como “Una pareja de tres”, e Intensa-Mente como “Del revés”.

Se resolvió con una cadena explícita con el siguiente orden: español latinoamericano, español de España, cualquier otro español, inglés, lo que haya. El título original le gana al de España cuando el original es español o inglés, que es lo que arregla El Eternauta. Cuando el idioma original ya es español, TMDb deja las traducciones al español vacías, así que la cadena seguía de largo hasta el inglés.

La cadena se recorre campo por campo, no traducción por traducción. Una traducción puede existir con el campo vacío, como es el caso de Juego de Tronos, que tiene la mexicana con el nombre vacío y una sinopsis de 270 caracteres, y la española con el nombre completo. Eligiendo “la mejor traducción” y usándola entera, la serie se quedaba sin título.

Con el póster pasa lo mismo. No es un dato del título, es la imagen que la fuente elige para el idioma pedido. Arreglar el texto sin la imagen deja la ficha contradiciéndose sola, con el título en un idioma y el póster en otro. Para la película “Las Ventajas de Ser Invisible” se mostraba con ese nombre sobre un póster que decía “Las ventajas de ser un marginado”.

`textoTraducido` y `elegirPoster` en `backend/src/services/tmdb.js`

---

## Lo que se midió y se decidió no hacer

### 11. La lista de control estaba mal planteada, no la implementación

Contra una lista de 18 “clásicos” literalmente (Casablanca, Ciudadano Kane, Psicosis, Los Siete Samuráis), la categoría “Ver clásicos” no contenía ni uno. Los que había eran taquilleros del 70 al 99: El Padrino, Volver al Futuro, Toy Story, Matrix.

Se midieron dos formas de arreglarlo y las dos funcionaban:

|                   | Títulos | Del canon |
| ----------------- | ------- | --------- |
| Umbral vigente    | 23      | 0 de 18   |
| Umbral más bajo   | 192     | 16 de 18  |
| Umbral por década | 47      | Casi todo |

Decidí no hacerlo ya que la persona que selecciona “Ver clásicos” no quiere una película de 1927, quiere algo taquillero con unos años encima. Forzar la entrada de cine viejo y poco conocido empeora el botón aunque mejore la métrica.

O sea que la lista de control estaba mal planteada. La pregunta no era “¿están los clásicos clásicos?” sino “¿está lo que alguien llamaría clásico sin ser cinéfilo?”, y con esa vara los 23 pasaban.

Más adelante decidí bajar el umbral, pero a un punto intermedio que nunca se había probado, y con el criterio de arriba como vara. Pude sumar Terminator, Tiburón, E.T. y Duro de Matar, y siguen sin entrar Casablanca ni Ciudadano Kane.

### 12. Más consultas no es más alcance

A la categoría “acción” se le probó una rama de keywords para subir de 80 a 200 resultados. El control cayó de 5/12 a 2/12. Con 18 consultas en vez de 2, la rama de género pasó de 40 candidatos a 11, y con ella se fueron Mad Max, John Wick y Duro de Matar. Es lo que explica el punto 2, que cada consulta nueva le saca cupo a todas las demás.

### 13. Dos funciones construidas, medidas y borradas

Un selector giratorio adaptado de una biblioteca de efectos, probado en dos pantallas. Con pocas opciones tapa las que están fuera de foco y terminan quedando 2 o 3 visibles de 4, y 1 o 2 de 11. Es una regresión de usabilidad real a cambio de un efecto visual. Se borró y quedó anotado el motivo para no volver a evaluarlo desde cero.

Un modo claro entero, analizado completo antes de escribirlo. Lo que hizo que no se llevara a cabo fue que el dorado de la marca da 1,85:1 de contraste sobre fondo claro, contra los 4,5 que pide el nivel AA de accesibilidad. O sea que en el tema claro dejaba de poder ser el color de los enlaces y del foco, que es donde vive la identidad. La app se queda solo oscura (a menos que en algún momento se rediseñe la paleta, ya que actualmente existen todas las variantes de isotipo, logotipo, imagotipo e imagotipo con eslogan para una versión clara, pero están inutilizadas).

---

## Accesibilidad

### 14. La herramienta automática daba cero y la revisión manual encontró nueve defectos

axe-core sobre 31 pantallas daba cero violaciones. Después, en la misma app con un lector de pantalla real (NVDA) se encontró nueve defectos.

La herramienta solo comprueba que las etiquetas existan, y ninguno de los nueve era una etiqueta faltante:

- Roles que prometen un comportamiento que no está: Un campo declaraba ser un combo desplegable sin teclado ni lista asociada, así que el lector anunciaba “cuadro combinado” y las flechas no hacían nada. Es peor que no poner ningún rol.
- Foco que se pierde: Al quitar del DOM el elemento que lo tenía, el foco vuelve al principio del documento. Sacando un chip de género se escuchaba, sin relación aparente, “Ver clásicos”, que era el primer control después del punto donde se había perdido.
- Cambios que no se anuncian: Los filtros se aplican en el cliente al instante, así que la grilla podía pasar de 80 títulos a 3 en silencio.

Además, 32 de las 41 regiones vivas se montaban junto con su texto. Un lector no lee el contenido inicial de una región viva, lee sus cambios, y para notar un cambio tiene que haber registrado la región antes. El patrón natural de React es exactamente el contrario:

```jsx
{
  error && <p role='alert'>{error}</p>;
}
```

Ahí el elemento y su texto entran juntos, así que para el lector apareció un párrafo, y los párrafos no se anuncian solos. El ARIA está bien escrito, por eso axe da cero, y el lector con el que se auditó lo perdona, mientras que el de iOS no, que es lo que lo hace difícil de ver. Funciona en la única plataforma donde se probó.

Para poder repetir la revisión sin depender de escuchar cada pantalla, se escribieron tres recorridos apoyados en una biblioteca propia que le pide a Chrome, por DevTools Protocol, el mismo árbol de accesibilidad que Chrome le entrega a un lector de pantalla, y lo transcribe a la frase que se diría. Contesta qué se anuncia y en qué orden. No contesta si se entiende al escucharlo, que es justamente lo que sigue necesitando una persona.

`frontend/src/components/RegionViva.jsx`, `frontend/lector-simulado.mjs`

---

## Seguridad

### 15. Una premisa verdadera con una conclusión falsa, escrita en un comentario

Revisando los caminos de edición de cuenta apareció que se podía borrar la cuenta sin escribir la contraseña. Un pedido con el cuerpo vacío contestaba 200 y la fila desaparecía, con nada más que la cookie de sesión.

La causa es que el campo de contraseña es opcional en la biblioteca de autenticación, y sin él cae a un chequeo de frescura de sesión cuyo valor por omisión son 24 horas, y ese valor nunca se había fijado. O sea que cualquier sesión de menos de un día borraba la cuenta y todas sus listas.

La razón por la que no se encontró este problema antes está en el comentario del código, que dice: _“el cliente igual exige la contraseña, así que nadie puede borrar la cuenta de otro con la sesión abierta prestada”_. La premisa era cierta, el formulario sí la manda. La conclusión no se seguía, porque el límite de seguridad es la API, nunca la pantalla. Y el proyecto ya tenía esa misma regla escrita unos párrafos más arriba, sobre las validaciones del registro.

Cuidado además con el arreglo que parece obvio y hace lo contrario: la condición de la biblioteca es `if (!password && freshAge !== 0)`, así que poner la frescura en cero no exige la contraseña, saltea el chequeo entero.

De la misma revisión salió otro caso con la misma forma. Restablecer la contraseña no cerraba las sesiones abiertas, porque esa opción es opt-in y estaba en su valor por omisión. Eso vacía justo el caso para el que existe la recuperación. Alguien que sospecha que otro entró a su cuenta hace exactamente eso, y si la sesión del intruso sobrevive no arregló nada, y encima se queda tranquilo. El proyecto también tenía el argumento escrito del otro lado, ya que al cambiar la contraseña desde el perfil sí se cerraban las demás, con un comentario que explicaba por qué. Faltaba aplicarlo en el camino de al lado, que es donde más falta hace.

Las dos veces el patrón fue el mismo, un razonamiento correcto, escrito, y no aplicado un archivo más allá.

### 16. Un contador que se hace adentro del INSERT

Las listas tienen un tope de mil títulos. Contar antes e insertar después no alcanza, ya que dos pedidos simultáneos cuentan 999 los dos y terminan insertando 1001. El conteo va adentro del propio INSERT, así que son la misma operación.

Por eso también la función dejó de devolver un booleano. Que no se haya insertado nada puede significar “ya estaba” o “no entra más”, que son dos respuestas distintas para la pantalla. Una es un no-op que no hay que explicar y la otra tiene que contestar un error y decir por qué.

`agregarAItem` en `backend/src/repositories/listas.js`

---

## Operación con restricciones

### 17. Espejar un catálogo entero en vez de consultarlo

La fuente de datos secundaria prevista (Trakt) pasó a requerir suscripción paga. La reemplazó TVMaze, con un rol mucho más chico, siendo este nada más que obtener la duración total de las series, que es lo que permite responder “una que pueda terminar en un fin de semana”. La fuente principal da la cantidad de episodios pero su duración viene vacía seguido, en 9 de 24 series medidas.

La decisión de diseño es que se espeja el catálogo entero en la base propia y las búsquedas nunca llaman a esa API. Consultar por título habría movido el límite de peticiones de un problema de la importación a un problema de cada búsqueda, y habría hecho falta un caché negativo, o sea un marcador por cada serie sin coincidencia, para no reconsultarlas eternamente. Con el espejo, “no está en la tabla” ya es la respuesta.

La estimación previa falló en dos de tres números, y por un motivo que vale
recordar:

|                 | Estimado | Real     |
| --------------- | -------- | -------- |
| Duración        | ~3 min   | 10,4 min |
| Filas guardadas | ~90.000  | 48.011   |
| Espacio         | ~17 MB   | 7,9 MB   |

Casi la mitad de las series no tiene el identificador que sirve de puente entre las dos fuentes, así que no se pueden cruzar. La estimación se había hecho mirando la primera página, donde faltaba 1 de 240, pero esa página son los programas más viejos y populares, que están bien curados. La cola larga no.

`backend/src/scripts/seedTvmaze.js`

### 18. Un vigilante adentro de la máquina no puede avisar de su propia muerte

El backend corre en una notebook con Linux, expuesta por un túnel. Un día el sitio estuvo cayéndose por tandas durante casi una hora y se descubrió de casualidad, usándolo.

El monitoreo que salió de ahí son trece chequeos cada quince minutos, y el que justifica todo el diseño es el que pide la dirección pública. Ese día el proceso del servidor y el del túnel estaban los dos vivos, sin ninguna unidad fallida, y lo que se había muerto eran las conexiones del túnel con el borde. Ningún chequeo de estado de servicios puede ver eso. Cuando falla, vuelve a preguntarle al servidor local para poder decir de qué lado está el problema.

Dos reglas lo vuelven útil en vez de ruidoso. La primera es un solo correo por corrida, con todo lo que cambió (si no, una caída de red manda cinco a la vez y la próxima vez nadie los lee), y la segunda es que avisa al empezar el problema y al resolverse, y en el medio se calla (cada quince minutos, repetir el aviso mientras dure son 96 correos por día).

Un chequeo que no se puede ejecutar cuenta como problema, no como “todo bien”. Es la diferencia entre un vigilante y un adorno, si el registro del sistema no se puede leer, el silencio sería indistinguible de la salud.

Si la máquina se queda sin internet, los chequeos públicos fallan y el correo tampoco puede salir, y eso no tiene arreglo desde adentro. Queda registrado, así que al volver la conexión manda un "se resolvió" que deja constancia del corte, pero avisar en el momento es imposible desde ahí adentro, por definición.

Por eso hay una segunda capa, afuera, que son dos monitores gratuitos cada 5 minutos.

| Monitor            | Tipo                                     | Qué agrega                                            |
| ------------------ | ---------------------------------------- | ----------------------------------------------------- |
| `/salud` de la API | Por palabra clave, busca `"estado":"ok"` | Detecta además un 200 cuyo contenido no es el nuestro |
| El sitio           | HTTP                                     | El hosting del frontend puede romperse por su cuenta  |

Que sea por palabra clave y no por código de estado es la misma idea que el chequeo de la dirección pública de más arriba. Un 200 no prueba que conteste lo que tiene que contestar.

Valía la pena comprobar que no le cuesta nada a la base, porque son 288 pedidos por día y si cada uno la despertara, el cómputo no se suspendería nunca y el plan gratuito se acabaría solo. Bueno eso no pasa. `/salud` no consulta nada, y el middleware de sesión que corre antes corta apenas ve que no hay cookie, sin llegar a tocarla.

Las dos capas ven cosas distintas, así que ninguna sobra. Con intervalo de 5 minutos, el monitor externo se pierde casi siempre las caídas cortas, que son las que motivaron todo esto, que duraron aproximadamente 25 segundos. Sirve para la máquina apagada, sin internet, o el túnel caído durante minutos. Los parpadeos cortos los agarra el chequeo de Wi-Fi de la capa interna, que cuenta reasociaciones por hora. Una dice qué pasa y la otra dice que pasa algo.

El simulacro se hace parando el túnel a propósito, que reproduce exactamente el escenario original. El servidor está perfecto y el borde sin poder llegarle. Tienen que llegar cuatro correos: problema y resolución de la capa interna, y caída y recuperación del monitor externo. Y hay que mirar los chequeos que fallan, no solo que falle alguno. El argumento es el mismo que el del latido de correo, un aviso que nunca se dispara y un aviso roto se ven exactamente igual desde afuera.

`backend/src/scripts/vigilancia.js`

`backend/src/scripts/vigilancia.js`

### 19. Un respaldo que nunca se restauró es una suposición

El proveedor de la base guarda 6 horas de historial de recuperación. Alcanza para el error que se nota en el momento y no para el que se nota tarde. Algo que rompe un viernes a la noche y se descubre el lunes ya quedó fuera de la ventana.

Los respaldos propios tapan ese hueco, y solo llevan los datos de las personas. Las tablas de caché y espejos son 17,6 de los 17,7 MB de la base y se regeneran solas con el uso, por lo que meterlas en el respaldo diario lo haría cien veces más pesado para proteger algo que un comando reconstruye.

El orden de las tablas se calcula leyendo las claves foráneas del esquema, no está escrito a mano. Si estuviese escrito a mano, una tabla nueva quedaría afuera en silencio, que es la peor forma de que falle un respaldo.

Hay un simulacro que crea una cuenta con listas y preferencias, respalda, borra todo, restaura, compara la huella de cada tabla, y vuelve a iniciar sesión con esa cuenta, que se encarga de comprobar de que el hash de la contraseña sobrevivió al viaje.

La primera corrida encontró un fallo real, y es la razón de ser del simulacro. El cliente de PostgreSQL convierte un array de JavaScript en un array de Postgres, no en JSON. Para una columna de enteros es lo correcto, pero para la columna JSONB de los tramos de año arruinaba la restauración entera. El archivo se creaba bien y se verificaba bien, por lo que hubiera fallado recién el día que hiciera falta.

`backend/src/scripts/respaldo.js`, `backend/src/scripts/respaldoSimulacro.js`
