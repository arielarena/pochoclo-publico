import { Router } from 'express';
import { responderError } from '../utils/responder.js';
import { exigirSesion } from '../auth/sesion.js';
import { GENEROS_TMDB } from '../data/genres.js';
import { leerGustos, guardarGustos, MAXIMO_GENEROS_FAVORITOS } from '../repositories/gustos.js';

export const gustosRouter = Router();

gustosRouter.use('/gustos', exigirSesion);

const TIPOS_VALIDOS = ['pelicula', 'miniserie', 'serie'];

/**
 * Mismo piso que las listas de años del frontend, y un techo con margen
 * para que un estreno anunciado no quede fuera. Es para atajar un error de
 * tipeo, no para acotar el catálogo.
 */
const ANIO_MINIMO = 1900;
const ANIO_MAXIMO = new Date().getFullYear() + 5;

/**
 * Tope de tramos de año favoritos (2026-09-08).
 *
 * Los géneros ya tenían el suyo (5) desde la milestone 20; los años no tenían
 * ninguno, y **son la dimensión que multiplica**: el bucle de
 * `buscarGustosPorGenero` es tipos × años × géneros × keywords. Medido ese
 * día con lo máximo que ofrece el selector de la pantalla (13 décadas más los
 * años sueltos): **8670 especificaciones de discover y 134 segundos.**
 *
 * Y a diferencia de una búsqueda ancha, esto es PERSISTENTE: queda guardado, y
 * cada "No sé qué ver" y cada "Quiero..." de esa persona lo vuelve a pagar.
 * `buscarGustosPorGenero` ya se acota sola desde ese día, así que este tope no
 * es la única defensa; está para que la fila no se guarde así de entrada.
 *
 * 50 deja lugar de sobra a cualquier selección real (las 13 décadas más 37
 * años sueltos) y queda por debajo de lo que el motor puede aprovechar, así
 * que nunca recorta algo que iba a servir.
 *
 * **Rechaza en vez de recortar**, igual que el tope de géneros de al lado y a
 * diferencia del de "Parecido a": acá el usuario está guardando una elección
 * suya, y recortarla en silencio le haría perder parte de lo que eligió sin
 * que nada se lo diga.
 */
const MAXIMO_TRAMOS_ANIO = 50;

function anioValido(valor) {
  return Number.isInteger(valor) && valor >= ANIO_MINIMO && valor <= ANIO_MAXIMO;
}

/**
 * Valida y normaliza los tres campos de la sección 19. Devuelve
 * `{ error }` con un mensaje en español, o `{ gustos }` listo para guardar.
 *
 * La validación es del lado del servidor a propósito, aunque la UI ya
 * impida pasarse: la UI se puede saltear.
 */
function validar(cuerpo) {
  const generosCrudos = cuerpo.generos ?? [];
  const tiposCrudos = cuerpo.tipos ?? [];
  const aniosCrudos = cuerpo.anios ?? [];

  if (!Array.isArray(generosCrudos) || !Array.isArray(tiposCrudos) || !Array.isArray(aniosCrudos)) {
    return { error: 'generos, tipos y anios tienen que ser listas' };
  }

  const generos = [...new Set(generosCrudos.map(Number))];
  if (generos.some((g) => !Number.isInteger(g) || !GENEROS_TMDB[g])) {
    return { error: 'Alguno de los géneros no existe' };
  }
  if (generos.length > MAXIMO_GENEROS_FAVORITOS) {
    return { error: `Se pueden elegir hasta ${MAXIMO_GENEROS_FAVORITOS} géneros favoritos` };
  }

  const tipos = [...new Set(tiposCrudos)];
  if (tipos.some((t) => !TIPOS_VALIDOS.includes(t))) {
    return { error: `Los tipos válidos son: ${TIPOS_VALIDOS.join(', ')}` };
  }

  /**
   * Se aceptan las dos formas de tramo que el motor ya entiende, para poder
   * pasarlas tal cual como preferencias.anio en la milestone 21.
   */
  if (aniosCrudos.length > MAXIMO_TRAMOS_ANIO) {
    return { error: `Se pueden elegir hasta ${MAXIMO_TRAMOS_ANIO} años o décadas favoritos` };
  }

  const anios = [];
  for (const tramo of aniosCrudos) {
    if (!tramo || typeof tramo !== 'object') {
      return { error: 'Cada año favorito tiene que ser un tramo' };
    }
    if (tramo.exacto != null) {
      if (!anioValido(Number(tramo.exacto))) return { error: `El año ${tramo.exacto} no parece válido` };
      anios.push({ exacto: Number(tramo.exacto) });
      continue;
    }
    const desde = tramo.desde != null ? Number(tramo.desde) : null;
    const hasta = tramo.hasta != null ? Number(tramo.hasta) : null;
    if (desde === null && hasta === null) {
      return { error: 'Cada año favorito tiene que tener un valor' };
    }
    if ((desde !== null && !anioValido(desde)) || (hasta !== null && !anioValido(hasta))) {
      return { error: 'Alguno de los años no parece válido' };
    }
    if (desde !== null && hasta !== null && hasta < desde) {
      return { error: 'Un tramo de años no puede terminar antes de empezar' };
    }
    anios.push({ desde, hasta });
  }

  if (typeof (cuerpo.clasicos ?? false) !== 'boolean') {
    return { error: 'clasicos tiene que ser un booleano' };
  }
  const clasicos = Boolean(cuerpo.clasicos);

  return { gustos: { generos, tipos, anios, clasicos } };
}

/** GET /gustos */
gustosRouter.get('/gustos', async (req, res) => {
  try {
    res.json({ gustos: await leerGustos(req.usuario.id) });
  } catch (err) {
    responderError(res, err, 'gustos');
  }
});

/** PUT /gustos   body: { generos: [id], tipos: [...], anios: [tramo], clasicos } */
gustosRouter.put('/gustos', async (req, res) => {
  const { gustos, error } = validar(req.body ?? {});
  if (error) return res.status(400).json({ error });

  try {
    await guardarGustos(req.usuario.id, gustos);
    res.json({ gustos });
  } catch (err) {
    responderError(res, err, 'gustos');
  }
});
