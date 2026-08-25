"use client";

import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Un número que cuenta hasta su valor al aparecer.
 *
 * No es adorno: un indicador que aparece ya escrito se lee como parte del
 * fondo, y uno que se mueve durante medio segundo obliga a mirarlo. En un
 * tablero con seis cifras, eso es la diferencia entre verlas y no verlas.
 *
 * Tres cosas que lo hacen usable y no molesto:
 *
 *  · **Respeta `prefers-reduced-motion`**: si el sistema lo pide, pinta el
 *    valor final y no anima nada. Willy tiene esto abierto ocho horas.
 *  · **Solo anima al entrar en pantalla**, con IntersectionObserver. Una cifra
 *    que se anima mientras está fuera del viewport es trabajo tirado, y peor:
 *    cuando el usuario llega, ya terminó.
 *  · **Cuenta con `requestAnimationFrame`**, no con `setInterval`. El navegador
 *    decide cuándo hay hueco; con intervalos, una pestaña ocupada da saltos.
 */
export function CifraAnimada({
  valor,
  decimales = 0,
  prefijo = "",
  sufijo = "",
  duracion = 620,
  className,
}: {
  valor: number;
  decimales?: number;
  prefijo?: string;
  sufijo?: string;
  /** Milisegundos. Por encima de ~800 deja de leerse como reacción. */
  duracion?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [mostrado, setMostrado] = React.useState(valor);
  const yaAnimado = React.useRef(false);

  React.useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;

    const reducido =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reducido || valor === 0) {
      setMostrado(valor);
      return;
    }

    // Al cambiar el valor —un filtro nuevo, por ejemplo— se vuelve a animar.
    yaAnimado.current = false;
    setMostrado(0);

    let cancelar: number | null = null;

    const animar = () => {
      const inicio = performance.now();
      const paso = (ahora: number) => {
        const t = Math.min(1, (ahora - inicio) / duracion);
        // easeOutCubic: arranca rápido y frena. Es el que se lee como "llegó",
        // frente al lineal, que parece que se quedó a medias.
        const suave = 1 - Math.pow(1 - t, 3);
        setMostrado(valor * suave);
        if (t < 1) cancelar = requestAnimationFrame(paso);
        else setMostrado(valor);
      };
      cancelar = requestAnimationFrame(paso);
    };

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting && !yaAnimado.current) {
            yaAnimado.current = true;
            animar();
            observador.disconnect();
          }
        }
      },
      { threshold: 0.2 },
    );

    observador.observe(nodo);

    return () => {
      observador.disconnect();
      if (cancelar !== null) cancelAnimationFrame(cancelar);
    };
  }, [valor, duracion]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {prefijo}
      {mostrado.toLocaleString("es-PE", {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      })}
      {sufijo}
    </span>
  );
}
