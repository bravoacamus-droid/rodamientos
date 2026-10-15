/**
 * La tabla de pedidos (131): filtros, orden, cifras de arriba y páginas.
 *
 * Luis, 15/10: *«en pedido tenemos que hacerlo tabla también, para poner ahí
 * ordenado, y los filtros también como en los demás módulos… aparte del
 * total, margen, estados, si está pagado o enviado a SUNAT o si ya tiene una
 * guía hecha… y KPIs informativos»*.
 *
 * Puro: las filas llegan ya armadas del servidor y aquí se cuentan. Los
 * pedidos son decenas al mes, así que filtrar y ordenar en memoria es más
 * simple y más honesto que un keyset sobre seis columnas ordenables.
 */

import { ETAPAS, type Etapa } from "./etapa";

export type EstadoSunatFactura = "aceptado" | "pendiente" | "rechazado";

export interface FacturaDelPedido {
  id: string;
  numero: string;
  /** En dólares, para sumar con los demás (los reportes van en USD). */
  saldoUsd: number;
  /** En la moneda de la factura, para enseñarlo. */
  saldo: number;
  moneda: "USD" | "PEN";
  vencida: boolean;
  sunat: EstadoSunatFactura;
}

export interface FilaPedido {
  id: string;
  numero: string;
  secuencia: number;
  fecha: string;
  cotizacionId: string;
  cotizacion: string;
  clienteId: string;
  cliente: string;
  /** La moneda de la venta (116) y su cambio, para enseñar el total en ella. */
  moneda: "USD" | "PEN";
  tipoCambio: number | null;
  /** Venta sin IGV y costo analizado, en dólares. */
  venta: number;
  costo: number;
  compras: { total: number; porRegistrar: number };
  guia: { id: string; numero: string; emitida: boolean } | null;
  facturas: FacturaDelPedido[];
  etapa: Etapa;
  productos: { codigo: string; cantidad: number }[];
}

/** El margen sobre el COSTO (023), o null si no hay costo con qué medirlo. */
export function margenPct(venta: number, costo: number): number | null {
  return costo > 0 ? Math.round(((venta - costo) / costo) * 1000) / 10 : null;
}

/** El total CON IGV, en la moneda de la venta: lo que se le cobra al cliente. */
export function totalVisible(f: Pick<FilaPedido, "venta" | "moneda" | "tipoCambio">, igv = 0.18): number {
  const usd = Math.round(f.venta * (1 + igv) * 100) / 100;
  return f.moneda === "PEN" && f.tipoCambio ? Math.round(usd * f.tipoCambio * 100) / 100 : usd;
}

export type Cobro = "sin_factura" | "pendiente" | "vencido" | "pagado";

export function cobroDe(f: Pick<FilaPedido, "facturas">): Cobro {
  if (f.facturas.length === 0) return "sin_factura";
  if (f.facturas.some((x) => x.saldoUsd > 0.005 && x.vencida)) return "vencido";
  if (f.facturas.some((x) => x.saldoUsd > 0.005)) return "pendiente";
  return "pagado";
}

/** El peor estado SUNAT de sus facturas: lo que hay que mirar. */
export function sunatDe(f: Pick<FilaPedido, "facturas">): EstadoSunatFactura | "sin_factura" {
  if (f.facturas.length === 0) return "sin_factura";
  if (f.facturas.some((x) => x.sunat === "rechazado")) return "rechazado";
  if (f.facturas.some((x) => x.sunat === "pendiente")) return "pendiente";
  return "aceptado";
}

export interface FiltrosPedidos {
  q?: string;
  cliente?: string;
  etapa?: string;
  cobro?: string;
  sunat?: string;
  guia?: string;
}

const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function filtrar(filas: readonly FilaPedido[], f: FiltrosPedidos): FilaPedido[] {
  const q = f.q ? normal(f.q.trim()) : "";
  return filas.filter(
    (p) =>
      (!q || [p.numero, p.cotizacion, p.cliente, ...p.productos.map((x) => x.codigo)].some((t) => normal(t).includes(q))) &&
      (!f.cliente || p.clienteId === f.cliente) &&
      (!f.etapa || p.etapa === f.etapa) &&
      (!f.cobro || cobroDe(p) === f.cobro) &&
      (!f.sunat || sunatDe(p) === f.sunat) &&
      (!f.guia || (f.guia === "con" ? p.guia?.emitida === true : !p.guia?.emitida)),
  );
}

export type Orden = "fecha" | "cliente" | "total" | "margen" | "etapa";
export const ORDENES: readonly Orden[] = ["fecha", "cliente", "total", "margen", "etapa"];

/** `?orden=total` ascendente, `?orden=-total` descendente. Por defecto, lo último primero. */
export function leerOrden(crudo: string | undefined): { campo: Orden; desc: boolean } {
  const desc = crudo?.startsWith("-") ?? true;
  const campo = ORDENES.find((o) => o === crudo?.replace(/^-/, ""));
  return campo ? { campo, desc } : { campo: "fecha", desc: true };
}

export function ordenar(filas: readonly FilaPedido[], campo: Orden, desc: boolean): FilaPedido[] {
  const valor = (p: FilaPedido): number | string => {
    switch (campo) {
      case "cliente":
        return normal(p.cliente);
      case "total":
        return p.venta;
      case "margen":
        return margenPct(p.venta, p.costo) ?? -Infinity;
      case "etapa":
        return ETAPAS.indexOf(p.etapa);
      default:
        return `${p.fecha}|${p.numero}`;
    }
  };
  const signo = desc ? -1 : 1;
  return [...filas].sort((a, b) => {
    const x = valor(a);
    const y = valor(b);
    return (x < y ? -1 : x > y ? 1 : a.numero.localeCompare(b.numero)) * signo;
  });
}

export interface Cifras {
  pedidos: number;
  venta: number;
  costo: number;
  margen: number | null;
  porRegistrarCompra: number;
  porFacturar: number;
  porCobrarUsd: number;
  vencidos: number;
}

/** Las cifras de arriba, de TODO lo filtrado (no solo de la página). */
export function cifras(filas: readonly FilaPedido[]): Cifras {
  const venta = Math.round(filas.reduce((a, p) => a + p.venta, 0) * 100) / 100;
  const costo = Math.round(filas.reduce((a, p) => a + p.costo, 0) * 100) / 100;
  return {
    pedidos: filas.length,
    venta,
    costo,
    // Solo de los que tienen costo: uno sin analizar no tiene margen, no 100 %.
    margen: (() => {
      const conCosto = filas.filter((p) => p.costo > 0);
      const v = conCosto.reduce((a, p) => a + p.venta, 0);
      const c = conCosto.reduce((a, p) => a + p.costo, 0);
      return margenPct(v, c);
    })(),
    porRegistrarCompra: filas.filter((p) => p.compras.porRegistrar > 0).length,
    porFacturar: filas.filter((p) => p.etapa === "por_facturar").length,
    porCobrarUsd: Math.round(filas.reduce((a, p) => a + p.facturas.reduce((s, x) => s + x.saldoUsd, 0), 0) * 100) / 100,
    vencidos: filas.filter((p) => cobroDe(p) === "vencido").length,
  };
}

/** Una página: la `pagina` es 1, 2, 3… */
export function paginar<T>(filas: readonly T[], pagina: number, tamano: number) {
  const paginas = Math.max(1, Math.ceil(filas.length / tamano));
  const actual = Math.min(Math.max(1, Math.trunc(pagina) || 1), paginas);
  return {
    filas: filas.slice((actual - 1) * tamano, actual * tamano),
    actual,
    paginas,
    anterior: actual > 1 ? String(actual - 1) : null,
    siguiente: actual < paginas ? String(actual + 1) : null,
  };
}
