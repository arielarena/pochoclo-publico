/**
 * Datos del sitio que aparecen en más de una página y que conviene poder
 * cambiar en un solo lugar. Antes el correo estaba escrito a mano en tres
 * archivos distintos, que es la forma más fácil de que uno quede viejo.
 */

/**
 * Dominio público del sitio, tal como lo nombran las páginas legales.
 *
 * Está acá y no escrito a mano porque estaba en dos documentos legales con un
 * valor (pochoclo.com) que contradecía al resto del proyecto: el correo de
 * contacto es contacto@pochoclo.ar, el backend se planificó como
 * api.pochoclo.ar, y el dominio pochoclo.ar se compró el 2026-08-27. Un
 * documento legal que nombra un dominio que no es el del sitio identifica
 * mal al responsable, que es justo lo que la Ley 25.326 pide que quede claro.
 */
export const DOMINIO_SITIO = 'pochoclo.ar';

/**
 * Dirección de contacto que se publica en Privacidad, Accesibilidad y
 * Acerca de.
 *
 * Andando y verificada desde el 2026-08-27 (Cloudflare Email Routing,
 * reenviada a una casilla personal). Las páginas legales publican esta
 * dirección como vía de contacto, requisito de la Ley 25.326.
 */
export const EMAIL_CONTACTO = 'contacto@pochoclo.ar';

/**
 * QUÉ PONER, que es una decisión que no puede tomar el código:
 *
 *  - Si el sitio lo opera una persona humana, va su nombre completo. No hace
 *    falta el DNI en la página.
 *  - El domicilio puede ser un domicilio constituido (el estudio de un
 *    abogado, una oficina, una casilla contratada) y no necesariamente el
 *    real. Publicar el domicilio particular es válido pero no obligatorio, y
 *    conviene evitarlo.
 *  - Si en algún momento el proyecto pasa a una sociedad, van la razón social
 *    y el domicilio legal, y hay que rehacer la inscripción ante la AAIP.
 *
 * Con las dos en null las páginas siguen funcionando y muestran solo el
 * correo, que es lo que había antes de completarlas: no se rompía nada, pero
 * el sitio no se podía publicar así. Completadas el 2026-08-27.
 */
export const RESPONSABLE_NOMBRE = 'Ariel Ignacio Arena';

/**
 * El domicilio que se PUBLICA, que no es necesariamente el completo.
 *
 * FORMATO: `Localidad, Provincia de X, República Argentina`. Cuatro reglas,
 * porque acá el formato identifica una jurisdicción y no es cosmético:
 *
 *  - "Provincia de" va escrito completo, sin abreviar.
 *  - **CABA se escribe distinto**: no es una provincia, así que va "Ciudad
 *    Autónoma de Buenos Aires" a secas, sin "Provincia de" y sin repetir
 *    "Buenos Aires". El interior y el conurbano sí llevan "Provincia de
 *    Buenos Aires", y la distinción importa porque son dos jurisdicciones
 *    judiciales distintas.
 *  - El país va incluido: el documento declara transferencias
 *    internacionales y ley argentina, así que identifica al responsable
 *    frente a quien lo lea desde afuera.
 *  - Sin código postal. No agrega nada sin la calle y en localidades chicas
 *    acerca demasiado al domicilio particular.
 */
export const RESPONSABLE_DOMICILIO =
  'Haedo, Partido de Morón, Provincia de Buenos Aires, República Argentina';

/**
 * ¿El domicilio de arriba es parcial (solo localidad y provincia)?
 *
 * DE DÓNDE SALE ESTA DECISIÓN (2026-08-27): el artículo 6 inciso b de la Ley
 * 25.326 pide "domicilio", y se entiende como uno determinado, o sea con
 * calle y número. Publicar solo la localidad **está por debajo de esa letra**
 * y hay que saberlo: no es un cumplimiento pleno, es un riesgo asumido a
 * conciencia mientras el proyecto no tenga ingresos.
 *
 * La alternativa era publicar el domicilio particular, y se descartó por tres
 * motivos: es irreversible (una página indexada queda en cachés y archivos
 * aunque después se borre), el nombre completo ya se publica acá y también lo
 * publica NIC.ar, así que juntos identifican una casa, y el sitio tiene
 * superficie de conflicto real (cuentas, suspensiones, donaciones). La otra
 * alternativa, una oficina virtual, cuesta del orden de USD 300 a 600 al año
 * y hoy no tiene con qué pagarse.
 *
 * CON ESTO EN `true` las dos páginas legales suman la frase que dice que el
 * domicilio completo se informa a pedido. **Esa frase es la que sostiene la
 * decisión**: sin ella, quien necesite notificar formalmente no tiene camino
 * y la omisión se lee como evasiva; con ella, el responsable sigue siendo
 * identificable, que es el bien jurídico que el artículo 6 protege.
 *
 * AL CONTRATAR UNA OFICINA VIRTUAL se cambia el domicilio de arriba por el
 * completo y esto pasa a `false`. Son dos líneas y no hay que tocar nada más.
 */
export const RESPONSABLE_DOMICILIO_ES_PARCIAL = true;

/**
 * Link de pago de Mercado Pago para las donaciones (sección 20 del
 * Definitivo). Si se pone en null, la página "Acerca de" muestra la
 * sección explicando que todavía no está habilitada, en vez de un botón
 * roto, y el pie no muestra el enlace.
 */
export const ENLACE_DONACION =
  'https://link.mercadopago.com.ar/donacionespochoclo';

/**
 * Fecha que muestran las páginas legales. Actualizarla cuando se toque el
 * contenido de esas páginas, no en cada cambio de la app.
 */
export const FECHA_ACTUALIZACION = '08/09/2026';

/**
 * Eslogan de la marca. Lo muestra el pie, en las 22 pantallas.
 *
 * OJO: esta frase está DUPLICADA A MANO en index.html, que la lleva en el
 * <title> y en la meta description. No es un descuido: index.html es un
 * archivo estático que queda fuera del bundle de React, así que no puede
 * importar nada de acá. Al cambiar el eslogan hay que tocar los dos lados.
 * Es el mismo caso, y por el mismo motivo, que el código VALIDACION_POCHOCLO
 * duplicado entre backend/ y frontend/ (ver auth/clienteAuth.js).
 */
export const TAGLINE = 'Miralo a tu manera';
