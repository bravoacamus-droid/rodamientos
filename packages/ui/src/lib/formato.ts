/**
 * Formateo de números, importes y fechas para la interfaz.
 *
 * Nada de esto es cálculo de negocio: el IGV, la detracción y las cuotas
 * viven en el `dominio/` de cada módulo, no aquí. Esto solo pinta.
 *
 * Locale fijo `es-PE` a propósito: el formato no debe depender del idioma
 * del navegador del operador, porque un importe que cambia de separador
 * entre dos máquinas es una fuente de errores de digitación.
 */

export type CodigoMoneda = "USD" | "PEN";

const SIMBOLO: Record<CodigoMoneda, string> = { USD: "$", PEN: "S/" };

/** Siempre 2 decimales. Un importe nunca se muestra "redondeado bonito". */
const nfImporte = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const nfEntero = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });

const cacheDecimales = new Map<number, Intl.NumberFormat>();
function nfDecimales(decimales: number): Intl.NumberFormat {
  const existente = cacheDecimales.get(decimales);
  if (existente) return existente;
  const creado = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  cacheDecimales.set(decimales, creado);
  return creado;
}

function aNumero(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * `formatearMoneda(1234.5)` → `"$ 1,234.50"`.
 *
 * El símbolo se antepone a mano en vez de usar `style: "currency"` porque
 * `es-PE` renderiza USD como `US$`, y Willy trabaja siempre en dólares:
 * el prefijo redundante solo roba ancho de columna.
 */
export function formatearMoneda(
  valor: number | string | null | undefined,
  moneda: CodigoMoneda = "USD",
  opciones?: { sinSimbolo?: boolean },
): string {
  const n = aNumero(valor);
  const cifra = nfImporte.format(n);
  if (opciones?.sinSimbolo) return cifra;
  // El signo va delante del símbolo: "-$ 120.00" y no "$ -120.00".
  return n < 0 ? `-${SIMBOLO[moneda]} ${nfImporte.format(Math.abs(n))}` : `${SIMBOLO[moneda]} ${cifra}`;
}

/** Formato compacto para KPIs: `$ 1.2M`, `$ 84.5k`. Nunca en una tabla. */
export function formatearMonedaCorta(
  valor: number | string | null | undefined,
  moneda: CodigoMoneda = "USD",
): string {
  const n = aNumero(valor);
  const s = `${SIMBOLO[moneda]} `;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${s}${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${s}${(n / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `${s}${nfImporte.format(n)}`;
}

/** Cantidades, pesos, stock. `decimales = 0` da enteros con separador de miles. */
export function formatearNumero(valor: number | string | null | undefined, decimales = 2): string {
  const n = aNumero(valor);
  return decimales === 0 ? nfEntero.format(n) : nfDecimales(decimales).format(n);
}

export function formatearPorcentaje(valor: number | string | null | undefined, decimales = 1): string {
  const n = aNumero(valor);
  return `${n.toFixed(decimales)}%`;
}

/**
 * Variación porcentual contra el periodo anterior.
 * Devuelve `null` cuando no hay base de comparación: mostrar "+100%" porque
 * el mes pasado fue cero es mentir con estadística.
 */
export function variacionPorcentual(actual: number, previo: number): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(previo)) return null;
  if (previo === 0) return null;
  return ((actual - previo) / Math.abs(previo)) * 100;
}

function aFecha(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  // Una fecha ISO de 10 caracteres es un DATE de Postgres sin hora: se ancla
  // al mediodía para que el desplazamiento de zona no la mueva un día.
  const d = new Date(valor.length === 10 ? `${valor}T12:00:00` : valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatearFecha(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return "—";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatearFechaHora(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return "—";
  return d.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatearFechaLarga(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return "—";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
}

/** Iniciales para avatares. */
export function iniciales(nombre?: string | null): string {
  if (!nombre) return "··";
  return (
    nombre
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("") || "··"
  );
}
