// Sin "use client": es un SVG y se pinta igual en el servidor.

/** Un rodamiento de bolas en trazo: el anillo exterior, el interior y las bolas. */
export function Rodamiento({ className }: { className?: string }) {
  const bolas = Array.from({ length: 10 }, (_, i) => {
    const angulo = (i / 10) * Math.PI * 2;
    // Redondeado: el servidor y el navegador tienen que pintar el mismo número
    // o React avisa de hidratación distinta.
    return {
      x: Math.round((100 + Math.cos(angulo) * 68) * 100) / 100,
      y: Math.round((100 + Math.sin(angulo) * 68) * 100) / 100,
    };
  });
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden="true" className={className}>
      <circle cx="100" cy="100" r="96" stroke="currentColor" strokeWidth="6" />
      <circle cx="100" cy="100" r="84" stroke="currentColor" strokeWidth="2" />
      <circle cx="100" cy="100" r="52" stroke="currentColor" strokeWidth="2" />
      <circle cx="100" cy="100" r="40" stroke="currentColor" strokeWidth="6" />
      {bolas.map((b, i) => (
        <circle key={i} cx={b.x} cy={b.y} r="13" fill="currentColor" />
      ))}
    </svg>
  );
}
