import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import { ordenarImportaciones } from "../dominio/transito";
import type {
  FiltrosImportaciones,
  GastoImportacion,
  Importacion,
} from "../dominio/tipos";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

/**
 * Las compras del exterior.
 *
 * Sin paginar y con tope alto a propósito: son envíos pequeños por courier
 * (30:01), decenas al año, no miles. Y el sentido de la pantalla es ver de un
 * vistazo qué está fuera, no navegar un histórico.
 *
 * Las líneas se traen para saber cuántas ya llegaron enteras, que es lo que
 * distingue «llegó a medias» de «no ha llegado».
 */
export async function importaciones(
  filtros: FiltrosImportaciones,
  hoy: string,
): Promise<Resultado<Importacion[]>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("compras")
      .select(
        `id, numero, proveedor_id, fecha, fecha_estimada, documento_proveedor,
         courier, tracking, subtotal, gastos_importacion, total, estado,
         proveedores!inner(razon_social),
         compra_items(cantidad, cantidad_recibida)`,
      )
      .eq("tipo", "importacion")
      .neq("estado", "anulada")
      .order("fecha", { ascending: false })
      .limit(300);

    // «Abiertas» son las que todavía no han llegado del todo. Es el filtro que
    // más se usa: la pregunta de cada mañana es qué falta, no qué llegó.
    if (filtros.abiertas === "1") consulta = consulta.neq("estado", "recibida");

    if (filtros.q) {
      consulta = consulta.or(
        `numero.ilike.%${filtros.q}%,tracking.ilike.%${filtros.q}%,documento_proveedor.ilike.%${filtros.q}%,courier.ilike.%${filtros.q}%`,
      );
    }

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        proveedores: { razon_social: string };
        compra_items: { cantidad: number; cantidad_recibida: number }[];
      }
    >;

    return {
      ok: true,
      datos: ordenarImportaciones(
        crudas.map((c) => {
          const items = c.compra_items ?? [];
          return {
            id: String(c.id),
            numero: String(c.numero),
            proveedor_id: String(c.proveedor_id),
            proveedor: c.proveedores.razon_social,
            fecha: String(c.fecha),
            fecha_estimada: (c.fecha_estimada as string | null) ?? null,
            documento_proveedor: (c.documento_proveedor as string | null) ?? null,
            courier: (c.courier as string | null) ?? null,
            tracking: (c.tracking as string | null) ?? null,
            subtotal: Number(c.subtotal ?? 0),
            gastos: Number(c.gastos_importacion ?? 0),
            total: Number(c.total ?? 0),
            estado: String(c.estado),
            lineas: items.length,
            lineasRecibidas: items.filter(
              (i) => Number(i.cantidad_recibida) >= Number(i.cantidad),
            ).length,
          };
        }),
        hoy,
      ),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * El detalle de gastos de una importación.
 *
 * La tabla existe desde la 002 y estuvo vacía hasta la 022, porque el
 * constructor de compras guarda un único número en `compras.gastos_importacion`
 * y eso es lo que lee la recepción. Desde la 022, en cuanto hay detalle, un
 * disparador mantiene la columna igual a la suma: quien no detalle sigue
 * tecleando el total, y quien detalle manda.
 */
export async function gastosDe(
  compraId: string,
): Promise<Resultado<GastoImportacion[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("gastos_importacion")
      .select("id, compra_id, concepto, monto, fecha, documento")
      .eq("compra_id", compraId)
      .order("fecha")
      .order("creado_en");

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((g) => ({
        id: String(g.id),
        compra_id: String(g.compra_id),
        concepto: String(g.concepto),
        monto: Number(g.monto ?? 0),
        fecha: String(g.fecha),
        documento: (g.documento as string | null) ?? null,
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}
