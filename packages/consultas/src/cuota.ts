/**
 * Guardián de cuota — el núcleo del paquete.
 *
 * El plan gratuito de Decolecta son 100 peticiones al mes. Este módulo es lo
 * único que decide si una llamada sale a la red. La atomicidad vive en
 * Postgres (función `consultas_reservar_cuota` con `SELECT ... FOR UPDATE`,
 * ver migracion.sql), no en memoria de proceso: el ERP corre en varias
 * instancias serverless a la vez y un contador en memoria se desincroniza en
 * el primer segundo.
 *
 * Flujo de una reserva:
 *   1. reservarCuota()  → incrementa el contador ANTES de llamar al proveedor
 *      (reserva optimista) o lo rechaza si no hay cupo para la prioridad dada.
 *   2. Si la llamada nunca llega al proveedor (timeout/red) → liberarCuota().
 *   3. Si el proveedor responde 429 (su cuota, no la nuestra, está agotada)
 *      → marcarAgotado(), que sincroniza el contador local a 100%.
 */

import type { ClienteSupabase } from "./cliente";
import type { EstadoCicloCuota, EstadoCuota, Prioridad } from "./tipos";

const RPC_RESERVAR = "consultas_reservar_cuota";
const RPC_LIBERAR = "consultas_liberar_cuota";
const RPC_MARCAR_AGOTADO = "consultas_marcar_agotado";
const TABLA_CUOTA = "consultas_cuota";

export type ConfiguracionCuota = {
  /** Etiqueta del plan (free | pro | custom), solo informativa. */
  plan: string;
  /** DECOLECTA_QUOTA_LIMIT. Cambiar de plan es cambiar este número, sin tocar código. */
  limite: number;
  /** DECOLECTA_QUOTA_RESERVE_PCT — % final del ciclo reservado solo para prioridad 'critical'. */
  reservaPorcentaje: number;
  /** DECOLECTA_QUOTA_CYCLE_DAY — día del mes en que reinicia el ciclo (1 = mes calendario). */
  diaCicloReinicio: number;
};

/** Umbrales de la sección 4.3 de la especificación. */
export function calcularEstado(porcentaje: number): EstadoCicloCuota {
  if (porcentaje >= 100) return "BLOCKED";
  if (porcentaje >= 95) return "CRITICAL";
  if (porcentaje >= 90) return "ALERT";
  if (porcentaje >= 75) return "WARN";
  if (porcentaje >= 50) return "INFO";
  return "OK";
}

/**
 * En modo reserva (CRITICAL) solo pasan las llamadas `critical`. En BLOCKED
 * no pasa ninguna. En el resto de estados pasa cualquier prioridad.
 */
export function pasaPrioridad(estado: EstadoCicloCuota, prioridad: Prioridad): boolean {
  if (estado === "BLOCKED") return false;
  if (estado === "CRITICAL") return prioridad === "critical";
  return true;
}

/** Etiqueta 'YYYY-MM' del ciclo vigente para `fecha`, dado el día de reinicio. */
export function periodoActual(fecha: Date, diaCicloReinicio: number): string {
  let anio = fecha.getUTCFullYear();
  let mes = fecha.getUTCMonth(); // 0-indexado
  if (fecha.getUTCDate() < diaCicloReinicio) {
    // Todavía no llegó el día de reinicio de este mes: seguimos en el ciclo anterior.
    mes -= 1;
    if (mes < 0) {
      mes = 11;
      anio -= 1;
    }
  }
  return `${anio}-${String(mes + 1).padStart(2, "0")}`;
}

/** Fecha ISO en la que reinicia el ciclo que empezó en `periodo`. */
export function finCicloISO(periodo: string, diaCicloReinicio: number): string {
  const [anioTexto, mesTexto] = periodo.split("-");
  const anio = Number(anioTexto);
  const mes = Number(mesTexto); // 1-indexado; usado tal cual como mes 0-indexado del SIGUIENTE mes en Date.UTC
  return new Date(Date.UTC(anio, mes, diaCicloReinicio)).toISOString();
}

/** Fecha ISO en la que empezó el ciclo `periodo`. */
export function inicioCicloISO(periodo: string, diaCicloReinicio: number): string {
  const [anioTexto, mesTexto] = periodo.split("-");
  const anio = Number(anioTexto);
  const mes = Number(mesTexto) - 1; // 0-indexado
  return new Date(Date.UTC(anio, mes, diaCicloReinicio)).toISOString();
}

type FilaRpcCuota = {
  concedido: boolean;
  periodo: string;
  plan: string;
  consumidas: number;
  limite: number;
};

type FilaCuota = {
  periodo: string;
  plan: string;
  consumidas: number;
  limite: number;
};

function construirEstado(
  periodo: string,
  plan: string,
  consumidas: number,
  limite: number,
  diaCicloReinicio: number,
): EstadoCuota {
  const porcentaje = limite > 0 ? (consumidas / limite) * 100 : 100;
  return {
    periodo,
    plan,
    consumidas,
    limite,
    restantes: Math.max(limite - consumidas, 0),
    porcentaje,
    estado: calcularEstado(porcentaje),
    reinicia: finCicloISO(periodo, diaCicloReinicio),
  };
}

export type ReservaCuota =
  | { concedida: true; cuota: EstadoCuota }
  | { concedida: false; cuota: EstadoCuota };

/**
 * Reserva atómicamente una unidad de cuota para `prioridad`, o la rechaza si
 * no hay cupo. Debe llamarse DESPUÉS de comprobar la caché (un acierto de
 * caché nunca debe pasar por aquí) y ANTES de llamar al proveedor.
 */
export async function reservarCuota(
  cliente: ClienteSupabase,
  config: ConfiguracionCuota,
  prioridad: Prioridad,
  ahora: Date = new Date(),
): Promise<ReservaCuota> {
  const periodo = periodoActual(ahora, config.diaCicloReinicio);
  const { data, error } = await cliente.rpc<FilaRpcCuota[]>(RPC_RESERVAR, {
    p_periodo: periodo,
    p_plan: config.plan,
    p_limite: config.limite,
    p_prioridad: prioridad,
    p_reserva_pct: config.reservaPorcentaje,
    p_inicio_ciclo: inicioCicloISO(periodo, config.diaCicloReinicio),
    p_fin_ciclo: finCicloISO(periodo, config.diaCicloReinicio),
  });

  if (error || !data || data.length === 0) {
    throw new Error(`No se pudo consultar el guardián de cuota de Decolecta: ${error?.message ?? "sin datos"}`);
  }

  const fila = data[0] as FilaRpcCuota;
  const cuota = construirEstado(fila.periodo, fila.plan, fila.consumidas, fila.limite, config.diaCicloReinicio);
  return { concedida: fila.concedido, cuota };
}

/** Libera una unidad reservada que no llegó a salir (timeout o error de red antes de enviar). */
export async function liberarCuota(
  cliente: ClienteSupabase,
  config: ConfiguracionCuota,
  ahora: Date = new Date(),
): Promise<void> {
  const periodo = periodoActual(ahora, config.diaCicloReinicio);
  await cliente.rpc(RPC_LIBERAR, { p_periodo: periodo });
}

/**
 * Sincroniza el contador local a "agotado": el proveedor respondió 429.
 * Es una señal de bug (el contador local se desincronizó), no un caso normal:
 * quien integre este paquete debería loguearlo como incidente.
 */
export async function marcarAgotado(
  cliente: ClienteSupabase,
  config: ConfiguracionCuota,
  ahora: Date = new Date(),
): Promise<void> {
  const periodo = periodoActual(ahora, config.diaCicloReinicio);
  await cliente.rpc(RPC_MARCAR_AGOTADO, { p_periodo: periodo });
}

/** Estado del ciclo actual, para el panel de administración (barra de consumo, umbral, fecha de reinicio). */
export async function estadoCuota(
  cliente: ClienteSupabase,
  config: ConfiguracionCuota,
  ahora: Date = new Date(),
): Promise<EstadoCuota> {
  const periodo = periodoActual(ahora, config.diaCicloReinicio);
  const { data } = await cliente
    .from<FilaCuota>(TABLA_CUOTA)
    .select("periodo,plan,consumidas,limite")
    .eq("periodo", periodo)
    .maybeSingle();

  if (!data) {
    // Todavía no se hizo ninguna reserva este ciclo.
    return construirEstado(periodo, config.plan, 0, config.limite, config.diaCicloReinicio);
  }
  return construirEstado(data.periodo, data.plan, data.consumidas, data.limite, config.diaCicloReinicio);
}
