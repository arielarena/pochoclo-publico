/**
 * Opciones de años y décadas, y la traducción entre lo que muestran los
 * selectores y los "tramos" que entiende el backend.
 *
 * Vive acá y no dentro de una página porque lo usan dos: el campo Año de
 * las Preferencias (`PaginaBuscar`) y los años favoritos de los Gustos
 * Registrados (`PaginaGustos`). Generar dos veces la misma lista de 126
 * años era la forma fácil de que una quedara vieja.
 */

/**
 * El piso de 1900 es por practicidad de las listas: para algo más viejo
 * está la modalidad de rango de PaginaBuscar, que no tiene tope.
 */
export const ANIO_ACTUAL = new Date().getFullYear();
export const PISO_LISTAS_ANIO = 1900;

/**
 * Techo de los campos de Año, en Preferencias y en Filtros.
 *
 * Deja lugar a los estrenos futuros, que TMDb tiene cargados, y evita que la
 * flecha de subir se vaya al infinito.
 *
 * Los campos de Año NO tienen piso: se puede escribir cualquier año. Hubo uno
 * en 1870 y se sacó, porque acotar hacia abajo no protege de nada (un año
 * imposible devuelve cero resultados, que ya es la respuesta correcta) y sí
 * molesta a quien tipea algo raro a propósito. Lo único que quedó de aquello
 * es el aviso no bloqueante de `anioSospechoso()`, que informa sin corregir.
 */
export const ANIO_MAXIMO = ANIO_ACTUAL + 10;

/**
 * Año del primer cortometraje conocido, aproximadamente. Es arbitrario: solo
 * marca a partir de dónde un año tipeado da para preguntar si no se coló un
 * dígito.
 */
export const ANIO_MINIMO_SIN_AVISO = 1887;

/**
 * ¿Alguno de los dos extremos del rango es sospechosamente viejo?
 *
 * OJO CON CUÁNDO SE MUESTRA EL AVISO que sale de acá: al SALIR del campo, no
 * mientras se escribe. Tipear "1990" pasa por "1" y por "19", que son años
 * menores a 1887, así que en cada tecla el aviso saltaría solo para
 * desaparecer dos teclas después. Lo controla el estado `anioRevisado` de
 * cada pantalla, no esta función.
 */
export function anioSospechoso(desde, hasta) {
  const viejo = (v) => v !== '' && v != null && Number(v) <= ANIO_MINIMO_SIN_AVISO;
  return viejo(desde) || viejo(hasta);
}

/** ¿El rango está al revés? Es el único error bloqueante del campo Año. */
export function rangoAnioInvalido(desde, hasta) {
  return desde !== '' && desde != null && hasta !== '' && hasta != null && Number(hasta) < Number(desde);
}

/**
 * El texto de ese error, compartido para que las dos pantallas digan lo
 * mismo. En Preferencias bloquea la navegación; en Filtros es informativo,
 * porque ahí no hay botón de enviar que bloquear.
 */
export const MENSAJE_RANGO_ANIO_INVALIDO = 'El año "Hasta" no puede ser menor al año "Desde".';

export const OPCIONES_DECADAS = [];
for (let d = Math.floor(ANIO_ACTUAL / 10) * 10; d >= PISO_LISTAS_ANIO; d -= 10) {
  OPCIONES_DECADAS.push({ valor: d, etiqueta: `Década de ${d}` });
}

export const OPCIONES_ANIOS = [];
for (let a = ANIO_ACTUAL; a >= PISO_LISTAS_ANIO; a--) {
  OPCIONES_ANIOS.push({ valor: a, etiqueta: String(a) });
}

/**
 * De lo elegido en los dos selectores a la lista de tramos que espera el
 * backend. Una década es el tramo de sus diez años; un año suelto es un
 * tramo exacto.
 */
export function tramosDesdeSeleccion(decadas, aniosSueltos) {
  return [
    ...decadas.map((d) => ({ desde: d, hasta: d + 9 })),
    ...aniosSueltos.map((a) => ({ exacto: a })),
  ];
}

/**
 * El camino inverso, para volver a llenar los selectores con lo que estaba
 * guardado. Un tramo se reconoce como década si mide exactamente diez años
 * y arranca en un múltiplo de diez; cualquier otro tramo se descompone en
 * los años que abarca, para que el selector pueda mostrarlo.
 */
export function seleccionDesdeTramos(tramos = []) {
  const decadas = [];
  const anios = [];

  for (const tramo of tramos) {
    if (tramo?.exacto != null) {
      anios.push(Number(tramo.exacto));
      continue;
    }
    const desde = tramo?.desde != null ? Number(tramo.desde) : null;
    const hasta = tramo?.hasta != null ? Number(tramo.hasta) : null;
    if (desde == null || hasta == null) continue;

    if (desde % 10 === 0 && hasta === desde + 9) {
      decadas.push(desde);
      continue;
    }
    for (let a = desde; a <= hasta; a++) anios.push(a);
  }

  return { decadas: [...new Set(decadas)], anios: [...new Set(anios)] };
}
