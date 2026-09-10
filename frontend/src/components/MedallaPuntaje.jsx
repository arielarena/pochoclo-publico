export default function MedallaPuntaje({ valor, tamano = 'normal' }) {
  const esGrande = tamano === 'grande';
  const clasesTamano = esGrande ? 'h-16 w-16 text-xl' : 'h-11 w-11 text-sm';

  if (valor == null) {
    return (
      <div
        role="img"
        aria-label="Puntuación no disponible"
        className={`flex ${clasesTamano} flex-shrink-0 items-center justify-center rounded-full border-2 border-linea-control font-display font-semibold text-crema/60`}
      >
        <span aria-hidden="true">S/D</span>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={`Puntuación ${valor.toFixed(1)} de 10`}
      className={`flex ${clasesTamano} flex-shrink-0 items-center justify-center rounded-full font-display font-bold text-noche shadow-lg shadow-manteca/20`}
      /* Usa el mismo token de degradé que la acción destacada, en vez de una
         copia con otro ángulo. Además del ahorro, hereda el corte en 125%: con
         terciopelo puro el número en noche medía 4.56:1 sobre el extremo del
         degradé, que pasa AA por 0.06. */
      style={{ backgroundImage: 'var(--degradado-destacado)' }}
    >
      <span aria-hidden="true">{valor.toFixed(1)}</span>
    </div>
  );
}
