import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import { desdeDePeriodo, leerPeriodoCuenta, type PeriodoCuenta } from "../dominio/estado-cuenta";
import { diasDeAtraso, diasDesdeVencimiento, ordenarParaCuenta } from "../dominio/situacion";
import type { MedioPago } from "../dominio/tipos";

/**
 * Lo que sale en el estado de cuenta de un cliente: sus datos, lo que debe
 * y, desde el 03/11, también lo que ya pagó.
 *
 * Luis, por Willy: el estado de cuenta tiene que traer «todos, los que
 * pagaron y los que falta pagar». Hasta hoy salía de `v_cartera` y solo
 * traía lo pendiente. Ahora sale de `comprobantes`: lo que se debe SIEMPRE
 * (sea de cuando sea), y lo pagado del periodo elegido. El atraso se calcula
 * con la regla de `v_cartera` (`diasDeAtraso`), así que el papel y la
 * pantalla de quien llama siguen diciendo lo mismo.
 */

export interface DocumentoCuenta {
  id: string;
  numero: string;
  tipo: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  orden_compra_cliente: string | null;
  total: number;
  pagado: number;
  saldo: number;
  dias_vencido: number;
  /**
   * En la moneda del documento (116): una factura en soles se le enseña al
   * cliente en soles. Los de arriba siguen en dólares para sumar.
   */
  moneda: "USD" | "PEN";
  total_doc: number;
  pagado_doc: number;
  saldo_doc: number;
}

export interface PagoCuenta {
  fecha: string;
  numero: string;
  monto: number;
  medio: MedioPago;
  referencia: string | null;
}

export interface EstadoDeCuenta {
  cliente: {
    id: string;
    razonSocial: string;
    documento: string | null;
    direccion: string | null;
    email: string | null;
    telefono: string | null;
  };
  documentos: DocumentoCuenta[];
  pagos: PagoCuenta[];
}

/** Cuántos días de pagos recibidos salen en el papel. */
export const DIAS_DE_PAGOS = 90;

export async function estadoDeCuenta(
  clienteId: string,
  hoy: string,
  periodo: PeriodoCuenta = "12m",
): Promise<{ ok: true; datos: EstadoDeCuenta | null } | { ok: false; error: string }> {
  try {
    const supabase = await clienteServidor();
    const desdePagadas = desdeDePeriodo(periodo, hoy);
    // Los pagos recibidos: los del periodo; con «solo lo pendiente», los de
    // los últimos 90 días, como antes.
    const desde = new Date(`${hoy}T12:00:00Z`);
    desde.setUTCDate(desde.getUTCDate() - DIAS_DE_PAGOS);
    const desdePagos = periodo === "pendiente" ? desde.toISOString().slice(0, 10) : desdePagadas;

    let docsConsulta = supabase
      .from("comprobantes")
      .select("id, numero, tipo, fecha_emision, fecha_vencimiento, orden_compra_cliente, total, pagado, saldo, moneda, tipo_cambio, pen_total")
      .eq("cliente_id", clienteId)
      .in("tipo", ["factura", "boleta"])
      .neq("estado", "anulado")
      // Por número, de la más antigua a la última (Willy, 03/11).
      .order("numero")
      .limit(1000);
    docsConsulta = desdePagadas
      ? docsConsulta.or(`saldo.gt.0,fecha_emision.gte.${desdePagadas}`)
      : docsConsulta;

    let pagosConsulta = supabase
      .from("pagos")
      .select("fecha, monto, medio, referencia, comprobantes!inner(numero, cliente_id)")
      .eq("comprobantes.cliente_id", clienteId)
      .order("fecha", { ascending: false })
      .limit(300);
    if (desdePagos) pagosConsulta = pagosConsulta.gte("fecha", desdePagos);

    const [cli, docs, pagos] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, razon_social, numero_documento, direccion, email, telefono")
        .eq("id", clienteId)
        .maybeSingle(),
      docsConsulta,
      pagosConsulta,
    ]);

    if (cli.error) return fallo(cli.error, "cobranzas/estado-de-cuenta");
    if (!cli.data) return { ok: true, datos: null };
    if (docs.error) return fallo(docs.error, "cobranzas/estado-de-cuenta");
    if (pagos.error) return fallo(pagos.error, "cobranzas/estado-de-cuenta");

    // Las en soles (116): la factura trae su moneda y su total en soles.
    const enSoles = new Map<string, { tc: number; total: number }>();
    for (const p of docs.data ?? []) {
      if (p.moneda === "PEN" && p.pen_total != null && Number(p.tipo_cambio) > 0) {
        enSoles.set(String(p.id), { tc: Number(p.tipo_cambio), total: Number(p.pen_total) });
      }
    }

    const c = cli.data;
    return {
      ok: true,
      datos: {
        cliente: {
          id: c.id,
          razonSocial: c.razon_social,
          documento: c.numero_documento ?? null,
          direccion: c.direccion ?? null,
          email: c.email ?? null,
          telefono: c.telefono ?? null,
        },
        // Lo que se debe arriba, de lo que vence antes a lo que vence después;
        // lo pagado debajo, por número (03/11).
        documentos: ordenarParaCuenta((docs.data ?? []).map((d) => ({
          id: String(d.id),
          numero: String(d.numero),
          tipo: String(d.tipo),
          fecha_emision: String(d.fecha_emision),
          fecha_vencimiento: d.fecha_vencimiento ?? null,
          orden_compra_cliente: d.orden_compra_cliente ?? null,
          total: Number(d.total ?? 0),
          pagado: Number(d.pagado ?? 0),
          saldo: Number(d.saldo ?? 0),
          // Con signo: «Vence en 5 días» en el papel. Lo vencido sigue siendo > 0.
          dias_vencido: Number(d.saldo ?? 0) > 0 ? diasDesdeVencimiento(d.fecha_vencimiento, hoy) : 0,
          ...(() => {
            const pen = enSoles.get(String(d.id));
            const saldo = Number(d.saldo ?? 0);
            if (!pen) {
              return { moneda: "USD" as const, total_doc: Number(d.total ?? 0), pagado_doc: Number(d.pagado ?? 0), saldo_doc: saldo };
            }
            const totalUsd = Number(d.total ?? 0);
            const saldoDoc =
              saldo <= 0 || !(totalUsd > 0) ? 0 : Math.min(pen.total, Math.round(((pen.total * saldo) / totalUsd) * 100) / 100);
            return {
              moneda: "PEN" as const,
              total_doc: pen.total,
              pagado_doc: Math.round((pen.total - saldoDoc) * 100) / 100,
              saldo_doc: saldoDoc,
            };
          })(),
        }))),
        pagos: (pagos.data ?? []).map((p) => {
          const comp = (Array.isArray(p.comprobantes) ? p.comprobantes[0] : p.comprobantes) as
            | { numero: string }
            | null;
          return {
            fecha: String(p.fecha),
            numero: comp?.numero ?? "",
            monto: Number(p.monto ?? 0),
            medio: p.medio as MedioPago,
            referencia: p.referencia ?? null,
          };
        }),
      },
    };
  } catch (e) {
    return fallo(e, "cobranzas/estado-de-cuenta");
  }
}

export interface ClienteConFacturas {
  cliente_id: string;
  cliente: string;
  facturas: number;
  saldo: number;
  vencido: number;
}

/**
 * Los clientes que se pueden elegir en el estado de cuenta (03/11): TODOS
 * los que tienen alguna factura, y no solo los que deben. El que está al día
 * también pide su estado de cuenta. Los que deben, arriba, de más a menos;
 * los demás, por nombre.
 */
export async function clientesConFacturas(
  hoy: string,
): Promise<{ ok: true; datos: ClienteConFacturas[] } | { ok: false; error: string }> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("comprobantes")
      .select("cliente_id, saldo, fecha_vencimiento, clientes(razon_social)")
      .in("tipo", ["factura", "boleta"])
      .neq("estado", "anulado")
      .limit(5000);
    if (error) return fallo(error, "cobranzas/clientes-con-facturas");

    const porCliente = new Map<string, ClienteConFacturas>();
    for (const f of data ?? []) {
      const cli = (Array.isArray(f.clientes) ? f.clientes[0] : f.clientes) as { razon_social: string } | null;
      const id = String(f.cliente_id);
      const c = porCliente.get(id) ?? { cliente_id: id, cliente: cli?.razon_social ?? "—", facturas: 0, saldo: 0, vencido: 0 };
      const saldo = Number(f.saldo ?? 0);
      c.facturas += 1;
      if (saldo > 0) {
        c.saldo += saldo;
        if (diasDeAtraso(f.fecha_vencimiento, hoy) > 0) c.vencido += saldo;
      }
      porCliente.set(id, c);
    }
    const lista = [...porCliente.values()].map((c) => ({
      ...c,
      saldo: Math.round(c.saldo * 100) / 100,
      vencido: Math.round(c.vencido * 100) / 100,
    }));
    lista.sort((a, b) => b.saldo - a.saldo || a.cliente.localeCompare(b.cliente));
    return { ok: true, datos: lista };
  } catch (e) {
    return fallo(e, "cobranzas/clientes-con-facturas");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ModoCuenta = "uno" | "varios" | "todos";

export interface EleccionCuenta {
  modo: ModoCuenta;
  periodo: PeriodoCuenta;
  clienteId: string | null;
  marcados: string[];
}

/**
 * Lo elegido en la dirección (`modo`, `cliente`, `c=…&c=…`, `periodo`), igual
 * para la pantalla y para el Excel (03/11): los dos tienen que sacar lo mismo.
 * `?cliente=` solo, sin modo, es como se llega desde Cobranzas y la ficha.
 */
export function leerEleccionCuenta(sp: URLSearchParams): EleccionCuenta {
  const cliente = sp.get("cliente");
  const modoParam = sp.get("modo");
  const modo: ModoCuenta = modoParam === "varios" || modoParam === "todos" ? modoParam : "uno";
  const periodoParam = sp.get("periodo");
  return {
    modo,
    // Un cliente: con lo pagado (12 meses). Varios o todos: lo que se debe.
    periodo: periodoParam ? leerPeriodoCuenta(periodoParam) : modo === "uno" ? "12m" : "pendiente",
    clienteId: cliente && UUID.test(cliente) ? cliente : null,
    marcados: sp.getAll("c").filter((v) => UUID.test(v)).slice(0, 200),
  };
}

/** Con muchos clientes, de seis en seis: no se le piden 111 consultas de golpe a la base. */
async function enTandas<T, R>(items: readonly T[], n: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const fuera: R[] = [];
  for (let i = 0; i < items.length; i += n) fuera.push(...(await Promise.all(items.slice(i, i + n).map(f))));
  return fuera;
}

/**
 * Los estados de cuenta de lo elegido. Con varios, el que no tiene nada que
 * enseñar no sale: una hoja vacía no se le manda a nadie.
 */
export async function estadosDeCuenta(
  e: EleccionCuenta,
  clientes: readonly ClienteConFacturas[],
  hoy: string,
): Promise<{ ok: true; ids: string[]; hojas: EstadoDeCuenta[] } | { ok: false; error: string }> {
  const ids =
    e.modo === "uno"
      ? e.clienteId
        ? [e.clienteId]
        : []
      : e.modo === "varios"
        ? e.marcados
        : clientes.filter((c) => e.periodo !== "pendiente" || c.saldo > 0).map((c) => c.cliente_id);
  const estados = await enTandas(ids, 6, (id) => estadoDeCuenta(id, hoy, e.periodo));
  const fallo = estados.find((x) => !x.ok);
  if (fallo && !fallo.ok) return { ok: false, error: fallo.error };
  const hojas = estados
    .flatMap((x) => (x.ok && x.datos ? [x.datos] : []))
    .filter((d) => e.modo === "uno" || d.documentos.length > 0);
  return { ok: true, ids, hojas };
}
