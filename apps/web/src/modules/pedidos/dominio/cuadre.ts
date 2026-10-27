/**
 * ¿Cuadra el pedido? (161)
 *
 * Luis, 27/10: *«trazabilidad de todo por pedido, si ya se facturó, si se
 * hizo la guía, todo tiene que cuadrar»*. Tres cifras, de un vistazo, arriba
 * de la ficha: despachado X de Y, facturado X de Y, cobrado $ X de $ Y.
 *
 * Despachado y facturado van en unidades —«faltan 4 de 10» es lo que se
 * cuenta en el almacén— y salen de `v_pedido_avance`, la misma vista que usa
 * el aviso de pedido a medio despachar: si contaran por separado, la ficha y
 * el aviso acabarían diciendo cosas distintas. El cobro va en dinero, en la
 * moneda de cada factura.
 *
 * Puro: sin React y sin fetch.
 */

import type { DespachoDelPedido } from "./etapa";

export type EstadoCifra = "nada" | "parte" | "todo";

export interface CifraEnUnidades {
  hecho: number;
  de: number;
  estado: EstadoCifra;
}

export interface CobroEnMoneda {
  moneda: "USD" | "PEN";
  cobrado: number;
  total: number;
  estado: EstadoCifra;
}

export interface CuadreDelPedido {
  despachado: CifraEnUnidades | null;
  facturado: CifraEnUnidades | null;
  /** Una por moneda; vacío si no hay facturas. */
  cobrado: CobroEnMoneda[];
}

const TOLERANCIA = 0.005;

function estadoDe(hecho: number, de: number): EstadoCifra {
  if (hecho <= TOLERANCIA) return "nada";
  return hecho >= de - TOLERANCIA ? "todo" : "parte";
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function cuadreDelPedido(
  despacho: DespachoDelPedido | null | undefined,
  facturas: readonly { tipo: string; total: number; saldo: number; moneda: "USD" | "PEN" }[],
): CuadreDelPedido {
  const unidades = (hecho: number): CifraEnUnidades | null =>
    despacho && despacho.confirmado > 0
      ? { hecho, de: despacho.confirmado, estado: estadoDe(hecho, despacho.confirmado) }
      : null;

  // Solo facturas y boletas: una nota de crédito ya baja el saldo de la
  // factura a la que se refiere (157), así que sumarla otra vez la contaría
  // dos veces.
  const porMoneda = new Map<"USD" | "PEN", { cobrado: number; total: number }>();
  for (const f of facturas) {
    if (f.tipo !== "factura" && f.tipo !== "boleta") continue;
    const m = porMoneda.get(f.moneda) ?? { cobrado: 0, total: 0 };
    m.total += f.total;
    m.cobrado += Math.max(0, f.total - f.saldo);
    porMoneda.set(f.moneda, m);
  }

  return {
    despachado: unidades(despacho?.despachado ?? 0),
    facturado: unidades(despacho?.facturado ?? 0),
    cobrado: [...porMoneda.entries()].map(([moneda, m]) => ({
      moneda,
      cobrado: redondear(m.cobrado),
      total: redondear(m.total),
      estado: m.total > TOLERANCIA ? estadoDe(m.cobrado, m.total) : "nada",
    })),
  };
}
