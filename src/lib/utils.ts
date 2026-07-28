import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ------------------------------------------------------------------ Números */

const nfPEN = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
});
const nfUSD = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});
const nfNum = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });
const nfInt = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });

export function money(value: number | string | null | undefined, currency = "PEN") {
  const n = Number(value ?? 0);
  return currency === "USD" ? nfUSD.format(n) : nfPEN.format(n);
}

/** Formato compacto para tarjetas KPI: S/ 1.2M, S/ 84.5k */
export function moneyShort(value: number | string | null | undefined, currency = "PEN") {
  const n = Number(value ?? 0);
  const s = currency === "USD" ? "$ " : "S/ ";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${s}${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${s}${(n / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `${s}${nfNum.format(n)}`;
}

export function num(value: number | string | null | undefined, decimals = 2) {
  const n = Number(value ?? 0);
  return decimals === 0 ? nfInt.format(n) : nfNum.format(n);
}

export function pct(value: number | string | null | undefined, decimals = 1) {
  const n = Number(value ?? 0);
  return `${n.toFixed(decimals)}%`;
}

export function variacion(actual: number, previo: number) {
  if (!previo) return actual > 0 ? 100 : 0;
  return ((actual - previo) / Math.abs(previo)) * 100;
}

/* ------------------------------------------------------------------- Fechas */

export function fecha(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value + (value.length === 10 ? "T12:00:00" : "")) : value;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fechaLarga(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value + (value.length === 10 ? "T12:00:00" : "")) : value;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
}

export function fechaHora(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("es-PE", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function haceTiempo(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const seg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return "hace instantes";
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const dias = Math.floor(hrs / 24);
  if (dias < 30) return `hace ${dias} d`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} meses`;
  return `hace ${Math.floor(meses / 12)} años`;
}

export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function sumarDias(iso: string, dias: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function inicioDeMesISO(offsetMeses = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMeses);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------- Texto */

export function iniciales(nombre?: string | null) {
  if (!nombre) return "··";
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function truncar(texto: string, max = 60) {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

export function slugify(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Enlace de WhatsApp con mensaje precargado */
export function whatsappUrl(telefono?: string | null, mensaje?: string) {
  if (!telefono) return null;
  const limpio = telefono.replace(/\D/g, "");
  const numero = limpio.startsWith("51") ? limpio : `51${limpio}`;
  return `https://wa.me/${numero}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ""}`;
}

/* ------------------------------------------------------------------ Utility */

export function debounce<T extends (...args: never[]) => void>(fn: T, ms = 300) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function rangoAging(dias: number) {
  if (dias <= 0) return "Vigente";
  if (dias <= 15) return "1-15 días";
  if (dias <= 30) return "16-30 días";
  if (dias <= 60) return "31-60 días";
  return "Más de 60 días";
}
