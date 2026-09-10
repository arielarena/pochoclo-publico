import {
  DOMINIO_SITIO,
  EMAIL_CONTACTO,
  FECHA_ACTUALIZACION,
  RESPONSABLE_DOMICILIO,
  RESPONSABLE_DOMICILIO_ES_PARCIAL,
  RESPONSABLE_NOMBRE,
} from '../config/sitio.js';
import useMetadatos from '../utils/useMetadatos.js';

/**
 * Política de Privacidad.
 *
 * La pide la Ley 25.326: hay que decir quién trata los datos, cuáles, con qué
 * fin, a quién se los damos, cuánto los guardamos y cómo se ejercen los
 * derechos. Este archivo es la única fuente de esa información, así que
 * TIENE QUE COINCIDIR CON EL CÓDIGO, y ese es el criterio con el que hay que
 * revisarlo: cada afirmación de abajo se puede comprobar leyendo un archivo.
 *
 * Las cuatro que se revisaron el 2026-08-25 y estaban mal o faltaban, con
 * dónde se verifica cada una, porque son las que se vuelven a desincronizar:
 *
 *  1. LAS SESIONES GUARDAN IP Y USER AGENT en nuestra propia base, no solo en
 *     los registros del hosting. Son dos columnas de la tabla "session" que
 *     crea Better Auth (comprobado con getAuthTables: ipAddress, userAgent).
 *  2. NO HAY "UNA SOLA COOKIE". Hay una segunda, better-auth.dont_remember,
 *     cuando el usuario destilda "Mantener la sesión abierta" (ver
 *     getCookies en better-auth/dist/cookies). Y la de sesión NO desaparece
 *     al cerrar el navegador: dura 30 días y se renueva sola
 *     (session.expiresIn en backend/src/auth/auth.js).
 *  3. AL ELEGIR CONTRASEÑA SE CONSULTA A HAVE I BEEN PWNED, que es un tercero
 *     (backend/src/auth/contrasenaFiltrada.js).
 *  4. PARTE DE LOS DATOS SALE DEL PAÍS, y desde el 2026-08-29 no todos.
 *     El servidor de la aplicación pasó a estar en la Argentina, así que los
 *     registros técnicos y de seguridad ya no se van; la base (Neon, Brasil),
 *     la entrega del sitio (Cloudflare) y el correo (Brevo) sí. El artículo 12
 *     de la Ley 25.326 regula justamente eso, y OJO CON LA ASIMETRÍA: la Unión
 *     Europea está en el listado de protección adecuada de la Disposición
 *     60-E/2016 y Brasil y los Estados Unidos no, así que no se pueden nombrar
 *     los tres en la misma frase.
 *
 * ------------------------------------------------------------------------
 * LO QUE SUMÓ LA REVISIÓN LEGAL DEL 2026-08-26, que es de dónde salen las
 * tres secciones nuevas y por qué no se pueden sacar sin romper el
 * cumplimiento:
 *
 *  A. **EL PAÍS ESTABA MAL.** Decía "principalmente en los Estados Unidos y
 *     en la Unión Europea". La base vive en `aws-sa-east-1`, o sea San Pablo,
 *     **Brasil** (ver la sección 10 de las notas de decisiones del proyecto, donde está medido). Un
 *     documento que declara mal dónde se almacenan los datos personales es
 *     justo lo que el artículo 12 no perdona.
 *  B. **LA TRANSFERENCIA NECESITA CONSENTIMIENTO INFORMADO, y para que sea
 *     informado hay que decir la parte incómoda**: ni Brasil ni Estados
 *     Unidos figuran en la lista de países con protección adecuada del Anexo
 *     I de la Disposición 60-E/2016. Sin esa frase el consentimiento del
 *     artículo 12 inciso 2 no está informado de nada.
 *  C. **FALTABA LA LEYENDA DE LA DISPOSICIÓN 10/2008**, que es obligatoria y
 *     textual: el acceso gratuito a intervalos no menores a seis meses, y la
 *     competencia de la AAIP para atender denuncias. Va en la sección 14, en
 *     su propio bloque y con esas palabras.
 *  D. Faltaban tres secciones enteras: qué NO se pide (artículo 7, datos
 *     sensibles), qué se hace con el perfil de gustos (artículo 20) y qué
 *     medidas de seguridad hay (artículo 9).
 *
 * LA CONCLUSIÓN DE COOKIES NO CAMBIA: no hay cartel de consentimiento porque
 * no hay nada que consentir. Las dos cookies son estrictamente necesarias, no
 * hay analítica, no hay publicidad, y lo único que se le pide a un tercero
 * desde el navegador son las imágenes de TMDb.
 *
 * PERO LA FRASE DE "NO GUARDAMOS NADA EN EL ALMACENAMIENTO LOCAL" ERA FALSA, y
 * estuvo publicada así (corregido el 2026-09-08). Este comentario decía que se
 * había verificado "con grep en frontend/src", y era cierto **el día que se
 * escribió**: el 2026-09-02, la sección 4.13.3 sumó `utils/precalentar.js`,
 * que escribe banderas en `sessionStorage`, y nadie volvió a correr ese grep.
 * El grep de hoy da un solo archivo, y es ese.
 *
 * LA CONCLUSIÓN SOBRE EL CARTEL SIGUE EN PIE (esa marca es estrictamente
 * necesaria: hace funcionar el precalentado que la persona disparó, no viaja a
 * ningún lado y muere con la pestaña), pero **el texto no podía seguir
 * afirmando que no existía**. Por la regla de la sección 4.26 de las notas de decisiones del proyecto,
 * una afirmación falsa acá es un incumplimiento y no un comentario viejo.
 *
 * LA LECCIÓN, para la próxima vez que se toque el navegador: un grep guardado
 * como comentario tiene fecha de vencimiento y nada avisa cuando vence. Si se
 * agrega cualquier uso de localStorage, sessionStorage, IndexedDB, analítica o
 * un recurso de un tercero, esta sección se revisa el mismo día.
 *
 * OJO CON LA NUMERACIÓN DE LAS SECCIONES: el número está escrito en tres
 * lugares que tienen que moverse juntos, y ninguna herramienta avisa si se
 * desincronizan. Son el <h2> visible, el id="seccion-N" de su <section>, y el
 * `numero` de cada EnlaceSeccion que apunte ahí. Si se inserta o se saca una
 * sección del medio, hay que renumerar los tres.
 *
 * **La renumeración del 2026-08-26 se pudo hacer justamente porque el sitio
 * todavía no está publicado.** Los ids son direcciones públicas en cuanto lo
 * esté (pochoclo.ar/privacidad#seccion-9), así que a partir de la
 * publicación renumerar rompe cualquier enlace guardado o compartido, y
 * conviene agregar secciones al final antes que insertarlas en el medio.
 */

/**
 * Enlace a otra sección de esta misma página.
 *
 * Es un <a href="#..."> pelado y no un <Link> de React Router a propósito: el
 * router no desplaza a un fragmento por su cuenta, y el navegador sí lo hace
 * nativamente cuando el destino está en el documento actual. Con <Link> el
 * enlace no llevaría a ningún lado.
 *
 * EL aria-label ESTÁ POR UN MOTIVO CONCRETO, no por completismo: el texto
 * visible es "la sección 9", que adentro de la frase se entiende, pero quien
 * navegue la página saltando de enlace en enlace con un lector de pantalla
 * escucharía tres enlaces que dicen "sección 2" y "sección 9" y no sabría a
 * qué llevan. Es el mismo defecto que tenía el botón de quitar de
 * Autocompletado, que TENÍA nombre accesible ("x") solo que inútil, y que
 * axe-core no marca porque técnicamente está bien. El texto visible va
 * contenido en el nombre accesible, que es lo que pide el criterio 2.5.3.
 */
function EnlaceSeccion({ numero, titulo, texto }) {
  return (
    <a
      href={`#seccion-${numero}`}
      aria-label={`Ir a ${texto}, ${titulo}`}
      className="text-manteca underline underline-offset-4"
    >
      {texto}
    </a>
  );
}

export default function PaginaPrivacidad() {
  useMetadatos('privacidad');

  return (
    <main id="contenido" className="pagina-lectura">
      <h1 className="titulo-pagina">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-crema/60">Última actualización: {FECHA_ACTUALIZACION}</p>

      <div className="mt-8 space-y-8 text-crema/80">
        <section id="seccion-1" className="scroll-mt-24">
          <h2 className="titulo-seccion">1. Quién es responsable de tus datos</h2>
          <p className="mt-2 leading-relaxed">
            Pochoclo ({DOMINIO_SITIO}) es un proyecto personal de recomendación de películas y series,
            mantenido por una sola persona y no por una empresa.
          </p>
          {/*
            Artículo 6 inciso b de la Ley 25.326: hay que informar la identidad
            y el domicilio del responsable, no solo un medio de contacto. Con
            las constantes en null la página no se rompe, pero queda
            incompleta; ver el comentario de config/sitio.js.
          */}
          {RESPONSABLE_NOMBRE ? (
            <p className="mt-3 leading-relaxed">
              El responsable de la base de datos es{' '}
              <strong className="text-crema">{RESPONSABLE_NOMBRE}</strong>
              {RESPONSABLE_DOMICILIO ? `, con domicilio en ${RESPONSABLE_DOMICILIO}` : ''}, y se lo puede
              contactar en {EMAIL_CONTACTO}.
              {/*
                La misma frase está en el punto 1 de PaginaTerminos, verbatim y
                a propósito: es la que sostiene la decisión de publicar el
                domicilio parcial (ver config/sitio.js). Si se cambia acá, hay
                que cambiarla allá.
              */}
              {RESPONSABLE_DOMICILIO && RESPONSABLE_DOMICILIO_ES_PARCIAL
                ? ' El domicilio completo se informa a quien lo solicite por esa misma dirección.'
                : ''}
            </p>
          ) : (
            <p className="mt-3 leading-relaxed">
              La persona que mantiene el sitio es la responsable de los datos que se describen acá, y se la
              puede contactar en {EMAIL_CONTACTO}.
            </p>
          )}
          <p className="mt-3 leading-relaxed">
            Esta política describe qué información se procesa al usar el sitio, con qué propósito, con quién
            se comparte, cuánto tiempo se guarda y cómo podés ejercer tus derechos. Se rige por la Ley 25.326
            de Protección de los Datos Personales y sus normas complementarias.
          </p>
        </section>

        <section id="seccion-2" className="scroll-mt-24">
          <h2 className="titulo-seccion">2. Si usás Pochoclo sin cuenta</h2>
          <p className="mt-2 leading-relaxed">
            Pochoclo se puede usar entero sin registrarse, y ese sigue siendo el uso por
            defecto: si no creás una cuenta, no guardamos ningún perfil tuyo ni usamos cookies. Concretamente:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              Las búsquedas que hacés (género, año, texto, etc.) se envían a nuestro servidor para traer
              resultados, pero no quedan asociadas a vos de ninguna forma. No hay cuenta, sesión, ni
              identificador que las vincule a una persona.
            </li>
            <li>
              Nuestro servidor registra datos técnicos básicos de cada visita (dirección IP, fecha y hora,
              páginas solicitadas), con fines de seguridad y para diagnosticar problemas. Se conservan como 
              máximo 90 días y después se borran solos. No se usan para armar perfiles ni se comparten con 
              fines comerciales. La red que entrega el sitio guarda además sus propios registros equivalentes, 
              por su cuenta y por poco tiempo.
            </li>
            <li>
              Además, dejamos escrita en esos mismos registros una línea por cada intento de inicio de
              sesión, alta de cuenta, cambio de contraseña o baja, con la dirección IP desde la que se hizo.
              Sirve para una sola cosa: poder responder si alguna vez alguien pregunta si entraron a su
              cuenta, y notar intentos de adivinar contraseñas. Nunca se anota el correo ni el nombre.
            </li>
          </ul>
        </section>

        <section id="seccion-3" className="scroll-mt-24">
          <h2 className="titulo-seccion">3. Si creás una cuenta</h2>
          <p className="mt-2 leading-relaxed">
            Crear una cuenta es opcional y sirve para guardar tus listas y para que las recomendaciones
            tengan en cuenta tus gustos. Si lo hacés, guardamos:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              <strong className="text-crema">Tu nombre</strong>, que puede ser un apodo. Solo se usa para
              saludarte.
            </li>
            <li>
              <strong className="text-crema">Tu correo</strong>, que identifica la cuenta, es con lo que
              iniciás sesión, y es a donde van los dos correos que describe{' '}
              <EnlaceSeccion numero={9} titulo="Terceros: el envío de correos" texto="la sección 9" />.
            </li>
            <li>
              <strong className="text-crema">Tu contraseña, cifrada</strong>. No la guardamos en texto plano
              y no podemos verla: en la base queda un hash, del que no se puede volver a la contraseña
              original.
            </li>
            <li>
              <strong className="text-crema">Tu fecha de nacimiento</strong>, que se usa con un solo fin:
              aplicar automáticamente el límite de edad a las recomendaciones. Podés desactivar ese filtro
              cuando quieras.
            </li>
            <li>
              <strong className="text-crema">Tus listas y tus gustos</strong>, es decir los títulos que
              agregues a Favoritas, Visto o Ver más tarde, tus plataformas, y los géneros, años y tipos que
              marques como preferidos.
            </li>
            <li>
              <strong className="text-crema">La fecha en que aceptaste los Términos</strong>, que es lo único
              que permite saber si aceptaste la versión vigente o una anterior.
            </li>
            <li>
              <strong className="text-crema">Un registro de tus sesiones abiertas</strong>: por cada
              dispositivo desde el que entres se guarda la dirección IP y el identificador de navegador que
              este envía, junto con cuándo empezó la sesión y cuándo vence. Es lo que permite mantenerte
              conectado y cerrar todas las sesiones de golpe desde tu perfil. Ese registro se borra solo
              cuando la sesión vence o cuando cerrás sesión.
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            Nada de esto se comparte, se vende ni se usa con fines publicitarios. Se guarda mientras tengas
            la cuenta abierta, y se borra cuando la borrás.
          </p>
          {/*
            Artículo 6 incisos c y d: el carácter obligatorio o facultativo de
            cada dato, y las consecuencias tanto de negarse a darlo como de
            darlo mal. Lo segundo faltaba, y acá no es un formalismo: la fecha
            de nacimiento es lo único que alimenta el límite de edad, así que
            una fecha falsa desactiva la protección sin que nada avise.
          */}
          <p className="mt-3 leading-relaxed">
            Todos estos datos son obligatorios para tener una cuenta, porque sin ellos no se la puede 
            identificar ni sostener. La consecuencia de no darlos es no tener cuenta, y el sitio se puede 
            usar entero igual, sin registrarse.
          </p>
          <p className="mt-3 leading-relaxed">
            La consecuencia de darlos mal es distinta según cuál: con un correo que no es tuyo no vas a poder
            recuperar la contraseña, y con una fecha de nacimiento falsa el límite de edad deja de protegerte, 
            porque es el único dato del que se calcula.
          </p>
        </section>

        <section id="seccion-4" className="scroll-mt-24">
          <h2 className="titulo-seccion">4. Qué no te pedimos</h2>
          {/*
            Artículo 7 de la Ley 25.326 (datos sensibles). La declaración
            negativa es la mitad fácil. La otra mitad, la de las listas, es la
            que un documento honesto tiene que decir: una lista de títulos
            favoritos puede sugerir orientación sexual, religión o ideología
            aunque nosotros no preguntemos nada de eso, y quien la arma tiene
            derecho a saberlo antes.
          */}
          <p className="mt-2 leading-relaxed">
            No pedimos ni tratamos datos sensibles en el sentido de la Ley 25.326: nada sobre tu salud, tu
            origen racial o étnico, tus opiniones políticas, tus convicciones religiosas o filosóficas, tu
            afiliación sindical ni tu vida sexual. Tampoco pedimos documento, domicilio, teléfono ni datos
            de pago, y no hay ninguna forma de subir archivos al sitio.
          </p>
          <p className="mt-3 leading-relaxed">
            Una aclaración que corresponde hacer: aunque no preguntemos nada de eso, una lista de títulos 
            favoritos puede dejar entrever cosas de ese tipo sobre vos. Nosotros no la interpretamos así ni 
            la usamos para nada que no sea recomendarte títulos, pero vos decidís qué poner ahí, y podés 
            borrar cualquier título de cualquier lista en el momento.
          </p>
        </section>

        <section id="seccion-5" className="scroll-mt-24">
          <h2 className="titulo-seccion">5. Qué hacemos con tus gustos</h2>
          {/*
            Artículo 20 de la Ley 25.326 (impugnación de valoraciones
            personales obtenidas por tratamiento automatizado). Acá no hay
            ninguna decisión con efecto jurídico, y decirlo explícitamente es
            mejor que callarlo: el derecho del artículo 20 aplica a decisiones
            que producen efectos, y una recomendación de película no lo es.
          */}
          <p className="mt-2 leading-relaxed">
            Si tenés cuenta, el sitio usa tus listas y tus gustos registrados para ordenar y elegir qué
            títulos mostrarte. Eso es todo lo que hace ese procesamiento: cambia qué películas y series
            aparecen primero.
          </p>
          <p className="mt-3 leading-relaxed">
            No se toma con eso ninguna decisión que produzca efectos jurídicos sobre vos ni que te afecte de
            forma significativa, no se arma ningún puntaje de tu conducta, y no se comparte ese perfil con
            nadie. Podés ver y editar todo lo que lo alimenta desde tus listas y desde Mis Gustos, o
            desactivarlo entero simplemente vaciándolas.
          </p>
        </section>

        <section id="seccion-6" className="scroll-mt-24">
          <h2 className="titulo-seccion">6. Cookies</h2>
          <p className="mt-2 leading-relaxed">
            Pochoclo usa cookies solo si iniciás sesión, y son como mucho dos:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              <strong className="text-crema">La cookie de sesión</strong>, que es la que te mantiene
              conectado para que no tengas que escribir la contraseña en cada página. Dura hasta 30 días y se
              renueva sola mientras uses el sitio. Si destildás <em>Mantener la sesión abierta</em> al
              entrar, en cambio, se borra al cerrar el navegador. En los dos casos desaparece si cerrás
              sesión, y el navegador no se la deja leer al código de la página.
            </li>
            <li>
              <strong className="text-crema">Una segunda cookie técnica</strong>, que se crea únicamente si
              destildaste esa casilla, y cuyo único contenido es esa preferencia. Es la que hace que la
              sesión no sobreviva al cierre del navegador.
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            Las dos son lo que se llama cookies estrictamente necesarias: hacen funcionar algo que pediste,
            no rastrean nada y no se comparten con nadie.
          </p>
          <p className="mt-3 leading-relaxed">
            No usamos cookies de publicidad, de analítica ni de terceros.
          </p>
          <p className="mt-3 leading-relaxed">
            En el almacenamiento de la pestaña (lo que el navegador llama <em>sessionStorage</em>) guardamos
            una sola cosa: una marca de que ya pedimos por adelantado los resultados de la opción que
            elegiste, para que la pantalla siguiente cargue más rápido. Es un simple &quot;ya lo pedimos&quot;,
            no viaja a ningún lado, no dice quién sos, y se borra sola al cerrar la pestaña.
          </p>
          <p className="mt-3 leading-relaxed">
            Nada de esto rastrea nada ni se comparte con nadie: todo lo que guardamos en tu navegador está
            para hacer funcionar algo que pediste. Por eso no vas a ver un cartel pidiéndote que lo aceptes:
            no hay nada que aceptar. Si eso llegara a cambiar, lo vas a ver anunciado en el sitio antes de
            que pase.
          </p>
        </section>

        <section id="seccion-7" className="scroll-mt-24">
          <h2 className="titulo-seccion">7. Dónde se guardan tus datos</h2>
          <p className="mt-2 leading-relaxed">
            Pochoclo funciona sobre cuatro piezas, y no todas están en el mismo lugar. Lo detallamos así
            porque la ley argentina regula de forma distinta lo que se guarda dentro del país y lo que sale
            de él.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              <strong className="text-crema">El servidor de la aplicación está en la Argentina</strong>, en
              un equipo propio. Ahí se resuelven tus búsquedas y ahí quedan los registros técnicos y de
              seguridad que describe{' '}
              <EnlaceSeccion numero={2} titulo="Si usás Pochoclo sin cuenta" texto="la sección 2" />.
            </li>
            <li>
              <strong className="text-crema">La base de datos</strong>, donde viven tu cuenta, tus listas y
              tus gustos, está a cargo de Neon Inc., una empresa de los Estados Unidos, y los servidores en
              los que corre están en San Pablo, Brasil.
            </li>
            <li>
              <strong className="text-crema">La entrega del sitio</strong> está a cargo de Cloudflare, Inc.,
              también de los Estados Unidos. Sirve las páginas y transporta el tráfico hasta nuestro
              servidor. Como toda red de ese tipo, guarda por su cuenta registros técnicos básicos de cada
              visita.
            </li>
            <li>
              <strong className="text-crema">El envío de correos</strong> está a cargo de Brevo (Sendinblue
              SAS), una empresa francesa que aloja en la Unión Europea. Lo describe{' '}
              <EnlaceSeccion numero={9} titulo="Terceros: el envío de correos" texto="la sección 9" />.
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            Ninguno de ellos usa tus datos para sus propios fines: los procesan por nuestra cuenta y
            siguiendo nuestras instrucciones.
          </p>
          {/*
            El artículo 12 prohíbe la transferencia a países sin protección
            adecuada, salvo excepciones, y una de ellas es el consentimiento
            del titular. Para que ese consentimiento valga tiene que ser
            informado, y lo que hay que informar es exactamente esto: qué
            países de destino NO están en la lista del Anexo I de la
            Disposición 60-E/2016. Sin esa frase, la persona está consintiendo
            sin saber qué.

            OJO CON LA ASIMETRÍA, que es lo que cambió al mudar el servidor a
            la Argentina: de los tres destinos que quedan afuera, la Unión
            Europea SÍ está en el listado y los otros dos no. Meterlos a los
            tres en la misma frase sería declarar de menos sobre Brasil y los
            Estados Unidos, y de más sobre la UE.
          */}
          <p className="mt-3 leading-relaxed">
            Ni Brasil ni los Estados Unidos figuran entre los países que la normativa argentina considera que
            tienen un nivel adecuado de protección de datos personales, según el listado de la Disposición
            60-E/2016. La transferencia a esos dos se hace sobre la base de tu consentimiento, en los términos 
            del artículo 12 de la Ley 25.326, que prestás al crear la cuenta. La Unión Europea sí figura en ese 
            listado, así que el envío de correos no depende de esa excepción.
          </p>
          <p className="mt-3 leading-relaxed">
            Si no estás de acuerdo, la salida es no crear una cuenta: el sitio se puede usar entero sin
            registrarse. Y si ya la creaste, borrarla retira ese consentimiento y se lleva los datos.
          </p>
        </section>

        <section id="seccion-8" className="scroll-mt-24">
          <h2 className="titulo-seccion">8. Terceros: The Movie Database (TMDb)</h2>
          <p className="mt-2 leading-relaxed">
            La información de películas y series (títulos, sinopsis, imágenes, calificaciones) proviene de
            la API de TMDb. Este producto usa la API de TMDb, pero no está respaldado ni certificado por
            TMDb. Cuando tu navegador carga un póster o una imagen, esa solicitud va directo a los
            servidores de TMDb, sujeta a su propia{' '}
            <a
              href="https://www.themoviedb.org/privacy-policy"
              target="_blank"
              rel="noreferrer"
              className="text-manteca underline underline-offset-4"
            >
              política de privacidad
            </a>
            . Es lo único que tu navegador le pide a un tercero. No cargamos fuentes, scripts ni videos de
            otros sitios.
          </p>
          <p className="mt-3 leading-relaxed">
            No le mandamos a TMDb tu nombre, tu correo ni ningún dato de tu cuenta. Como esa solicitud sale
            de tu navegador, TMDb ve tu dirección IP, igual que la ve cualquier sitio del que cargues una
            imagen.
          </p>
        </section>

        <section id="seccion-9" className="scroll-mt-24">
          <h2 className="titulo-seccion">9. Terceros: el envío de correos</h2>
          <p className="mt-2 leading-relaxed">
            Si tenés cuenta, Pochoclo te manda correos en dos situaciones: para confirmar tu dirección
            cuando te registrás, y para restablecer tu contraseña si lo pedís. Y si nos escribís a{' '}
            {EMAIL_CONTACTO}, la respuesta sale por el mismo medio, tengas o no cuenta. No enviamos
            novedades, promociones ni ningún otro tipo de correo, y no hay ninguna lista a la que estés
            suscripto.
          </p>
          <p className="mt-3 leading-relaxed">
            Para enviarlos usamos Brevo (Sendinblue SAS), una empresa francesa que aloja en la Unión
            Europea y que necesariamente procesa tu dirección para poder entregar el mensaje. No le damos
            ningún otro dato tuyo, y los correos no llevan imágenes ni enlaces de seguimiento, así que no
            registramos si los abriste.
          </p>
        </section>

        <section id="seccion-10" className="scroll-mt-24">
          <h2 className="titulo-seccion">10. Terceros: el control de contraseñas filtradas</h2>
          <p className="mt-2 leading-relaxed">
            Cuando elegís una contraseña, comprobamos que no sea una de las que ya aparecieron en
            filtraciones públicas de otros sitios, porque esas son las primeras que prueba cualquier atacante.
            Para eso consultamos el servicio{' '}
            <a
              href="https://haveibeenpwned.com/Passwords"
              target="_blank"
              rel="noreferrer"
              className="text-manteca underline underline-offset-4"
            >
              Have I Been Pwned
            </a>
            .
          </p>
          <p className="mt-3 leading-relaxed">
            Tu contraseña no sale de nuestro servidor. Lo que se envía son los primeros cinco caracteres de 
            un código derivado de ella, que comparten miles de contraseñas distintas, y la comparación final 
            se hace de nuestro lado. Ese servicio no recibe la contraseña, ni el código completo, ni tu correo, 
            ni ningún dato que permita saber de quién se trata.
          </p>
        </section>

        <section id="seccion-11" className="scroll-mt-24">
          <h2 className="titulo-seccion">11. Cómo protegemos tus datos</h2>
          {/*
            Artículo 9 de la Ley 25.326 (medidas técnicas y organizativas) y
            Resolución AAIP 47/2018, que recomienda las medidas y también la
            notificación de incidentes.

            CADA VIÑETA DE ACÁ ES COMPROBABLE EN EL CÓDIGO, y así tiene que
            seguir siendo: prometer una medida que no existe es peor que no
            prometer ninguna. Hash de contraseña y cookie httpOnly en
            auth/auth.js, verificación del certificado en config/db.js
            (rejectUnauthorized), las tres capas de límites en
            middleware/limitePedidos.js, y el respaldo con su simulacro de
            restauración en scripts/respaldo.js y respaldoSimulacro.js.
          */}
          <p className="mt-2 leading-relaxed">
            Ningún sistema es perfectamente seguro, y prometerte lo contrario sería mentirte. Lo que sí
            podemos decirte es qué medidas concretas están puestas:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              Tu contraseña se guarda como un hash, no como texto. Ni siquiera nosotros podemos leerla, y por
              eso cuando la olvidás se restablece en vez de recordártela.
            </li>
            <li>
              Todo el tráfico, tanto el tuyo con el sitio como el nuestro con la base de datos, va cifrado, y
              la conexión a la base verifica el certificado del servidor.
            </li>
            <li>
              La cookie de sesión no se la puede leer el código de la página, lo que evita que un fallo del
              sitio la exponga, y está marcada para que solo viaje al dominio propio.
            </li>
            <li>
              Hay límites de cantidad de pedidos por dirección IP, y límites más estrictos todavía en el
              inicio de sesión, el alta de cuenta y el pedido de restablecimiento, para frenar los intentos
              de adivinar contraseñas.
            </li>
            <li>
              Hacemos copias de seguridad de los datos de cuentas. Realizamos pruebas para asegurarnos de que 
              se puedan restaurar de verdad.
            </li>
            <li>
              El acceso a la base está limitado a la persona responsable del sitio. No hay equipo, ni
              proveedores con acceso, ni nadie más mirando.
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            Si alguna vez detectamos un acceso no autorizado a datos de cuentas, nos comprometemos a avisarte 
            por correo lo antes posible, contándote qué pasó y qué conviene que hagas, y a informarlo a la 
            autoridad de control.
          </p>
        </section>

        <section id="seccion-12" className="scroll-mt-24">
          <h2 className="titulo-seccion">12. Cuánto tiempo guardamos cada cosa</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              Tu cuenta, tus listas y tus gustos: mientras la cuenta exista. Cuando la borrás, se van con 
              ella en el momento.
            </li>
            <li>
              Las sesiones abiertas: hasta 30 días desde la última vez que usaste el sitio, o hasta que 
              cierres sesión.
            </li>
            <li>
              Los registros técnicos y de seguridad: como máximo 90 días en nuestro servidor, y después se 
              borran solos. No los guardamos aparte ni los archivamos.
            </li>
            <li>
              Las copias de seguridad: se van reemplazando por las más nuevas. Si borrás tu cuenta, puede quedar 
              en una copia hasta que esa copia se reemplace. No se usa para nada, solo está ahí por si hay que 
              recuperar el sistema.
            </li>
          </ul>
        </section>

        <section id="seccion-13" className="scroll-mt-24">
          <h2 className="titulo-seccion">13. Menores de edad</h2>
          {/*
            No hay un número en la Ley 25.326. El 13 sale del Código Civil y
            Comercial, que en su artículo 25 llama "adolescente" a quien tiene
            13 o más, y del criterio de autonomía progresiva del artículo 26.
            Decir de dónde sale el número es lo que convierte la regla en algo
            defendible en vez de en un número inventado.
          */}
          <p className="mt-2 leading-relaxed">
            Para crear una cuenta hay que tener 13 años o más. Es la edad desde la cual el Código Civil y Comercial 
            considera adolescente a una persona y le reconoce autonomía progresiva para decidir por sí misma en 
            asuntos de este tipo.
          </p>
          <p className="mt-3 leading-relaxed">
            No pedimos ni queremos datos de menores de esa edad, y si nos enteramos de que existe una cuenta
            así, la damos de baja. Sin cuenta, el sitio se puede usar entero y no hay ninguna edad mínima,
            porque no se guarda nada.
          </p>
          <p className="mt-3 leading-relaxed">
            Si estás a cargo de una persona menor de edad y querés ver qué datos tiene guardados su cuenta,
            corregirlos o borrarla, escribinos a {EMAIL_CONTACTO} y lo resolvemos.
          </p>
        </section>

        <section id="seccion-14" className="scroll-mt-24">
          <h2 className="titulo-seccion">14. Tus derechos (Ley 25.326)</h2>
          <p className="mt-2 leading-relaxed">
            La ley te reconoce los derechos de acceso, rectificación, actualización y supresión de tus datos
            personales. Ejercerlos es gratuito.
          </p>
          <p className="mt-3 leading-relaxed">
            Si usás Pochoclo sin cuenta, no hay un perfil tuyo para acceder, rectificar o eliminar, más allá
            de los registros técnicos mencionados arriba.
          </p>
          <p className="mt-3 leading-relaxed">
            Si tenés cuenta, todos tus datos están en tu perfil y los podés ejercer vos mismo, en el momento
            y sin pedírnoslo:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              Acceder y rectificar: tu nombre y tu fecha de nacimiento se editan desde tu perfil, y tus listas 
              y gustos desde sus propias pantallas.
            </li>
            <li>
              Eliminar: hay un botón para borrar la cuenta en tu perfil. Borra todo (cuenta, listas y gustos), 
              es inmediato y no se puede deshacer.
            </li>
            <li>
              Pedir una copia: si en vez de verlos en pantalla querés una copia de tus datos, escribinos y te 
              la mandamos.
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            Si preferís pedírnoslo a nosotros, o si creés que procesamos información tuya de forma
            incorrecta, escribinos a {EMAIL_CONTACTO}. La ley nos da un plazo de diez días corridos para
            responder un pedido de acceso, y de cinco días hábiles para rectificar, actualizar o suprimir
            datos.
          </p>
          {/*
            LEYENDA OBLIGATORIA, Disposición DNPDP 10/2008. Es textual y no se
            puede parafrasear ni resumir: por eso va en su propio bloque, con
            comillas, separada del resto del documento. Lo único que se
            actualizó del texto original es el nombre del organismo, que pasó
            de la Dirección Nacional de Protección de Datos Personales a la
            AAIP (Ley 27.275 y Decreto 746/2017).
          */}
          <div className="panel mt-4 p-4 text-sm">
            <p className="leading-relaxed">
              El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los
              mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un
              interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley
              25.326.
            </p>
            <p className="mt-3 leading-relaxed">
              La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley
              25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan con relación
              al incumplimiento de las normas sobre protección de datos personales.
            </p>
          </div>
        </section>

        <section id="seccion-15" className="scroll-mt-24">
          <h2 className="titulo-seccion">15. Cambios en esta política</h2>
          <p className="mt-2 leading-relaxed">
            Podemos actualizarla. La fecha del encabezado dice cuándo fue la última vez. Si el cambio afecta
            de verdad a lo que hacemos con tus datos, se anuncia en el sitio antes de que pase, y no después.
          </p>
          <p className="mt-3 leading-relaxed">
            Si querés consultar una versión anterior de este documento, escribinos y te la mandamos.
          </p>
        </section>

        <section id="seccion-16" className="scroll-mt-24">
          <h2 className="titulo-seccion">16. Contacto y reclamos</h2>
          <p className="mt-2 leading-relaxed">
            Para cualquier consulta sobre esta política, o para ejercer tus derechos, escribí a{' '}
            {EMAIL_CONTACTO}.
          </p>
          <p className="mt-3 leading-relaxed">
            Si considerás que no te respondimos como corresponde, podés presentar un reclamo ante la{' '}
            <a
              href="https://www.argentina.gob.ar/aaip"
              target="_blank"
              rel="noreferrer"
              className="text-manteca underline underline-offset-4"
            >
              Agencia de Acceso a la Información Pública
            </a>
            , que es la autoridad de control en materia de protección de datos personales en la Argentina.
          </p>
        </section>
      </div>
    </main>
  );
}
