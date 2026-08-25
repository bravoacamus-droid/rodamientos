import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import type {
  CompraPendiente,
  FiltrosRecepciones,
  RecepcionDetalle,
  RecepcionLista,
} from "../dominio/tipos";

export const POR_PAGINA = 30;

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

function fallo(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

/** Lo que PostgREST devuelve al anidar un producto con su marca. */
interface ProductoAnidado {
  codigo: string;
  descripcion: string;
  unidad_codigo: string;
  marcas: { nombre: string } | null;
}

/**
 * Listado de recepciones.
 *
 * Keyset sobre `numero` descendente, igual que cotizaciones: el número es
 * `REC-26-00001`, con año de dos cifras y relleno de ceros, así que ordena
 * bien como texto y no hace falta un índice aparte ni un OFFSET que se
 * degrada. Se pide un elemento de más para saber si hay página siguiente sin
 * pagar un `count` sobre toda la tabla.
 */
export async function listarRecepciones(
  filtros: FiltrosRecepciones,
): Promise<Resultado<{ filas: RecepcionLista[]; siguiente: string | null }>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("recepciones")
      .select(
        `id, numero, fecha, guia_proveedor, factura_proveedor, anulada,
         proveedores(razon_social),
         compras(numero),
         perfiles(nombre),
         recepcion_items(cantidad, costo_unitario)`,
      )
      .order("numero", { ascending: false })
      .limit(POR_PAGINA + 1);

    if (filtros.cursor) consulta = consulta.lt("numero", filtros.cursor);
    if (filtros.proveedor) consulta = consulta.eq("proveedor_id", filtros.proveedor);
    if (filtros.desde) consulta = consulta.gte("fecha", filtros.desde);
    if (filtros.hasta) consulta = consulta.lte("fecha", filtros.hasta);
    if (filtros.q) {
      // Por lo que se busca una recepción concreta: su número, o el documento
      // del proveedor que se tiene delante en papel.
      consulta = consulta.or(
        `numero.ilike.%${filtros.q}%,guia_proveedor.ilike.%${filtros.q}%,factura_proveedor.ilike.%${filtros.q}%`,
      );
    }

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        proveedores: { razon_social: string } | null;
        compras: { numero: string } | null;
        perfiles: { nombre: string } | null;
        // Se traen los ítems en vez de pedir `recepcion_items(count)` porque
        // hacen falta las dos cosas —cuántos y por cuánto— y una recepción
        // tiene decenas de líneas, no miles: sale más barato una consulta con
        // el anidado que dos viajes.
        recepcion_items: { cantidad: number; costo_unitario: number }[] | null;
      }
    >;

    const todas: RecepcionLista[] = crudas.map((r) => {
      const items = r.recepcion_items ?? [];
      return {
        id: String(r.id),
        numero: String(r.numero),
        fecha: String(r.fecha),
        proveedor: r.proveedores?.razon_social ?? null,
        compra_numero: r.compras?.numero ?? null,
        guia_proveedor: (r.guia_proveedor as string | null) ?? null,
        factura_proveedor: (r.factura_proveedor as string | null) ?? null,
        recibido_por: r.perfiles?.nombre ?? null,
        anulada: Boolean(r.anulada),
        items: items.length,
        // Sin los gastos prorrateados: es lo que se le pagó al proveedor, que
        // es contra lo que se cuadra la factura.
        valorizado:
          Math.round(
            items.reduce(
              (a, i) => a + Number(i.cantidad ?? 0) * Number(i.costo_unitario ?? 0),
              0,
            ) * 100,
          ) / 100,
      };
    });

    const hayMas = todas.length > POR_PAGINA;
    const filas = hayMas ? todas.slice(0, POR_PAGINA) : todas;

    return {
      ok: true,
      datos: {
        filas,
        siguiente: hayMas ? (filas[filas.length - 1]?.numero ?? null) : null,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** La ficha de una recepción, con sus líneas. */
export async function detalleRecepcion(
  id: string,
): Promise<Resultado<RecepcionDetalle | null>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("recepciones")
      .select(
        `id, numero, fecha, compra_id, guia_proveedor, factura_proveedor,
         observaciones, anulada, creado_en,
         proveedores(razon_social, numero_documento),
         compras(numero),
         perfiles(nombre),
         recepcion_items(
           id, producto_id, cantidad, costo_unitario,
           productos(codigo, descripcion, unidad_codigo, marcas(nombre))
         )`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: true, datos: null };

    const r = data as unknown as Record<string, unknown> & {
      proveedores: { razon_social: string; numero_documento: string | null } | null;
      compras: { numero: string } | null;
      perfiles: { nombre: string } | null;
      recepcion_items: Array<{
        id: string;
        producto_id: string;
        cantidad: number;
        costo_unitario: number;
        productos: ProductoAnidado | null;
      }> | null;
    };

    return {
      ok: true,
      datos: {
        id: String(r.id),
        numero: String(r.numero),
        fecha: String(r.fecha),
        proveedor: r.proveedores?.razon_social ?? null,
        proveedor_documento: r.proveedores?.numero_documento ?? null,
        compra_id: (r.compra_id as string | null) ?? null,
        compra_numero: r.compras?.numero ?? null,
        guia_proveedor: (r.guia_proveedor as string | null) ?? null,
        factura_proveedor: (r.factura_proveedor as string | null) ?? null,
        recibido_por: r.perfiles?.nombre ?? null,
        observaciones: (r.observaciones as string | null) ?? null,
        anulada: Boolean(r.anulada),
        creado_en: String(r.creado_en),
        lineas: (r.recepcion_items ?? [])
          .map((i) => ({
            id: i.id,
            producto_id: i.producto_id,
            codigo: i.productos?.codigo ?? "—",
            marca: i.productos?.marcas?.nombre ?? null,
            descripcion: i.productos?.descripcion ?? "—",
            unidad: i.productos?.unidad_codigo ?? "NIU",
            cantidad: Number(i.cantidad ?? 0),
            costo_unitario: Number(i.costo_unitario ?? 0),
            importe:
              Math.round(Number(i.cantidad ?? 0) * Number(i.costo_unitario ?? 0) * 100) /
              100,
          }))
          // PostgREST no garantiza el orden de una relación anidada. Por
          // código, que es como el operador lee la factura del proveedor.
          .sort((a, b) => a.codigo.localeCompare(b.codigo)),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Proveedores activos, para el desplegable del registro.
 *
 * La consulta vive en el módulo de proveedores, que es su dueño. Aquí solo se
 * reexporta con el nombre que usa esta pantalla: cuando alguien decida que un
 * proveedor de baja tampoco debe salir en las compras, se cambia en un sitio.
 */
export { proveedoresParaSelector as proveedoresActivos } from "@/modules/proveedores/api/consultas";

/**
 * Compras con mercadería todavía por llegar.
 *
 * Se traen con sus líneas para poder precargar la recepción sin un segundo
 * viaje al elegir. Son pocas por definición —una compra deja de estar
 * pendiente en cuanto llega—, así que el anidado no es caro.
 *
 * `anulada` y `recibida` quedan fuera: no hay nada que recibir de ellas.
 */
export async function comprasPendientes(): Promise<Resultado<CompraPendiente[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("compras")
      .select(
        `id, numero, fecha, proveedor_id, gastos_importacion,
         proveedores(razon_social),
         compra_items(
           producto_id, cantidad, cantidad_recibida, costo_unitario, unidad_codigo,
           productos(codigo, descripcion, unidad_codigo, marcas(nombre))
         )`,
      )
      .in("estado", ["registrada", "recibida_parcial"])
      .order("numero", { ascending: false })
      .limit(50);

    if (error) return fallo(error);

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        proveedores: { razon_social: string } | null;
        compra_items: Array<{
          producto_id: string;
          cantidad: number;
          cantidad_recibida: number;
          costo_unitario: number;
          unidad_codigo: string;
          productos: ProductoAnidado | null;
        }> | null;
      }
    >;

    const compras: CompraPendiente[] = crudas.map((c) => ({
      id: String(c.id),
      numero: String(c.numero),
      fecha: String(c.fecha),
      proveedor_id: String(c.proveedor_id),
      proveedor: c.proveedores?.razon_social ?? "—",
      gastos_importacion: Number(c.gastos_importacion ?? 0),
      lineas: (c.compra_items ?? []).map((i) => ({
        producto_id: i.producto_id,
        codigo: i.productos?.codigo ?? "—",
        marca: i.productos?.marcas?.nombre ?? null,
        descripcion: i.productos?.descripcion ?? "—",
        unidad: i.unidad_codigo ?? i.productos?.unidad_codigo ?? "NIU",
        cantidad: Number(i.cantidad ?? 0),
        cantidad_recibida: Number(i.cantidad_recibida ?? 0),
        costo_unitario: Number(i.costo_unitario ?? 0),
      })),
    }));

    // Una compra en la que ya llegó todo no tiene por qué aparecer aunque su
    // estado se haya quedado atrás.
    return {
      ok: true,
      datos: compras.filter((c) =>
        c.lineas.some((l) => l.cantidad - l.cantidad_recibida > 0),
      ),
    };
  } catch (e) {
    return fallo(e);
  }
}
