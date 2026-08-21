import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Une clases resolviendo conflictos de Tailwind (la última gana).
 * Es la única utilidad que importan TODOS los componentes del paquete.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Agrupa llamadas seguidas en una sola tras `ms` de silencio.
 * Lo usa el buscador de productos: sin esto, escribir "6205" son cuatro
 * consultas al catálogo en vez de una.
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms = 300,
): ((...args: Parameters<T>) => void) & { cancelar: () => void } {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const envuelta = (...args: Parameters<T>) => {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), ms);
  };
  envuelta.cancelar = () => {
    if (temporizador) clearTimeout(temporizador);
  };
  return envuelta;
}
