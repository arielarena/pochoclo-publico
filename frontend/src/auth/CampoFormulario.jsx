/**
 * Campo etiquetado para los formularios de cuenta. Las tres pantallas
 * (iniciar sesión, crear cuenta, perfil) usan los mismos estilos de input que
 * el resto de la app, así que en vez de repetirlos en tres archivos viven acá.
 *
 * La etiqueta es visible, no un placeholder: un placeholder desaparece al
 * escribir y deja al usuario sin saber qué campo está completando, que es
 * uno de los problemas clásicos de accesibilidad en formularios de login.
 *
 * `error` es el mensaje de validación del propio campo, el que aparece al
 * salir de él. Va acá adentro y no suelto en cada página porque hay tres
 * cosas que tienen que moverse juntas y es fácil olvidarse de alguna:
 * `aria-invalid` (que además pinta el borde en rojo, ver la clase `campo`),
 * el `aria-describedby` que ata el mensaje al campo, y el `role="alert"` que
 * hace que un lector de pantalla lo anuncie sin tener que ir a buscarlo.
 */
import RegionViva from '../components/RegionViva.jsx';
export default function CampoFormulario({
  id,
  etiqueta,
  tipo = 'text',
  valor,
  onCambiar,
  autoComplete,
  requerido = true,
  ayuda,
  error,
  /**
   * Id de un elemento externo que también describe al campo (hoy, la lista
   * de requisitos de la contraseña). Va como prop y no suelto en `...resto`
   * porque el spread PISARÍA el aria-describedby que arma el componente: el
   * campo perdería en silencio la relación con su propio mensaje de error o
   * su texto de ayuda, que es justo lo que este componente existe para no
   * olvidarse.
   */
  describePor,
  ...resto
}) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = error ? `${id}-error` : undefined;
  /**
   * El error va primero: si el campo tiene los dos, es lo primero que
   * conviene escuchar.
   */
  const descrito = [idError, idAyuda, describePor].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="etiqueta-campo">
        {etiqueta}
      </label>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        autoComplete={autoComplete}
        required={requerido}
        aria-invalid={error ? true : undefined}
        aria-describedby={descrito}
        className="campo mt-1.5"
        {...resto}
      />
      {error && (
        <RegionViva rol="alert" id={idError}  className="mensaje-error mt-1.5">
          {error}
        </RegionViva>
      )}
      {ayuda && (
        <p id={idAyuda} className="texto-ayuda mt-1.5">
          {ayuda}
        </p>
      )}
    </div>
  );
}
