import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from '../auth/ContextoSesion.jsx';
import Cargando from './Cargando.jsx';

/**
 * Envuelve las rutas que no tienen sentido sin cuenta (perfil, y desde la
 * milestone 19 las listas). Manda a /iniciar-sesion guardando a dónde quería ir el
 * usuario, así después del login vuelve ahí y no al inicio.
 *
 * El estado de carga importa: `usuario` arranca en null mientras Better
 * Auth todavía está resolviendo la sesión, y sin esperar ese momento un
 * usuario con la sesión abierta vería un redirect a /iniciar-sesion cada vez que
 * recarga la página.
 */
export default function RutaPrivada({ children }) {
  const { usuario, cargando } = useSesion();
  const ubicacion = useLocation();

  if (cargando) {
    return (
      <main id="contenido" className="pagina-ancho">
        <Cargando mensaje="Un segundo…" />
      </main>
    );
  }

  if (!usuario) {
    return <Navigate to="/iniciar-sesion" replace state={{ destino: ubicacion.pathname }} />;
  }

  return children;
}
