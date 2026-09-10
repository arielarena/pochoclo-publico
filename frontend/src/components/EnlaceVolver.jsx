import { Link } from 'react-router-dom';

/**
 * La flecha de "Volver" que llevan las pantallas de las que se puede salir
 * sin haber terminado nada: las cuatro de búsqueda (Preferencias, Tipo,
 * Estado de ánimo, ¿Quién está viendo?) y la de resultados.
 *
 * ES UN <Link> Y NO UN navigate(-1), aunque el destino sea casi siempre el
 * paso anterior. El historial no garantiza a dónde lleva "atrás": si el
 * usuario recargó la página, si entró desde afuera con un enlace directo, o
 * si en /resultados tocó "Más recomendaciones", el paso anterior no es la
 * pantalla que uno espera. Con un destino explícito la flecha siempre va al
 * mismo lado, y de paso en /resultados puede devolver el formulario cargado,
 * que "atrás" no hace (React lo desmonta al navegar; ver 4.5 de las notas de decisiones del proyecto).
 *
 * `estado` es lo que la pantalla de destino necesita para reconstruirse (en
 * /buscar, el formulario entero; en las de tarjetas, cuál estaba elegida).
 * Desde el inicio no hace falta nada, así que ahí va sin estado.
 */
export default function EnlaceVolver({ a = '/', estado, texto = 'Volver al inicio' }) {
  return (
    <Link to={a} state={estado} className="boton-secundario">
      {/* aria-hidden: el texto del enlace ya dice a dónde va. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
      {texto}
    </Link>
  );
}
