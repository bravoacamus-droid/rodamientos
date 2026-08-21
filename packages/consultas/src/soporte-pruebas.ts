/**
 * Doble de prueba del cliente de Supabase, usado SOLO por los archivos
 * `*.test.ts` de este paquete.
 *
 * No es un mock superficial: replica en memoria el mismo comportamiento que
 * las tablas y la función `consultas_reservar_cuota` de `migracion.sql`
 * (incluida la reserva atómica), para poder probar el guardián de cuota y la
 * caché de verdad, sin red ni Postgres.
 */

import type { ClienteSupabase, ConstructorSelect, ConstructorTabla, RespuestaSupabase } from "./cliente";
import type { ConfiguracionCuota } from "./cuota";
import type { ContextoConsultas } from "./proveedor";

type Fila = Record<string, unknown>;

function construirSelect<T>(filas: Fila[]): ConstructorSelect<T> {
  let candidatas = filas;
  const builder: ConstructorSelect<T> = {
    eq(columna: string, valor: string) {
      candidatas = candidatas.filter((f) => f[columna] === valor);
      return builder;
    },
    async maybeSingle() {
      const fila = candidatas[0];
      return { data: (fila as unknown as T | undefined) ?? null, error: null };
    },
  };
  return builder;
}

export class ClienteSupabaseFalso implements ClienteSupabase {
  private cache = new Map<string, Fila>();
  private cuota = new Map<string, Fila>();
  public logs: Fila[] = [];
  public llamadasRpc: Array<{ nombre: string; parametros: Record<string, unknown> | undefined }> = [];
  public llamadasFrom: string[] = [];

  from<T = Fila>(tabla: string): ConstructorTabla<T> {
    this.llamadasFrom.push(tabla);

    if (tabla === "consultas_cache") {
      return {
        select: () => construirSelect<T>(Array.from(this.cache.values())),
        upsert: async (fila) => {
          const clave = `${String(fila.espacio)}:${String(fila.clave)}`;
          this.cache.set(clave, fila);
          return { data: null, error: null };
        },
        insert: async () => ({ data: null, error: null }),
      };
    }

    if (tabla === "consultas_cuota") {
      return {
        select: () => construirSelect<T>(Array.from(this.cuota.values())),
        upsert: async (fila) => {
          this.cuota.set(String(fila.periodo), fila);
          return { data: null, error: null };
        },
        insert: async () => ({ data: null, error: null }),
      };
    }

    if (tabla === "consultas_log") {
      return {
        select: () => construirSelect<T>([]),
        upsert: async () => ({ data: null, error: null }),
        insert: async (fila) => {
          this.logs.push(fila);
          return { data: null, error: null };
        },
      };
    }

    throw new Error(`Tabla no soportada en el doble de prueba: ${tabla}`);
  }

  async rpc<T = Fila>(nombre: string, parametros?: Record<string, unknown>): Promise<RespuestaSupabase<T>> {
    this.llamadasRpc.push({ nombre, parametros });
    if (nombre === "consultas_reservar_cuota") {
      return this.reservar(parametros) as unknown as RespuestaSupabase<T>;
    }
    if (nombre === "consultas_liberar_cuota") {
      this.liberar(parametros);
      return { data: null, error: null };
    }
    if (nombre === "consultas_marcar_agotado") {
      this.marcarAgotado(parametros);
      return { data: null, error: null };
    }
    throw new Error(`RPC no soportada en el doble de prueba: ${nombre}`);
  }

  /** Para inspeccionar el estado de una cuota directamente en los tests. */
  filaCuota(periodo: string): Fila | undefined {
    return this.cuota.get(periodo);
  }

  private reservar(p?: Record<string, unknown>): RespuestaSupabase<Fila[]> {
    const periodo = String(p?.p_periodo);
    const plan = String(p?.p_plan);
    const limite = Number(p?.p_limite);
    const prioridad = String(p?.p_prioridad);
    const reservaPct = Number(p?.p_reserva_pct);

    let fila = this.cuota.get(periodo);
    if (!fila) {
      fila = { periodo, plan, limite, consumidas: 0, agotado_forzado: false, ultimo_umbral_notificado: 0 };
      this.cuota.set(periodo, fila);
    }

    const consumidas = Number(fila.consumidas);
    const agotado = Boolean(fila.agotado_forzado);
    const pct = (consumidas / Math.max(limite, 1)) * 100;
    const reservaDesde = 100 - reservaPct;

    if (agotado || consumidas >= limite) {
      return { data: [{ concedido: false, periodo, plan, consumidas, limite }], error: null };
    }
    if (pct >= reservaDesde && prioridad !== "critical") {
      return { data: [{ concedido: false, periodo, plan, consumidas, limite }], error: null };
    }

    fila.consumidas = consumidas + 1;
    this.cuota.set(periodo, fila);
    return { data: [{ concedido: true, periodo, plan, consumidas: fila.consumidas, limite }], error: null };
  }

  private liberar(p?: Record<string, unknown>): void {
    const periodo = String(p?.p_periodo);
    const fila = this.cuota.get(periodo);
    if (fila) fila.consumidas = Math.max(Number(fila.consumidas) - 1, 0);
  }

  private marcarAgotado(p?: Record<string, unknown>): void {
    const periodo = String(p?.p_periodo);
    const fila = this.cuota.get(periodo);
    if (fila) {
      fila.consumidas = Number(fila.limite);
      fila.agotado_forzado = true;
    }
  }
}

export const CONFIGURACION_CUOTA_PRUEBA: ConfiguracionCuota = {
  plan: "free",
  limite: 100,
  reservaPorcentaje: 5,
  diaCicloReinicio: 1,
};

/**
 * Construye un `ContextoConsultas` para tests: sin red real (el `fetch` se
 * inyecta) y con backoff a 0 para que los reintentos no esperen segundos de
 * verdad.
 */
export function crearContextoPrueba(overrides: Partial<ContextoConsultas> = {}): ContextoConsultas {
  // `token` es `string | undefined` en el propio tipo: hay que distinguir
  // "no me pasaron nada" de "me pasaron undefined a propósito" (el caso del
  // test "sin token configurado"), por eso se usa `in` y no `??`.
  const token = "token" in overrides ? overrides.token : "token-de-prueba";
  return {
    cliente: overrides.cliente ?? new ClienteSupabaseFalso(),
    token,
    cuota: overrides.cuota ?? CONFIGURACION_CUOTA_PRUEBA,
    backoffBaseMs: overrides.backoffBaseMs ?? 0,
    ahora: overrides.ahora,
    fetch: overrides.fetch,
    baseUrl: overrides.baseUrl,
    timeoutMs: overrides.timeoutMs,
  };
}

/** Fabrica un `Response` falso, como los que devolvería `fetch`. */
export function respuestaFalsa(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
