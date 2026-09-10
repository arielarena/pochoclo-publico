import { Link } from 'react-router-dom';
import { EMAIL_CONTACTO, ENLACE_DONACION } from '../config/sitio.js';
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
