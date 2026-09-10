/**
 * Campo numérico con dos botones separados para subir y bajar, en vez de las
 * flechitas nativas de <input type="number">.
 *
 * Por qué existe: el control del navegador es diminuto, aparece recién al
 * pasar el mouse por encima (así que en una tablet no aparece nunca), y se
 * dibuja distinto en cada navegador; en las versiones nuevas de Chrome
 * quedó como una barrita vertical que no se lee como "más y menos". Acá son
 * dos botones del tamaño de un dedo, siempre visibles, con su nombre para
 * lectores de pantalla.
 *
 * El teclado sigue funcionando igual que siempre (flechas arriba/abajo sobre
 * el input), porque el <input type="number"> se conserva: lo único que se
 * apagó son sus flechas dibujadas (ver index.css).
 *
 * `etiqueta` es obligatoria y siempre existe en el DOM; `etiquetaVisible` en
 * false la deja solo para lectores de pantalla, para los casos en que el
 * contexto ya la da (ej. el par Desde/Hasta debajo del título "Año").
 */
export default function CampoNumero({
  id,
  etiqueta,
  etiquetaVisible = true,
  valor,
  onCambiar,
  onBlur,
  min,
  max,
  paso = 1,
  /**
   * Con qué número arranca si el campo está vacío. La primera pulsación de
   * cualquiera de los dos botones lo deja en este valor en vez de sumarle o
   * restarle: partir de 0 en un campo de año obligaría a miles de clicks.
   */
  valorInicial,
  placeholder,
  className = 'w-full',
}) {
  const idCampo = id ?? `numero-${etiqueta.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  const acotar = (numero) => {
    let acotado = numero;
    if (min != null) acotado = Math.max(min, acotado);
    if (max != null) acotado = Math.min(max, acotado);
    return acotado;
  };

  function ajustar(direccion) {
    if (valor === '' || valor == null) {
      const semilla = valorInicial ?? min ?? 0;
      onCambiar(String(acotar(semilla)));
      return;
    }
    onCambiar(String(acotar(Number(valor) + direccion * paso)));
  }

  /**
   * Los límites se aplican al SALIR del campo, no en cada tecla.
   *
   * Acotar mientras se escribe pelea con el usuario: en un campo de 0 a 10,
   * tipear "10" pasa por "1" y después por "10", pero en uno de 0 a 100
   * tipear "25" pasa por "2"; y en un año, "1990" pasa por "1", "19" y
   * "199". Si cada paso intermedio se corrige, el número se reescribe solo
   * abajo de los dedos. Al salir del campo ya no hay ambigüedad sobre qué
   * quiso poner.
   *
   * Sin esto, `min`/`max` solo frenaban las flechas: tipeando se podía dejar
   * una duración negativa o una puntuación de 50.
   */
  function alSalir(evento) {
    if (valor !== '' && valor != null && Number.isFinite(Number(valor))) {
      const acotado = acotar(Number(valor));
      if (acotado !== Number(valor)) onCambiar(String(acotado));
    }
    onBlur?.(evento);
  }

  const enElTope = valor !== '' && valor != null && max != null && Number(valor) >= max;
  const enElPiso = valor !== '' && valor != null && min != null && Number(valor) <= min;

  return (
    <div className={className}>
      <label htmlFor={idCampo} className={etiquetaVisible ? 'texto-ayuda mb-1' : 'solo-lector'}>
        {etiqueta}
      </label>
      {/* El outline de foco va en el contenedor y no en el <input>, que lo
          tiene apagado: el control que percibe el usuario es la caja entera
          con sus dos botones, así que un anillo alrededor del input solo
          dejaría los botones afuera. Son los mismos 2px de manteca con 2px de
          separación que dibuja la regla global de :focus-visible. */}
      {/* `pointer-coarse:min-h-[3.125rem]`: en pantalla táctil el control
          crece a 50px de alto. No es estético, es la única forma de que los
          dos botones lleguen a los 24x24 que pide WCAG 2.5.8 (criterio de
          tamaño del objetivo). Con la altura de escritorio la caja mide 38px
          y, repartida entre subir y bajar, deja botones de 18 y 19px, que
          además están pegados uno al otro: ahí no vale la excepción de
          espaciado del criterio. 50 menos los 2px de borde son 48, o sea 24
          justos para cada uno.

          Va detrás de `pointer: coarse` y no siempre porque en escritorio el
          control se apunta con el mouse, y agrandarlo 12px lo desalinearía
          de los campos de al lado, que miden 42. */}
      <div className="rounded-campo flex items-stretch overflow-hidden border border-linea-control bg-noche pointer-coarse:min-h-[3.125rem] focus-within:border-manteca focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-manteca">
        <input
          id={idCampo}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={paso}
          placeholder={placeholder}
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          onBlur={alSalir}
          /* `pointer-coarse:text-base`: en pantalla táctil la letra sube de 14
             a 16px. Es el umbral exacto abajo del cual Safari en iOS hace zoom
             sobre el campo al enfocarlo, y ese zoom NO se deshace solo: el
             usuario queda con la página agrandada y corrida. Es el único
             <input> de la app con letra chica; el resto usa la clase `campo`,
             que hereda los 16px del cuerpo.

             Va con el mismo interruptor que la altura de más arriba, así que
             en escritorio el campo sigue igual que siempre. */
          className="w-full min-w-0 bg-transparent px-3 py-2 text-sm text-crema pointer-coarse:text-base focus:outline-none"
        />
        {/* Los dos botones comparten una columna angosta al costado, con una
            línea que los separa del texto para que se lean como control y no
            como parte del número.

            Los dos divisores internos usan `linea` y NO `linea-control`, que
            es el token del borde de afuera. La diferencia importa: el borde
            exterior es el límite del control y le corresponden los 3:1 de
            WCAG 1.4.11, pero los divisores solo separan zonas adentro de algo
            que ya está delimitado, y qué hace cada botón lo dice su flecha.
            Con los tres al mismo peso, el campo se leía como tres bordes
            distintos amontonados: uno curvo por fuera y dos rectos por
            dentro, todos igual de marcados.

            Los botones NO llevan radio propio: el `overflow-hidden` de la
            caja los recorta contra la misma curva del borde. Antes cada uno
            traía su `rounded-tr`/`rounded-br` calculado a mano, y ahí estaba
            el problema de que la caja se viera curva por fuera y recta por
            dentro: el fondo del hover y la línea divisoria llegaban al borde
            con esquina viva y se metían en la curva. */}
        <div className="flex flex-col border-l border-linea">
          <button
            type="button"
            onClick={() => ajustar(1)}
            disabled={enElTope}
            aria-label={`Aumentar ${etiqueta}`}
            className="flex flex-1 items-center justify-center px-2 text-crema/60 transition hover:bg-crema/10 hover:text-manteca disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-crema/60"
          >
            <svg aria-hidden="true" viewBox="0 0 10 6" className="h-1.5 w-2.5 fill-current">
              <path d="M5 0 10 6H0z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => ajustar(-1)}
            disabled={enElPiso}
            aria-label={`Disminuir ${etiqueta}`}
            className="flex flex-1 items-center justify-center border-t border-linea px-2 text-crema/60 transition hover:bg-crema/10 hover:text-manteca disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-crema/60"
          >
            <svg aria-hidden="true" viewBox="0 0 10 6" className="h-1.5 w-2.5 fill-current">
              <path d="M5 6 0 0h10z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
