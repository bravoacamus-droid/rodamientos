import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import { prioridad } from "../dominio/cobro";
import type {
  ClienteEnCartera,
  CuotaComprobante,
  DocumentoPorCobrar,
  FiltrosCartera,
  Gestion,
  MedioPago,
  PagoRegistrado,
  TramoAging,
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
    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((d) => ({
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
      })),
    };
  } catch (e) {
    return fallo(e);
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

    if (error) return fallo(error);

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
    return fallo(e);
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

    if (error) return fallo(error);

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
    return fallo(e);
  }
}

/** Los últimos pagos registrados. */
export async function ultimosPagos(limite = 50): Promise<Resultado<PagoRegistrado[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("pagos")
      .select(
        `id, comprobante_id, fecha, monto, medio, referencia, observaciones,
         comprobantes(numero, clientes(razon_social)),
         perfiles(nombre)`,
      )
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false })
      .limit(limite);

    if (error) return fallo(error);

    const crudos = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        comprobantes: { numero: string; clientes: { razon_social: string } | null } | null;
        perfiles: { nombre: string } | null;
      }
    >;

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
      })),
    };
  } catch (e) {
    return fallo(e);
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
    if (error) return fallo(error);

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
    return fallo(e);
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

    if (error) return fallo(error);

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
    return fallo(e);
  }
}
