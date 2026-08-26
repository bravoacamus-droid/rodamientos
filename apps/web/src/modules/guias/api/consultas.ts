import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type {
  CotizacionDespachable,
  EstadoGuia,
  FiltrosGuias,
  GuiaDetalle,
  GuiaLista,
  LineaGuia,
  ModalidadTraslado,
  MotivoTraslado,
} from "../dominio/tipos";

export const POR_PAGINA = 30;

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

const ESTADOS = ["borrador", "emitida", "anulada"] as const;
const dos = (n: number) => Math.round(n * 100) / 100;

/**
 * Listado de guías.
 *
 * Keyset sobre `numero` descendente: el número es `T001-00000001`, con ceros a
 * la izquierda, así que ordena bien como texto. Es el mismo criterio que el
 * resto de documentos.
 */
export async function listarGuias(
  filtros: FiltrosGuias,
): Promise<Resultado<{ filas: GuiaLista[]; siguiente: string | null }>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("guias_remision")
      .select(
        `id, numero, fecha_emision, fecha_traslado, motivo_descripcion,
         direccion_llegada, peso_bruto_kg, numero_bultos, estado, estado_sunat,
         clientes(razon_social),
         cotizaciones(numero),
         guia_items(id)`,
      )
      .order("numero", { ascending: false })
      .limit(POR_PAGINA + 1);

    if (filtros.cursor) consulta = consulta.lt("numero", filtros.cursor);
    if (filtros.cliente) consulta = consulta.eq("cliente_id", filtros.cliente);
    if (filtros.desde) consulta = consulta.gte("fecha_emision", filtros.desde);
    if (filtros.hasta) consulta = consulta.lte("fecha_emision", filtros.hasta);

    const estado = ESTADOS.find((e) => e === filtros.estado);
    if (estado) consulta = consulta.eq("estado", estado);

    if (filtros.q) {
      // Por lo que se busca una guía: su número, la dirección donde se entregó,
      // o la placa del vehículo que la llevó.
      consulta = consulta.or(
        `numero.ilike.%${filtros.q}%,direccion_llegada.ilike.%${filtros.q}%,transportista_placa.ilike.%${filtros.q}%`,
      );
    }

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        clientes: { razon_social: string } | null;
        cotizaciones: { numero: string } | null;
        guia_items: { id: string }[] | null;
      }
    >;

    const todas: GuiaLista[] = crudas.map((g) => ({
      id: String(g.id),
      numero: String(g.numero),
      fecha_emision: String(g.fecha_emision),
      fecha_traslado: String(g.fecha_traslado),
      cliente: g.clientes?.razon_social ?? null,
      cotizacion_numero: g.cotizaciones?.numero ?? null,
      motivo: (g.motivo_descripcion as string | null) ?? null,
      direccion_llegada: (g.direccion_llegada as string | null) ?? null,
      peso_bruto_kg: Number(g.peso_bruto_kg ?? 0),
      numero_bultos: Number(g.numero_bultos ?? 0),
      estado: g.estado as EstadoGuia,
      estado_sunat: String(g.estado_sunat ?? "no_enviado"),
      items: (g.guia_items ?? []).length,
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

/** La ficha de una guía, con sus líneas. */
export async function detalleGuia(id: string): Promise<Resultado<GuiaDetalle | null>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("guias_remision")
      .select(
        `id, serie, correlativo, numero, cliente_id, cotizacion_id,
         orden_compra_cliente, fecha_emision, fecha_traslado,
         motivo_codigo, motivo_descripcion,
         ubigeo_partida, direccion_partida, ubigeo_llegada, direccion_llegada,
         peso_bruto_kg, unidad_peso, numero_bultos, modalidad_traslado,
         transportista_documento, transportista_razon_social, transportista_placa,
         conductor_documento, conductor_nombre, conductor_licencia,
         entregado_por, recibido_por, estado, estado_sunat, sunat_mensaje,
         observaciones, motivo_anulacion, creado_en,
         clientes(razon_social, numero_documento),
         cotizaciones(numero),
         guia_items(id, producto_id, orden, codigo, descripcion, cantidad, unidad_codigo, peso_kg)`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: true, datos: null };

    const g = data as unknown as Record<string, unknown> & {
      clientes: { razon_social: string; numero_documento: string | null } | null;
      cotizaciones: { numero: string } | null;
      guia_items: Array<{
        id: string;
        producto_id: string;
        orden: number;
        codigo: string | null;
        descripcion: string | null;
        cantidad: number;
        unidad_codigo: string | null;
        peso_kg: number | null;
      }> | null;
    };

    // El comprobante que salió de esta guía se pide aparte: `comprobantes`
    // apunta a `guias_remision`, no al revés, y anidarlo desde aquí obliga a
    // desambiguar la relación por ahorrar una consulta que casi siempre
    // devuelve una fila o ninguna.
    const { data: comp } = await supabase
      .from("comprobantes")
      .select("id, numero")
      .eq("guia_id", id)
      .neq("estado", "anulado")
      .maybeSingle();

    const lineas: LineaGuia[] = (g.guia_items ?? [])
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map((i) => ({
        id: String(i.id),
        producto_id: String(i.producto_id),
        codigo: i.codigo ?? "—",
        descripcion: i.descripcion ?? "—",
        unidad: i.unidad_codigo ?? "NIU",
        cantidad: Number(i.cantidad ?? 0),
        peso_kg: Number(i.peso_kg ?? 0),
      }));

    return {
      ok: true,
      datos: {
        id: String(g.id),
        serie: String(g.serie),
        correlativo: Number(g.correlativo),
        numero: String(g.numero),
        cliente_id: String(g.cliente_id),
        cliente: g.clientes?.razon_social ?? null,
        cliente_documento: g.clientes?.numero_documento ?? null,
        cotizacion_id: (g.cotizacion_id as string | null) ?? null,
        cotizacion_numero: g.cotizaciones?.numero ?? null,
        orden_compra_cliente: (g.orden_compra_cliente as string | null) ?? null,
        fecha_emision: String(g.fecha_emision),
        fecha_traslado: String(g.fecha_traslado),
        motivo_codigo: String(g.motivo_codigo ?? "01"),
        motivo_descripcion: (g.motivo_descripcion as string | null) ?? null,
        ubigeo_partida: (g.ubigeo_partida as string | null) ?? null,
        direccion_partida: (g.direccion_partida as string | null) ?? null,
        ubigeo_llegada: (g.ubigeo_llegada as string | null) ?? null,
        direccion_llegada: (g.direccion_llegada as string | null) ?? null,
        peso_bruto_kg: Number(g.peso_bruto_kg ?? 0),
        unidad_peso: String(g.unidad_peso ?? "KGM"),
        numero_bultos: Number(g.numero_bultos ?? 0),
        modalidad_traslado: (g.modalidad_traslado as ModalidadTraslado) ?? "02",
        transportista_documento: (g.transportista_documento as string | null) ?? null,
        transportista_razon_social: (g.transportista_razon_social as string | null) ?? null,
        transportista_placa: (g.transportista_placa as string | null) ?? null,
        conductor_documento: (g.conductor_documento as string | null) ?? null,
        conductor_nombre: (g.conductor_nombre as string | null) ?? null,
        conductor_licencia: (g.conductor_licencia as string | null) ?? null,
        entregado_por: (g.entregado_por as string | null) ?? null,
        recibido_por: (g.recibido_por as string | null) ?? null,
        estado: g.estado as EstadoGuia,
        estado_sunat: String(g.estado_sunat ?? "no_enviado"),
        sunat_mensaje: (g.sunat_mensaje as string | null) ?? null,
        observaciones: (g.observaciones as string | null) ?? null,
        motivo_anulacion: (g.motivo_anulacion as string | null) ?? null,
        creado_en: String(g.creado_en),
        lineas,
        comprobante: comp ? { id: String(comp.id), numero: String(comp.numero) } : null,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Los motivos de traslado del catálogo 20, para el desplegable. */
export async function motivosTraslado(): Promise<Resultado<MotivoTraslado[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("motivos_traslado")
      .select("codigo, descripcion")
      .eq("activo", true)
      .order("orden");

    if (error) return fallo(error);
    return {
      ok: true,
      datos: (data ?? []).map((m) => ({
        codigo: String(m.codigo),
        descripcion: String(m.descripcion),
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Cotizaciones aprobadas con mercadería pendiente de salir.
 *
 * Se excluyen las que ya se despacharon enteras. Una cotización aprobada de la
 * que ya salió todo no tiene por qué seguir ofreciéndose: es el camino más
 * corto a sacar el mismo material dos veces.
 */
export async function cotizacionesDespachables(): Promise<
  Resultado<{ id: string; numero: string; fecha: string; cliente: string }[]>
> {
  try {
    const supabase = await clienteServidor();

    const [{ data, error }, { data: yaDespachado }] = await Promise.all([
      supabase
        .from("cotizaciones")
        .select(`id, numero, fecha, clientes(razon_social), cotizacion_items(id, cantidad)`)
        .in("estado", ["aprobada", "atendida"])
        .order("numero", { ascending: false })
        .limit(100),
      // Las guías NO anuladas y sus líneas: es lo que ya salió del almacén.
      supabase
        .from("guias_remision")
        .select("cotizacion_id, estado, guia_items(cotizacion_item_id, cantidad)")
        .neq("estado", "anulada"),
    ]);

    if (error) return fallo(error);

    const despachadoPorItem = new Map<string, number>();
    for (const g of (yaDespachado ?? []) as unknown as Array<{
      guia_items: { cotizacion_item_id: string | null; cantidad: number }[] | null;
    }>) {
      for (const i of g.guia_items ?? []) {
        if (!i.cotizacion_item_id) continue;
        despachadoPorItem.set(
          i.cotizacion_item_id,
          dos((despachadoPorItem.get(i.cotizacion_item_id) ?? 0) + Number(i.cantidad ?? 0)),
        );
      }
    }

    const filas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        clientes: { razon_social: string } | null;
        cotizacion_items: { id: string; cantidad: number }[] | null;
      }
    >;

    return {
      ok: true,
      datos: filas
        .filter((c) =>
          (c.cotizacion_items ?? []).some(
            (i) => Number(i.cantidad ?? 0) - (despachadoPorItem.get(i.id) ?? 0) > 0,
          ),
        )
        .map((c) => ({
          id: String(c.id),
          numero: String(c.numero),
          fecha: String(c.fecha),
          cliente: c.clientes?.razon_social ?? "—",
        })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Una cotización con lo que falta por despachar de cada línea. */
export async function cotizacionParaDespachar(
  id: string,
): Promise<Resultado<CotizacionDespachable | null>> {
  try {
    const supabase = await clienteServidor();

    const [{ data, error }, { data: guias }] = await Promise.all([
      supabase
        .from("cotizaciones")
        .select(
          `id, numero, fecha, cliente_id, orden_compra_cliente,
           clientes(razon_social, numero_documento, direccion, ubigeo_codigo),
           cotizacion_items(
             id, producto_id, orden, codigo, descripcion, unidad_codigo, cantidad,
             productos(peso_kg)
           )`,
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("guias_remision")
        .select("guia_items(cotizacion_item_id, cantidad)")
        .eq("cotizacion_id", id)
        .neq("estado", "anulada"),
    ]);

    if (error) return fallo(error);
    if (!data) return { ok: true, datos: null };

    const despachado = new Map<string, number>();
    for (const g of (guias ?? []) as unknown as Array<{
      guia_items: { cotizacion_item_id: string | null; cantidad: number }[] | null;
    }>) {
      for (const i of g.guia_items ?? []) {
        if (!i.cotizacion_item_id) continue;
        despachado.set(
          i.cotizacion_item_id,
          dos((despachado.get(i.cotizacion_item_id) ?? 0) + Number(i.cantidad ?? 0)),
        );
      }
    }

    const c = data as unknown as Record<string, unknown> & {
      clientes: {
        razon_social: string;
        numero_documento: string | null;
        direccion: string | null;
        ubigeo_codigo: string | null;
      } | null;
      cotizacion_items: Array<{
        id: string;
        producto_id: string;
        orden: number;
        codigo: string | null;
        descripcion: string | null;
        unidad_codigo: string | null;
        cantidad: number;
        productos: { peso_kg: number | null } | null;
      }> | null;
    };

    return {
      ok: true,
      datos: {
        id: String(c.id),
        numero: String(c.numero),
        fecha: String(c.fecha),
        cliente_id: String(c.cliente_id),
        cliente: c.clientes?.razon_social ?? "—",
        cliente_documento: c.clientes?.numero_documento ?? null,
        cliente_direccion: c.clientes?.direccion ?? null,
        cliente_ubigeo: c.clientes?.ubigeo_codigo ?? null,
        orden_compra_cliente: (c.orden_compra_cliente as string | null) ?? null,
        lineas: (c.cotizacion_items ?? [])
          .slice()
          .sort((a, b) => a.orden - b.orden)
          .map((i) => ({
            cotizacion_item_id: String(i.id),
            producto_id: String(i.producto_id),
            codigo: i.codigo ?? "—",
            descripcion: i.descripcion ?? "—",
            unidad: i.unidad_codigo ?? "NIU",
            cantidad: Number(i.cantidad ?? 0),
            despachado: despachado.get(String(i.id)) ?? 0,
            peso_kg: Number(i.productos?.peso_kg ?? 0),
          })),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Las agencias con las que se despacha a provincia.
 *
 * Willy, 26/08 (22:31): *«no son muchas, tengo dos o tres agencias»*. Los
 * campos del transportista ya estaban en la guía; lo que faltaba era la lista
 * de la que elegir, para no volver a teclear el RUC de Shalom en cada envío.
 *
 * Solo las activas: una que se dejó de usar sigue existiendo —hay guías viejas
 * que la citan— pero no tiene por qué ofrecerse al despachar hoy.
 */
export async function agenciasActivas(): Promise<
  Resultado<{ id: string; razon_social: string; nombre_corto: string | null; numero_documento: string | null }[]>
> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("agencias_transporte")
      .select("id, razon_social, nombre_corto, numero_documento")
      .eq("activo", true)
      .order("nombre_corto", { nullsFirst: false })
      .limit(100);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((a) => ({
        id: String(a.id),
        razon_social: String(a.razon_social),
        nombre_corto: (a.nombre_corto as string | null) ?? null,
        numero_documento: (a.numero_documento as string | null) ?? null,
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}
