const BASE_IMAGEN = 'https://image.tmdb.org/t/p/';

export function urlImagen(path, tamano) {
  if (!path) return null;
  return `${BASE_IMAGEN}${tamano}${path}`;
}

export function urlPoster(path, tamano = 'w342') {
  return urlImagen(path, tamano);
}

export function urlBackdrop(path, tamano = 'w780') {
  return urlImagen(path, tamano);
}
