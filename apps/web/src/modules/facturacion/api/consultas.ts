import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type {
  ComprobanteDetalle,
  ComprobanteLista,
  CotizacionFacturable,
  EstadoComprobante,
  EstadoSunat,
  FiltrosComprobantes,
  LineaComprobante,
  TipoComprobante,
} from "../dominio/tipos";

export const POR_PAGINA = 30;

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/** Los valores que de verdad acepta cada enum de Postgres. */
const TIPOS = ["factura", "boleta", "nota_credito", "nota_debito"] as const;
const ESTADOS = ["emitido", "pagado", "anulado", "vencido"] as const;
const SUNAT = [
  "no_enviado",
  "pendiente",
  "enviado",
  "aceptado",
  "observado",
  "rechazado",
  "baja_solicitada",
  "baja_aceptada",
] as const;

/**
 * Listado de comprobantes.
 *
 * Keyset sobre `numero` descendente. Ojo: aquí el número es `F001-00000001`,
 * con ocho cifras y ceros a la izquierda, así que ordena bien como texto —es
 * lo mismo que hacen cotizaciones y recepciones, y por el mismo motivo—.
 *
 * `comprobantes` tiene DOS claves ajenas a `perfiles` (vendedor y anulado_por),
 * así que la relación se nombra explícitamente o PostgREST responde PGRST201.
 */
export async function listarComprobantes(
  filtros: FiltrosComprobantes,
): Promise<Resultado<{ filas: ComprobanteLista[]; siguiente: string | null }>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("comprobantes")
      .select(
        `id, tipo, numero, fecha_emision, fecha_vencimiento, total, pagado, saldo,
         estado, estado_sunat,
         clientes(razon_social, numero_documento),
         cotizaciones(numero),
         perfiles!comprobantes_vendedor_id_fkey(nombre)`,
      )
      .order("numero", { ascending: false })
      .limit(POR_PAGINA + 1);

    if (filtros.cursor) consulta = consulta.lt("numero", filtros.cursor);
    if (filtros.cliente) consulta = consulta.eq("cliente_id", filtros.cliente);
    if (filtros.desde) consulta = consulta.gte("fecha_emision", filtros.desde);
    if (filtros.hasta) consulta = consulta.lte("fecha_emision", filtros.hasta);

    const tipo = TIPOS.find((t) => t === filtros.tipo);
    if (tipo) consulta = consulta.eq("tipo", tipo);
    const estado = ESTADOS.find((e) => e === filtros.estado);
    if (estado) consulta = consulta.eq("estado", estado);
    const sunat = SUNAT.find((s) => s === filtros.sunat);
    if (sunat) consulta = consulta.eq("estado_sunat", sunat);

    if (filtros.q) {
      consulta = consulta.or(
        `numero.ilike.%${filtros.q}%,orden_compra_cliente.ilike.%${filtros.q}%`,
      );
    }

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        clientes: { razon_social: string; numero_documento: string | null } | null;
        cotizaciones: { numero: string } | null;
        perfiles: { nombre: string } | null;
      }
    >;

    const todas: ComprobanteLista[] = crudas.map((c) => ({
      id: String(c.id),
      tipo: c.tipo as TipoComprobante,
      numero: String(c.numero),
      fecha_emision: String(c.fecha_emision),
      fecha_vencimiento: (c.fecha_vencimiento as string | null) ?? null,
      cliente: c.clientes?.razon_social ?? null,
      cliente_documento: c.clientes?.numero_documento ?? null,
      cotizacion_numero: c.cotizaciones?.numero ?? null,
      total: Number(c.total ?? 0),
      pagado: Number(c.pagado ?? 0),
      saldo: Number(c.saldo ?? 0),
      estado: c.estado as EstadoComprobante,
      estado_sunat: c.estado_sunat as EstadoSunat,
      vendedor: c.perfiles?.nombre ?? null,
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

/** La ficha de un comprobante, con sus líneas. */
export async function detalleComprobante(
  id: string,
): Promise<Resultado<ComprobanteDetalle | null>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("comprobantes")
      .select(
        `id, tipo, serie, correlativo, numero, cliente_id, cotizacion_id,
         orden_compra_cliente, referencia_id, motivo_nota_codigo,
         fecha_emision, fecha_vencimiento, condicion_pago, dias_credito,
         op_gravada, op_exonerada, op_inafecta, descuento_global, igv, total,
         total_letras, pagado, saldo, estado, estado_sunat,
         sunat_codigo_respuesta, sunat_mensaje, sunat_enviado_en, sunat_hash_cdr,
         detraccion_aplica, detraccion_porcentaje, detraccion_monto, detraccion_codigo,
         retencion_aplica, retencion_monto,
         observaciones, motivo_anulacion, creado_en,
         clientes(razon_social, numero_documento, tipo_documento, direccion, email),
         cotizaciones(numero),
         perfiles!comprobantes_vendedor_id_fkey(nombre),
         comprobante_items(
           id, producto_id, orden, codigo, descripcion, unidad_codigo,
           cantidad, valor_unitario, descuento_pct, importe
         )`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: true, datos: null };

    const c = data as unknown as Record<string, unknown> & {
      clientes: {
        razon_social: string;
        numero_documento: string | null;
        tipo_documento: string | null;
        direccion: string | null;
        email: string | null;
      } | null;
      cotizaciones: { numero: string } | null;
      perfiles: { nombre: string } | null;
      comprobante_items: Array<{
        id: string;
        producto_id: string | null;
        orden: number;
        codigo: string | null;
        descripcion: string | null;
        unidad_codigo: string | null;
        cantidad: number;
        valor_unitario: number;
        descuento_pct: number;
        importe: number | null;
      }> | null;
    };

    // El número del documento referenciado por una nota se pide aparte: la
    // autorreferencia de `comprobantes` a sí misma se puede anidar, pero
    // hacerlo aquí obliga a desambiguar tres relaciones en el mismo select y
    // el resultado es ilegible por ahorrar una consulta que casi nunca ocurre.
    let referenciaNumero: string | null = null;
    if (c.referencia_id) {
      const { data: ref } = await supabase
        .from("comprobantes")
        .select("numero")
        .eq("id", c.referencia_id as string)
        .maybeSingle();
      referenciaNumero = ref?.numero ?? null;
    }

    const lineas: LineaComprobante[] = (c.comprobante_items ?? [])
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map((i) => ({
        id: String(i.id),
        producto_id: i.producto_id,
        codigo: i.codigo ?? "—",
        descripcion: i.descripcion ?? "—",
        unidad: i.unidad_codigo ?? "NIU",
        cantidad: Number(i.cantidad ?? 0),
        valor_unitario: Number(i.valor_unitario ?? 0),
        descuento_pct: Number(i.descuento_pct ?? 0),
        // `importe` es columna generada: se usa la de la base, no se recalcula.
        importe: Number(i.importe ?? 0),
      }));

    return {
      ok: true,
      datos: {
        id: String(c.id),
        tipo: c.tipo as TipoComprobante,
        serie: String(c.serie),
        correlativo: Number(c.correlativo),
        numero: String(c.numero),
        cliente_id: String(c.cliente_id),
        cliente: c.clientes?.razon_social ?? null,
        cliente_documento: c.clientes?.numero_documento ?? null,
        cliente_tipo_documento: c.clientes?.tipo_documento ?? null,
        cliente_direccion: c.clientes?.direccion ?? null,
        cliente_email: c.clientes?.email ?? null,
        cotizacion_id: (c.cotizacion_id as string | null) ?? null,
        cotizacion_numero: c.cotizaciones?.numero ?? null,
        orden_compra_cliente: (c.orden_compra_cliente as string | null) ?? null,
        referencia_id: (c.referencia_id as string | null) ?? null,
        referencia_numero: referenciaNumero,
        motivo_nota_codigo: (c.motivo_nota_codigo as string | null) ?? null,
        fecha_emision: String(c.fecha_emision),
        fecha_vencimiento: (c.fecha_vencimiento as string | null) ?? null,
        condicion_pago: String(c.condicion_pago ?? "contado"),
        dias_credito: Number(c.dias_credito ?? 0),
        op_gravada: Number(c.op_gravada ?? 0),
        op_exonerada: Number(c.op_exonerada ?? 0),
        op_inafecta: Number(c.op_inafecta ?? 0),
        descuento_global: Number(c.descuento_global ?? 0),
        igv: Number(c.igv ?? 0),
        total: Number(c.total ?? 0),
        total_letras: (c.total_letras as string | null) ?? null,
        pagado: Number(c.pagado ?? 0),
        saldo: Number(c.saldo ?? 0),
        estado: c.estado as EstadoComprobante,
        estado_sunat: c.estado_sunat as EstadoSunat,
        sunat_codigo_respuesta: (c.sunat_codigo_respuesta as string | null) ?? null,
        sunat_mensaje: (c.sunat_mensaje as string | null) ?? null,
        sunat_enviado_en: (c.sunat_enviado_en as string | null) ?? null,
        sunat_hash_cdr: (c.sunat_hash_cdr as string | null) ?? null,
        detraccion_aplica: Boolean(c.detraccion_aplica),
        detraccion_porcentaje: Number(c.detraccion_porcentaje ?? 0),
        detraccion_monto: Number(c.detraccion_monto ?? 0),
        detraccion_codigo: (c.detraccion_codigo as string | null) ?? null,
        retencion_aplica: Boolean(c.retencion_aplica),
        retencion_monto: Number(c.retencion_monto ?? 0),
        vendedor: c.perfiles?.nombre ?? null,
        observaciones: (c.observaciones as string | null) ?? null,
        motivo_anulacion: (c.motivo_anulacion as string | null) ?? null,
        creado_en: String(c.creado_en),
        lineas,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Cotizaciones aprobadas que todavía no se han facturado.
 *
 * Es de donde nace un comprobante. Se excluyen las que ya tienen uno: facturar
 * dos veces la misma cotización es el error que más caro sale, porque el
 * segundo documento también descarga stock.
 */
export async function cotizacionesFacturables(): Promise<
  Resultado<{ id: string; numero: string; fecha: string; cliente: string; total: number }[]>
> {
  try {
    const supabase = await clienteServidor();

    const [{ data, error }, { data: yaFacturadas }] = await Promise.all([
      supabase
        .from("cotizaciones")
        .select(`id, numero, fecha, total, clientes(razon_social)`)
        .eq("estado", "aprobada")
        .order("numero", { ascending: false })
        .limit(100),
      supabase
        .from("comprobantes")
        .select("cotizacion_id")
        .not("cotizacion_id", "is", null)
        .neq("estado", "anulado"),
    ]);

    if (error) return fallo(error);

    const facturadas = new Set(
      (yaFacturadas ?? []).map((f) => String(f.cotizacion_id)),
    );

    const filas = (data ?? []) as unknown as Array<
      Record<string, unknown> & { clientes: { razon_social: string } | null }
    >;

    return {
      ok: true,
      datos: filas
        .filter((c) => !facturadas.has(String(c.id)))
        .map((c) => ({
          id: String(c.id),
          numero: String(c.numero),
          fecha: String(c.fecha),
          cliente: c.clientes?.razon_social ?? "—",
          total: Number(c.total ?? 0),
        })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Una cotización con todo lo que hace falta para emitir su comprobante. */
export async function cotizacionParaFacturar(
  id: string,
): Promise<Resultado<CotizacionFacturable | null>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("cotizaciones")
      .select(
        `id, numero, fecha, cliente_id, orden_compra_cliente, total,
         clientes(razon_social, numero_documento, tipo_documento, condicion_pago, dias_credito),
         cotizacion_items(
           producto_id, orden, codigo, descripcion, unidad_codigo,
           cantidad, valor_unitario, descuento_pct, importe
         )`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: true, datos: null };

    const c = data as unknown as Record<string, unknown> & {
      clientes: {
        razon_social: string;
        numero_documento: string | null;
        tipo_documento: string | null;
        condicion_pago: string;
        dias_credito: number;
      } | null;
      cotizacion_items: Array<{
        producto_id: string;
        orden: number;
        codigo: string | null;
        descripcion: string | null;
        unidad_codigo: string | null;
        cantidad: number;
        valor_unitario: number;
        descuento_pct: number;
        importe: number | null;
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
        cliente_tipo_documento: c.clientes?.tipo_documento ?? null,
        orden_compra_cliente: (c.orden_compra_cliente as string | null) ?? null,
        condicion_pago: c.clientes?.condicion_pago ?? "contado",
        dias_credito: Number(c.clientes?.dias_credito ?? 0),
        total: Number(c.total ?? 0),
        lineas: (c.cotizacion_items ?? [])
          .slice()
          .sort((a, b) => a.orden - b.orden)
          .map((i) => ({
            producto_id: i.producto_id,
            codigo: i.codigo ?? "—",
            descripcion: i.descripcion ?? "—",
            unidad: i.unidad_codigo ?? "NIU",
            cantidad: Number(i.cantidad ?? 0),
            valor_unitario: Number(i.valor_unitario ?? 0),
            descuento_pct: Number(i.descuento_pct ?? 0),
            importe: Number(i.importe ?? 0),
          })),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}
