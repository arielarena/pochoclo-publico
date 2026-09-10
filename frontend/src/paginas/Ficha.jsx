import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { obtenerFicha, obtenerSimilaresFicha } from '../api/cliente.js';
import { urlPoster, urlBackdrop, urlImagen } from '../utils/imagenes.js';
import { datosEstructuradosFicha } from '../utils/datosEstructurados.js';
import Cargando from '../components/Cargando.jsx';
import GrillaResultados from '../components/GrillaResultados.jsx';
import EsqueletoGrilla from '../components/EsqueletoGrilla.jsx';
import RegionViva from '../components/RegionViva.jsx';
import MedallaPuntaje from '../components/MedallaPuntaje.jsx';
import AccionesListas from '../listas/AccionesListas.jsx';
import PaginaError from './PaginaError.jsx';
import useMetadatos from '../utils/useMetadatos.js';

const ETIQUETA_TIPO = { pelicula: 'Película', miniserie: 'Miniserie', serie: 'Serie' };

/**
 * La duración total viene en minutos y es aproximada (promedio por episodio
 * por cantidad de episodios), así que se muestra redondeada a horas y con
 * un "unas" adelante en vez de dar una precisión que no tenemos.
 */
function textoDuracionTotal(minutos) {
  const horas = Math.round(minutos / 60);
  if (horas < 1) return `${minutos} minutos`;
  return `Unas ${horas} hora${horas === 1 ? '' : 's'}`;
}

export default function Ficha() {
  const { tipo, id } = useParams();
  const [ficha, setFicha] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  /**
   * Contador de reintentos: cambiarlo vuelve a disparar el efecto, que es la
   * forma de que el botón "Probar de nuevo" de la pantalla de error pida la
   * ficha otra vez sin recargar todo.
   */
  const [intento, setIntento] = useState(0);

  /**
   * Similares: desde el 2026-09-01 es un pedido aparte (ver
   * `routes/ficha.js`), porque es la parte cara de la pantalla (misma
   * lógica de "Parecido a", con cruce de tipo) y no tiene por qué demorar
   * lo que ya se puede mostrar. Se dispara en paralelo con el de arriba, no
   * después: las dos rutas son independientes en el backend, así que
   * esperar a que termine la ficha para recién pedir los similares solo
   * agregaría tiempo sin necesidad.
   */
  const [similares, setSimilares] = useState(null);
  const [cargandoSimilares, setCargandoSimilares] = useState(true);

  /**
   * La única pantalla que calcula sus metadatos en vez de leerlos de la tabla:
   * el título recién se sabe cuando llegan los datos. Mientras tanto, y si la
   * ficha no existe, quedan los genéricos de config/metadatos.js.
   *
   * La sinopsis va entera: el hook la recorta a 160 caracteres cortando en un
   * espacio, que es lo que hace falta acá porque ese texto no lo escribimos
   * nosotros.
   *
   * **Solo se usa si está en español**, y no cualquier sinopsis. Desde que el
   * backend cae al inglés cuando no hay una en español (ver textoTraducido en
   * services/tmdb.js), usarla igual pondría una `meta description` en inglés
   * dentro de una página en español, que es de las pocas cosas que un buscador
   * mira para decidir de qué va el sitio. Cuando no la hay queda la genérica de
   * config/metadatos.js, que sí está en español.
   */
  useMetadatos('ficha', {
    titulo: ficha ? `${ficha.titulo}${ficha.anio ? ` (${ficha.anio})` : ''} | Pochoclo` : undefined,
    descripcion: (ficha?.sinopsisIdioma === 'es' && ficha.sinopsis) || undefined,
  });

  /**
   * `vigente` corta las dos ramas (then y catch/finally) si `tipo`/`id`
   * cambiaron antes de que este pedido resolviera. Hace falta porque
   * `Ficha` NO se desmonta al navegar de un título a otro (React Router
   * reusa la misma instancia, solo cambian los params): sin esta guarda, si
   * el usuario entra a una ficha, clickea rápido "Ver más parecidos" o una
   * tarjeta de otra ficha, y el pedido viejo tarda más que el nuevo, su
   * respuesta llega después y pisa los datos correctos con los del título
   * anterior — la URL queda en el título nuevo pero la pantalla muestra el
   * viejo, sin ningún aviso de que algo salió mal.
   */
  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setFicha(null);
    setError(null);
    obtenerFicha(tipo, id)
      .then((datos) => { if (vigente) setFicha(datos); })
      .catch((err) => { if (vigente) setError(err); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [tipo, id, intento]);

  useEffect(() => {
    let vigente = true;
    setCargandoSimilares(true);
    setSimilares(null);
    obtenerSimilaresFicha(tipo, id)
      /**
       * Un fallo acá no puede tumbar la ficha: la sección de similares
       * simplemente no aparece, igual que cuando esto vivía adentro de
       * `buscarParecidoA` con su propio catch en el backend.
       */
      .then((datos) => { if (vigente) setSimilares(datos.similares); })
      .catch(() => { if (vigente) setSimilares([]); })
      .finally(() => { if (vigente) setCargandoSimilares(false); });
    return () => { vigente = false; };
  }, [tipo, id, intento]);

  /**
   * Los estados transitorios también necesitan el landmark y el ancla del
   * skip link: si no, durante los segundos que tarda la ficha, quien navega
   * con lector de pantalla se queda sin punto de entrada. Esto ya no espera
   * a los similares (2026-09-01, ver el segundo efecto): esos son la parte
   * cara de la pantalla y ahora cargan aparte, con su propio esqueleto más
   * abajo.
   */
  if (cargando) {
    return (
      <main id="contenido" className="pagina-ancho">
        <h1 className="solo-lector">Cargando la ficha del título</h1>
        <Cargando mensaje="Trayendo los detalles…" />
      </main>
    );
  }
  if (error) {
    /**
     * Un 404 y un 400 son la misma cosa para el visitante: la dirección que
     * tiene en la barra no lleva a ningún título (id inventado, tipo mal
     * escrito, o un título que TMDb sacó de su catálogo). Lo que corresponde
     * ahí es el 404 de la app, no un cartel rojo sobre una pantalla vacía.
     */
    const noExiste = error.estado === 404 || error.estado === 400;
    if (noExiste) {
      return (
        <PaginaError
          codigo="404"
          ilustracion="404"
          titulo="No encontramos ese título"
          mensaje="Puede que el enlace esté mal escrito, o que el título ya no esté en TMDb, que es de donde salen nuestros datos."
          acciones={
            <>
              <Link to="/buscar" className="boton-primario">
                Buscar otra cosa
              </Link>
              <Link to="/" className="boton-secundario">
                Ir al inicio
              </Link>
            </>
          }
        />
      );
    }
    return (
      <PaginaError
        titulo="No pudimos abrir esta ficha"
        mensaje={error.message}
        acciones={
          <>
            {/* Reintentar sin recargar: acá el fallo es de red o de TMDb, o
                sea que volver a pedir lo mismo puede andar perfectamente. Es
                justo lo contrario del límite de error, donde repetir el
                render vuelve a fallar seguro. */}
            <button type="button" onClick={() => setIntento((n) => n + 1)} className="boton-primario">
              Probar de nuevo
            </button>
            <Link to="/" className="boton-secundario">
              Ir al inicio
            </Link>
          </>
        }
      />
    );
  }
  if (!ficha) return null;

  const backdrop = urlBackdrop(ficha.backdrop);
  const poster = urlPoster(ficha.poster);
  /**
   * Una plataforma puede estar en más de una categoría (alquiler y compra
   * suelen repetir a Apple TV y Google Play), así que se dedupea por id: dos
   * logos iguales pegados se leen como un error, no como dos formas de verla.
   */
  const todasLasPlataformas = [
    ...(ficha.plataformas?.suscripcion ?? []).map((p) => ({ ...p, como: 'con suscripción' })),
    ...(ficha.plataformas?.alquiler ?? []).map((p) => ({ ...p, como: 'de alquiler' })),
    ...(ficha.plataformas?.compra ?? []).map((p) => ({ ...p, como: 'para comprar' })),
  ].filter((p, i, todas) => todas.findIndex((o) => o.id === p.id) === i);
  const enlacePlataformas = ficha.plataformas?.enlace ?? null;

  return (
    <main id="contenido" className="pb-16">
      {/* Un <script type="application/ld+json"> es un bloque de datos, no un
          script: el navegador nunca lo ejecuta, así que la CSP estricta de
          vite.config.js (script-src 'self', sin unsafe-inline) no lo
          bloquea, esté en el HTML estático o, como acá, insertado por React.
          Misma verificación que ya se hizo para el JSON-LD de index.html. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datosEstructuradosFicha(ficha, tipo, id)) }}
      />
      <div className="relative h-72 w-full overflow-hidden sm:h-96">
        {backdrop && <img src={backdrop} alt="" className="h-full w-full object-cover opacity-35" />}
        <div className="absolute inset-0 bg-gradient-to-t from-noche via-noche/70 to-noche/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-noche/60 via-transparent to-noche/60" />
      </div>

      <div className="relative z-10 mx-auto -mt-36 max-w-4xl px-4">
        <div className="flex flex-col gap-6 sm:flex-row">
          {poster && (
            <img
              src={poster}
              alt={ficha.titulo}
              className="w-40 flex-shrink-0 self-start rounded-panel shadow-2xl shadow-black/50 ring-1 ring-linea sm:w-52"
            />
          )}
          <div className="flex-1 pt-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-crema/60">
              <span>{ETIQUETA_TIPO[ficha.tipoContenido] ?? ficha.tipoContenido}</span>
              <span>·</span>
              <span>{ficha.anio ?? 'Sin año'}</span>
              {ficha.edad && (
                <>
                  <span>·</span>
                  <span className="insignia text-xs">{ficha.edad}</span>
                </>
              )}
              {ficha.es_clasico && (
                <span className="insignia text-xs">Clásico</span>
              )}
              {ficha.estado === 'Canceled' && <span className="text-crema/50">(Cancelada)</span>}
            </div>

            <h1 className="titulo-pagina mt-1">{ficha.titulo}</h1>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <MedallaPuntaje valor={ficha.puntuacion} tamano="grande" />
              <div className="text-sm text-crema/60">
                {ficha.duracion && <p>{ficha.duracion} min</p>}
                {ficha.temporadas && (
                  <p>
                    {ficha.temporadas} temporada{ficha.temporadas > 1 ? 's' : ''}
                    {ficha.episodios ? ` · ${ficha.episodios} episodios` : ''}
                  </p>
                )}
                {ficha.duracionTotal && <p>{textoDuracionTotal(ficha.duracionTotal)} para verla entera</p>}
              </div>
            </div>

            {ficha.sinopsis && (
              <div className="mt-4">
                {/* La cadena de idioma del backend puede terminar en inglés, o en el
                    idioma original, cuando el título no tiene sinopsis en español
                    (ver textoTraducido en services/tmdb.js). Mostrar ese texto sin
                    avisar se lee como un error nuestro; avisando, se entiende que es
                    lo que hay. El aviso solo aparece si de verdad no es español.

                    Es un <p> suelto con borde a la izquierda y nada de ancho fijo,
                    así que se adapta solo: a 320px envuelve en tres líneas sin
                    desbordar, que es el caso que mira la auditoría de diseño
                    adaptable. */}
                {ficha.sinopsisIdioma && ficha.sinopsisIdioma !== 'es' && (
                  <p className="texto-ayuda mb-2 border-l-2 border-linea pl-3">
                    Este título no tiene sinopsis en español. Mostramos su sinopsis original.
                  </p>
                )}
                <p className="leading-relaxed text-crema/80">{ficha.sinopsis}</p>
              </div>
            )}

            <AccionesListas item={{ tmdb_id: ficha.tmdb_id, tipo: ficha.tipo, titulo: ficha.titulo }} />
          </div>
        </div>

        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {ficha.reparto?.length > 0 && (
            <div>
              <h2 className="mb-2 font-display font-bold text-crema">Reparto</h2>
              <p className="text-crema/70">{ficha.reparto.join(', ')}</p>
            </div>
          )}
          {ficha.direccion?.length > 0 && (
            <div>
              <h2 className="mb-2 font-display font-bold text-crema">Dirección</h2>
              <p className="text-crema/70">{ficha.direccion.join(', ')}</p>
            </div>
          )}
        </div>

        {todasLasPlataformas.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 font-display font-bold text-crema">Disponible en</h2>
            {/*
              Los logos son imágenes, no enlaces, y es a propósito.

              TMDb no expone un link por plataforma (ver plataformasDetalladas
              en backend/src/services/tmdb.js): lo único que da es un link por
              título a su propia página de "dónde verla". Enlazar cada logo
              ahí hacía que el logo de Netflix llevara a TMDb, que no es lo
              que un logo de Netflix promete. Un enlace que no cumple lo que
              su etiqueta dice es peor que no tener enlace, así que los logos
              informan y el enlace de abajo, que sí dice a dónde va, lleva.
            */}
            <div className="flex flex-wrap gap-3">
              {todasLasPlataformas.map((p) => (
                <img
                  key={p.id}
                  src={urlImagen(p.logo, 'w45')}
                  alt={`${p.nombre} (${p.como})`}
                  title={`${p.nombre} (${p.como})`}
                  className="rounded-campo h-10 w-10 border border-linea"
                />
              ))}
            </div>
            {enlacePlataformas && (
              <a
                href={enlacePlataformas}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-semibold text-manteca underline underline-offset-4 hover:text-manteca-fuerte"
              >
                Consultar plataformas disponibles en TMDb
              </a>
            )}
            <p className="mt-2 text-xs text-crema/50">
              Datos de disponibilidad de JustWatch, vía TMDb. Pueden estar desactualizados.
            </p>
          </div>
        )}

        {/* Mientras cargan, el esqueleto reserva el lugar (misma pieza que
            usa PaginaResultados); listos, la sección desaparece si no hay
            ninguno en vez de quedar con un título sin nada debajo. */}
        {(cargandoSimilares || similares?.length > 0) && (
          <div className="mt-12">
            <h2 className="titulo-seccion">Parecido a esto</h2>
            <div className="regla-acento mt-2 mb-4" />

            {cargandoSimilares ? (
              <>
                <RegionViva rol="status" className="solo-lector">
                  Buscando títulos parecidos
                </RegionViva>
                <EsqueletoGrilla />
              </>
            ) : (
              <>
                <GrillaResultados resultados={similares} />

                {/* La Ficha muestra diez y no más, como pide la sección 10 ("una
                    lista de similares, no un botón"). Esto no la agranda: manda al
                    flujo de "Parecido a" con este título como referencia, que es
                    donde viven los Filtros, el orden y "Traer más resultados". */}
                <div className="mt-6 flex justify-center">
                  <Link
                    to="/resultados"
                    state={{
                      flujo: 'parecido-a',
                      parametros: { referencias: [{ tmdb_id: ficha.tmdb_id, tipo: ficha.tipo }] },
                      origen: { ruta: `/titulo/${tipo}/${id}`, texto: 'Volver al título' },
                    }}
                    className="boton-secundario"
                  >
                    Ver más parecidos
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
