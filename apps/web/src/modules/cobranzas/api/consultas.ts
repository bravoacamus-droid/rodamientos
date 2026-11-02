import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";
import type { Database } from "@rodatech/db/tipos";

import { fallo } from "@/lib/errores";

import { prioridad } from "../dominio/cobro";
import {
  ESTADOS_RETENCION,
  type ClienteEnCartera,
  type CrDelDocumento,
  type CuotaComprobante,
  type DocumentoPorCobrar,
  type EstadoRetencion,
  type FiltrosCartera,
  type Gestion,
  type Mostrar,
  type MedioPago,
  type PagoRegistrado,
  type RetencionDeFactura,
  type TramoAging,
} from "../dominio/tipos";

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

const TRAMOS = [
  "sin_vencimiento",
  "por_vencer",
  "1_30",
  "31_60",
  "61_90",
  "mas_90",
] as const;

const dos = (n: number) => Math.round(n * 100) / 100;

/**
 * La cartera: todo lo que está por cobrar.
 *
 * Sale de `v_cartera`, que ya filtra los comprobantes con saldo vivo y calcula
 * los días de atraso y el tramo. El índice `ix_comp_cartera` cubre exactamente
 * ese filtro, así que no hace falta paginar: la cartera viva de esta empresa
 * son decenas de documentos, no miles, y verla entera es justo lo que quiere
 * quien cobra.
 */
export async function cartera(
  filtros: FiltrosCartera,
): Promise<Resultado<DocumentoPorCobrar[]>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("v_cartera")
      .select(
        `id, numero, tipo, cliente_id, cliente, documento, fecha_emision,
         fecha_vencimiento, condicion_pago, total, pagado, saldo, estado,
         orden_compra_cliente, dias_vencido, tramo_aging, vendedor,
         detraccion_aplica, detraccion_monto, retencion_aplica, retencion_monto`,
      )
      // De lo más atrasado a lo menos: es el orden en que se llama.
      .order("dias_vencido", { ascending: false })
      .order("saldo", { ascending: false })
      .limit(500);

    if (filtros.cliente) consulta = consulta.eq("cliente_id", filtros.cliente);
    if (filtros.vencido === "1") consulta = consulta.gt("dias_vencido", 0);

    const tramo = TRAMOS.find((t) => t === filtros.tramo);
    if (tramo) consulta = consulta.eq("tramo_aging", tramo);

    if (filtros.q) {
      consulta = consulta.or(
        `numero.ilike.%${filtros.q}%,cliente.ilike.%${filtros.q}%,orden_compra_cliente.ilike.%${filtros.q}%`,
      );
    }

    const { data, error } = await consulta;
    if (error) return fallo(error, "cobranzas/cartera");

    return { ok: true, datos: await completar((data ?? []) as FilaBase[]) };
  } catch (e) {
    return fallo(e, "cobranzas/cartera");
  }
}

/** Lo que trae `v_cartera`, o lo mismo armado desde `comprobantes`. */
interface FilaBase {
  id: string;
  numero: string;
  tipo: string;
  cliente_id: string;
  cliente: string | null;
  documento: string | null;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  condicion_pago: string | null;
  total: number | null;
  pagado: number | null;
  saldo: number | null;
  estado: string;
  orden_compra_cliente: string | null;
  dias_vencido: number | null;
  tramo_aging: string | null;
  vendedor: string | null;
  detraccion_aplica: boolean | null;
  detraccion_monto: number | null;
  retencion_aplica: boolean | null;
  retencion_monto: number | null;
}

/**
 * Le pone a cada fila su moneda (116) y su retención (175), aparte: `v_cartera`
 * no las trae y tocar la vista arrastra a los reportes.
 */
async function completar(filas: FilaBase[]): Promise<DocumentoPorCobrar[]> {
  const supabase = await clienteServidor();
  const ids = filas.map((d) => String(d.id));
  const enSoles = new Map<string, { tipo_cambio: number; pen_total: number }>();
  if (ids.length > 0) {
    const { data: pen } = await supabase
      .from("comprobantes")
      .select("id, tipo_cambio, pen_total")
      .in("id", ids)
      .eq("moneda", "PEN");
    for (const p of pen ?? []) {
      if (p.pen_total != null && Number(p.tipo_cambio) > 0) {
        enSoles.set(String(p.id), { tipo_cambio: Number(p.tipo_cambio), pen_total: Number(p.pen_total) });
      }
    }
  }
  const ret = await retencionesPorId(ids);

  return filas.map((d) => {
    const r = ret.get(String(d.id));
    return {
      id: String(d.id),
      numero: String(d.numero),
      tipo: String(d.tipo),
      cliente_id: String(d.cliente_id),
      cliente: String(d.cliente ?? "—"),
      documento: d.documento ?? null,
      fecha_emision: String(d.fecha_emision),
      fecha_vencimiento: d.fecha_vencimiento ?? null,
      condicion_pago: String(d.condicion_pago ?? "contado"),
      total: Number(d.total ?? 0),
      pagado: Number(d.pagado ?? 0),
      saldo: Number(d.saldo ?? 0),
      estado: String(d.estado),
      orden_compra_cliente: d.orden_compra_cliente ?? null,
      dias_vencido: Number(d.dias_vencido ?? 0),
      tramo_aging: (d.tramo_aging as TramoAging) ?? "sin_vencimiento",
      vendedor: d.vendedor ?? null,
      detraccion_aplica: Boolean(d.detraccion_aplica),
      detraccion_monto: Number(d.detraccion_monto ?? 0),
      retencion_aplica: Boolean(d.retencion_aplica),
      retencion_monto: Number(d.retencion_monto ?? 0),
      moneda: enSoles.has(String(d.id)) ? ("PEN" as const) : ("USD" as const),
      tipo_cambio: enSoles.get(String(d.id))?.tipo_cambio ?? null,
      pen_total: enSoles.get(String(d.id))?.pen_total ?? null,
      cliente_agente: r?.cliente_agente ?? false,
      retencion_cobrada: r?.retencion_cobrada ?? 0,
      cr: r?.cr ?? null,
      estado_retencion: r?.estado_retencion ?? "no_agente",
      llega_umbral: r?.llega_umbral ?? null,
      retencion_decidida: r?.retencion_decidida ?? false,
      retenida_el: r?.retenida_el ?? null,
    };
  });
}

const SIN_FILAS = ["00000000-0000-0000-0000-000000000000"];

/**
 * Lo ya pagado y las retenciones, para el desplegable «Mostrar» (31/10).
 *
 * Willy quiere ver los que ya están pagados, los pagados con su documento de
 * retención y los que solo pagaron, y filtrar los que deben el documento de
 * retención. `v_cartera` solo trae lo que se debe; esto sale de
 * `comprobantes` y de `v_retenciones`. Lo más reciente arriba, hasta 200: el
 * histórico tiene más de 500 facturas pagadas.
 */
export async function documentosPagados(
  filtros: FiltrosCartera,
  mostrar: Exclude<Mostrar, "vencido">,
): Promise<Resultado<DocumentoPorCobrar[]>> {
  try {
    const supabase = await clienteServidor();
    let consulta = supabase
      .from("comprobantes")
      .select(
        `id, numero, tipo, cliente_id, fecha_emision, fecha_vencimiento, condicion_pago,
         total, pagado, saldo, estado, orden_compra_cliente,
         detraccion_aplica, detraccion_monto, retencion_aplica, retencion_monto,
         clientes(razon_social, numero_documento),
         perfiles!comprobantes_vendedor_id_fkey(nombre)`,
      )
      .eq("tipo", "factura")
      .neq("estado", "anulado")
      .order("fecha_emision", { ascending: false })
      .order("numero", { ascending: false })
      .limit(200);

    // Las retenciones son pocas: se buscan en la vista y se filtra por id.
    const idsCon = async (estados: EstadoRetencion[]) => {
      const { data } = await supabase.from("v_retenciones").select("comprobante_id").in("estado_retencion", estados);
      return (data ?? []).map((r) => String(r.comprobante_id));
    };
    if (mostrar === "falta_cr" || mostrar === "con_cr") {
      const ids = await idsCon([mostrar === "falta_cr" ? "falta_cr" : "cr_recibido"]);
      consulta = consulta.in("id", ids.length > 0 ? ids : SIN_FILAS);
    } else {
      consulta = consulta.eq("estado", "pagado");
      if (mostrar === "pagadas_sin_retencion") {
        const conRetencion = await idsCon(["falta_cr", "cr_recibido"]);
        if (conRetencion.length > 0) consulta = consulta.not("id", "in", `(${conRetencion.join(",")})`);
      }
    }

    if (filtros.cliente) consulta = consulta.eq("cliente_id", filtros.cliente);
    if (filtros.q) {
      // Por número, O/C o nombre del cliente, como Facturación: PostgREST no
      // deja un `or` sobre la tabla embebida, así que los clientes van antes.
      const q = filtros.q.replace(/[,()]/g, " ").trim();
      const { data: clientes } = await supabase.from("clientes").select("id").ilike("razon_social", `%${q}%`).limit(50);
      const deClientes = (clientes ?? []).map((c) => String(c.id));
      consulta = consulta.or(
        [
          `numero.ilike.%${q}%`,
          `orden_compra_cliente.ilike.%${q}%`,
          deClientes.length > 0 ? `cliente_id.in.(${deClientes.join(",")})` : null,
        ]
          .filter(Boolean)
          .join(","),
      );
    }

    const { data, error } = await consulta;
    if (error) return fallo(error, "cobranzas/documentosPagados");

    const crudos = (data ?? []) as unknown as Array<
      Omit<FilaBase, "cliente" | "documento" | "vendedor" | "dias_vencido" | "tramo_aging"> & {
        clientes: { razon_social: string; numero_documento: string | null } | null;
        perfiles: { nombre: string } | null;
      }
    >;
    return {
      ok: true,
      datos: await completar(
        crudos.map((c) => ({
          ...c,
          cliente: c.clientes?.razon_social ?? null,
          documento: c.clientes?.numero_documento ?? null,
          vendedor: c.perfiles?.nombre ?? null,
          dias_vencido: 0,
          tramo_aging: "sin_vencimiento",
        })),
      ),
    };
  } catch (e) {
    return fallo(e, "cobranzas/documentosPagados");
  }
}

type FilaRetenciones = Database["public"]["Views"]["v_retenciones"]["Row"];

const aEstado = (e: string | null): EstadoRetencion =>
  ESTADOS_RETENCION.find((x) => x === e) ?? "no_agente";

const aCr = (r: FilaRetenciones): CrDelDocumento | null =>
  r.cr_subido_en
    ? { nombre: String(r.cr_nombre ?? "CR"), numero_cr: r.numero_cr ?? null, subido_en: String(r.cr_subido_en) }
    : null;

/** La retención de unas facturas, por factura (175). */
async function retencionesPorId(ids: string[]): Promise<
  Map<
    string,
    {
      cliente_agente: boolean;
      retencion_cobrada: number;
      cr: CrDelDocumento | null;
      estado_retencion: EstadoRetencion;
      llega_umbral: boolean | null;
      retencion_decidida: boolean;
      retenida_el: string | null;
    }
  >
> {
  const porId = new Map();
  if (ids.length === 0) return porId;
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("v_retenciones")
    .select(
      "comprobante_id, cliente_agente, retencion_cobrada, cr_nombre, numero_cr, cr_subido_en, estado_retencion, llega_umbral, retencion_decidida, retenida_el",
    )
    .in("comprobante_id", ids);
  for (const r of (data ?? []) as FilaRetenciones[]) {
    porId.set(String(r.comprobante_id), {
      cliente_agente: Boolean(r.cliente_agente),
      retencion_cobrada: Number(r.retencion_cobrada ?? 0),
      cr: aCr(r),
      estado_retencion: aEstado(r.estado_retencion),
      llega_umbral: r.llega_umbral ?? null,
      retencion_decidida: Boolean(r.retencion_decidida),
      retenida_el: r.retenida_el ?? null,
    });
  }
  return porId;
}

/** Los CR subidos de unas facturas, por factura (120). Sin CR, no está. */
async function crDe(ids: string[]): Promise<Map<string, CrDelDocumento>> {
  const porId = new Map<string, CrDelDocumento>();
  for (const [id, r] of await retencionesPorId(ids)) if (r.cr) porId.set(id, r.cr);
  return porId;
}

/**
 * Los comprobantes de retención (175): las facturas con la retención ya
 * cobrada, falte o no su CR. Willy, 31/10: *«debo saber qué comprobantes de
 * retención se han entregado y qué comprobantes de retención quedan
 * pendientes»*. Van aunque la factura ya no deba nada: es justo cuando el CR
 * llega tarde.
 *
 * Los que faltan, del que más lleva esperando al que menos; los recibidos,
 * del último subido hacia atrás.
 */
export async function comprobantesDeRetencion(
  cuales: "faltan" | "recibidos",
): Promise<Resultado<RetencionDeFactura[]>> {
  try {
    const supabase = await clienteServidor();
    let consulta = supabase
      .from("v_retenciones")
      .select(
        "comprobante_id, numero, cliente_id, cliente, documento, fecha_emision, total, retencion_cobrada, retenida_el, cr_nombre, numero_cr, cr_subido_en, estado_retencion",
      )
      .limit(200);
    consulta =
      cuales === "faltan"
        ? consulta.eq("estado_retencion", "falta_cr").order("retenida_el", { ascending: true })
        : consulta.eq("estado_retencion", "cr_recibido").order("cr_subido_en", { ascending: false }).limit(50);
    const { data, error } = await consulta;
    if (error) return fallo(error, "cobranzas/comprobantesDeRetencion");
    return {
      ok: true,
      datos: ((data ?? []) as FilaRetenciones[]).map((r) => ({
        comprobante_id: String(r.comprobante_id),
        numero: String(r.numero),
        cliente_id: String(r.cliente_id),
        cliente: String(r.cliente ?? "—"),
        documento: r.documento ?? null,
        fecha_emision: String(r.fecha_emision),
        total: Number(r.total ?? 0),
        retencion: Number(r.retencion_cobrada ?? 0),
        retenida_el: r.retenida_el ?? null,
        cr: aCr(r),
        estado_retencion: aEstado(r.estado_retencion),
      })),
    };
  } catch (e) {
    return fallo(e, "cobranzas/comprobantesDeRetencion");
  }
}

/**
 * La cartera agrupada por cliente, ordenada por lo que más urge cobrar.
 *
 * La prioridad combina atraso e importe: una factura de 200 con 120 días y una
 * de 5.000 con 10 pesan distinto, y llamar en el orden equivocado cuesta
 * dinero.
 */
export async function carteraPorCliente(): Promise<Resultado<ClienteEnCartera[]>> {
  try {
    const supabase = await clienteServidor();

    // Se agrupa en Postgres (vista `v_cartera_por_cliente`, migración 048).
    //
    // Antes se traían los 1.000 primeros documentos abiertos y se agrupaban
    // aquí, así que a partir de ahí la deuda salía DE MENOS — y el orden de
    // llamada, que es de lo que va esta pantalla, salía mal. Ver PENDIENTES
    // §0.3. Después de agrupar hay una fila por cliente, y eso está acotado
    // por el maestro: ya no hay nada que truncar.
    const { data, error } = await supabase
      .from("v_cartera_por_cliente")
      .select("cliente_id, cliente, documento, documentos, saldo, vencido, dias_mas_antiguo")
      .limit(1000);

    if (error) return fallo(error, "cobranzas/carteraPorCliente");

    const lista: ClienteEnCartera[] = (data ?? []).map((d) => ({
      cliente_id: String(d.cliente_id),
      cliente: String(d.cliente ?? "—"),
      documento: d.documento ?? null,
      documentos: Number(d.documentos ?? 0),
      saldo: dos(Number(d.saldo ?? 0)),
      vencido: dos(Number(d.vencido ?? 0)),
      diasMasAntiguo: Number(d.dias_mas_antiguo ?? 0),
    }));
    const mayor = lista.reduce((a, c) => Math.max(a, c.saldo), 0);

    return {
      ok: true,
      datos: lista.sort(
        (a, b) =>
          prioridad(b.saldo, b.diasMasAntiguo, mayor) -
          prioridad(a.saldo, a.diasMasAntiguo, mayor),
      ),
    };
  } catch (e) {
    return fallo(e, "cobranzas/carteraPorCliente");
  }
}

/** Las cuotas de un comprobante, para enseñar el reparto antes de cobrar. */
export async function cuotasDe(
  comprobanteId: string,
): Promise<Resultado<CuotaComprobante[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("comprobante_cuotas")
      .select("id, numero, fecha_vencimiento, monto, pagado, saldo")
      .eq("comprobante_id", comprobanteId)
      .order("numero");

    if (error) return fallo(error, "cobranzas/cuotasDe");

    return {
      ok: true,
      datos: (data ?? []).map((c) => ({
        id: String(c.id),
        numero: Number(c.numero),
        fecha_vencimiento: String(c.fecha_vencimiento),
        monto: Number(c.monto ?? 0),
        pagado: Number(c.pagado ?? 0),
        saldo: Number(c.saldo ?? 0),
      })),
    };
  } catch (e) {
    return fallo(e, "cobranzas/cuotasDe");
  }
}

/**
 * Los últimos pagos registrados, de un periodo si se da (07/10: el arqueo
 * semanal de Willy, «cuánto me ingresa, cuánto me depositan»).
 */
export async function ultimosPagos(
  limite = 50,
  periodo: { desde?: string; hasta?: string } = {},
): Promise<Resultado<PagoRegistrado[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("pagos")
      .select(
        `id, comprobante_id, fecha, monto, medio, referencia, observaciones, voucher_ruta,
         comprobantes(numero, clientes(razon_social)),
         perfiles(nombre)`,
      )
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false })
      .gte("fecha", esFecha(periodo.desde) ? (periodo.desde as string) : "2000-01-01")
      .lte("fecha", esFecha(periodo.hasta) ? (periodo.hasta as string) : "2100-01-01")
      .limit(limite);

    if (error) return fallo(error, "cobranzas/ultimosPagos");

    const crudos = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        comprobantes: { numero: string; clientes: { razon_social: string } | null } | null;
        perfiles: { nombre: string } | null;
      }
    >;

    // Un cobro «Retención» dice si su factura ya tiene el CR (31/10): pagada
    // la factura, sale de la cartera, y este es el sitio donde se sigue viendo.
    const crs = await crDe([
      ...new Set(crudos.filter((p) => p.medio === "retencion").map((p) => String(p.comprobante_id))),
    ]);

    return {
      ok: true,
      datos: crudos.map((p) => ({
        id: String(p.id),
        comprobante_id: String(p.comprobante_id),
        comprobante_numero: p.comprobantes?.numero ?? "—",
        cliente: p.comprobantes?.clientes?.razon_social ?? null,
        fecha: String(p.fecha),
        monto: Number(p.monto ?? 0),
        medio: (p.medio as MedioPago) ?? "transferencia",
        referencia: (p.referencia as string | null) ?? null,
        observaciones: (p.observaciones as string | null) ?? null,
        registrado_por: p.perfiles?.nombre ?? null,
        tiene_voucher: Boolean(p.voucher_ruta),
        cr: p.medio === "retencion" ? (crs.get(String(p.comprobante_id)) ?? null) : null,
      })),
    };
  } catch (e) {
    return fallo(e, "cobranzas/ultimosPagos");
  }
}

/**
 * Los cobros de UN comprobante, del más antiguo al más reciente (TR-06).
 *
 * La ficha de la factura decía «Pagado X» y nada más: ni cuándo, ni por qué
 * medio, ni quién lo registró, ni con qué voucher. Todo eso existía y solo se
 * veía desde Cobranzas. Aquí «¿qué pasó después?» deja de cortarse en la
 * factura.
 *
 * `perfiles` va con el nombre de la clave delante: hoy `pagos` solo tiene una
 * hacia perfiles, pero el día que tenga dos PostgREST tumbaría la consulta
 * (PGRST201), como ya pasó con las guías de la factura.
 *
 * Los importes salen como están guardados, en dólares: la ficha los pasa a la
 * moneda del documento.
 */
export async function pagosDe(comprobanteId: string): Promise<Resultado<PagoRegistrado[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("pagos")
      .select(
        `id, comprobante_id, fecha, monto, medio, referencia, observaciones, voucher_ruta,
         perfiles!pagos_registrado_por_fkey(nombre)`,
      )
      .eq("comprobante_id", comprobanteId)
      .order("fecha", { ascending: true })
      .order("creado_en", { ascending: true });

    if (error) return fallo(error, "cobranzas/pagosDe");

    const crudos = (data ?? []) as unknown as Array<
      Record<string, unknown> & { perfiles: { nombre: string } | null }
    >;

    return {
      ok: true,
      datos: crudos.map((p) => ({
        id: String(p.id),
        comprobante_id: String(p.comprobante_id),
        comprobante_numero: "",
        cliente: null,
        fecha: String(p.fecha),
        monto: Number(p.monto ?? 0),
        medio: (p.medio as MedioPago) ?? "transferencia",
        referencia: (p.referencia as string | null) ?? null,
        observaciones: (p.observaciones as string | null) ?? null,
        registrado_por: p.perfiles?.nombre ?? null,
        tiene_voucher: Boolean(p.voucher_ruta),
        // La ficha de la factura enseña su CR en su propio bloque.
        cr: null,
      })),
    };
  } catch (e) {
    return fallo(e, "cobranzas/pagosDe");
  }
}

/** Las gestiones de cobranza más recientes. */
export async function gestiones(
  clienteId?: string,
  limite = 50,
): Promise<Resultado<Gestion[]>> {
  try {
    const supabase = await clienteServidor();
    let consulta = supabase
      .from("gestiones_cobranza")
      .select(
        `id, cliente_id, comprobante_id, fecha, canal, resultado, compromiso_fecha, nota,
         comprobantes(numero),
         perfiles(nombre)`,
      )
      .order("fecha", { ascending: false })
      .limit(limite);

    if (clienteId) consulta = consulta.eq("cliente_id", clienteId);

    const { data, error } = await consulta;
    if (error) return fallo(error, "cobranzas/gestiones");

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        comprobantes: { numero: string } | null;
        perfiles: { nombre: string } | null;
      }
    >;

    return {
      ok: true,
      datos: crudas.map((g) => ({
        id: String(g.id),
        cliente_id: String(g.cliente_id),
        comprobante_id: (g.comprobante_id as string | null) ?? null,
        comprobante_numero: g.comprobantes?.numero ?? null,
        fecha: String(g.fecha),
        canal: String(g.canal ?? "otro"),
        resultado: (g.resultado as string | null) ?? null,
        compromiso_fecha: (g.compromiso_fecha as string | null) ?? null,
        nota: (g.nota as string | null) ?? null,
        usuario: g.perfiles?.nombre ?? null,
      })),
    };
  } catch (e) {
    return fallo(e, "cobranzas/gestiones");
  }
}

/**
 * Compromisos de pago que ya vencieron o vencen hoy.
 *
 * Es la lista con la que se empieza el día: alguien prometió pagar y llegó la
 * fecha. Sin esto, una promesa apuntada se olvida y la gestión se pierde.
 */
export async function compromisosVencidos(hoy: string): Promise<Resultado<Gestion[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("gestiones_cobranza")
      .select(
        `id, cliente_id, comprobante_id, fecha, canal, resultado, compromiso_fecha, nota,
         clientes(razon_social),
         comprobantes(numero, saldo),
         perfiles(nombre)`,
      )
      .not("compromiso_fecha", "is", null)
      .lte("compromiso_fecha", hoy)
      .order("compromiso_fecha")
      .limit(50);

    if (error) return fallo(error, "cobranzas/compromisosVencidos");

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        clientes: { razon_social: string } | null;
        comprobantes: { numero: string; saldo: number } | null;
        perfiles: { nombre: string } | null;
      }
    >;

    return {
      ok: true,
      // Un compromiso sobre un documento ya cobrado no es un pendiente: se
      // cumplió, aunque nadie volviera a apuntarlo.
      datos: crudas
        .filter((g) => !g.comprobantes || Number(g.comprobantes.saldo ?? 0) > 0)
        .map((g) => ({
          id: String(g.id),
          cliente_id: String(g.cliente_id),
          comprobante_id: (g.comprobante_id as string | null) ?? null,
          comprobante_numero: g.comprobantes?.numero ?? null,
          fecha: String(g.fecha),
          canal: String(g.canal ?? "otro"),
          resultado: (g.resultado as string | null) ?? null,
          compromiso_fecha: (g.compromiso_fecha as string | null) ?? null,
          nota: `${g.clientes?.razon_social ?? ""}${g.nota ? ` · ${g.nota}` : ""}`,
          usuario: g.perfiles?.nombre ?? null,
        })),
    };
  } catch (e) {
    return fallo(e, "cobranzas/compromisosVencidos");
  }
}

function esFecha(v?: string): boolean {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

/** Las cifras de arriba de cobranzas (108). */
export interface IndicadoresCobranzas {
  porCobrar: number;
  documentos: number;
  clientes: number;
  vencido: number;
  docsVencidos: number;
  venceSemana: number;
  docsSemana: number;
  cobrado: number;
  pagos: number;
}

export async function indicadoresCobranzas(periodo: {
  desde?: string;
  hasta?: string;
}): Promise<Resultado<IndicadoresCobranzas>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("indicadores_cobranzas", {
      ...(esFecha(periodo.desde) ? { p_desde: periodo.desde as string } : {}),
      ...(esFecha(periodo.hasta) ? { p_hasta: periodo.hasta as string } : {}),
    });
    if (error) return fallo(error, "cobranzas/indicadores");
    const d = (data ?? {}) as Record<string, unknown>;
    const n = (k: string) => Number(d[k] ?? 0);
    return {
      ok: true,
      datos: {
        porCobrar: n("por_cobrar"),
        documentos: n("documentos"),
        clientes: n("clientes"),
        vencido: n("vencido"),
        docsVencidos: n("docs_vencidos"),
        venceSemana: n("vence_semana"),
        docsSemana: n("docs_semana"),
        cobrado: n("cobrado"),
        pagos: n("pagos"),
      },
    };
  } catch (e) {
    return fallo(e, "cobranzas/indicadores");
  }
}
