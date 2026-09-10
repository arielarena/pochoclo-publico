import { CLASES_GRILLA } from './GrillaResultados.jsx';

/**
 * Esqueleto de la grilla de resultados, para mostrar mientras se busca.
 *
 * Una búsqueda tarda entre 2,5 y 3 segundos (ver la sección 4.9.1 de
 * las notas de decisiones del proyecto), que es demasiado para tres puntitos: no dan idea de qué está
 * por aparecer ni de cuánto va a ocupar. El esqueleto usa exactamente la
 * misma grilla y la misma proporción de póster que las tarjetas reales, así
 * que además de dar señal de progreso RESERVA EL ESPACIO: cuando llegan los
 * datos, la página no salta.
 *
 * Va con aria-hidden y sin texto: quien usa un lector de pantalla no gana
 * nada con doce cajas vacías anunciadas una por una. El aviso de que se está
 * buscando lo da el role="status" de quien lo invoca.
 */
export default function EsqueletoGrilla({ cantidad = 10 }) {
  return (
    <div aria-hidden="true" className={CLASES_GRILLA}>
      {Array.from({ length: cantidad }, (_, i) => (
        <div key={i} className="tarjeta overflow-hidden">
          <div className="esqueleto aspect-2/3 w-full" />
          <div className="space-y-2 p-3">
            <div className="esqueleto h-2.5 w-1/2 rounded-full" />
            <div className="esqueleto h-3.5 w-full rounded-full" />
            <div className="esqueleto h-3 w-1/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
