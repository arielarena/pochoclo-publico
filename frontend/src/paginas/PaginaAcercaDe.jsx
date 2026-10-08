import { Link } from 'react-router-dom';
import { EMAIL_CONTACTO, ENLACE_DONACION } from '../config/sitio.js';
import SeccionExtension from '../components/SeccionExtension.jsx';
import useMetadatos from '../utils/useMetadatos.js';

/**
 * Sección 20 del Definitivo: las donaciones viven en dos lugares que
 * conviven, un enlace discreto en el pie de toda la app y esta sección más
 * detallada. Acá va el detalle; el enlace corto del pie apunta a esta
 * misma sección.
 */
export default function PaginaAcercaDe() {
  useMetadatos('acercaDe');

  return (
    <main id="contenido" className="pagina-lectura">
      <h1 className="titulo-pagina">Acerca de Pochoclo</h1>

      <div className="mt-8 space-y-8 text-crema/80">
        <section>
          <h2 className="titulo-seccion">Qué es</h2>
          <p className="mt-2 leading-relaxed">
            Pochoclo es un recomendador de películas y series pensado para solucionar el problema principal
            cuando abrís una plataforma de streaming: ¿y ahora que veo? Pochoclo te ayuda a encontrar eso que 
            buscas. Con diferentes maneras de buscar, con filtros y con listas para guardar lo que te interesa, 
            la recomendación la formas vos.
          </p>
          <p className="mt-3 leading-relaxed">
            Se puede usar sin crear una cuenta y sin dejar ningún dato. Podés ver cómo funciona eso en la{' '}
            <Link to="/privacidad" className="text-manteca underline underline-offset-4">
              política de privacidad
            </Link>
            , las reglas de uso en los{' '}
            <Link to="/terminos" className="text-manteca underline underline-offset-4">
              términos y condiciones
            </Link>
            , y qué hicimos para que sea navegable por cualquiera en la{' '}
            <Link to="/accesibilidad" className="text-manteca underline underline-offset-4">
              declaración de accesibilidad
            </Link>
            .
          </p>
        </section>

        {/* ESTA SECCIÓN FALTABA, y su ausencia era el agujero más grande que
            tenía la app para contarse. Hasta acá, el único lugar de todo el
            sitio donde se explicaba qué agrega una cuenta era la propia
            pantalla de crearla, o sea que había que haber decidido
            registrarse para enterarse de para qué sirve. Y las listas, que
            son lo más concreto que ofrece, son invisibles sin sesión, porque
            el "+" de las tarjetas no se dibuja (ver components/../listas/
            BotonListas.jsx, y es correcto que sea así).

            Va después de "Qué es" y no antes, en ese orden a propósito. La
            sección de arriba termina diciendo que el sitio se usa entero sin
            cuenta, que es el principio del proyecto y no se toca; esta
            cuenta la otra mitad sin contradecirla. */}
        {/* EL `id` Y EL `scroll-mt-24` SON UN PAR Y VAN JUNTOS, mismo caso
            que `#donaciones` acá abajo y que las dieciséis secciones de
            `/privacidad`. Sin el margen de desplazamiento, el `h2` de destino
            queda tapado por el encabezado pegajoso, que mide 73 px.

            Quien entra desde el enlace del inicio llega con `#cuentas`, y de
            eso se encarga `components/DesplazarAlNavegar.jsx`, porque el
            router no desplaza a ningún fragmento por su cuenta (ver la 4.25 y
            la 4.25.4 de las notas de decisiones del proyecto, donde eso ya falló dos veces). De paso el
            destino recibe el foco, así que quien navega con teclado o con
            lector de pantalla no se queda parado en el enlace de origen. */}
        <section id="cuentas" className="scroll-mt-24">
          <h2 className="titulo-seccion">Qué cambia con una cuenta</h2>
          <p className="mt-2 leading-relaxed">
            Nada de lo dicho previamente deja de funcionar si no tenés una. Sin embargo, la 
            personalización se enriquece con una. Podés guardar títulos en tres listas, Favoritas, 
            Visto y Ver más tarde, anotar a qué plataformas estás suscripto para no recibir 
            recomendaciones que no podés mirar, y registrar tus gustos de géneros, años y si 
            preferís películas o series.
          </p>
          <p className="mt-3 leading-relaxed">
            Con eso, las búsquedas que no te piden ningún criterio, como No sé qué ver y Quiero ver
            una película, dejan de ser iguales para todo el mundo y suman secciones armadas con tus
            gustos y con títulos parecidos a los que guardaste en Favoritas y Visto. Lo que marcás 
            como Visto deja de aparecer en cualquier búsqueda, que es lo que evita que te recomendemos
            por décima vez algo que ya viste.
          </p>
          <p className="mt-3 leading-relaxed">
            <Link to="/crear-cuenta" className="text-manteca underline underline-offset-4">
              Crear una cuenta
            </Link>{' '}
            lleva un nombre, un correo, una contraseña y tu fecha de nacimiento, y se puede borrar
            cuando quieras desde el perfil.
          </p>
        </section>

        <SeccionExtension />

        {/* Las condiciones de uso de la API de TMDb piden que la atribución
            esté en la sección de "Acerca de" o de créditos, con su logo y con
            el aviso de que no respaldan el producto. El logo también está en
            el pie. Ver el comentario largo de components/Pie.jsx. */}
        <section>
          <h2 className="titulo-seccion">De dónde salen los datos</h2>
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block transition hover:opacity-80"
          >
            <img src="/tmdb.svg" alt="The Movie Database" className="h-5 w-auto" width="154" height="20" />
          </a>
          <p className="mt-3 leading-relaxed">
            Este producto usa la API de TMDb, pero no está respaldado ni certificado por TMDb. La
            información de películas y series (fichas, imágenes, puntajes, reparto, plataformas
            disponibles) viene de ahí. Las puntuaciones y las categorías que ves acá, como Clásico o el
            nivel de complejidad, las calculamos nosotros a partir de esos datos, así que no son valores
            oficiales de TMDb.
          </p>
        </section>

        <section id="donaciones" className="scroll-mt-24">
          <h2 className="titulo-seccion">Donaciones</h2>
          <p className="mt-2 leading-relaxed">
            Pochoclo es gratis, no tiene publicidad y no vende datos de nadie. Si te resulta útil y querés 
            colaborar, cualquier aporte ayuda, y si no, la app funciona exactamente igual. No hay funciones 
            reservadas para quien dona.
          </p>

          {ENLACE_DONACION ? (
            <>
              {/* Un aporte es plata que cambia de manos, así que las
                  condiciones van antes del botón y no solo en una página
                  aparte: que es voluntario, que no compra nada y que no se
                  devuelve. El detalle está en el punto 6 de los Términos.
                  Va adentro de esta rama porque nombra a Mercado Pago, que no
                  tiene sentido mencionar si todavía no hay medio de pago. */}
              <p className="mt-3 text-sm leading-relaxed text-crema/60">
                Un aporte es voluntario, no compra ninguna función y no es reembolsable. El pago lo
                procesa Mercado Pago. Está explicado en los{' '}
                <Link to="/terminos" className="text-manteca underline underline-offset-4">
                  términos y condiciones
                </Link>
                .
              </p>
              <a
                href={ENLACE_DONACION}
                target="_blank"
                rel="noopener noreferrer"
                className="boton-primario mt-5"
              >
                Colaborar con Pochoclo
              </a>
            </>
          ) : (
            <p className="panel mt-5 px-5 py-4 text-sm text-crema/60">
              Todavía no está habilitado el medio para recibir aportes. Cuando lo esté, va a aparecer acá.
            </p>
          )}
        </section>

        <section>
          <h2 className="titulo-seccion">Contacto</h2>
          <p className="mt-2 leading-relaxed">
            Para sugerencias, errores que encuentres, o cualquier consulta, escribí a{' '}
            <a
              href={`mailto:${EMAIL_CONTACTO}`}
              className="text-manteca underline underline-offset-4"
            >
              {EMAIL_CONTACTO}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
