/**
 * Título y descripción de cada pantalla.
 *
 * POR QUÉ EXISTE: hasta ahora las 22 rutas compartían el <title> y la
 * description de index.html, así que la pestaña, el historial y los favoritos
 * decían "Pochoclo: miralo a tu manera" estuvieras donde estuvieras, y un
 * buscador no tenía con qué distinguir una pantalla de otra.
 *
 * QUÉ ALCANZA Y QUÉ NO, que es la parte importante: esto lo escribe React
 * desde el navegador. Google ejecuta JavaScript y lo lee; los crawlers de
 * redes sociales NO, así que la tarjeta al compartir sale de los <meta
 * property="og:*"> estáticos de index.html y no de acá. Son dos mecanismos
 * distintos para dos públicos distintos, y no hay que confundirlos.
 *
 * LAS DESCRIPCIONES VAN POR DEBAJO DE 160 CARACTERES, que es lo que Google
 * muestra antes de cortar. El hook las recorta igual por las dudas, porque la
 * de la Ficha sale de la sinopsis y esa no la escribimos nosotros.
 *
 * `indexable: false` agrega <meta name="robots" content="noindex, nofollow">.
 * Es la segunda mitad de lo que declara public/robots.txt: aquel evita que se
 * pidan esas direcciones, esta evita que se indexen si alguien igual llega.
 */

export const TITULO_POR_OMISION = 'Pochoclo: miralo a tu manera';

export const DESCRIPCION_POR_OMISION =
  '¿Qué vemos esta noche? Pochoclo recomienda películas y series según tus gustos, con o sin cuenta. Miralo a tu manera.';

export const METADATOS = {
  inicio: {
    titulo: TITULO_POR_OMISION,
    descripcion: DESCRIPCION_POR_OMISION,
    indexable: true,
  },
  buscar: {
    titulo: 'Buscar por preferencias | Pochoclo',
    descripcion:
      'Elegí género, plataforma, año, actor, una película parecida, entre otras opciones, y Pochoclo te arma la recomendación.',
    indexable: true,
  },
  tipo: {
    titulo: 'Película, miniserie o serie | Pochoclo',
    descripcion:
      'Elegí el formato y Pochoclo te dice qué ver esta noche, sin filtros ni formularios largos.',
    indexable: true,
  },
  estadoAnimo: {
    titulo: 'Buscar por estado de ánimo | Pochoclo',
    descripcion:
      'Reírte, llorar, asustarte o volar tu mente: once estados de ánimo para encontrar qué película o serie ver.',
    indexable: true,
  },
  quienEstaViendo: {
    titulo: '¿Quién está viendo? | Pochoclo',
    descripcion:
      'Solo, en pareja, con amigos o en familia: Pochoclo ajusta la recomendación dependiendo de con quién vas a mirar.',
    indexable: true,
  },
  acercaDe: {
    titulo: 'Acerca de Pochoclo',
    descripcion:
      'Qué es Pochoclo, de dónde salen los datos de películas y series, y cómo colaborar con el proyecto.',
    indexable: true,
  },
  privacidad: {
    titulo: 'Política de privacidad | Pochoclo',
    descripcion:
      'Qué datos guarda Pochoclo, dónde, por cuánto tiempo, y qué derechos tenés sobre ellos según la Ley 25.326.',
    indexable: true,
  },
  terminos: {
    titulo: 'Términos y condiciones | Pochoclo',
    descripcion:
      'Las condiciones de uso de Pochoclo: el servicio tal como es, cuentas, donaciones y responsabilidad.',
    indexable: true,
  },
  accesibilidad: {
    titulo: 'Declaración de accesibilidad | Pochoclo',
    descripcion:
      'Qué hace Pochoclo para poder usarse con teclado y lector de pantalla.',
    indexable: true,
  },

  /* La Ficha SÍ es indexable: su contenido es distinto en cada título y Google
     lo ve porque ejecuta JavaScript. El título y la descripción reales los
     pasa la propia pantalla cuando llegan los datos; esto es lo que se ve
     mientras carga. */
  ficha: {
    titulo: 'Ficha de título | Pochoclo',
    descripcion: 'Sinopsis, puntuación, dónde verla y títulos parecidos.',
    indexable: true,
  },

  /* De acá para abajo, nada que indexar. Ver el comentario de robots.txt: o
     no tienen contenido propio, o son datos de una persona, o llevan un token
     en la dirección. */
  resultados: {
    titulo: 'Resultados | Pochoclo',
    descripcion: 'Los títulos que Pochoclo encontró para tu búsqueda.',
    indexable: false,
  },
  iniciarSesion: {
    titulo: 'Iniciar sesión | Pochoclo',
    descripcion:
      'Entrá a tu cuenta de Pochoclo para usar tus listas y tus gustos.',
    indexable: false,
  },
  crearCuenta: {
    titulo: 'Crear cuenta | Pochoclo',
    descripcion:
      'Creá una cuenta para guardar listas y recibir recomendaciones según tus gustos.',
    indexable: false,
  },
  recuperarContrasena: {
    titulo: 'Recuperar contraseña | Pochoclo',
    descripcion: 'Pedí el enlace para elegir una contraseña nueva.',
    indexable: false,
  },
  restablecerContrasena: {
    titulo: 'Elegir una contraseña nueva | Pochoclo',
    descripcion: 'Elegí una contraseña nueva para tu cuenta.',
    indexable: false,
  },
  aceptarTerminos: {
    titulo: 'Aceptar los Términos | Pochoclo',
    descripcion:
      'Los Términos cambiaron y hace falta que los aceptes de nuevo.',
    indexable: false,
  },
  perfil: {
    titulo: 'Mi perfil | Pochoclo',
    descripcion: 'Tus datos, tu contraseña y tu cuenta.',
    indexable: false,
  },
  listas: {
    titulo: 'Mis listas | Pochoclo',
    descripcion: 'Favoritas, Visto y Ver más tarde.',
    indexable: false,
  },
  misPlataformas: {
    titulo: 'Mis plataformas | Pochoclo',
    descripcion:
      'Las plataformas donde mirás, para que las recomendaciones salgan de ahí.',
    indexable: false,
  },
  misGustos: {
    titulo: 'Mis gustos | Pochoclo',
    descripcion:
      'Géneros, años y tipo preferido para personalizar las recomendaciones.',
    indexable: false,
  },
  noEncontrada: {
    titulo: 'No encontramos esa página | Pochoclo',
    descripcion: 'La dirección que buscabas no existe en Pochoclo.',
    indexable: false,
  },
};
