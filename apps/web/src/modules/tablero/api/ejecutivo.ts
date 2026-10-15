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

// ---------------------------------------------------------------------------
// Lo vendido (132)
// ---------------------------------------------------------------------------

/**
 * Lo vendido: los pedidos (130) más el histórico del sistema viejo (las
 * cotizaciones atendidas sin pedido). Luis, 15/10: *«ahí es cuando una venta
 * ya se concretó»*. Va junto a lo facturado y lo cotizado, no en su lugar:
 * lo facturado es lo declarado; lo vendido, el sí del cliente.
 */
export interface DatosVentas {
  resumen: {
    ventas: number;
    pedidos: number;
    repetidos: number;
    vendido: number;
    /** Margen sobre el costo, solo de lo que tiene costo; null sin ninguna. */
    margen: number | null;
    clientes: number;
    facturado: number;
    porCobrar: number;
    sinFacturar: number;
    montoSinFacturar: number;
  };
  serie: { periodo: string; ventas: number; vendido: number; repetidos: number }[];
  porCliente: {
    id: string;
    cliente: string;
    ventas: number;
    repetidos: number;
    vendido: number;
    margen: number | null;
  }[];
}

const margenDe = (venta: number, costo: number) =>
  costo > 0 ? Math.round(((venta - costo) / costo) * 1000) / 10 : null;

export async function datosVentas(
  rango: { desde: string; hasta: string; grano: Grano },
  cliente: string | null = null,
): Promise<Resultado<DatosVentas>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("tablero_ventas", {
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
          ventas: n(r.ventas),
          pedidos: n(r.pedidos),
          repetidos: n(r.repetidos),
          vendido: n(r.vendido),
          margen: margenDe(n(r.venta_con_costo), n(r.costo)),
          clientes: n(r.clientes),
          facturado: n(r.facturado),
          porCobrar: n(r.por_cobrar),
          sinFacturar: n(r.sin_facturar),
          montoSinFacturar: n(r.monto_sin_facturar),
        },
        serie: lista(d.serie).map((p) => ({
          periodo: txt(p.periodo),
          ventas: n(p.ventas),
          vendido: n(p.vendido),
          repetidos: n(p.repetidos),
        })),
        porCliente: lista(d.por_cliente).map((c) => ({
          id: txt(c.id),
          cliente: txt(c.cliente),
          ventas: n(c.ventas),
          repetidos: n(c.repetidos),
          vendido: n(c.vendido),
          margen: margenDe(n(c.venta_con_costo), n(c.costo)),
        })),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

// ---------------------------------------------------------------------------
// Compras (133)
// ---------------------------------------------------------------------------

/** El reporte de compras: todo en dólares y sin IGV, sin las anuladas. */
export interface DatosCompras {
  resumen: {
    compras: number;
    proveedores: number;
    comprado: number;
    gastos: number;
    importado: number;
    gastosImportacion: number;
    diasEntrega: number | null;
    productos: number;
    unidades: number;
    ahorroPosible: number;
    porRecibir: number;
    montoPorRecibir: number;
    sinRegistrar: number;
  };
  serie: { periodo: string; compras: number; local: number; aerea: number; maritima: number; gastos: number }[];
  porVia: { via: string; compras: number; monto: number; gastos: number }[];
  proveedores: {
    id: string;
    proveedor: string;
    compras: number;
    monto: number;
    diasEntrega: number | null;
    recibidas: number;
    ultima: string;
  }[];
  productos: {
    id: string;
    codigo: string;
    descripcion: string;
    marca: string | null;
    unidades: number;
    monto: number;
    veces: number;
    proveedores: number;
    costoPromedio: number;
  }[];
  mejorPrecio: {
    id: string;
    codigo: string;
    descripcion: string;
    mejor: number;
    peor: number;
    proveedores: number;
    proveedorMejor: string;
    proveedorPeor: string;
    diferencia: number;
  }[];
  alzas: { codigo: string; descripcion: string; ultimo: number; anterior: number; variacion: number; fecha: string }[];
  pendientes: { id: string; numero: string; fecha: string; proveedor: string; faltaFactura: boolean; monto: number; dias: number }[];
}

export async function datosCompras(
  rango: { desde: string; hasta: string; grano: Grano },
  proveedor: string | null = null,
): Promise<Resultado<DatosCompras>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("tablero_compras", {
      p_desde: rango.desde,
      p_hasta: rango.hasta,
      p_grano: rango.grano,
      ...(proveedor ? { p_proveedor: proveedor } : {}),
    });
    if (error) return fallo(error);
    const d = (data ?? {}) as Json;
    const r = (d.resumen ?? {}) as Json;
    return {
      ok: true,
      datos: {
        resumen: {
          compras: n(r.compras),
          proveedores: n(r.proveedores),
          comprado: n(r.comprado),
          gastos: n(r.gastos),
          importado: n(r.importado),
          gastosImportacion: n(r.gastos_importacion),
          diasEntrega: nulo(r.dias_entrega),
          productos: n(r.productos),
          unidades: n(r.unidades),
          ahorroPosible: n(r.ahorro_posible),
          porRecibir: n(r.por_recibir),
          montoPorRecibir: n(r.monto_por_recibir),
          sinRegistrar: n(r.sin_registrar),
        },
        serie: lista(d.serie).map((p) => ({
          periodo: txt(p.periodo),
          compras: n(p.compras),
          local: n(p.local),
          aerea: n(p.aerea),
          maritima: n(p.maritima),
          gastos: n(p.gastos),
        })),
        porVia: lista(d.por_via).map((v) => ({ via: txt(v.via), compras: n(v.compras), monto: n(v.monto), gastos: n(v.gastos) })),
        proveedores: lista(d.proveedores).map((x) => ({
          id: txt(x.id),
          proveedor: txt(x.proveedor),
          compras: n(x.compras),
          monto: n(x.monto),
          diasEntrega: nulo(x.dias_entrega),
          recibidas: n(x.recibidas),
          ultima: txt(x.ultima),
        })),
        productos: lista(d.productos).map((x) => ({
          id: txt(x.id),
          codigo: txt(x.codigo),
          descripcion: txt(x.descripcion),
          marca: x.marca ? txt(x.marca) : null,
          unidades: n(x.unidades),
          monto: n(x.monto),
          veces: n(x.veces),
          proveedores: n(x.proveedores),
          costoPromedio: n(x.costo_promedio),
        })),
        mejorPrecio: lista(d.mejor_precio).map((x) => ({
          id: txt(x.id),
          codigo: txt(x.codigo),
          descripcion: txt(x.descripcion),
          mejor: n(x.mejor),
          peor: n(x.peor),
          proveedores: n(x.proveedores),
          proveedorMejor: txt(x.proveedor_mejor),
          proveedorPeor: txt(x.proveedor_peor),
          diferencia: n(x.diferencia),
        })),
        alzas: lista(d.alzas).map((x) => ({
          codigo: txt(x.codigo),
          descripcion: txt(x.descripcion),
          ultimo: n(x.ultimo),
          anterior: n(x.anterior),
          variacion: n(x.variacion),
          fecha: txt(x.fecha),
        })),
        pendientes: lista(d.pendientes).map((x) => ({
          id: txt(x.id),
          numero: txt(x.numero),
          fecha: txt(x.fecha),
          proveedor: txt(x.proveedor),
          faltaFactura: Boolean(x.falta_factura),
          monto: n(x.monto),
          dias: n(x.dias),
        })),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Los proveedores a los que se les ha comprado, para el filtro del reporte. */
export async function proveedoresConCompras(): Promise<Resultado<{ id: string; nombre: string }[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("compras")
      .select("proveedor_id, proveedores(razon_social)")
      .neq("estado", "anulada")
      .limit(5000);
    if (error) return fallo(error);
    const vistos = new Map<string, string>();
    for (const c of (data ?? []) as unknown as { proveedor_id: string; proveedores: { razon_social: string } | null }[]) {
      vistos.set(c.proveedor_id, c.proveedores?.razon_social ?? "—");
    }
    return {
      ok: true,
      datos: [...vistos.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };
  } catch (e) {
    return fallo(e);
  }
}

// ---------------------------------------------------------------------------
// Historial del producto (134) y compras de un proveedor
// ---------------------------------------------------------------------------

export interface DatosProducto {
  resumen: {
    vendidoUnidades: number;
    vendido: number;
    ventas: number;
    clientes: number;
    precioPromedio: number | null;
    margen: number | null;
    facturadoUnidades: number;
    facturado: number;
    compradoUnidades: number;
    comprado: number;
    costoPromedio: number | null;
    proveedores: number;
  };
  serie: { periodo: string; vendidoUnidades: number; vendido: number; compradoUnidades: number; comprado: number }[];
  clientes: { id: string; cliente: string; unidades: number; vendido: number; ventas: number; ultima: string; precio: number | null }[];
  proveedores: {
    id: string;
    proveedor: string;
    ultimoCosto: number | null;
    ultimaCompra: string | null;
    unidades: number | null;
    costoPromedio: number | null;
    compras: number;
  }[];
}

export async function datosProducto(
  rango: { desde: string; hasta: string; grano: Grano },
  producto: string,
): Promise<Resultado<DatosProducto>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("tablero_producto", {
      p_desde: rango.desde,
      p_hasta: rango.hasta,
      p_grano: rango.grano,
      p_producto: producto,
    });
    if (error) return fallo(error);
    const d = (data ?? {}) as Json;
    const r = (d.resumen ?? {}) as Json;
    return {
      ok: true,
      datos: {
        resumen: {
          vendidoUnidades: n(r.vendido_unidades),
          vendido: n(r.vendido),
          ventas: n(r.ventas),
          clientes: n(r.clientes),
          precioPromedio: nulo(r.precio_promedio),
          margen: margenDe(n(r.venta_con_costo), n(r.costo_vendido)),
          facturadoUnidades: n(r.facturado_unidades),
          facturado: n(r.facturado),
          compradoUnidades: n(r.comprado_unidades),
          comprado: n(r.comprado),
          costoPromedio: nulo(r.costo_promedio),
          proveedores: n(r.proveedores),
        },
        serie: lista(d.serie).map((p) => ({
          periodo: txt(p.periodo),
          vendidoUnidades: n(p.vendido_unidades),
          vendido: n(p.vendido),
          compradoUnidades: n(p.comprado_unidades),
          comprado: n(p.comprado),
        })),
        clientes: lista(d.clientes).map((c) => ({
          id: txt(c.id),
          cliente: txt(c.cliente),
          unidades: n(c.unidades),
          vendido: n(c.vendido),
          ventas: n(c.ventas),
          ultima: txt(c.ultima),
          precio: nulo(c.precio),
        })),
        proveedores: lista(d.proveedores).map((x) => ({
          id: txt(x.id),
          proveedor: txt(x.proveedor),
          ultimoCosto: nulo(x.ultimo_costo),
          ultimaCompra: x.ultima_compra ? txt(x.ultima_compra) : null,
          unidades: nulo(x.unidades),
          costoPromedio: nulo(x.costo_promedio),
          compras: n(x.compras),
        })),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Una compra en la lista de su proveedor. */
export interface CompraDeProveedor {
  id: string;
  numero: string;
  fecha: string;
  estado: string;
  faltaFactura: boolean;
  via: string;
  factura: string | null;
  pedido: { id: string; numero: string } | null;
  totalUsd: number;
  productos: string;
}

/** Las compras de un proveedor en el periodo, las últimas primero. */
export async function comprasDelProveedor(
  proveedor: string,
  rango: { desde: string; hasta: string },
): Promise<Resultado<CompraDeProveedor[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("compras")
      .select(
        `id, numero, fecha, estado, falta_factura, tipo, via_importacion, documento_proveedor, total, moneda, tipo_cambio,
         pedido:pedidos!compras_pedido_id_fkey(id, numero),
         compra_items(cantidad, productos(codigo))`,
      )
      .eq("proveedor_id", proveedor)
      .gte("fecha", rango.desde)
      .lte("fecha", rango.hasta)
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false })
      .limit(200);
    if (error) return fallo(error);
    return {
      ok: true,
      datos: ((data ?? []) as unknown as {
        id: string;
        numero: string;
        fecha: string;
        estado: string;
        falta_factura: boolean;
        tipo: string;
        via_importacion: string | null;
        documento_proveedor: string | null;
        total: number;
        moneda: string;
        tipo_cambio: number | null;
        pedido: { id: string; numero: string } | null;
        compra_items: { cantidad: number; productos: { codigo: string } | null }[] | null;
      }[]).map((c) => ({
        id: c.id,
        numero: c.numero,
        fecha: String(c.fecha),
        estado: c.estado,
        faltaFactura: Boolean(c.falta_factura),
        via: c.tipo === "local" ? "local" : (c.via_importacion ?? "importacion"),
        factura: c.documento_proveedor,
        pedido: c.pedido,
        totalUsd:
          c.moneda === "USD" || !(Number(c.tipo_cambio) > 0)
            ? Number(c.total)
            : Math.round((Number(c.total) / Number(c.tipo_cambio)) * 100) / 100,
        productos: (c.compra_items ?? []).map((i) => `${i.productos?.codigo ?? "—"} × ${Number(i.cantidad)}`).join(" · "),
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}
