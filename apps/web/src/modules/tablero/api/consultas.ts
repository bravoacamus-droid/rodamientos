import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";
import type { Severidad } from "@/modules/alertas";
import { etiquetaPeriodo, periodoAnterior, type Rango } from "@/modules/reportes";

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

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

// ---------------------------------------------------------------------------
// Tablero por rango (26/08)
// ---------------------------------------------------------------------------

/** Lo que resume un periodo, y el mismo periodo anterior para comparar. */
export interface KpisPeriodo {
  ventaNeta: number;
  costo: number;
  margen: number;
  /** Sobre el COSTO, como todo el sistema desde la 023. */
  margenPct: number;
  documentos: number;
  unidades: number;
  ventaNetaPrevia: number;
  margenPrevio: number;
  /** La serie del periodo, para el gráfico y el sparkline. */
  serie: PuntoSerie[];
}

/** Un punto de la serie del tablero. */
export interface PuntoSerie {
  periodo: string;
  etiqueta: string;
  venta: number;
  costo: number;
  margen: number;
}

/** Suma una serie de `serie_ventas` en un solo indicador. */
function sumar(filas: readonly { venta: number; costo: number; documentos: number; unidades: number }[]) {
  const dos = (n: number) => Math.round(n * 100) / 100;
  const venta = dos(filas.reduce((a, f) => a + f.venta, 0));
  const costo = dos(filas.reduce((a, f) => a + f.costo, 0));
  return {
    venta,
    costo,
    margen: dos(venta - costo),
    documentos: filas.reduce((a, f) => a + f.documentos, 0),
    unidades: dos(filas.reduce((a, f) => a + f.unidades, 0)),
  };
}

async function serieCruda(
  supabase: Awaited<ReturnType<typeof clienteServidor>>,
  desde: string,
  hasta: string,
  grano: string,
) {
  const { data, error } = await supabase.rpc("serie_ventas", {
    p_desde: desde,
    p_hasta: hasta,
    p_grano: grano,
  });
  if (error) throw error;
  return (data ?? []).map((f) => ({
    periodo: String(f.periodo),
    venta: Number(f.venta ?? 0),
    costo: Number(f.costo ?? 0),
    margen: Number(f.margen ?? 0),
    documentos: Number(f.documentos ?? 0),
    unidades: Number(f.unidades ?? 0),
  }));
}

/**
 * Los indicadores de un rango, con el periodo anterior para comparar.
 *
 * Las dos consultas van en paralelo: son independientes y encadenarlas
 * duplicaría la espera para enseñar una flechita.
 */
export async function kpisDeRango(
  rango: Rango,
): Promise<Resultado<KpisPeriodo>> {
  try {
    const supabase = await clienteServidor();
    const previo = periodoAnterior(rango);

    const [ahora, antes] = await Promise.all([
      serieCruda(supabase, rango.desde, rango.hasta, rango.grano),
      serieCruda(supabase, previo.desde, previo.hasta, rango.grano),
    ]);

    const a = sumar(ahora);
    const b = sumar(antes);

    return {
      ok: true,
      datos: {
        ventaNeta: a.venta,
        costo: a.costo,
        margen: a.margen,
        margenPct: a.costo > 0 ? Math.round(((a.venta - a.costo) / a.costo) * 10000) / 100 : 0,
        documentos: a.documentos,
        unidades: a.unidades,
        ventaNetaPrevia: b.venta,
        margenPrevio: b.margen,
        serie: ahora.map((f) => ({
          periodo: f.periodo,
          etiqueta: etiquetaPeriodo(f.periodo, rango.grano),
          venta: f.venta,
          costo: f.costo,
          margen: f.margen,
        })),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}
