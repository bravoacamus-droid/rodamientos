import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type {
  CotizacionLista,
  EstadoCotizacion,
  FiltrosCotizaciones,
} from "../dominio/tipos";

export const POR_PAGINA = 30;

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/**
 * Listado de cotizaciones.
 *
 * Ordena por número descendente: lo último cotizado es lo que se consulta, y
 * el número ya es `serie-correlativo` con relleno de ceros, así que ordena
 * bien como texto sin necesidad de un índice aparte.
 *
 * Pide un elemento de más para saber si hay página siguiente sin hacer count.
 */
export async function listarCotizaciones(
  filtros: FiltrosCotizaciones,
): Promise<Resultado<{ filas: CotizacionLista[]; siguiente: string | null }>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("cotizaciones")
      .select(
        `id, numero, fecha, fecha_vencimiento, cliente_id,
         orden_compra_cliente, subtotal, igv, total, margen_pct, estado,
         clientes!inner(razon_social, numero_documento),
         perfiles!cotizaciones_vendedor_id_fkey(nombre),
         cotizacion_items(count)`,
      )
      .order("numero", { ascending: false })
      .limit(POR_PAGINA + 1);

    if (filtros.cursor) consulta = consulta.lt("numero", filtros.cursor);
    if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);
    if (filtros.cliente) consulta = consulta.eq("cliente_id", filtros.cliente);
    if (filtros.desde) consulta = consulta.gte("fecha", filtros.desde);
    if (filtros.hasta) consulta = consulta.lte("fecha", filtros.hasta);
    if (filtros.q) {
      // El número y la orden de compra son los dos campos por los que se busca
      // una cotización concreta; el nombre del cliente se filtra con el select.
      consulta = consulta.or(
        `numero.ilike.%${filtros.q}%,orden_compra_cliente.ilike.%${filtros.q}%`,
      );
    }

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        clientes: { razon_social: string; numero_documento: string | null } | null;
        perfiles: { nombre: string } | null;
        cotizacion_items: { count: number }[] | null;
      }
    >;

    const todas: CotizacionLista[] = crudas.map((c) => ({
      id: String(c.id),
      numero: String(c.numero),
      fecha: String(c.fecha),
      fecha_vencimiento: String(c.fecha_vencimiento),
      cliente_id: String(c.cliente_id),
      cliente: c.clientes?.razon_social ?? "—",
      cliente_documento: c.clientes?.numero_documento ?? null,
      orden_compra_cliente: (c.orden_compra_cliente as string | null) ?? null,
      subtotal: Number(c.subtotal ?? 0),
      igv: Number(c.igv ?? 0),
      total: Number(c.total ?? 0),
      margen_pct: Number(c.margen_pct ?? 0),
      estado: c.estado as CotizacionLista["estado"],
      vendedor: c.perfiles?.nombre ?? null,
      items: c.cotizacion_items?.[0]?.count ?? 0,
    }));

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

/** Conteo por estado, para las pastillas de filtro de la cabecera. */
export async function conteoPorEstado(): Promise<
  Resultado<Partial<Record<EstadoCotizacion, number>>>
> {
  try {
    const supabase = await clienteServidor();
    const contar = (estado: EstadoCotizacion) =>
      supabase
        .from("cotizaciones")
        // El embed de perfiles nombra su clave foránea: `cotizaciones` apunta
        // DOS veces a `perfiles` (vendedor_id y aprobada_por) y sin nombrarla
        // PostgREST no sabe cuál usar; responde PGRST201 y la ficha sale vacía.
        .select("id", { count: "exact", head: true })
        .eq("estado", estado);

    // "atendida", no "facturada": ese estado nunca existió en el enum
    // `estado_cotizacion`. Con los tipos provisionales la consulta compilaba
    // y devolvía 0 siempre, así que la pastilla se veía vacía sin motivo.
    const estados = ["borrador", "enviada", "aprobada", "atendida"] as const;
    const respuestas = await Promise.all(estados.map((e) => contar(e)));

    const primerError = respuestas.find((r) => r.error)?.error;
    if (primerError) return fallo(primerError);

    const conteo: Partial<Record<EstadoCotizacion, number>> = {};
    estados.forEach((e, i) => {
      conteo[e] = respuestas[i]?.count ?? 0;
    });

    return { ok: true, datos: conteo };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Clientes para el selector del constructor.
 *
 * Se traen enteros y de una vez: Rodatech tiene cientos, no cientos de miles,
 * y un selector que consulta por cada tecla es peor experiencia y más carga.
 * Los bloqueados vienen igual pero marcados, para que se vea POR QUÉ no se
 * puede cotizar a alguien en vez de que simplemente no aparezca.
 */
export async function clientesParaCotizar(): Promise<
  Resultado<
    {
      id: string;
      codigo: string;
      razon_social: string;
      numero_documento: string | null;
      contacto: string | null;
      condicion_pago: string;
      dias_credito: number;
      bloqueado: boolean;
    }[]
  >
> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("clientes")
      .select(
        "id, codigo, razon_social, numero_documento, contacto, condicion_pago, dias_credito, bloqueado",
      )
      .eq("activo", true)
      .order("razon_social");

    if (error) return fallo(error);
    return { ok: true, datos: data ?? [] };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Una cotización completa, con sus líneas y lo que hace falta para imprimirla.
 *
 * Cabecera, líneas, cliente y emisor en DOS consultas y no en cuatro: la ficha
 * se abre después de cada guardado y cada viaje de más se nota.
 */
export async function cotizacionPorId(id: string): Promise<
  Resultado<{
    cabecera: {
      id: string;
      numero: string;
      estado: EstadoCotizacion;
      fecha: string;
      validez_dias: number;
      tiempo_entrega: string | null;
      orden_compra_cliente: string | null;
      contacto: string | null;
      condiciones: string | null;
      observaciones: string | null;
      mostrar_descuento: boolean;
      subtotal: number;
      descuento_total: number;
      igv: number;
      total: number;
      costo_total: number;
      margen_pct: number;
      cliente_id: string;
      cliente: {
        razon_social: string;
        numero_documento: string | null;
        tipo_documento: string;
        direccion: string | null;
        contacto: string | null;
        whatsapp: string | null;
        telefono: string | null;
      };
      vendedor: string | null;
    };
    lineas: {
      producto_id: string | null;
      orden: number;
      codigo: string;
      marca: string | null;
      descripcion: string;
      cantidad: number;
      unidad_codigo: string;
      valor_unitario: number;
      descuento_pct: number;
      costo_unitario: number;
      precio_minimo_ref: number;
      importe: number;
    }[];
    emisor: {
      razon_social: string;
      nombre_comercial: string;
      ruc: string;
      direccion: string | null;
      telefono: string | null;
      email_ventas: string | null;
      email: string | null;
      web: string | null;
      logo_url: string | null;
    };
  }>
> {
  try {
    const supabase = await clienteServidor();

    const [cabecera, emisor] = await Promise.all([
      supabase
        .from("cotizaciones")
        .select(
          `id, numero, estado, fecha, validez_dias, tiempo_entrega,
           orden_compra_cliente, contacto, condiciones, observaciones,
           mostrar_descuento, subtotal, descuento_total, igv, total,
           costo_total, margen_pct, cliente_id,
           clientes!inner(razon_social, numero_documento, tipo_documento,
                          direccion, contacto, whatsapp, telefono),
           perfiles!cotizaciones_vendedor_id_fkey(nombre),
           cotizacion_items(producto_id, orden, codigo, marca, descripcion,
                            cantidad, unidad_codigo, valor_unitario,
                            descuento_pct, costo_unitario, precio_minimo_ref,
                            importe)`,
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("empresa")
        .select(
          "razon_social, nombre_comercial, ruc, direccion, telefono, email_ventas, email, web, logo_url",
        )
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (cabecera.error) return fallo(cabecera.error);
    if (!cabecera.data) return { ok: false, error: "La cotización no existe." };
    if (emisor.error) return fallo(emisor.error);
    if (!emisor.data) return { ok: false, error: "Falta configurar los datos de la empresa." };

    const c = cabecera.data as unknown as Record<string, unknown>;
    const cli = c.clientes as Record<string, unknown>;
    const items = (c.cotizacion_items ?? []) as Record<string, unknown>[];
    const vendedor = (c.perfiles as { nombre?: string } | null)?.nombre ?? null;

    return {
      ok: true,
      datos: {
        // El select con relaciones anidadas devuelve un tipo que TypeScript no
        // puede estrechar solo; la forma real la garantiza la firma de arriba.
        cabecera: { ...(c as Record<string, unknown>), cliente: cli, vendedor } as never,
        // El orden lo fija la cotización, no el orden de llegada de la fila.
        lineas: [...items].sort(
          (a, b) => Number(a.orden) - Number(b.orden),
        ) as never,
        emisor: emisor.data as never,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}
