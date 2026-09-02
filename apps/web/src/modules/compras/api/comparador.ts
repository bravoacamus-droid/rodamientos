import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type {
  EstadoRespuesta,
  ItemConsultado,
  Moneda,
  ProveedorConsultado,
  Respuesta,
} from "../dominio/comparador";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

export const POR_PAGINA = 30;

export type EstadoRonda = "abierta" | "cerrada" | "anulada";

export interface RondaEnLista {
  id: string;
  numero: string;
  fecha: string;
  estado: EstadoRonda;
  nota: string | null;
  productos: number;
  preguntados: number;
  contestaron: number;
  /** Cuántas compras salieron de esta ronda. Es el final de la historia. */
  compras: number;
}

/**
 * Las rondas de precios, de la más reciente a la más antigua.
 *
 * Los contadores se traen con `count` sobre el embed y no contando filas en
 * TypeScript: son cuatro consultas anidadas que PostgREST resuelve en una, y
 * contar arriba sería contar sobre la página —el fallo de §0.3, que ya mordió
 * tres veces.
 */
export async function rondas(
  estado?: EstadoRonda,
): Promise<Resultado<RondaEnLista[]>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("consultas_precio")
      .select(
        `id, numero, fecha, estado, nota,
         productos:consulta_precio_items(count),
         preguntados:consulta_precio_proveedores(count),
         compras:compras(count)`,
      )
      .order("fecha", { ascending: false })
      .order("id", { ascending: false })
      .limit(POR_PAGINA);

    if (estado) consulta = consulta.eq("estado", estado);

    const { data, error } = await consulta;
    if (error) return fallo(error, "compras/rondas");

    // Los que contestaron van aparte: es un `count` con filtro, y PostgREST
    // no admite dos agregados distintos sobre el mismo embed.
    const ids = (data ?? []).map((r) => String(r.id));
    const contestaron = new Map<string, number>();
    if (ids.length > 0) {
      const { data: resp, error: e2 } = await supabase
        .from("consulta_precio_proveedores")
        .select("consulta_id")
        .in("consulta_id", ids)
        .neq("estado", "esperando");
      if (e2) return fallo(e2, "compras/rondas");
      for (const fila of resp ?? []) {
        const k = String(fila.consulta_id);
        contestaron.set(k, (contestaron.get(k) ?? 0) + 1);
      }
    }

    return {
      ok: true,
      datos: (data ?? []).map((r) => ({
        id: String(r.id),
        numero: String(r.numero),
        fecha: String(r.fecha),
        estado: String(r.estado) as EstadoRonda,
        nota: (r.nota as string | null) ?? null,
        productos: contar(r.productos),
        preguntados: contar(r.preguntados),
        contestaron: contestaron.get(String(r.id)) ?? 0,
        compras: contar(r.compras),
      })),
    };
  } catch (e) {
    return fallo(e, "compras/rondas");
  }
}

/** PostgREST devuelve `[{count: n}]` para un embed agregado, y `[]` si no hay. */
function contar(v: unknown): number {
  if (Array.isArray(v)) {
    const primero = v[0] as { count?: number } | undefined;
    return Number(primero?.count ?? 0);
  }
  return 0;
}

export interface RondaDetalle {
  id: string;
  numero: string;
  fecha: string;
  estado: EstadoRonda;
  nota: string | null;
  items: ItemConsultado[];
  proveedores: ProveedorConsultado[];
  respuestas: Respuesta[];
  /** Las compras que ya salieron de aquí, para no proponerlas dos veces. */
  compras: { id: string; numero: string; proveedor_id: string }[];
}

/** Una ronda entera: qué se preguntó, a quién, y qué contestaron. */
export async function rondaDetalle(id: string): Promise<Resultado<RondaDetalle>> {
  try {
    const supabase = await clienteServidor();

    const { data: cab, error } = await supabase
      .from("consultas_precio")
      .select("id, numero, fecha, estado, nota")
      .eq("id", id)
      .maybeSingle();
    if (error) return fallo(error, "compras/rondaDetalle");
    if (!cab) return { ok: false, error: "Esa consulta de precios no existe." };

    const [items, provs, compras] = await Promise.all([
      supabase
        .from("consulta_precio_items")
        .select(
          `id, producto_id, cantidad, orden,
           producto:productos!consulta_precio_items_producto_id_fkey(
             codigo, descripcion, unidad_codigo, marca:marcas(nombre))`,
        )
        .eq("consulta_id", id)
        .order("orden"),
      supabase
        .from("consulta_precio_proveedores")
        .select(
          `id, proveedor_id, estado, moneda, tipo_cambio, incluye_igv,
           validez_hasta, dias_entrega, nota,
           proveedor:proveedores!consulta_precio_proveedores_proveedor_id_fkey(razon_social)`,
        )
        .eq("consulta_id", id),
      supabase
        .from("compras")
        .select("id, numero, proveedor_id")
        .eq("consulta_precio_id", id),
    ]);

    if (items.error) return fallo(items.error, "compras/rondaDetalle");
    if (provs.error) return fallo(provs.error, "compras/rondaDetalle");
    if (compras.error) return fallo(compras.error, "compras/rondaDetalle");

    const idsProv = (provs.data ?? []).map((p) => String(p.id));
    let respuestas: Respuesta[] = [];
    if (idsProv.length > 0) {
      const { data, error: e } = await supabase
        .from("consulta_precio_respuestas")
        .select("item_id, consulta_proveedor_id, costo_unitario, dias_entrega, disponible, nota")
        .in("consulta_proveedor_id", idsProv);
      if (e) return fallo(e, "compras/rondaDetalle");
      respuestas = (data ?? []).map((r) => ({
        item_id: String(r.item_id),
        consulta_proveedor_id: String(r.consulta_proveedor_id),
        costo_unitario: r.costo_unitario === null ? null : Number(r.costo_unitario),
        dias_entrega: r.dias_entrega === null ? null : Number(r.dias_entrega),
        disponible: Boolean(r.disponible),
        nota: (r.nota as string | null) ?? null,
      }));
    }

    const proveedores: ProveedorConsultado[] = (provs.data ?? [])
      .map((p) => {
        const prov = p.proveedor as { razon_social?: string } | null;
        return {
          consulta_proveedor_id: String(p.id),
          proveedor_id: String(p.proveedor_id),
          proveedor: String(prov?.razon_social ?? "—"),
          estado: String(p.estado) as EstadoRespuesta,
          moneda: String(p.moneda) as Moneda,
          tipo_cambio: p.tipo_cambio === null ? null : Number(p.tipo_cambio),
          incluye_igv: Boolean(p.incluye_igv),
          validez_hasta: (p.validez_hasta as string | null) ?? null,
          dias_entrega: p.dias_entrega === null ? null : Number(p.dias_entrega),
          nota: (p.nota as string | null) ?? null,
        };
      })
      // Estable: la rejilla tiene una columna por proveedor y no puede
      // cambiar de orden entre dos cargas.
      .sort((a, b) => a.proveedor.localeCompare(b.proveedor));

    return {
      ok: true,
      datos: {
        id: String(cab.id),
        numero: String(cab.numero),
        fecha: String(cab.fecha),
        estado: String(cab.estado) as EstadoRonda,
        nota: (cab.nota as string | null) ?? null,
        items: (items.data ?? []).map((i) => {
          const p = i.producto as {
            codigo?: string;
            descripcion?: string;
            unidad_codigo?: string;
            marca?: { nombre?: string } | null;
          } | null;
          return {
            item_id: String(i.id),
            producto_id: String(i.producto_id),
            codigo: String(p?.codigo ?? "—"),
            descripcion: String(p?.descripcion ?? "—"),
            marca: p?.marca?.nombre ?? null,
            unidad: String(p?.unidad_codigo ?? "NIU"),
            cantidad: Number(i.cantidad),
          };
        }),
        proveedores,
        respuestas,
        compras: (compras.data ?? []).map((c) => ({
          id: String(c.id),
          numero: String(c.numero),
          proveedor_id: String(c.proveedor_id),
        })),
      },
    };
  } catch (e) {
    return fallo(e, "compras/rondaDetalle");
  }
}

export interface PrecioHistorico {
  consulta: string;
  fecha: string;
  proveedor: string;
  costoUsd: number;
  disponible: boolean;
}

/**
 * A cuánto le dejaron un producto las últimas veces que preguntó.
 *
 * Es la mitad de «que haya historial y mejorar los precios» que no se ve en
 * una sola ronda: sirve para saber si lo que le acaban de decir es caro o
 * barato **para ese producto**, no solo respecto de los otros dos que
 * contestaron hoy.
 */
export async function historialDePrecios(
  productoId: string,
  limite = 10,
): Promise<Resultado<PrecioHistorico[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_comparativa_precios")
      .select("consulta, fecha, proveedor, costo_usd, disponible")
      .eq("producto_id", productoId)
      .not("costo_usd", "is", null)
      .order("fecha", { ascending: false })
      .limit(limite);

    if (error) return fallo(error, "compras/historialDePrecios");

    return {
      ok: true,
      datos: (data ?? []).map((f) => ({
        consulta: String(f.consulta),
        fecha: String(f.fecha),
        proveedor: String(f.proveedor),
        costoUsd: Number(f.costo_usd),
        disponible: Boolean(f.disponible),
      })),
    };
  } catch (e) {
    return fallo(e, "compras/historialDePrecios");
  }
}
