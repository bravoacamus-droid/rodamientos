import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import { familiaDe, ordenarBandeja } from "../dominio/alerta";
import {
  TIPOS_QUE_SE_GENERAN,
  type Alerta,
  type Familia,
  type FiltrosBandeja,
  type ResumenBandeja,
  type Severidad,
  type TipoAlerta,
} from "../dominio/tipos";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

const SEVERIDADES: readonly Severidad[] = ["info", "baja", "media", "alta", "critica"];
const FAMILIAS: readonly Familia[] = ["almacen", "dinero", "documentos"];

const CAMPOS = `id, tipo, severidad, titulo, mensaje, entidad_tipo, entidad_id,
  entidad_nombre, valor, accion_url, leida, archivada, notificado_en, generada_en`;

/** Fila cruda → `Alerta`. PostgREST devuelve `unknown` en todo lo anulable. */
function aAlerta(d: Record<string, unknown>): Alerta {
  return {
    id: String(d.id),
    tipo: String(d.tipo) as TipoAlerta,
    severidad: String(d.severidad) as Severidad,
    titulo: String(d.titulo),
    mensaje: String(d.mensaje),
    entidad_tipo: (d.entidad_tipo as string | null) ?? null,
    entidad_id: (d.entidad_id as string | null) ?? null,
    entidad_nombre: (d.entidad_nombre as string | null) ?? null,
    valor: d.valor === null || d.valor === undefined ? null : Number(d.valor),
    accion_url: (d.accion_url as string | null) ?? null,
    leida: Boolean(d.leida),
    archivada: Boolean(d.archivada),
    notificado_en: (d.notificado_en as string | null) ?? null,
    generada_en: String(d.generada_en),
  };
}

/**
 * La bandeja.
 *
 * Sin paginar, y a propósito: `generar_alertas()` es idempotente por `huella`
 * con ventana semanal o mensual según el tipo, así que la bandeja viva son
 * decenas de filas, no miles. El día que el catálogo real de 2.000 SKU meta
 * cientos de quiebres a la vez, el tope de 500 avisa —se ve que la lista se
 * corta— antes que un `range()` que esconde el problema.
 *
 * El orden final lo pone `ordenarBandeja` en memoria y no un `order()` de
 * PostgREST porque «lo grave primero» necesita el peso de la severidad, y el
 * enum de Postgres ordena por su orden de declaración: info < baja < media <
 * alta < critica, o sea justo al revés de lo que se quiere leer.
 */
export async function bandeja(
  filtros: FiltrosBandeja,
): Promise<Resultado<Alerta[]>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("alertas")
      .select(CAMPOS)
      .eq("archivada", filtros.ver === "archivadas")
      .order("generada_en", { ascending: false })
      .limit(500);

    const severidad = SEVERIDADES.find((s) => s === filtros.severidad);
    if (severidad) consulta = consulta.eq("severidad", severidad);

    const tipo = TIPOS_QUE_SE_GENERAN.find((t) => t === filtros.tipo);
    if (tipo) consulta = consulta.eq("tipo", tipo);

    // La familia no es una columna: se deduce del tipo. Se traduce a la lista
    // de tipos que le corresponden para que el filtro siga ocurriendo en la
    // base y no traiga 500 filas para descartar 400.
    const familia = FAMILIAS.find((f) => f === filtros.familia);
    if (familia) {
      consulta = consulta.in(
        "tipo",
        TIPOS_QUE_SE_GENERAN.filter((t) => familiaDe(t) === familia),
      );
    }

    if (filtros.q) {
      consulta = consulta.or(
        `titulo.ilike.%${filtros.q}%,mensaje.ilike.%${filtros.q}%,entidad_nombre.ilike.%${filtros.q}%`,
      );
    }

    const { data, error } = await consulta;
    if (error) return fallo(error);

    return {
      ok: true,
      datos: ordenarBandeja((data ?? []).map((d) => aAlerta(d as Record<string, unknown>))),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * El resumen de la bandeja VIVA, sin filtrar.
 *
 * Va sin filtros a propósito: las tarjetas de arriba tienen que seguir diciendo
 * «3 críticas» aunque estés mirando solo almacén. Un contador que se mueve con
 * el filtro no sirve para decidir si hay que dejar lo que estás haciendo.
 */
export async function resumenBandeja(): Promise<Resultado<ResumenBandeja>> {
  try {
    const supabase = await clienteServidor();

    // Se cuenta en Postgres (vista `v_resumen_alertas`, migración 048).
    //
    // Antes se traían las 2.000 primeras alertas sin archivar y se sumaban
    // aquí. Mientras hubiera menos de 2.000 acertaba; a partir de ahí seguía
    // dando un número, solo que otro — y con el cron diario de la 032
    // generando alertas eso era cuestión de meses. Ver PENDIENTES §0.3.
    const { data, error } = await supabase
      .from("v_resumen_alertas")
      .select("total, sin_leer, criticas, altas, medias, bajas, infos, ultima")
      .maybeSingle();

    if (error) return fallo(error);

    const n = (v: unknown): number => {
      const x = Number(v ?? 0);
      return Number.isFinite(x) ? x : 0;
    };

    return {
      ok: true,
      datos: {
        total: n(data?.total),
        sinLeer: n(data?.sin_leer),
        criticas: n(data?.criticas),
        porSeveridad: {
          critica: n(data?.criticas),
          alta: n(data?.altas),
          media: n(data?.medias),
          baja: n(data?.bajas),
          info: n(data?.infos),
        },
        ultima: data?.ultima ? String(data.ultima) : null,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}
