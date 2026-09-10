import { EMAIL_CONTACTO, FECHA_ACTUALIZACION } from '../config/sitio.js';
import useMetadatos from '../utils/useMetadatos.js';

export default function PaginaAccesibilidad() {
  useMetadatos('accesibilidad');

  return (
    <main id="contenido" className="pagina-lectura">
      <h1 className="titulo-pagina">Declaración de Accesibilidad</h1>
      <p className="mt-2 text-sm text-crema/60">Última actualización: {FECHA_ACTUALIZACION}</p>

      <div className="mt-8 space-y-8 text-crema/80">
        <section>
          <h2 className="titulo-seccion">Nuestro compromiso</h2>
          <p className="mt-2 leading-relaxed">
            Pochoclo busca ser utilizable por la mayor cantidad de personas posible, independientemente de
            cómo naveguen la web: con teclado, con lector de pantalla, con zoom, o con preferencia de poco
            movimiento en pantalla. Tomamos como referencia las Pautas de Accesibilidad para el Contenido
            Web (WCAG) 2.1, nivel AA, como objetivo.
          </p>
        </section>

        <section>
          <h2 className="titulo-seccion">Qué revisamos, y con qué</h2>
          <p className="mt-2 leading-relaxed">
            Hicimos tres revisiones. Cada una se encargó de revisar distintas cosas.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              <strong className="text-crema">Una automática</strong>: Recorre treinta y una pantallas y
              revisa contraste, etiquetas, roles y tamaño de los objetivos táctiles. No encuentra
              incumplimientos.
            </li>
            <li>
              <strong className="text-crema">Una manual con lector de pantalla (NVDA sobre
              Chrome)</strong>: Hecha en agosto de 2026, comprobó que lo que se anuncia
              tiene sentido. Resolvió distintos problemas como el recorrido con flechas para los buscadores,
              el anuncio de la cantidad de títulos tras filtrar u ordenar, o el foco del teclado
              manteniéndose al quitar una opción, al cerrar una ventana o al guardar en una lista.
            </li>
            <li>
              <strong className="text-crema">Una tercera sobre el árbol de accesibilidad</strong>: Es
              la información que el navegador le entrega a un lector de pantalla. Sirve para comprobar qué
              se anuncia y en qué orden. Resolvió la lectura de avisos que aparecían mientras se usaba el sitio.
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            No llevamos a cabo una auditoría formal externa. No contamos con una certificación. 
            No realizamos una prueba con personas que usen lectores de pantalla todos los días,
            que es lo que de verdad revela si algo se entiende al escucharlo.
          </p>
        </section>

        <section>
          <h2 className="titulo-seccion">Qué implementamos concretamente</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>Contraste de color verificado (mínimo 4.5:1 para texto normal) en toda la paleta.</li>
            <li>
              Navegación completa por teclado, con un indicador de foco visible y consistente en todos los
              elementos interactivos.
            </li>
            <li>Un enlace de "Saltar al contenido principal" al inicio de cada página.</li>
            <li>
              Etiquetas asociadas correctamente a cada campo de formulario (no solo texto de referencia
              visual, como un placeholder que desaparece al escribir).
            </li>
            <li>
              Textos alternativos en imágenes, y roles y etiquetas ARIA en los íconos e indicadores que no
              son puramente decorativos. Por ejemplo, la medalla de puntaje anuncia "Puntuación 8.4 de 10",
              no solo "8.4".
            </li>
            <li>
              Estados de carga y mensajes de error anunciados a lectores de pantalla en el momento en que
              aparecen.
            </li>
            <li>
              Las animaciones se desactivan automáticamente si el sistema del usuario tiene activada la preferencia de
              "reducir movimiento".
            </li>
            <li>
              El idioma de la página está declarado (español de Argentina) para que los lectores de
              pantalla usen la pronunciación correcta.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="titulo-seccion">En teléfonos y otros dispositivos</h2>
          <p className="mt-2 leading-relaxed">
            El sitio está pensado y medido para pantallas chicas, y para usarse solo con los dedos. En
            concreto:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              El diseño se comprueba en ocho tamaños de pantalla, desde 320 píxeles de ancho, incluidos dos
              apaisados. Nada queda cortado ni fuera del alcance del dedo.
            </li>
            <li>
              Los botones y enlaces que no van dentro de un párrafo miden al menos 24 por 24 píxeles, y los
              controles que se tocan seguido se agrandan cuando el dispositivo es táctil.
            </li>
            <li>
              No bloqueamos el zoom: el usuario puede agrandar la pantalla con los dedos en cualquier página.
            </li>
            <li>
              Los campos de texto tienen letra de al menos 16 píxeles, así el navegador no hace zoom solo
              al escribir y no deja la pantalla corrida.
            </li>
            <li>
              Las sugerencias de los buscadores se pueden tocar de a una, sin depender del teclado.
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            No realizamos las pruebas con lectores de pantalla en teléfonos.
            No probamos VoiceOver en iPhone ni TalkBack en Android, que funcionan distinto de los de
            computadora y tienen sus propios gestos. Las medidas están implementadas y verificadas por
            otros medios. Es asumido que funcionan correctamente, pero no lo podemos afirmar. Si usás alguno
            de los dos y algo no anda como esperabas, escribinos. Es la única forma que tenemos de
            enterarnos.
          </p>
        </section>

        <section>
          <h2 className="titulo-seccion">Limitaciones conocidas</h2>
          <p className="mt-2 leading-relaxed">
            Este es un proyecto personal en desarrollo activo, mantenido por una sola persona. Conviene que
            sepas hasta dónde llega lo que comprobamos:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              Probamos con NVDA sobre Chrome, en Windows. No probamos con JAWS, ni con VoiceOver, 
              ni con lectores de pantalla en teléfonos, por lo que puede haber diferencias que no conocemos.
            </li>
            <li>
              Las pruebas las hizo quien desarrolla el sitio, no personas que usen estas tecnologías todos
              los días. Son dos cosas distintas, y la segunda encuentra cosas que la primera no.
            </li>
            <li>
              No hay auditoría externa ni certificación de ningún tipo.
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            Si algo no funciona como debería, no es que estés usando el sitio mal. Es un problema nuestro y
            queremos saberlo.
          </p>
        </section>

        <section>
          <h2 className="titulo-seccion">Contacto</h2>
          <p className="mt-2 leading-relaxed">
            Si encontrás una barrera de accesibilidad en Pochoclo, o si algo no se anuncia o no se puede
            tocar como esperabas, contanos a {EMAIL_CONTACTO}. Nos sirve que nos digas qué página, qué
            estabas tratando de hacer, y si podés, con qué lo estabas usando (esto incluye el lector de 
            pantalla, el navegador y el aparato). Con eso alcanza para reproducirlo. Vamos a hacer lo posible 
            para responder y corregirlo.
          </p>
        </section>
      </div>
    </main>
  );
}
