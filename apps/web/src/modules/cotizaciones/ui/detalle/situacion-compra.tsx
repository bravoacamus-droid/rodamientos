import { CircleCheck, PackageSearch, ShoppingCart, TriangleAlert } from "lucide-react";

import { proveedoresGuardados, resumirCompra } from "../../dominio/compra-linea";
import {
  resumirSituaciones,
  situacionDeLinea,
  type ResumenSituacion,
  type SituacionLinea,
} from "../../dominio/situacion-linea";

/**
 * «Almacén o compra», línea a línea, en la ficha de una cotización que
 * todavía no se aprobó (04/11).
 *
 * Luis, 04/11: *«cuando abra una cotización… con la cantidad, que aparezca
 * si tiene stock, si se hizo el análisis o si se tiene que hacer el análisis
 * de compra»*. Hasta hoy eso solo se veía entrando a editar, línea por línea.
 *
 * Se calcula con el stock de HOY: si la mercadería llegó después de analizar
 * la compra, aquí ya sale del almacén (186).
 */

type LineaFicha = {
  producto_id: string | null;
  cantidad: number;
  stock: number;
  comprar_igual: boolean;
  productos: { es_kit: boolean } | null;
  cotizacion_item_proveedores: Parameters<typeof proveedoresGuardados>[0];
};

export interface DatosSituacion {
  situacion: SituacionLinea;
  stock: number;
  necesita: number;
  esKit: boolean;
  /** «ROATSA · USD 5.13» o «2 proveedores · USD 5.40». */
  compra: string | null;
  comprarIgual: boolean;
}

const usd = (n: number) => `USD ${n.toFixed(2)}`;

export function datosDeSituacion(l: LineaFicha): DatosSituacion {
  const proveedores = proveedoresGuardados(l.cotizacion_item_proveedores);
  const necesita = Number(l.cantidad);
  const r = resumirCompra(necesita, proveedores);
  const comprando = proveedores.filter((p) => p.cantidad > 0);
  const esKit = Boolean(l.productos?.es_kit);
  return {
    situacion: situacionDeLinea({
      productoId: l.producto_id,
      esKit,
      necesita,
      stock: l.stock,
      analizada: r.costo !== null,
      comprarIgual: l.comprar_igual,
    }),
    stock: l.stock,
    necesita,
    esKit,
    compra:
      r.costo === null
        ? null
        : `${comprando.length === 1 ? (comprando[0]?.nombre ?? "—") : `${comprando.length} proveedores`} · ${usd(r.costo)}`,
    comprarIgual: l.comprar_igual,
  };
}

export function resumenDeSituaciones(datos: readonly DatosSituacion[]): ResumenSituacion {
  return resumirSituaciones(datos.map((d) => d.situacion));
}

/** La celda de la tabla (y la línea de la tarjeta en el teléfono). */
export function SituacionCompra({ d }: { d: DatosSituacion }) {
  switch (d.situacion) {
    case "almacen":
    case "almacen_con_analisis":
      return (
        <span className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-[var(--ok)]">
            <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
            Sale del almacén · hay {d.stock}
          </span>
          {d.situacion === "almacen_con_analisis" ? (
            <span className="text-sm text-[var(--fg-muted)]">Ya llegó: el análisis queda de referencia</span>
          ) : null}
        </span>
      );
    case "comprar":
      return (
        <span className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium">
            <ShoppingCart className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
            Compra analizada
          </span>
          <span className="text-sm text-[var(--fg-muted)]">{d.compra}</span>
          {d.comprarIgual && d.stock > 0 ? (
            <span className="text-sm text-[var(--info)]">Comprar igual · hay {d.stock}</span>
          ) : null}
        </span>
      );
    case "parcial":
      return (
        <span className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-[var(--warn)]">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            Hay {d.stock} de {d.necesita}
          </span>
          <span className="text-sm text-[var(--fg-muted)]">Falta analizar la compra del resto</span>
        </span>
      );
    case "falta_analizar":
      return (
        <span className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-[var(--warn)]">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            Sin stock
          </span>
          <span className="text-sm text-[var(--fg-muted)]">Falta analizar la compra</span>
        </span>
      );
    default:
      return d.esKit ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--fg-muted)]">
          <PackageSearch className="size-4 shrink-0" aria-hidden="true" />
          Kit: lo dicen sus piezas
        </span>
      ) : (
        <span className="text-sm text-[var(--fg-subtle)]">—</span>
      );
  }
}

/** Encima de la tabla: cuántas salen del almacén, cuántas se compran y cuántas faltan. */
export function ResumenSituacionCompra({ r }: { r: ResumenSituacion }) {
  if (r.almacen + r.comprar + r.faltaAnalizar === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      {r.almacen > 0 ? (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--ok)] px-2.5 py-1 font-medium text-[var(--ok)]">
          <CircleCheck className="size-4" aria-hidden="true" />
          {r.almacen === 1 ? "1 sale del almacén" : `${r.almacen} salen del almacén`}
        </span>
      ) : null}
      {r.comprar > 0 ? (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-2.5 py-1 font-medium">
          <ShoppingCart className="size-4 text-brand-600" aria-hidden="true" />
          {r.comprar === 1 ? "1 con la compra analizada" : `${r.comprar} con la compra analizada`}
        </span>
      ) : null}
      {r.faltaAnalizar > 0 ? (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] px-2.5 py-1 font-medium">
          <TriangleAlert className="size-4 text-[var(--warn)]" aria-hidden="true" />
          {r.faltaAnalizar} sin análisis de compra · se pide al aprobar
        </span>
      ) : null}
    </div>
  );
}
