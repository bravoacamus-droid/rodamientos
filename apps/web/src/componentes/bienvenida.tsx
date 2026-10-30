"use client";

// Cliente porque depende de algo que solo sabe el navegador: si se acaba de
// pulsar «Entrar» en esta pestaña.

import * as React from "react";
import { Logo } from "@/componentes/logo";
import { Rodamiento } from "@/componentes/rodamiento";

/**
 * La bienvenida al entrar (30/10).
 *
 * Luis, 30/10: *«cuando ingresa, también, animación de bienvenida»*.
 *
 * Sale UNA vez, justo después de iniciar sesión, y nunca más mientras se
 * trabaja: el login deja una marca en `sessionStorage` al enviarse
 * (`MARCA_RECIEN_ENTRA`) y esto la consume. Abrir otra pestaña, recargar o
 * volver al tablero no la repite. Dura 1,6 s, no tapa nada que haya que
 * esperar —la página carga debajo— y un clic la cierra antes.
 *
 * Con «reducir movimiento» del sistema no sale: una pantalla que aparece y
 * desaparece sin animación es solo un parpadeo.
 */
export const MARCA_RECIEN_ENTRA = "rodatech.recien-entra";

const DURACION = 1600;
const SALIDA = 450;

export function Bienvenida({ nombre, empresa }: { nombre: string; empresa: string }) {
  const [fase, setFase] = React.useState<"oculta" | "visible" | "saliendo">("oculta");

  React.useEffect(() => {
    let recienEntra = false;
    try {
      recienEntra = window.sessionStorage.getItem(MARCA_RECIEN_ENTRA) === "1";
      window.sessionStorage.removeItem(MARCA_RECIEN_ENTRA);
    } catch {
      // Sin almacenamiento (modo privado estricto): sin bienvenida, y ya.
    }
    if (!recienEntra) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setFase("visible");
    const salir = window.setTimeout(() => setFase("saliendo"), DURACION);
    const quitar = window.setTimeout(() => setFase("oculta"), DURACION + SALIDA);
    return () => {
      window.clearTimeout(salir);
      window.clearTimeout(quitar);
    };
  }, []);

  if (fase === "oculta") return null;

  const primerNombre = nombre.trim().split(/\s+/)[0] ?? "";
  const hoy = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Lima",
  }).format(new Date());
  // Mayúscula solo al principio: «Jueves, 30 de octubre». La clase
  // `capitalize` la ponía en cada palabra («30 De Octubre»).
  const fecha = hoy.charAt(0).toUpperCase() + hoy.slice(1);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => setFase("oculta")}
      className="fondo-marca fixed inset-0 z-[80] grid cursor-pointer place-items-center overflow-hidden px-6 print:hidden"
      // `position` aquí y no con `fixed`: `fondo-marca` pone `relative`, y
      // entre dos utilidades no está garantizado cuál gana.
      style={{
        position: "fixed",
        ...(fase === "saliendo" ? { animation: `rt-desvanecer ${SALIDA}ms ease-in forwards` } : {}),
      }}
    >
      {/* Los rodamientos de la marca, girando despacio detrás. */}
      <Rodamiento className="anim-girar-lento pointer-events-none absolute -right-32 -top-32 size-[34rem] text-white/[0.07]" />
      <Rodamiento className="anim-girar-inverso pointer-events-none absolute -bottom-40 -left-28 size-[28rem] text-accent-400/[0.12]" />

      <div className="relative flex flex-col items-center text-center">
        <span className="anim-aparecer-escala rounded-2xl bg-white px-5 py-4 shadow-[0_18px_50px_rgb(0_0_0/0.35)]">
          <Logo className="h-16 w-auto sm:h-20" />
        </span>
        <p
          className="anim-entrar mt-8 text-3xl font-bold tracking-tight sm:text-4xl"
          style={{ animationDelay: "220ms" }}
        >
          {primerNombre ? `¡Hola, ${primerNombre}!` : "¡Hola!"}
        </p>
        <p className="anim-entrar mt-2 text-lg text-white/85" style={{ animationDelay: "340ms" }}>
          Te damos la bienvenida a {empresa}
        </p>
        <p
          className="anim-entrar mt-1 text-base text-accent-300"
          style={{ animationDelay: "440ms" }}
        >
          {fecha}
        </p>
        <span
          className="filo-marca anim-crecer mt-6 block h-1 w-32 rounded-full"
          style={{ animationDelay: "520ms" }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
