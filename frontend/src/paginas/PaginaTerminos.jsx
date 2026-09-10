import { Link } from 'react-router-dom';
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
 * Términos y Condiciones.
 *
 * A diferencia de la Política de Privacidad, que la pide la Ley 25.326, este
 * documento no lo exige una ley en particular: existe porque Pochoclo hace
 * tres cosas que sin un marco escrito quedan sueltas.
 *
 *  1. Hay CUENTAS (milestone 18). Sin Términos no está dicho en ningún lado
 *     que la cuenta es personal, que se puede suspender, ni cuál es la edad
 *     mínima para abrir una.
 *  2. Hay DINERO. El link de Mercado Pago ya está activo en config/sitio.js,
 *     y una donación necesita decir que es gratuita, sin contraprestación y
 *     no reembolsable.
 *  3. Hay un LÍMITE DE EDAD AUTOMÁTICO (sección 17 del Definitivo). La app
 *     filtra sola por fecha de nacimiento usando certificaciones que carga
 *     gente en TMDb y una tabla de equivalencias nuestra (logic/edad.js).
 *     Es la promesa más riesgosa que hace la app, y el punto 3 de abajo es
 *     el que aclara que no es un control parental.
 *
 * ------------------------------------------------------------------------
 * LO QUE SUMÓ LA REVISIÓN LEGAL DEL 2026-08-26. Este documento es un
 * CONTRATO DE ADHESIÓN celebrado a distancia con consumidores, así que le
 * aplican el Código Civil y Comercial (artículos 984 a 989 y 1092 a 1122) y
 * la Ley 24.240. Eso tiene una consecuencia que conviene entender antes de
 * escribir cualquier cláusula nueva:
 *
 *   **UNA CLÁUSULA ABUSIVA NO ES UNA CLÁUSULA RIESGOSA: ES UNA CLÁUSULA QUE
 *   SE TIENE POR NO ESCRITA** (artículos 988 y 1122 del CCyC, y artículo 37
 *   de la Ley 24.240). O sea que escribirla de más no protege de nada, y
 *   encima arrastra la sospecha sobre el resto del documento. Por eso los
 *   puntos 9 y 11 dicen expresamente qué NO limitan.
 *
 * Los cuatro huecos que se taparon:
 *
 *  A. **NO SE IDENTIFICABA AL PROVEEDOR.** El artículo 4 de la Ley 24.240 y
 *     la Resolución 104/2005 piden nombre y domicilio en un lugar visible.
 *     Decía "una sola persona" y nada más. Ver config/sitio.js.
 *  B. **LA SUSPENSIÓN DE CUENTAS NO TENÍA PROCEDIMIENTO.** Una facultad de
 *     rescindir unilateralmente sin decir el motivo ni dar respuesta es de
 *     manual el tipo de cláusula que el artículo 1119 del CCyC declara
 *     abusiva. Ahora es el punto 6, con aviso, motivo, descargo y datos.
 *  C. **LA JURISDICCIÓN ESTABA BIEN PERO SIN FUNDAMENTO.** Se le sumó de
 *     dónde sale (artículo 1109 del CCyC), que es lo que la vuelve
 *     inatacable en vez de una concesión que mañana se puede correr.
 *  D. **LA LIMITACIÓN DE RESPONSABILIDAD ERA DEMASIADO AMPLIA.** El artículo
 *     1743 del CCyC invalida las que eximen por dolo. Excluirlo a mano hace
 *     que la cláusula sobreviva; no excluirlo la hacía caer entera.
 *
 * CÓMO SE ACEPTA, que son dos caminos distintos y conviene no confundirlos:
 *
 *  - SIN CUENTA, por uso. No hay cartel al entrar, y es lo que corresponde a
 *    un servicio gratuito que además no tiene nada que consentir: no hay
 *    ninguna cookie hasta que alguien inicia sesión (ver PaginaPrivacidad).
 *    El enlace del pie está en todas las pantallas.
 *  - CON CUENTA, con una casilla explícita en el registro, que el servidor
 *    verifica y sin la cual el alta se rechaza. Se guarda el booleano y la
 *    FECHA (campos aceptoTerminos y terminosAceptadosEn en auth/auth.js).
 *
 * ESA FECHA ES LO QUE SOSTIENE LA PROMESA DEL PUNTO 10: ante un cambio que le
 * imponga algo nuevo a quien ya tiene cuenta, se le vuelve a pedir la
 * aceptación en vez de darla por hecha. Quién quedó atrás lo dice
 * `npm run terminos-pendientes`, comparando contra FECHA_TERMINOS.
 *
 * ESA PANTALLA YA EXISTE: es `/terminos/aceptar` (PaginaAceptarTerminos), y
 * se ofrece sola desde el aviso de `components/AvisoTerminos.jsx` a quien
 * entra con la aceptación atrasada. Quién quedó atrás lo decide el servidor
 * comparando contra FECHA_TERMINOS, nunca el frontend.
 */
export default function PaginaTerminos() {
  useMetadatos('terminos');

  return (
    <main id="contenido" className="pagina-lectura">
      <h1 className="titulo-pagina">Términos y Condiciones</h1>
      <p className="mt-2 text-sm text-crema/60">Última actualización: {FECHA_ACTUALIZACION}</p>

      <div className="mt-8 space-y-8 text-crema/80">
        <section>
          <h2 className="titulo-seccion">1. Qué es esto y quién lo opera</h2>
          <p className="mt-2 leading-relaxed">
            Pochoclo ({DOMINIO_SITIO}) es un sitio de recomendación de películas y series, mantenido como
            proyecto personal. Estos Términos son las reglas de uso del sitio. Al usarlo, las aceptás. Si
            hay algo con lo que no estás de acuerdo, la salida es no usarlo.
          </p>
          {/*
            Artículo 4 de la Ley 24.240 y Resolución 104/2005: el proveedor
            tiene que identificarse. Con las constantes en null la página
            sigue funcionando pero queda incompleta; ver config/sitio.js.
          */}
          {RESPONSABLE_NOMBRE ? (
            <p className="mt-3 leading-relaxed">
              El sitio lo opera <strong className="text-crema">{RESPONSABLE_NOMBRE}</strong>
              {RESPONSABLE_DOMICILIO ? `, con domicilio en ${RESPONSABLE_DOMICILIO}` : ''}. Para cualquier
              consulta, reclamo o notificación, la dirección de contacto es {EMAIL_CONTACTO}.
              {/*
                Verbatim con la sección 1 de PaginaPrivacidad, a propósito. Ver
                el porqué en config/sitio.js. Si se cambia acá, cambiarla allá.
              */}
              {RESPONSABLE_DOMICILIO && RESPONSABLE_DOMICILIO_ES_PARCIAL
                ? ' El domicilio completo se informa a quien lo solicite por esa misma dirección.'
                : ''}
            </p>
          ) : (
            <p className="mt-3 leading-relaxed">
              Para cualquier consulta, reclamo o notificación, la dirección de contacto es {EMAIL_CONTACTO}.
            </p>
          )}
          <p className="mt-3 leading-relaxed">
            Van de la mano con la{' '}
            <Link to="/privacidad" className="text-manteca underline underline-offset-4">
              política de privacidad
            </Link>
            , que explica qué información se procesa y con qué fin.
          </p>
        </section>

        <section>
          <h2 className="titulo-seccion">2. El servicio, tal como es</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              Pochoclo es gratuito, no tiene publicidad y no vende datos de nadie. No hay funciones pagas
              ni nada que comprar.
            </li>
            <li>Se puede usar entero sin crear una cuenta. Crearla es opcional.</li>
            <li>
              Lo mantiene una sola persona, no una empresa con equipo de soporte. Puede tener errores,
              estar caído, o cambiar de un día para el otro.
            </li>
            <li>
              No garantizamos que el sitio esté disponible de forma continua, ni que la información esté
              completa o al día.
            </li>
            <li>
              Podemos modificar, suspender o discontinuar el sitio o cualquiera de sus funciones. Si
              alguna vez cerrara de forma definitiva, la intención es avisarlo con anticipación en el
              propio sitio para que quien tenga cuenta pueda copiarse sus listas, pero no podemos
              comprometer un plazo.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="titulo-seccion">3. Las recomendaciones son orientativas</h2>
          <p className="mt-2 leading-relaxed">
            Pochoclo sugiere qué ver. No es una fuente de datos oficial ni una autoridad de clasificación.
            Concretamente:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              La información de títulos, sinopsis, reparto e imágenes viene de TMDb, la cargan y editan
              sus usuarios, y puede tener errores o estar incompleta.
            </li>
            <li>
              La Puntuación, la marca de Clásico, el nivel de Complejidad y la duración total de una serie
              son cálculos nuestros a partir de esos datos. No son valores oficiales de TMDb ni de nadie más, 
              y la duración total de las series es una estimación.
            </li>
            <li>
              En qué plataforma está disponible un título es lo que informa TMDb, cambia seguido y puede
              no coincidir con lo que veas en la plataforma.
            </li>
          </ul>
          <p className="mt-4 leading-relaxed">
            Sobre el límite de edad: Pochoclo puede filtrar automáticamente las recomendaciones según la 
            fecha de nacimiento de tu cuenta. Ese filtro se arma con las certificaciones oficiales que TMDb 
            informa para cada título, cuando las informa. Un título puede no tener certificación cargada, 
            tenerla mal, o corresponder a la clasificación de otro país.
          </p>
          <p className="mt-3 leading-relaxed">
            Es una ayuda, no un control parental y no reemplaza el criterio de una persona adulta a cargo. No 
            conviene usarlo como única barrera para decidir qué puede ver un menor.
          </p>
        </section>

        <section>
          <h2 className="titulo-seccion">4. Cuentas</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              {/*
                El 13 no es un número inventado: es la edad desde la cual el
                artículo 25 del CCyC habla de "adolescente" y el 26 le
                reconoce autonomía progresiva. Decir de dónde sale es lo que
                hace defendible la regla.
              */}
              La edad mínima es 13 años. Es la edad desde la cual el Código Civil y Comercial reconoce autonomía 
              progresiva para decidir en asuntos de este tipo. Si sos menor de 13, no crees una cuenta: 
              podés usar todo el sitio sin registrarte igual. Si tenés entre 13 y 18, corresponde que quien 
              esté a tu cargo sepa que la creaste, y puede pedirnos verla o borrarla.
            </li>
            <li>
              El nombre puede ser un apodo, pero el correo tiene que ser tuyo y la fecha de nacimiento
              tiene que ser la real: si no, el límite de edad no sirve para nada.
            </li>
            <li>
              La cuenta es personal. Sos responsable de mantener tu contraseña en reserva y de lo que se
              haga desde tu cuenta. Si sospechás que alguien más entró, escribinos.
            </li>
            <li>
              Al registrarte te mandamos un correo para confirmar que la dirección es tuya. Podemos exigir
              esa confirmación para poder entrar, así que conviene hacerla apenas llega.
            </li>
            <li>
              Si olvidás la contraseña, podés pedir un enlace para restablecerla desde la pantalla de
              inicio de sesión. El enlace vence en una hora y se puede usar una sola vez.
            </li>
            <li>
              Podés borrar tu cuenta cuando quieras desde tu perfil. Es inmediato, se lleva tus listas y
              tus gustos, y cualquier otro dato registrado tuyo. No se puede deshacer.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="titulo-seccion">5. Qué no se puede hacer</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>Intentar acceder a cuentas ajenas o a partes del sistema que no son públicas.</li>
            <li>
              Sobrecargar el servicio a propósito, automatizar pedidos masivos, extraer el contenido en
              bloque, o revender los datos que muestra el sitio.
            </li>
            <li>Usar el sitio para cualquier actividad ilegal.</li>
            <li>Copiar el sitio o presentarlo como propio.</li>
          </ul>
        </section>

        {/*
          PUNTO 6, NUEVO. Antes esto era una viñeta suelta del punto 4 que
          decía "podemos suspender o eliminar una cuenta". Una facultad de
          rescindir sin causa expresada, sin aviso y sin respuesta es
          exactamente lo que el artículo 1119 del CCyC define como cláusula
          abusiva, y el 988 la tiene por no escrita. Con aviso, motivo,
          descargo y devolución de datos, la facultad se sostiene.
        */}
        <section>
          <h2 className="titulo-seccion">6. Suspensión y baja de cuentas</h2>
          <p className="mt-2 leading-relaxed">
            Podemos suspender o dar de baja una cuenta que se use para algo de lo que describe el punto 5,
            que haya sido creada de forma automatizada, o cuya fecha de nacimiento sea falsa siendo menor de
            13 años:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              Te avisamos al correo de la cuenta, y te decimos cuál es el motivo concreto.
            </li>
            <li>
              Podés contestar ese correo con tu descargo, y lo revisamos. Si nos equivocamos, reponemos la
              cuenta con todo lo que tenía.
            </li>
            <li>
              Salvo que una orden judicial diga otra cosa, antes de borrar nada te damos un plazo razonable
              para pedirnos una copia de tus listas y tus gustos.
            </li>
            <li>
              Si el problema se puede resolver sin dar de baja la cuenta, hacemos eso primero.
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            Vos también podés irte cuando quieras, sin dar explicaciones y sin costo, borrando la cuenta
            desde tu perfil.
          </p>
        </section>

        <section>
          <h2 className="titulo-seccion">7. Donaciones</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              {/*
                Calificarla como donación (artículo 1542 del CCyC) es lo que
                explica por qué no hay derecho de revocación de los diez días:
                ese derecho es de los contratos de consumo a distancia, y una
                liberalidad sin contraprestación no lo es. Sin la calificación,
                la sola frase "no son reembolsables" queda floja.
              */}
              Son voluntarias y sin contraprestación. Jurídicamente son una donación, no una compra ni una
              suscripción: no comprás ninguna función, ni prioridad, ni publicidad. No existen funciones
              reservadas para quien dona, y la app funciona exactamente igual si no donás.
            </li>
            <li>
              Como no hay nada que se te entregue a cambio, no son reembolsables ni les corresponde el derecho 
              de arrepentimiento de los diez días, que aplica a las compras a distancia. Si hubo un error
              evidente, como un cobro duplicado o un monto que claramente no quisiste poner, escribinos a{' '}
              {EMAIL_CONTACTO} y lo resolvemos igual.
            </li>
            <li>
              El pago lo procesa Mercado Pago, con sus propios términos y su propia política de
              privacidad. Pochoclo no ve ni guarda los datos de tu medio de pago.
            </li>
            <li>
              Pochoclo no es una entidad de bien público registrada, así que un aporte no es deducible de
              impuestos ni emite recibo de donación.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="titulo-seccion">8. Contenido de terceros y propiedad intelectual</h2>
          <p className="mt-2 leading-relaxed">
            Los títulos, sinopsis, pósters, imágenes y datos de reparto pertenecen a TMDb y a los titulares
            de derechos de cada obra. Pochoclo no es dueño de ese material y lo muestra con fines de
            identificación e información. Este producto usa la API de TMDb, pero no está respaldado ni
            certificado por TMDb.
          </p>
          <p className="mt-3 leading-relaxed">
            Pochoclo no aloja, no transmite y no enlaza copias de películas o series. Lo único que informa 
            es en qué plataformas legales figura disponible cada título.
          </p>
          <p className="mt-3 leading-relaxed">
            El nombre, el logo, el diseño y el código de Pochoclo son de su autor, y están protegidos por la
            Ley 11.723.
          </p>
          {/*
            Un procedimiento concreto es lo que convierte "escribinos" en algo
            operativo: sin decir qué mandar, un reclamo llega incompleto y se
            pierden días de ida y vuelta.
          */}
          <p className="mt-3 leading-relaxed">
            Si sos titular de derechos y considerás que algo publicado acá afecta los tuyos, escribinos a{' '}
            {EMAIL_CONTACTO} indicando qué contenido es y en qué página está, cuál es el derecho afectado, y
            cómo contactarte. Revisamos el reclamo a la brevedad y, si corresponde, damos de baja el contenido.
            Como casi todo lo que se muestra viene de TMDb, en muchos casos la corrección hay que hacerla
            también allá, y te lo vamos a indicar.
          </p>
        </section>

        <section>
          <h2 className="titulo-seccion">9. Responsabilidad</h2>
          <p className="mt-2 leading-relaxed">
            El sitio se ofrece tal como está y de forma gratuita. En la medida en que la ley lo permita, no
            respondemos por daños derivados de usar o no poder usar Pochoclo, de decisiones que tomes a
            partir de una recomendación, ni de la información provista por terceros.
          </p>
          {/*
            Artículo 1743 del CCyC: son inválidas las cláusulas que eximen o
            limitan la obligación de indemnizar cuando afectan derechos
            indisponibles o cuando media dolo. Excluir el dolo a mano es lo que
            hace que el resto de la cláusula se mantenga en pie.
          */}
          <p className="mt-3 leading-relaxed">
            Lo que esa limitación no alcanza, y no puede alcanzar: el dolo, la culpa grave, los daños a la 
            vida o a la integridad de las personas, y cualquier otro supuesto que la ley declare indisponible.
          </p>
          <p className="mt-3 leading-relaxed">
            Nada de lo que dice este documento limita los derechos que la ley argentina te reconoce como
            consumidor y a los que no se puede renunciar. Si alguna cláusula de estos Términos resultara
            contraria a esas normas, se la tiene por no escrita y el resto del documento sigue vigente.
          </p>
        </section>

        <section>
          <h2 className="titulo-seccion">10. Cambios en estos Términos</h2>
          <p className="mt-2 leading-relaxed">
            Podemos actualizarlos. La fecha del encabezado dice cuándo fue la última vez, y si el cambio
            es importante se anuncia en el sitio. Para quien usa Pochoclo sin cuenta, seguir usándolo
            después de un cambio significa que lo acepta.
          </p>
          <p className="mt-3 leading-relaxed">
            Si tenés cuenta es distinto, porque los aceptaste marcando una casilla y guardamos la fecha en
            que lo hiciste. Ante un cambio que te imponga algo nuevo, vamos a pedirte que los aceptes otra
            vez en vez de darlo por hecho. Mientras tanto no te bloqueamos nada. Si no estás de acuerdo,
            podés borrar tu cuenta desde tu perfil.
          </p>
          <p className="mt-3 leading-relaxed">
            Si querés consultar una versión anterior de este documento, escribinos y te la mandamos.
          </p>
        </section>

        <section>
          <h2 className="titulo-seccion">11. Ley aplicable y jurisdicción</h2>
          <p className="mt-2 leading-relaxed">
            Estos Términos se rigen por las leyes de la República Argentina.
          </p>
          {/*
            Artículo 1109 del CCyC: en los contratos celebrados a distancia,
            el lugar de cumplimiento es aquel donde el consumidor recibió o
            debió recibir la prestación, y ese lugar fija la jurisdicción. Su
            última frase declara nula cualquier pacta en contrario. O sea que
            no es una concesión nuestra: es la única jurisdicción posible.
          */}
          <p className="mt-3 leading-relaxed">
            Si sos consumidor, cualquier controversia se resuelve ante los tribunales del lugar donde usaste 
            el servicio, que normalmente es tu domicilio. Esto lo fija el artículo 1109 del Código Civil y 
            Comercial, y es nulo cualquier acuerdo que diga lo contrario. Este documento no intenta cambiarlo.
          </p>
          <p className="mt-3 leading-relaxed">
            Antes de llegar a un juicio podés reclamar gratis ante la autoridad de defensa del consumidor de
            tu jurisdicción, o a través del Servicio de Conciliación Previa en las Relaciones de Consumo
            (COPREC). Y siempre podés escribirnos primero, la mayoría de las cosas se resuelven así.
          </p>
        </section>

        <section>
          <h2 className="titulo-seccion">12. Contacto</h2>
          <p className="mt-2 leading-relaxed">
            Para cualquier consulta sobre estos Términos, escribí a {EMAIL_CONTACTO}.
          </p>
        </section>
      </div>
    </main>
  );
}
