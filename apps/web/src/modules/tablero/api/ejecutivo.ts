import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";
import type { Grano } from "@/modules/reportes";

import type { FilaCliente } from "../dominio/ejecutivo";
import type { Resultado } from "./consultas";

/**
 * Las lecturas del tablero ejecutivo (104).
 *
 * Una llamada por pestaña y por rango; la base devuelve un jsonb ya agregado.
 * Aquí solo se traduce a nombres de la pantalla y se pasa a número, porque
 * `numeric` llega como texto o como número según el tamaño.
 */

type Json = Record<string, unknown>;

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const nulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const lista = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);

// ---------------------------------------------------------------------------
// Facturación
// ---------------------------------------------------------------------------

export interface PuntoFacturacion {
  periodo: string;
  documentos: number;
  venta: number;
  notas: number;
  anuladas: number;
  clientes: number;
}

export interface DatosFacturacion {
  resumen: {
    documentos: number;
    facturas: number;
    boletas: number;
    venta: number;
    igv: number;
    total: number;
    notas: number;
    notasMonto: number;
    anuladas: number;
    anuladoMonto: number;
    clientes: number;
    cobrado: number;
    saldo: number;
    vencido: number;
    contado: number;
    credito: number;
    sunatAceptado: number;
    sunatPendiente: number;
    sunatProblema: number;
  };
  serie: PuntoFacturacion[];
  porEstado: { estado: string; documentos: number; monto: number }[];
  topClientes: { id: string; cliente: string; documentos: number; venta: number }[];
  topProductos: {
    codigo: string;
    descripcion: string;
    unidades: number;
    venta: number;
    documentos: number;
  }[];
}

export async function datosFacturacion(
  rango: { desde: string; hasta: string; grano: Grano },
  cliente: string | null,
): Promise<Resultado<DatosFacturacion>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("tablero_facturacion", {
      p_desde: rango.desde,
      p_hasta: rango.hasta,
      p_grano: rango.grano,
      ...(cliente ? { p_cliente: cliente } : {}),
    });
    if (error) return fallo(error);
    const d = (data ?? {}) as Json;
    const r = (d.resumen ?? {}) as Json;
    return {
      ok: true,
      datos: {
        resumen: {
          documentos: n(r.documentos),
          facturas: n(r.facturas),
          boletas: n(r.boletas),
          venta: n(r.venta),
          igv: n(r.igv),
          total: n(r.total),
          notas: n(r.notas),
          notasMonto: n(r.notas_monto),
          anuladas: n(r.anuladas),
          anuladoMonto: n(r.anulado_monto),
          clientes: n(r.clientes),
          cobrado: n(r.cobrado),
          saldo: n(r.saldo),
          vencido: n(r.vencido),
          contado: n(r.contado),
          credito: n(r.credito),
          sunatAceptado: n(r.sunat_aceptado),
          sunatPendiente: n(r.sunat_pendiente),
          sunatProblema: n(r.sunat_problema),
        },
        serie: lista(d.serie).map((p) => ({
          periodo: txt(p.periodo),
          documentos: n(p.documentos),
          venta: n(p.venta),
          notas: n(p.notas),
          anuladas: n(p.anuladas),
          clientes: n(p.clientes),
        })),
        porEstado: lista(d.por_estado).map((e) => ({
          estado: txt(e.estado),
          documentos: n(e.documentos),
          monto: n(e.monto),
        })),
        topClientes: lista(d.top_clientes).map((c) => ({
          id: txt(c.id),
          cliente: txt(c.cliente),
          documentos: n(c.documentos),
          venta: n(c.venta),
        })),
        topProductos: lista(d.top_productos).map((p) => ({
          codigo: txt(p.codigo),
          descripcion: txt(p.descripcion),
          unidades: n(p.unidades),
          venta: n(p.venta),
          documentos: n(p.documentos),
        })),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export interface PuntoClientes {
  periodo: string;
  activos: number;
  nuevos: number;
  venta: number;
}

export interface DatosClientes {
  clientes: FilaCliente[];
  catalogo: number;
  nunca: number;
  serie: PuntoClientes[];
}

export async function datosClientes(
  rango: { desde: string; hasta: string; grano: Grano },
  previo: { desde: string; hasta: string },
): Promise<Resultado<DatosClientes>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("tablero_clientes", {
      p_desde: rango.desde,
      p_hasta: rango.hasta,
      p_prev_desde: previo.desde,
      p_prev_hasta: previo.hasta,
      p_grano: rango.grano,
    });
    if (error) return fallo(error);
    const d = (data ?? {}) as Json;
    return {
      ok: true,
      datos: {
        clientes: lista(d.clientes).map((c) => ({
          id: txt(c.id),
          cliente: txt(c.cliente),
          documento: c.documento ? txt(c.documento) : null,
          venta: n(c.venta),
          documentos: n(c.documentos),
          ventaPrev: n(c.venta_prev),
          documentosPrev: n(c.documentos_prev),
          primera: txt(c.primera),
          ultima: txt(c.ultima),
          documentosHist: n(c.documentos_hist),
          diasSinComprar: n(c.dias_sin_comprar),
        })),
        catalogo: n(d.catalogo),
        nunca: n(d.nunca),
        serie: lista(d.serie).map((p) => ({
          periodo: txt(p.periodo),
          activos: n(p.activos),
          nuevos: n(p.nuevos),
          venta: n(p.venta),
        })),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Los clientes que han comprado alguna vez, para el filtro de facturación. */
export async function clientesConCompras(): Promise<Resultado<{ id: string; nombre: string }[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("tablero_clientes", {
      p_desde: "2000-01-01",
      p_hasta: "2100-01-01",
      p_prev_desde: "1999-01-01",
      p_prev_hasta: "1999-01-02",
      p_grano: "anio",
    });
    if (error) return fallo(error);
    const filas = lista((data as Json | null)?.clientes)
      .map((c) => ({ id: txt(c.id), nombre: txt(c.cliente) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return { ok: true, datos: filas };
  } catch (e) {
    return fallo(e);
  }
}

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------

export interface DatosCotizaciones {
  resumen: {
    cotizaciones: number;
    monto: number;
    borrador: number;
    enviada: number;
    aprobada: number;
    rechazada: number;
    vencida: number;
    anulada: number;
    montoProceso: number;
    montoAprobado: number;
    montoPerdido: number;
    diasAprobacion: number | null;
    facturado: number;
    clientes: number;
  };
  porEstado: { estado: string; cotizaciones: number; monto: number }[];
  serie: {
    periodo: string;
    cotizaciones: number;
    monto: number;
    aprobadas: number;
    montoAprobado: number;
  }[];
  porVendedor: { vendedor: string; cotizaciones: number; aprobadas: number; monto: number }[];
  topClientes: {
    id: string;
    cliente: string;
    cotizaciones: number;
    aprobadas: number;
    monto: number;
  }[];
  topProductos: {
    codigo: string;
    descripcion: string;
    veces: number;
    cantidad: number;
    monto: number;
  }[];
  porVencer: {
    id: string;
    numero: string;
    cliente: string;
    monto: number;
    fecha: string;
    fechaVencimiento: string;
    estado: string;
    dias: number;
  }[];
  motivosRechazo: { motivo: string; veces: number }[];
}

export async function datosCotizaciones(
  rango: { desde: string; hasta: string; grano: Grano },
  cliente: string | null = null,
): Promise<Resultado<DatosCotizaciones>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("tablero_cotizaciones", {
      p_desde: rango.desde,
      p_hasta: rango.hasta,
      p_grano: rango.grano,
      ...(cliente ? { p_cliente: cliente } : {}),
    });
    if (error) return fallo(error);
    const d = (data ?? {}) as Json;
    const r = (d.resumen ?? {}) as Json;
    return {
      ok: true,
      datos: {
        resumen: {
          cotizaciones: n(r.cotizaciones),
          monto: n(r.monto),
          borrador: n(r.borrador),
          enviada: n(r.enviada),
          aprobada: n(r.aprobada),
          rechazada: n(r.rechazada),
          vencida: n(r.vencida),
          anulada: n(r.anulada),
          montoProceso: n(r.monto_proceso),
          montoAprobado: n(r.monto_aprobado),
          montoPerdido: n(r.monto_perdido),
          diasAprobacion: nulo(r.dias_aprobacion),
          facturado: n(r.facturado),
          clientes: n(r.clientes),
        },
        porEstado: lista(d.por_estado).map((e) => ({
          estado: txt(e.estado),
          cotizaciones: n(e.cotizaciones),
          monto: n(e.monto),
        })),
        serie: lista(d.serie).map((p) => ({
          periodo: txt(p.periodo),
          cotizaciones: n(p.cotizaciones),
          monto: n(p.monto),
          aprobadas: n(p.aprobadas),
          montoAprobado: n(p.monto_aprobado),
        })),
        porVendedor: lista(d.por_vendedor).map((v) => ({
          vendedor: txt(v.vendedor),
          cotizaciones: n(v.cotizaciones),
          aprobadas: n(v.aprobadas),
          monto: n(v.monto),
        })),
        topClientes: lista(d.top_clientes).map((c) => ({
          id: txt(c.id),
          cliente: txt(c.cliente),
          cotizaciones: n(c.cotizaciones),
          aprobadas: n(c.aprobadas),
          monto: n(c.monto),
        })),
        topProductos: lista(d.top_productos).map((p) => ({
          codigo: txt(p.codigo),
          descripcion: txt(p.descripcion),
          veces: n(p.veces),
          cantidad: n(p.cantidad),
          monto: n(p.monto),
        })),
        porVencer: lista(d.por_vencer).map((u) => ({
          id: txt(u.id),
          numero: txt(u.numero),
          cliente: txt(u.cliente),
          monto: n(u.monto),
          fecha: txt(u.fecha),
          fechaVencimiento: txt(u.fecha_vencimiento),
          estado: txt(u.estado),
          dias: n(u.dias),
        })),
        motivosRechazo: lista(d.motivos_rechazo).map((m) => ({
          motivo: txt(m.motivo),
          veces: n(m.veces),
        })),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Todos los clientes activos, para el filtro de cotizaciones.
 *
 * No solo los que han comprado, como en facturación: se cotiza a quien
 * todavía no compra, y es justo a quien hay que poder buscar.
 */
export async function clientesActivos(): Promise<Resultado<{ id: string; nombre: string }[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("clientes")
      .select("id, razon_social")
      .eq("activo", true)
      .order("razon_social");
    if (error) return fallo(error);
    return { ok: true, datos: (data ?? []).map((c) => ({ id: c.id, nombre: c.razon_social })) };
  } catch (e) {
    return fallo(e);
  }
}
