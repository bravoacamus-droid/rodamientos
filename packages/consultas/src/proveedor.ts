/**
 * Orquestador común a RUC, DNI y tipo de cambio.
 *
 * Orden obligatorio (especificación, sección 8): validar → caché → cuota →
 * red → normalizar → escribir caché. Este archivo implementa desde "caché" en
 * adelante; la validación local vive en cada módulo (`ruc.ts`, `dni.ts`,
 * `tipo-cambio.ts`) porque las reglas son distintas para cada documento y no
 * deben ni tocar la caché ni el guardián de cuota.
 */

import { createHash } from "node:crypto";
import type { ClienteSupabase } from "./cliente";
import { type ConfiguracionCuota, liberarCuota, marcarAgotado, periodoActual, reservarCuota } from "./cuota";
import { escribirCache, leerCache, unaSolaVez } from "./cache";
import { type PeticionFetch, unaLlamadaHttp } from "./http";
import type { CodigoError } from "./errores";
import type { EstadoCuota, Origen, Prioridad, Resultado } from "./tipos";

export type ContextoConsultas = {
  /** Cliente de Supabase ya construido. Este paquete nunca lo crea. */
  cliente: ClienteSupabase;
  /** DECOLECTA_TOKEN. Si es `undefined`, el paquete degrada a "escribe a mano" sin lanzar. */
  token: string | undefined;
  cuota: ConfiguracionCuota;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: PeticionFetch;
  /** Inyectable para tests deterministas; por defecto `() => new Date()`. */
  ahora?: () => Date;
  /** Base del backoff exponencial en reintentos, en ms (por defecto 2000: 2s, 4s). Se baja en tests. */
  backoffBaseMs?: number;
};

export type DefinicionConsulta = {
  /** Namespace de caché: 'ruc' | 'dni' | 'tipo_cambio'. */
  espacio: string;
  /** Clave normalizada dentro del espacio (documento, o fecha/mes normalizados). */
  clave: string;
  /** Ruta del endpoint de Decolecta, ej. '/v1/sunat/ruc'. */
  ruta: string;
  parametros: Record<string, string | undefined>;
  /** TTL de la caché positiva; `null` = permanente. */
  ttlCacheMs: number | null;
  /** TTL de la caché negativa (400/404/422). */
  ttlNegativoMs: number;
  /** Nombre del endpoint para el log de observabilidad. */
  endpointLog: string;
};

export type OpcionesConsulta = {
  prioridad?: Prioridad;
  /** Solo para administradores: se salta la caché. Siempre queda auditado en consultas_log. */
  forzarActualizacion?: boolean;
};

/** 1 intento + 2 reintentos, solo para 5xx/red — igual que la especificación (sección 5). */
const MAX_INTENTOS = 3;

export async function ejecutarConsulta<T>(
  contexto: ContextoConsultas,
  def: DefinicionConsulta,
  opciones: OpcionesConsulta = {},
): Promise<Resultado<T>> {
  const prioridad = opciones.prioridad ?? "normal";
  const ahora = contexto.ahora ?? (() => new Date());
  const periodo = periodoActual(ahora(), contexto.cuota.diaCicloReinicio);
  const paramHash = hashParametro(def.espacio, def.clave);

  if (!opciones.forzarActualizacion) {
    const cache = await leerCache<T>(contexto.cliente, def.espacio, def.clave);
    if (cache.estado === "vigente") {
      await registrarLog(contexto.cliente, def.endpointLog, prioridad, periodo, paramHash, null, true, 0);
      if (cache.ok) {
        return construir<T>(true, "cache", cache.datos, null, null, null, cache.obtenidoEn);
      }
      return construir<T>(
        false,
        "cache",
        null,
        null,
        "No se encontró ese documento (recordado en caché).",
        "DOCUMENTO_INVALIDO",
        cache.obtenidoEn,
      );
    }
  }

  return unaSolaVez(`${def.espacio}:${def.clave}`, () =>
    resolverSinCache(contexto, def, prioridad, ahora, paramHash),
  );
}

async function resolverSinCache<T>(
  contexto: ContextoConsultas,
  def: DefinicionConsulta,
  prioridad: Prioridad,
  ahora: () => Date,
  paramHash: string,
): Promise<Resultado<T>> {
  const token = contexto.token;
  if (!token) {
    return construir<T>(
      false,
      "sin_configurar",
      null,
      null,
      "No hay token de Decolecta configurado (DECOLECTA_TOKEN). Escribe los datos a mano.",
      "SIN_CONFIGURAR",
      null,
    );
  }

  let ultimoMensaje: string | null = null;
  let ultimoCodigo: CodigoError | null = null;
  let ultimaCuota: EstadoCuota | null = null;
  const backoffBase = contexto.backoffBaseMs ?? 2000;

  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const reserva = await reservarCuota(contexto.cliente, contexto.cuota, prioridad, ahora());
    ultimaCuota = reserva.cuota;

    if (!reserva.concedida) {
      return degradarPorCuota(contexto, def, reserva.cuota);
    }

    const inicio = Date.now();
    const respuesta = await unaLlamadaHttp<T>(def.ruta, def.parametros, {
      token,
      baseUrl: contexto.baseUrl,
      timeoutMs: contexto.timeoutMs,
      fetch: contexto.fetch,
    });
    const ms = Date.now() - inicio;

    if (respuesta.ok) {
      await registrarLog(contexto.cliente, def.endpointLog, prioridad, reserva.cuota.periodo, paramHash, 200, false, ms);
      await escribirCache(contexto.cliente, def.espacio, def.clave, true, respuesta.datos, def.ttlCacheMs);
      return construir<T>(true, "api", respuesta.datos, reserva.cuota, null, null, new Date().toISOString());
    }

    const error = respuesta.error;
    ultimoMensaje = error.mensaje;
    ultimoCodigo = error.codigo;
    await registrarLog(
      contexto.cliente,
      def.endpointLog,
      prioridad,
      reserva.cuota.periodo,
      paramHash,
      error.httpStatus,
      false,
      ms,
    );

    if (error.codigo === "TIMEOUT" || error.codigo === "RED") {
      // No llegó al proveedor: se libera la reserva. Si quedan intentos, se reintenta.
      await liberarCuota(contexto.cliente, contexto.cuota, ahora());
      if (intento < MAX_INTENTOS - 1) {
        await esperar(backoffMs(intento, backoffBase));
        continue;
      }
      break;
    }

    if (error.codigo === "CUOTA_PROVEEDOR_AGOTADA") {
      // 429: el proveedor dice que no hay cupo. Señal de desincronización:
      // se sincroniza el contador local a agotado y no se reintenta.
      await marcarAgotado(contexto.cliente, contexto.cuota, ahora());
      break;
    }

    if (error.cacheable) {
      await escribirCache(contexto.cliente, def.espacio, def.clave, false, null, def.ttlNegativoMs);
    }

    if (error.reintentable && intento < MAX_INTENTOS - 1) {
      await esperar(backoffMs(intento, backoffBase));
      continue;
    }
    break;
  }

  if (ultimoCodigo) {
    return construir<T>(false, "api", null, ultimaCuota, ultimoMensaje, ultimoCodigo, null);
  }
  return construir<T>(
    false,
    "proveedor_caido",
    null,
    ultimaCuota,
    "No se pudo completar la consulta. Escribe los datos a mano.",
    "RED",
    null,
  );
}

/**
 * Degradación elegante cuando no hay cupo (sección 4.5 y 4.6): primero se
 * intenta la caché rancia —una entrada vencida sigue siendo mejor que una
 * pantalla vacía—; si no existe, se devuelve un resultado explícito que le
 * dice a la interfaz que habilite el llenado manual. Nunca se lanza una
 * excepción.
 */
async function degradarPorCuota<T>(
  contexto: ContextoConsultas,
  def: DefinicionConsulta,
  cuota: EstadoCuota,
): Promise<Resultado<T>> {
  const rancio = await leerCache<T>(contexto.cliente, def.espacio, def.clave);
  if (rancio.estado === "rancio" && rancio.ok) {
    return construir<T>(
      true,
      "stale_cache",
      rancio.datos,
      cuota,
      "Cuota agotada: se muestra el último dato guardado, puede estar desactualizado.",
      null,
      rancio.obtenidoEn,
    );
  }
  const mensaje =
    cuota.estado === "BLOCKED"
      ? "Se alcanzó el límite mensual de consultas a Decolecta. Ingresa los datos manualmente."
      : "Quedan pocas consultas este mes; se reservan para operaciones críticas. Ingresa los datos manualmente.";
  return construir<T>(false, "quota_blocked", null, cuota, mensaje, "CUOTA_LOCAL_AGOTADA", null);
}

function construir<T>(
  ok: boolean,
  origen: Origen,
  datos: T | null,
  cuota: EstadoCuota | null,
  mensaje: string | null,
  errorCodigo: CodigoError | null,
  obtenidoEn: string | null,
): Resultado<T> {
  return { ok, origen, datos, cuota, mensaje, errorCodigo, obtenidoEn };
}

function backoffMs(intento: number, base: number): number {
  return base * Math.pow(2, intento);
}

function esperar(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolver) => setTimeout(resolver, ms));
}

/**
 * Hash corto y no reversible de la clave consultada, para el log. Nunca se
 * guarda el documento en claro en `consultas_log`: el RUC no es sensible,
 * pero el DNI sí (Ley 29733) y conviene tratarlos igual para no bifurcar el
 * código de logging.
 */
function hashParametro(espacio: string, clave: string): string {
  return createHash("sha256").update(`${espacio}:${clave}`).digest("hex").slice(0, 16);
}

async function registrarLog(
  cliente: ClienteSupabase,
  endpoint: string,
  prioridad: Prioridad,
  periodo: string,
  paramHash: string,
  statusCode: number | null,
  desdeCache: boolean,
  ms: number,
): Promise<void> {
  try {
    await cliente.from("consultas_log").insert({
      periodo,
      endpoint,
      prioridad,
      param_hash: paramHash,
      status_code: statusCode,
      desde_cache: desdeCache,
      ms,
    });
  } catch {
    // El log es observabilidad: nunca debe romper una consulta real.
  }
}
