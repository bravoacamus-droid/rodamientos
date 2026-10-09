import { aUsdSinIgv, type Moneda } from "@/modules/compras/dominio/comparador";

import { redondear2, redondear4 } from "./totales";

/**
 * A quién se le compra cada línea de la cotización, y a cuánto (111).
 *
 * Willy, en la hoja que le dibujó a Luis el 09/10: el 6308 2RS se cotiza por
 * 10 piezas; un proveedor tiene 7 y otro 3, a precios distintos, y el costo de
 * la línea es **(PC2 × 7 + PC3 × 3) / 10**. Luis: *«se tiene que convertir en
 * uno solo, porque tiene que salir el precio de costo de los dos»*.
 *
 * Puro: sin React y sin red. La base hace la misma cuenta al guardar
 * (`guardar_proveedores_de_lineas`) y es la que manda; esto es para verla en
 * vivo mientras se apunta.
 */

export type { Moneda };

export interface ProveedorLinea {
  proveedorId: string;
  nombre: string;
  /** Cuántas se le compran. 0 = solo se apunta su precio. */
  cantidad: number;
  /** Tal como lo dijo: en su moneda, con o sin IGV. Null = todavía no se sabe. */
  precio: number | null;
  moneda: Moneda;
  incluyeIgv: boolean;
  tipoCambio: number | null;
  /** El día que lo dijo (yyyy-mm-dd). Null = hoy. */
  fecha: string | null;
}

/** Lo que vale para el margen: dólares sin IGV. Null si falta algo. */
export function costoUsd(p: ProveedorLinea): number | null {
  return aUsdSinIgv(p.precio, p.moneda, p.tipoCambio, p.incluyeIgv);
}

export interface ResumenCompra {
  /** Cuántas se compran en total (las de cantidad > 0). */
  compradas: number;
  /** Lo que falta para la cantidad cotizada; 0 si ya se cubre. */
  falta: number;
  /** Lo que se compra de más, para stock. */
  sobra: number;
  /** El promedio ponderado en USD sin IGV. Null si no hay nada comprable. */
  costo: number | null;
  /** Filas con algo por resolver: sin precio, o en soles sin tipo de cambio. */
  incompletas: number;
}

export function resumirCompra(cantidad: number, proveedores: readonly ProveedorLinea[]): ResumenCompra {
  let compradas = 0;
  let suma = 0;
  let incompletas = 0;
  for (const p of proveedores) {
    const usd = costoUsd(p);
    if (usd === null) {
      incompletas++;
      continue;
    }
    if (p.cantidad > 0) {
      compradas += p.cantidad;
      suma += p.cantidad * usd;
    }
  }
  compradas = redondear2(compradas);
  return {
    compradas,
    falta: redondear2(Math.max(0, cantidad - compradas)),
    sobra: redondear2(Math.max(0, compradas - cantidad)),
    costo: compradas > 0 ? redondear4(suma / compradas) : null,
    incompletas,
  };
}

/**
 * Cuántas se le ponen al proveedor que se añade: lo que falta.
 *
 * Luis: *«el segundo producto, le piden 10; su primer proveedor solo tiene 8,
 * entonces tiene que añadir otro proveedor […] que recalcule: tiene que salir
 * 2»*. Si ya está cubierto, 0 — se está apuntando un precio, no comprando.
 */
export function cantidadParaElSiguiente(cantidad: number, proveedores: readonly ProveedorLinea[]): number {
  const puestas = proveedores.reduce((s, p) => s + (p.cantidad > 0 ? p.cantidad : 0), 0);
  return redondear2(Math.max(0, cantidad - puestas));
}

/** El margen sobre el COSTO (023): (venta − costo) / costo. */
export function margenSobreCosto(venta: number, costo: number | null): number | null {
  if (costo === null || !(costo > 0) || !Number.isFinite(venta)) return null;
  return (venta - costo) / costo;
}

/** El precio de venta que da ese margen sobre el costo, redondeado a centavos. */
export function precioConMargen(costo: number, margen: number): number {
  return redondear2(costo * (1 + margen));
}

/** Los márgenes que se ofrecen con un clic. */
export const MARGENES_RAPIDOS = [0.2, 0.3, 0.4, 0.5] as const;

/** Lo que va a la base: el precio tal cual lo dijo el proveedor. */
export function proveedoresAPayload(proveedores: readonly ProveedorLinea[]) {
  return proveedores
    .filter((p) => costoUsd(p) !== null)
    .map((p) => ({
      proveedor_id: p.proveedorId,
      cantidad: p.cantidad,
      costo_unitario: p.precio,
      moneda: p.moneda,
      incluye_igv: p.incluyeIgv,
      tipo_cambio: p.moneda === "PEN" ? p.tipoCambio : null,
      fecha: p.fecha,
    }));
}

// ---------------------------------------------------------------------------
// Las órdenes de compra
// ---------------------------------------------------------------------------

export interface LineaConfirmada {
  productoId: string;
  codigo: string;
  /** Lo cotizado. */
  cantidad: number;
  /** Lo que el cliente confirmó. */
  confirmada: number;
  unidad: string;
  proveedores: readonly ProveedorLinea[];
}

export interface ItemOrden {
  productoId: string;
  codigo: string;
  cantidad: number;
  /** En la moneda de la orden, SIN IGV: así lo espera `crear_compra`. */
  costo: number;
  unidad: string;
}

export interface OrdenPropuesta {
  proveedorId: string;
  nombre: string;
  moneda: Moneda;
  tipoCambio: number | null;
  items: ItemOrden[];
}

/** El precio sin IGV, en la moneda en que lo dio. */
function netoEnSuMoneda(p: ProveedorLinea, igv: number): number {
  const precio = p.precio ?? 0;
  return redondear4(p.incluyeIgv ? precio / (1 + igv) : precio);
}

/**
 * De lo confirmado a las órdenes de compra: una por proveedor.
 *
 * Si el cliente confirma MENOS de lo cotizado, se deja de comprar primero lo
 * más caro: con 7 a $10 y 3 a $12, confirmar 8 compra 7 + 1. Lo que se había
 * decidido comprar de más para stock se respeta, porque fue una decisión.
 *
 * La moneda de la orden es la del proveedor si todo lo suyo vino en soles;
 * si mezcla, en dólares. Las cantidades son enteras (Luis, 21/09).
 */
export function proponerOrdenes(lineas: readonly LineaConfirmada[], igv = 0.18): OrdenPropuesta[] {
  const porProveedor = new Map<string, { nombre: string; filas: { linea: LineaConfirmada; p: ProveedorLinea; cantidad: number }[] }>();

  for (const linea of lineas) {
    if (!(linea.confirmada > 0)) continue;
    const comprables = linea.proveedores.filter((p) => p.cantidad > 0 && costoUsd(p) !== null);
    if (comprables.length === 0) continue;

    let quitar = Math.max(0, linea.cantidad - linea.confirmada);
    const cantidades = new Map(comprables.map((p) => [p.proveedorId, p.cantidad]));
    // Del más caro al más barato.
    for (const p of [...comprables].sort((a, b) => (costoUsd(b) ?? 0) - (costoUsd(a) ?? 0))) {
      if (quitar <= 0) break;
      const tiene = cantidades.get(p.proveedorId) ?? 0;
      const menos = Math.min(tiene, quitar);
      cantidades.set(p.proveedorId, tiene - menos);
      quitar -= menos;
    }

    for (const p of comprables) {
      const cantidad = Math.round(cantidades.get(p.proveedorId) ?? 0);
      if (cantidad <= 0) continue;
      const grupo = porProveedor.get(p.proveedorId) ?? { nombre: p.nombre, filas: [] };
      grupo.filas.push({ linea, p, cantidad });
      porProveedor.set(p.proveedorId, grupo);
    }
  }

  return [...porProveedor.entries()]
    .map(([proveedorId, g]) => {
      const enSoles = g.filas.every((f) => f.p.moneda === "PEN");
      const moneda: Moneda = enSoles ? "PEN" : "USD";
      return {
        proveedorId,
        nombre: g.nombre,
        moneda,
        tipoCambio: enSoles ? (g.filas[0]?.p.tipoCambio ?? null) : null,
        items: g.filas.map((f) => ({
          productoId: f.linea.productoId,
          codigo: f.linea.codigo,
          cantidad: f.cantidad,
          costo: enSoles ? netoEnSuMoneda(f.p, igv) : (costoUsd(f.p) ?? 0),
          unidad: f.linea.unidad,
        })),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo guardado en `cotizacion_item_proveedores`, de vuelta a la pantalla. */
export function proveedoresGuardados(
  filas: readonly {
    proveedor_id: string;
    orden: number;
    cantidad: number | string;
    costo_unitario: number | string;
    moneda: string;
    incluye_igv: boolean;
    tipo_cambio: number | string | null;
    fecha: string;
    proveedores: { razon_social: string } | null;
  }[] | null | undefined,
): ProveedorLinea[] {
  return [...(filas ?? [])]
    .sort((a, b) => a.orden - b.orden)
    .map((f) => ({
      proveedorId: f.proveedor_id,
      nombre: f.proveedores?.razon_social ?? "—",
      cantidad: Number(f.cantidad),
      precio: Number(f.costo_unitario),
      moneda: f.moneda === "PEN" ? "PEN" : "USD",
      incluyeIgv: f.incluye_igv,
      tipoCambio: f.tipo_cambio === null ? null : Number(f.tipo_cambio),
      fecha: f.fecha,
    }));
}
