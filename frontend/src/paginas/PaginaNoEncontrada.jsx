/**
 * El 404 del frontend: la ruta comodín de App.jsx, o sea todo lo que no
 * coincidió con ninguna de las rutas reales.
 *
 * NO SE MUESTRA LA DIRECCIÓN QUE SE PIDIÓ, y es a propósito. Es lo primero
 * que uno quiere poner acá ("buscamos /tal-cosa y no encontramos nada"), pero
 * eso es texto que escribe quien manda el enlace, dibujado adentro de nuestra
 * página y con nuestra marca alrededor. React lo escapa, así que no hay
 * inyección de HTML, pero sí alcanza para un engaño de texto: un enlace a
 * `pochoclo.ar/tu-cuenta-fue-bloqueada-escribi-a-soporte@otrositio.com` se
 * leería como un aviso nuestro. Es un riesgo chico y evitable, y lo que se
 * pierde es poco: la dirección ya está en la barra del navegador, arriba de
 * todo.
 *
 * OJO CON UNA MITAD QUE NO ES NUESTRA: esto lo ve quien llega a una dirección
 * inexistente CON LA APP YA CARGADA (un enlace viejo, un clic dentro del
 * sitio). Quien escribe la dirección a mano o entra desde afuera le pega
 * primero al hosting, y ahí el 404 lo contesta el hosting salvo que esté
 * configurado el "SPA fallback" (servir index.html para cualquier ruta).
 * Sin eso, además, cualquier enlace profundo compartido deja de andar, no
 * solo el 404.
 */
import { Link } from 'react-router-dom';
import PaginaError from './PaginaError.jsx';
import useMetadatos from '../utils/useMetadatos.js';

export default function PaginaNoEncontrada() {
  useMetadatos('noEncontrada');

  return (
    <PaginaError
      codigo="404"
      ilustracion="404"
      titulo="Esta página no existe"
      mensaje="Puede que el enlace esté mal escrito, o que apunte a algo que sacamos. Lo que sí existe es todo lo demás: elegí por dónde seguir."
      acciones={
        <>
          <Link to="/" className="boton-primario">
            Ir al inicio
          </Link>
          <Link to="/buscar" className="boton-secundario">
            Buscar algo para ver
          </Link>
        </>
      }
    />
  );
}
