export default function Cargando({ mensaje = 'Buscando algo bueno…' }) {
  return (
    <div role="status" className="flex flex-col items-center gap-4 py-16 text-crema/70">
      <div aria-hidden="true" className="flex gap-2">
        <span className="punto-carga h-3 w-3 rounded-full bg-manteca" style={{ animationDelay: '0s' }} />
        <span className="punto-carga h-3 w-3 rounded-full bg-terciopelo" style={{ animationDelay: '0.15s' }} />
        <span className="punto-carga h-3 w-3 rounded-full bg-manteca" style={{ animationDelay: '0.3s' }} />
      </div>
      <p className="font-display text-crema/60 italic">{mensaje}</p>
    </div>
  );
}
