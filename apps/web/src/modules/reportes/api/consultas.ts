import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import {
  etiquetaMes,
  inicioDeMes,
  mesesAtras,
  ordenarAging,
  rellenarMeses,
} from "../dominio/periodo";
import type {
  Embudo,
  FamiliaValorizada,
  MesVentas,
  ProductoVendido,
  ResumenReportes,
  TramoCartera,
} from "../dominio/tipos";

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/**
 * Consultas de los informes.
 *
 * Todas van contra las vistas analíticas que ya existen en la base. Ninguna
 * agrega en JavaScript lo que Postgres ya agregó: con 2.000 SKU y años de
 * movimientos, traer las filas para sumarlas aquí sería mover megabytes para
 * calcular una columna.
 *
 * Lo único que se hace en JS es lo que Postgres NO puede: rellenar los meses
 * sin ventas —que por definición no están en el resultado— y ordenar los
 * tramos de aging por riesgo en vez de alfabéticamente.
 */

/** La serie mensual de ventas, con los meses vacíos incluidos. */
export async function ventasMensuales(
  hoy: string,
  meses = 12,
): Promise<Resultado<MesVentas[]>> {
  try {
    const supabase = await clienteServidor();
    const desde = mesesAtras(hoy, meses - 1);

    const { data, error } = await supabase
      .from("v_ventas_mensuales")
      .select("mes, documentos, venta_neta, igv, total, costo, margen, margen_pct")
      .gte("mes", desde)
      .order("mes");

    if (error) return fallo(error);

    const filas = (data ?? []).map((f) => ({
      mes: inicioDeMes(String(f.mes)),
      etiqueta: etiquetaMes(String(f.mes)),
      documentos: Number(f.documentos ?? 0),
      ventaNeta: Number(f.venta_neta ?? 0),
      igv: Number(f.igv ?? 0),
      total: Number(f.total ?? 0),
      costo: Number(f.costo ?? 0),
      margen: Number(f.margen ?? 0),
      margenPct: Number(f.margen_pct ?? 0),
    }));

    // Un mes sin ventas no aparece en la vista. Sin rellenarlo, el gráfico
    // uniría agosto con octubre como si septiembre no hubiera existido.
    return {
      ok: true,
      datos: rellenarMeses(filas, desde, hoy, (mes) => ({
        mes,
        etiqueta: etiquetaMes(mes),
        documentos: 0,
        ventaNeta: 0,
        igv: 0,
        total: 0,
        costo: 0,
        margen: 0,
        margenPct: 0,
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Los productos que más venden, por importe. */
export async function topProductos(limite = 10): Promise<Resultado<ProductoVendido[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_top_productos")
      .select(
        "producto_id, codigo, descripcion, marca, subfamilia, unidades, venta, costo, margen, clientes, ultima_venta",
      )
      .order("venta", { ascending: false })
      .limit(limite);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((p) => {
        const venta = Number(p.venta ?? 0);
        const margen = Number(p.margen ?? 0);
        return {
          id: String(p.producto_id),
          codigo: String(p.codigo),
          descripcion: String(p.descripcion ?? ""),
          marca: p.marca ?? null,
          subfamilia: p.subfamilia ?? null,
          unidades: Number(p.unidades ?? 0),
          venta,
          costo: Number(p.costo ?? 0),
          margen,
          // Sobre la venta, no sobre el costo: es como se mira un margen
          // comercial y es lo mismo que hace la ficha de producto.
          margenPct: venta > 0 ? Math.round((margen / venta) * 1000) / 10 : 0,
          clientes: Number(p.clientes ?? 0),
          ultimaVenta: p.ultima_venta ?? null,
        };
      }),
    };
  } catch (e) {
    return fallo(e);
  }
}

/** El aging de la cartera: cuánto se debe y desde cuándo. */
export async function agingCartera(): Promise<Resultado<TramoCartera[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_cartera")
      .select("tramo_aging, saldo")
      .gt("saldo", 0);

    if (error) return fallo(error);

    // Agrupar aquí y no en SQL es la excepción a la regla del archivo, y es a
    // propósito: la cartera viva de esta empresa son decenas de documentos, no
    // miles, y una vista más solo para esto habría que mantenerla.
    const porTramo = new Map<string, TramoCartera>();
    for (const f of data ?? []) {
      const tramo = String(f.tramo_aging ?? "Sin clasificar");
      const actual = porTramo.get(tramo) ?? { tramo, documentos: 0, saldo: 0 };
      actual.documentos += 1;
      actual.saldo = Math.round((actual.saldo + Number(f.saldo ?? 0)) * 100) / 100;
      porTramo.set(tramo, actual);
    }

    return { ok: true, datos: ordenarAging([...porTramo.values()]) };
  } catch (e) {
    return fallo(e);
  }
}

/** Cuánto vale el almacén, por familia. */
export async function valorizacionPorFamilia(): Promise<
  Resultado<FamiliaValorizada[]>
> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_valorizacion_inventario")
      .select("familia, skus, unidades, valor_costo, valor_venta, margen_potencial");

    if (error) return fallo(error);

    // La vista agrega por SUBfamilia; el informe enseña familias, que son tres
    // y caben en un gráfico. Bajar a subfamilia son diecisiete porciones y no
    // se lee ninguna.
    const porFamilia = new Map<string, FamiliaValorizada>();
    for (const f of data ?? []) {
      const familia = String(f.familia ?? "Sin familia");
      const actual =
        porFamilia.get(familia) ??
        {
          familia,
          skus: 0,
          unidades: 0,
          valorCosto: 0,
          valorVenta: 0,
          margenPotencial: 0,
        };
      actual.skus += Number(f.skus ?? 0);
      actual.unidades += Number(f.unidades ?? 0);
      actual.valorCosto += Number(f.valor_costo ?? 0);
      actual.valorVenta += Number(f.valor_venta ?? 0);
      actual.margenPotencial += Number(f.margen_potencial ?? 0);
      porFamilia.set(familia, actual);
    }

    const dos = (n: number) => Math.round(n * 100) / 100;

    return {
      ok: true,
      datos: [...porFamilia.values()]
        .map((f) => ({
          ...f,
          valorCosto: dos(f.valorCosto),
          valorVenta: dos(f.valorVenta),
          margenPotencial: dos(f.margenPotencial),
        }))
        .sort((a, b) => b.valorCosto - a.valorCosto),
    };
  } catch (e) {
    return fallo(e);
  }
}

/** El embudo: qué se cotizó, qué se despachó, qué se facturó y qué se cobró. */
export async function embudoComercial(): Promise<Resultado<Embudo>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_trazabilidad_venta")
      .select("cotizacion_id, total_cotizado, guia_id, comprobante_id, total_facturado, saldo");

    if (error) return fallo(error);

    const filas = data ?? [];
    const dos = (n: number) => Math.round(n * 100) / 100;

    // Una cotización con dos guías aparece dos veces: se cuentan documentos
    // ÚNICOS o el embudo saldría más ancho abajo que arriba.
    const cotizaciones = new Set<string>();
    const guias = new Set<string>();
    const comprobantes = new Set<string>();

    let cotizado = 0;
    let facturado = 0;
    let porCobrar = 0;

    for (const f of filas) {
      if (f.cotizacion_id && !cotizaciones.has(String(f.cotizacion_id))) {
        cotizaciones.add(String(f.cotizacion_id));
        cotizado += Number(f.total_cotizado ?? 0);
      }
      if (f.guia_id) guias.add(String(f.guia_id));
      if (f.comprobante_id && !comprobantes.has(String(f.comprobante_id))) {
        comprobantes.add(String(f.comprobante_id));
        facturado += Number(f.total_facturado ?? 0);
        porCobrar += Number(f.saldo ?? 0);
      }
    }

    return {
      ok: true,
      datos: {
        cotizado: dos(cotizado),
        cotizaciones: cotizaciones.size,
        // El despachado se mide por el importe facturado de las ventas que SÍ
        // llevaron guía: la guía no lleva importes, solo mercadería.
        despachado: dos(
          filas
            .filter((f) => f.guia_id && f.comprobante_id)
            .reduce((a, f) => a + Number(f.total_facturado ?? 0), 0),
        ),
        guias: guias.size,
        facturado: dos(facturado),
        comprobantes: comprobantes.size,
        cobrado: dos(facturado - porCobrar),
        porCobrar: dos(porCobrar),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Los indicadores de la cabecera. */
export async function resumen(hoy: string): Promise<Resultado<ResumenReportes>> {
  try {
    const supabase = await clienteServidor();
    const mesActual = inicioDeMes(hoy);
    const mesAnterior = mesesAtras(hoy, 1);

    const [ventas, cartera, inventario, reposicion] = await Promise.all([
      supabase
        .from("v_ventas_mensuales")
        .select("mes, venta_neta, margen_pct")
        .gte("mes", mesAnterior),
      supabase.from("v_cartera").select("saldo, dias_vencido").gt("saldo", 0),
      supabase.from("v_valorizacion_inventario").select("valor_costo"),
      supabase
        .from("v_reposicion")
        .select("id", { count: "exact", head: true })
        .in("estado_stock", ["critico", "bajo"]),
    ]);

    const primerError =
      ventas.error ?? cartera.error ?? inventario.error ?? reposicion.error;
    if (primerError) return fallo(primerError);

    const porMes = new Map(
      (ventas.data ?? []).map((v) => [inicioDeMes(String(v.mes)), v]),
    );
    const actual = porMes.get(mesActual);
    const anterior = porMes.get(mesAnterior);

    const dos = (n: number) => Math.round(n * 100) / 100;

    return {
      ok: true,
      datos: {
        ventaMes: Number(actual?.venta_neta ?? 0),
        ventaMesAnterior: Number(anterior?.venta_neta ?? 0),
        margenPct: Number(actual?.margen_pct ?? 0),
        porCobrar: dos(
          (cartera.data ?? []).reduce((a, c) => a + Number(c.saldo ?? 0), 0),
        ),
        vencido: dos(
          (cartera.data ?? [])
            .filter((c) => Number(c.dias_vencido ?? 0) > 0)
            .reduce((a, c) => a + Number(c.saldo ?? 0), 0),
        ),
        inventarioCosto: dos(
          (inventario.data ?? []).reduce((a, i) => a + Number(i.valor_costo ?? 0), 0),
        ),
        skusBajoMinimo: reposicion.count ?? 0,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}
