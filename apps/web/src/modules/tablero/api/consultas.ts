import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";
import type { Severidad } from "@/modules/alertas";

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

export interface MesVentas {
  mes: string;
  venta_neta: number;
  costo: number;
  margen: number;
  margen_pct: number;
  documentos: number;
}

export interface KpisMes {
  ventaNeta: number;
  margen: number;
  margenPct: number;
  documentos: number;
  /** Mes anterior, para la comparación de las tarjetas. */
  ventaNetaPrevia: number;
  margenPrevio: number;
  /** Serie de los últimos meses, para el sparkline. */
  serie: number[];
}

export interface Cartera {
  porVencer: number;
  vencido1a15: number;
  vencido16a30: number;
  vencido31a60: number;
  vencidoMas60: number;
  total: number;
}

export interface AlertaResumen {
  id: string;
  tipo: string;
  /**
   * Los CINCO niveles del enum, no cuatro. Antes faltaba `info`, y como la
   * consulta se afirma con `as`, una alerta informativa entraba con un tipo
   * que decía que era imposible.
   */
  severidad: Severidad;
  titulo: string;
  mensaje: string;
  entidad_nombre: string | null;
  valor: number | null;
  accion_url: string | null;
  /** null = todavía no se avisó a nadie. */
  notificado_en: string | null;
  generada_en: string;
}

/**
 * Ventas de los últimos 12 meses.
 *
 * Sale de `v_ventas_mensuales`, que ya agrega sobre comprobantes no anulados.
 * Se piden los 13 últimos: 12 para el gráfico más el previo, que hace falta
 * para comparar el mes en curso contra el anterior.
 */
export async function ventasMensuales(): Promise<Resultado<MesVentas[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_ventas_mensuales")
      .select("mes, venta_neta, costo, margen, margen_pct, documentos")
      .order("mes", { ascending: false })
      .limit(13);

    if (error) return fallo(error);

    const filas = (data ?? []).map((f) => ({
      mes: String(f.mes),
      venta_neta: Number(f.venta_neta ?? 0),
      costo: Number(f.costo ?? 0),
      margen: Number(f.margen ?? 0),
      margen_pct: Number(f.margen_pct ?? 0),
      documentos: Number(f.documentos ?? 0),
    }));

    // La vista viene descendente porque el límite tiene que quedarse con los
    // meses recientes; el gráfico los quiere en orden cronológico.
    return { ok: true, datos: filas.reverse() };
  } catch (e) {
    return fallo(e);
  }
}

/** Indicadores del mes en curso, derivados de la serie mensual. */
export function kpisDesdeSerie(meses: MesVentas[]): KpisMes {
  const actual = meses[meses.length - 1];
  const previo = meses[meses.length - 2];

  return {
    ventaNeta: actual?.venta_neta ?? 0,
    margen: actual?.margen ?? 0,
    margenPct: actual?.margen_pct ?? 0,
    documentos: actual?.documentos ?? 0,
    ventaNetaPrevia: previo?.venta_neta ?? 0,
    margenPrevio: previo?.margen ?? 0,
    serie: meses.slice(-12).map((m) => m.venta_neta),
  };
}

/**
 * Aging de cartera en los tramos que pidió el cliente: 1-15, 16-30, 31-60 y
 * más de 60. Se trae el saldo con su vencimiento y se reparte aquí, en vez de
 * lanzar cinco consultas con rangos distintos.
 */
export async function cartera(): Promise<Resultado<Cartera>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_cartera")
      .select("saldo, fecha_vencimiento")
      .gt("saldo", 0);

    if (error) return fallo(error);

    const hoy = new Date();
    const resumen: Cartera = {
      porVencer: 0,
      vencido1a15: 0,
      vencido16a30: 0,
      vencido31a60: 0,
      vencidoMas60: 0,
      total: 0,
    };

    for (const fila of data ?? []) {
      const saldo = Number(fila.saldo ?? 0);
      const vence = new Date(String(fila.fecha_vencimiento));
      const dias = Math.floor(
        (hoy.getTime() - vence.getTime()) / 86_400_000,
      );

      if (dias <= 0) resumen.porVencer += saldo;
      else if (dias <= 15) resumen.vencido1a15 += saldo;
      else if (dias <= 30) resumen.vencido16a30 += saldo;
      else if (dias <= 60) resumen.vencido31a60 += saldo;
      else resumen.vencidoMas60 += saldo;

      resumen.total += saldo;
    }

    return { ok: true, datos: resumen };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Alertas prioritarias.
 *
 * Ordena por severidad y luego por antigüedad. Las archivadas no aparecen; las
 * leídas sí, porque una alerta de crédito vencido sigue vigente aunque alguien
 * ya la haya visto.
 */
export async function alertasPrioritarias(
  limite = 8,
): Promise<Resultado<AlertaResumen[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("alertas")
      .select(
        "id, tipo, severidad, titulo, mensaje, entidad_nombre, valor, accion_url, notificado_en, generada_en",
      )
      .eq("archivada", false)
      // `ascending: false` NO es un detalle de gusto.
      //
      // `severidad_alerta` se declaró como ('info','baja','media','alta',
      // 'critica') y un enum de Postgres ordena por su orden de DECLARACIÓN.
      // Con el orden por defecto, este panel se llamaba «alertas prioritarias»
      // y enseñaba las seis MENOS importantes: un quiebre de stock quedaba
      // fuera del recorte mientras dentro había cotizaciones por vencer.
      .order("severidad", { ascending: false })
      .order("generada_en", { ascending: false })
      .limit(limite);

    if (error) return fallo(error);
    return { ok: true, datos: (data ?? []) as unknown as AlertaResumen[] };
  } catch (e) {
    return fallo(e);
  }
}

/** Cuántas alertas siguen sin notificar. El cliente pidió que las alertas
 *  lleguen, no que haya que entrar a buscarlas. */
export async function alertasSinNotificar(): Promise<Resultado<number>> {
  try {
    const supabase = await clienteServidor();
    const { count, error } = await supabase
      .from("alertas")
      .select("id", { count: "exact", head: true })
      .eq("archivada", false)
      .is("notificado_en", null);

    if (error) return fallo(error);
    return { ok: true, datos: count ?? 0 };
  } catch (e) {
    return fallo(e);
  }
}
