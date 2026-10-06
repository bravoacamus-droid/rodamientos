import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type { MedioPago } from "../dominio/tipos";

/**
 * Lo que sale en el estado de cuenta de un cliente: sus datos, lo que debe
 * y lo que pagó en los últimos tres meses.
 *
 * Lo pendiente sale de `v_cartera`, la misma vista que la pantalla de
 * cobranzas: el papel que se manda y la pantalla de quien llama no pueden
 * decir saldos distintos.
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
): Promise<{ ok: true; datos: EstadoDeCuenta | null } | { ok: false; error: string }> {
  try {
    const supabase = await clienteServidor();
    const desde = new Date(`${hoy}T12:00:00Z`);
    desde.setUTCDate(desde.getUTCDate() - DIAS_DE_PAGOS);

    const [cli, docs, pagos] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, razon_social, numero_documento, direccion, email, telefono")
        .eq("id", clienteId)
        .maybeSingle(),
      supabase
        .from("v_cartera")
        .select(
          "id, numero, tipo, fecha_emision, fecha_vencimiento, orden_compra_cliente, total, pagado, saldo, dias_vencido",
        )
        .eq("cliente_id", clienteId)
        // Del que vence antes al que vence después: es el orden en que se paga.
        .order("fecha_vencimiento", { ascending: true, nullsFirst: true })
        .order("fecha_emision"),
      supabase
        .from("pagos")
        .select("fecha, monto, medio, referencia, comprobantes!inner(numero, cliente_id)")
        .eq("comprobantes.cliente_id", clienteId)
        .gte("fecha", desde.toISOString().slice(0, 10))
        .order("fecha", { ascending: false })
        .limit(100),
    ]);

    if (cli.error) return fallo(cli.error, "cobranzas/estado-de-cuenta");
    if (!cli.data) return { ok: true, datos: null };
    if (docs.error) return fallo(docs.error, "cobranzas/estado-de-cuenta");
    if (pagos.error) return fallo(pagos.error, "cobranzas/estado-de-cuenta");

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
        documentos: (docs.data ?? []).map((d) => ({
          id: String(d.id),
          numero: String(d.numero),
          tipo: String(d.tipo),
          fecha_emision: String(d.fecha_emision),
          fecha_vencimiento: d.fecha_vencimiento ?? null,
          orden_compra_cliente: d.orden_compra_cliente ?? null,
          total: Number(d.total ?? 0),
          pagado: Number(d.pagado ?? 0),
          saldo: Number(d.saldo ?? 0),
          dias_vencido: Number(d.dias_vencido ?? 0),
        })),
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
