import "server-only";

import { redondear2 } from "@rodatech/config";
import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import { totalesDe } from "../dominio/emision";

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

/**
 * Lo que queda por facturar de una línea de cotización.
 *
 * El techo es lo que el cliente CONFIRMÓ (`cantidad_aprobada`, migración 041),
 * no lo que se cotizó. Ese era el fallo que arregla la 047: al cliente que
 * confirmaba 4 de 6 se le emitía un comprobante por 6.
 *
 * `cantidad_aprobada` en null significa «todavía no ha contestado». No puede
 * caer a cero —una cotización que se factura es que se aprobó— así que se cae
 * a lo cotizado, que es lo que hacía el sistema entero antes de la 041.
 */
const pendienteDe = (l: {
  cantidad: number;
  cantidad_aprobada: number | null;
  cantidad_atendida: number | null;
}): number =>
  Math.max(
    Number(l.cantidad_aprobada ?? l.cantidad ?? 0) - Number(l.cantidad_atendida ?? 0),
    0,
  );

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
    if (error) return fallo(error, "facturacion/listarComprobantes");

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
    return fallo(e, "facturacion/listarComprobantes");
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

    if (error) return fallo(error, "facturacion/detalleComprobante");
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
    return fallo(e, "facturacion/detalleComprobante");
  }
}

/**
 * Cotizaciones aprobadas que todavía no se han facturado.
 *
 * Es de donde nace un comprobante. Salen las que tienen algo PENDIENTE de
 * facturar, que desde la 047 no es lo mismo que «las que no tienen ninguna
 * factura»: una cotización se puede entregar en dos veces.
 *
 * Facturar dos veces lo mismo lo impide `cantidad_atendida`, y lo vigila
 * también un check en la base. No hace falta esconder la cotización entera
 * para eso, y esconderla dejaba la segunda mitad sin forma de emitirse.
 */
export async function cotizacionesFacturables(): Promise<
  Resultado<{ id: string; numero: string; fecha: string; cliente: string; total: number }[]>
> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("cotizaciones")
      .select(
        `id, numero, fecha, total, clientes(razon_social),
         cotizacion_items(cantidad, cantidad_aprobada, cantidad_atendida,
                          valor_unitario, descuento_pct)`,
      )
      .eq("estado", "aprobada")
      .order("numero", { ascending: false })
      .limit(100);

    if (error) return fallo(error, "facturacion/cotizacionesFacturables");

    const filas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        clientes: { razon_social: string } | null;
        cotizacion_items: Array<{
          cantidad: number;
          cantidad_aprobada: number | null;
          cantidad_atendida: number | null;
          valor_unitario: number;
          descuento_pct: number;
        }> | null;
      }
    >;

    return {
      ok: true,
      datos: filas
        .map((c) => {
          const pendientes = (c.cotizacion_items ?? [])
            .map((l) => ({ ...l, cantidad: pendienteDe(l) }))
            .filter((l) => l.cantidad > 0);
          return { c, pendientes };
        })
        // Se queda lo que TIENE algo pendiente, en vez de descartar lo que ya
        // tiene un comprobante.
        //
        // El filtro viejo excluía toda cotización con una factura encima, para
        // no facturar dos veces. Pero desde la 047 se puede facturar en partes,
        // y aquel filtro escondía la segunda mitad para siempre: la cotización
        // se quedaba con 2 unidades vivas que ya no había forma de emitir. Lo
        // que impide facturar de más ahora es `cantidad_atendida`, que es
        // exacto y lo vigila también la base.
        .filter(({ pendientes }) => pendientes.length > 0)
        .map(({ c, pendientes }) => ({
          id: String(c.id),
          numero: String(c.numero),
          fecha: String(c.fecha),
          cliente: c.clientes?.razon_social ?? "—",
          // Lo que queda por facturar, no el total de la cotización: es el
          // número con el que se elige en el desplegable.
          total: totalesDe(pendientes).total,
        })),
    };
  } catch (e) {
    return fallo(e, "facturacion/cotizacionesFacturables");
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
           cantidad, cantidad_aprobada, cantidad_atendida,
           valor_unitario, descuento_pct, importe
         )`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error, "facturacion/cotizacionParaFacturar");
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
        cantidad_aprobada: number | null;
        cantidad_atendida: number | null;
        valor_unitario: number;
        descuento_pct: number;
        importe: number | null;
      }> | null;
    };

    const lineasCrudas = (c.cotizacion_items ?? [])
      .slice()
      .sort((a, b) => a.orden - b.orden);

    /*
      Cuánto hay en el estante de cada uno.

      Aparte y no en el `select` de arriba porque `stock` no cuelga de
      `cotizaciones`: PostgREST no sabe llegar de una a la otra. Y si falla, la
      pantalla tiene que abrir igual —se factura sin saber el stock, que es
      exactamente lo que se hacía hasta hoy— así que el error no se propaga.
    */
    const stockPorProducto = new Map<string, number>();
    const idsProducto = [...new Set(lineasCrudas.map((l) => l.producto_id))];
    if (idsProducto.length > 0) {
      const { data: saldos } = await supabase
        .from("stock")
        .select("producto_id, cantidad")
        .in("producto_id", idsProducto);
      for (const s of saldos ?? []) {
        stockPorProducto.set(String(s.producto_id), Number(s.cantidad ?? 0));
      }
    }

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
        lineas_ya_facturadas: lineasCrudas.filter((l) => pendienteDe(l) <= 0).length,
        lineas: lineasCrudas
          // Solo lo que queda por facturar. Una línea ya entregada entera
          // no puede volver a salir en otro comprobante.
          .filter((i) => pendienteDe(i) > 0)
          .map((i) => {
            const cantidad = pendienteDe(i);
            return {
              producto_id: i.producto_id,
              codigo: i.codigo ?? "—",
              descripcion: i.descripcion ?? "—",
              unidad: i.unidad_codigo ?? "NIU",
              cantidad,
              cantidad_cotizada: Number(i.cantidad ?? 0),
              cantidad_atendida: Number(i.cantidad_atendida ?? 0),
              stock: stockPorProducto.get(i.producto_id) ?? 0,
              valor_unitario: Number(i.valor_unitario ?? 0),
              descuento_pct: Number(i.descuento_pct ?? 0),
              // El importe se recalcula sobre lo PENDIENTE. El de la tabla
              // es el de la línea entera, y con una factura parcial daría
              // un total que no cuadra con las cantidades que se emiten.
              importe: redondear2(
                cantidad *
                  Number(i.valor_unitario ?? 0) *
                  (1 - Number(i.descuento_pct ?? 0) / 100),
              ),
            };
          }),
      },
    };
  } catch (e) {
    return fallo(e, "facturacion/cotizacionParaFacturar");
  }
}

/**
 * Los motivos de nota del catálogo, para el desplegable.
 *
 * Se traen los DOS tipos de golpe —crédito y débito— y la pantalla filtra: son
 * trece filas en total, y pedirlos otra vez al cambiar de tipo sería un viaje
 * al servidor para nada.
 */
export async function motivosNota(): Promise<
  Resultado<{ codigo: string; descripcion: string; tipo: string }[]>
> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("motivos_nota")
      .select("codigo, descripcion, tipo")
      .eq("activo", true)
      .order("tipo")
      .order("codigo");

    if (error) return fallo(error, "facturacion/motivosNota");
    return {
      ok: true,
      datos: (data ?? []).map((m) => ({
        codigo: String(m.codigo),
        descripcion: String(m.descripcion),
        tipo: String(m.tipo),
      })),
    };
  } catch (e) {
    return fallo(e, "facturacion/motivosNota");
  }
}

/**
 * Cuánto se ha acreditado ya sobre un comprobante con notas de crédito.
 *
 * Sin este dato se podrían emitir dos notas por el total y acabar acreditando
 * el doble de lo que se facturó. Devuelve 0 ante cualquier fallo: la pantalla
 * enseña un aviso, pero la comprobación de verdad la repite la acción antes de
 * emitir.
 */
export async function yaAcreditadoDe(comprobanteId: string): Promise<number> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("comprobantes")
      .select("total")
      .eq("referencia_id", comprobanteId)
      .eq("tipo", "nota_credito")
      .neq("estado", "anulado");

    if (error) return 0;
    return (
      Math.round((data ?? []).reduce((a, n) => a + Number(n.total ?? 0), 0) * 100) / 100
    );
  } catch {
    return 0;
  }
}
