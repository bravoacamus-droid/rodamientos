// Sin "use client": son SVG y texto, se pintan igual en el servidor.

/*
 * PROPUESTA de logo (26/11) — concepto «La O que gira».
 *
 * La O de RODATECH es un rodamiento: la marca se lee de corrido y el producto
 * está dentro de ella, sin un dibujo aparte que haya que mirar. Conserva lo
 * que ya era de la casa —la cursiva, el azul y el dorado— y quita lo que no se
 * reproduce bien (biseles, sombras, el rótulo dentro de una caja).
 *
 * Es una propuesta y NO sustituye a public/logo.png: el resto del ERP y el
 * papel siguen con el logo de siempre hasta que Willy lo apruebe. Para volver
 * atrás en el login basta con poner otra vez <Logo /> en login/page.tsx.
 *
 * Ojo: las letras son texto con Manrope 800, no trazos. Para el login sirve;
 * para el archivo final del logo hay que convertirlas a contorno.
 */

const BOLAS = Array.from({ length: 8 }, (_, i) => {
  const angulo = (i / 8) * Math.PI * 2;
  // Redondeado: servidor y navegador tienen que pintar el mismo número.
  return {
    x: Math.round((50 + Math.cos(angulo) * 28.5) * 100) / 100,
    y: Math.round((50 + Math.sin(angulo) * 28.5) * 100) / 100,
  };
});

/**
 * El rodamiento de la marca: pista exterior, ocho bolas doradas y pista
 * interior. Las pistas van en `currentColor` para que sirva sobre azul y
 * sobre blanco; las bolas son doradas salvo que se pida otra cosa: de fondo,
 * en marca de agua, van del color del resto (`bolas="currentColor"`).
 */
export function RodamientoMarca({
  className,
  bolas = "var(--color-accent-400)",
}: {
  className?: string;
  bolas?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M50 0a50 50 0 1 0 .001 0zM50 12a38 38 0 1 0 .001 0z"
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M50 31a19 19 0 1 0 .001 0zM50 39a11 11 0 1 0 .001 0z"
      />
      <g fill={bolas}>
        {BOLAS.map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r="6.6" />
        ))}
      </g>
    </svg>
  );
}

/**
 * RODATECH con la O hecha rodamiento. El tamaño lo manda `font-size` (las
 * medidas de la O van en `em`), así que se escala con una clase `text-*`.
 * «RODA» toma el color del texto; «TECH» va siempre en dorado, por eso este
 * logotipo se pone sobre fondo oscuro: dorado sobre blanco no llega a 2:1.
 */
export function LogoRodatech({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Rodatech"
      className={`inline-flex -skew-x-12 items-center font-extrabold leading-none tracking-[-0.02em] ${className ?? ""}`}
    >
      <span aria-hidden="true">R</span>
      <RodamientoMarca className="mx-[0.02em] size-[0.78em]" />
      <span aria-hidden="true">DA</span>
      <span aria-hidden="true" className="text-accent-400">
        TECH
      </span>
    </span>
  );
}
