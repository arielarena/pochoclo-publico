import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ProveedorSesion } from './auth/ContextoSesion.jsx';
import { ProveedorTerminos } from './auth/ContextoTerminos.jsx';
import { ProveedorListas } from './listas/ContextoListas.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorSesion>
        {/* Adentro de ProveedorSesion porque pregunta por el usuario, y
            afuera de App porque el aviso de re-aceptación vive arriba de
            todas las pantallas y no dentro de una. */}
        <ProveedorTerminos>
          <ProveedorListas>
            <App />
          </ProveedorListas>
        </ProveedorTerminos>
      </ProveedorSesion>
    </BrowserRouter>
  </StrictMode>
);
