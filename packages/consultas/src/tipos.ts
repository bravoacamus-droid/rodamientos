import type { CodigoError } from "./errores";

/**
 * Tipos públicos compartidos por todo el paquete.
 */

/**
 * Prioridad declarada por quien llama. En modo reserva de cuota (≥95%) solo
 * pasan las `critical`. Regla práctica de la especificación: si el usuario
 * puede esperar o escribir el dato a mano, es `normal` o `low`; nunca
 * `critical`.
 */
export type Prioridad = "critical" | "normal" | "low";

/** De dónde salió el dato devuelto. */
export type Origen =
  | "api" // vino de Decolecta en esta misma llamada
  | "cache" // caché vigente
  | "stale_cache" // caché vencida, usada como último recurso sin cupo
  | "quota_blocked" // no había cupo y tampoco caché rancia
  | "sin_configurar" // falta DECOLECTA_TOKEN
  | "proveedor_caido" // agotó reintentos por red/timeout
  | "invalido"; // no pasó la validación local, nunca salió a la red

export type EstadoCicloCuota = "OK" | "INFO" | "WARN" | "ALERT" | "CRITICAL" | "BLOCKED";

export type EstadoCuota = {
  /** Ciclo actual, 'YYYY-MM' del inicio de ciclo (no necesariamente el mes calendario). */
  periodo: string;
  plan: string;
  consumidas: number;
  limite: number;
  restantes: number;
  /** 0-100 (puede superar 100 si el proveedor cobró de más; se deja sin recortar). */
  porcentaje: number;
  estado: EstadoCicloCuota;
  /** ISO de la fecha en que reinicia el ciclo. */
  reinicia: string;
};

/** Forma uniforme de respuesta de toda función pública del paquete. */
export type Resultado<T> = {
  ok: boolean;
  origen: Origen;
  datos: T | null;
  /** Estado de cuota tras la operación; null si ni siquiera se llegó a consultar (p.ej. validación local). */
  cuota: EstadoCuota | null;
  /** Mensaje en español listo para mostrar al usuario. */
  mensaje: string | null;
  errorCodigo: CodigoError | null;
  /** Fecha ISO en que se obtuvo el dato mostrado (útil para "dato del 12/06/2025" en stale_cache). */
  obtenidoEn: string | null;
};
