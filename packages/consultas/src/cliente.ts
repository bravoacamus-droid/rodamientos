/**
 * Contrato mínimo del cliente de Supabase que este paquete necesita.
 *
 * Se define aquí —en vez de importar el tipo `SupabaseClient` real de
 * `@supabase/supabase-js`— para no acoplar el paquete a una versión concreta
 * del SDK ni a `@rodatech/db`. Cualquier objeto que cumpla esta forma sirve:
 * el cliente real de Supabase la cumple de sobra (tiene muchos más métodos),
 * y en los tests se usa un doble en memoria sin red ni base de datos.
 *
 * El paquete NUNCA crea este cliente: siempre se recibe por inyección de
 * dependencia en `ContextoConsultas.cliente`.
 */

export type FilaSupabase = Record<string, unknown>;

export type RespuestaSupabase<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

export interface ConstructorSelect<T> {
  eq(columna: string, valor: string): ConstructorSelect<T>;
  maybeSingle(): PromiseLike<RespuestaSupabase<T>>;
}

export interface ConstructorTabla<T> {
  select(columnas: string): ConstructorSelect<T>;
  upsert(fila: FilaSupabase, opciones?: { onConflict?: string }): PromiseLike<RespuestaSupabase<null>>;
  insert(fila: FilaSupabase): PromiseLike<RespuestaSupabase<null>>;
}

export interface ClienteSupabase {
  from<T = FilaSupabase>(tabla: string): ConstructorTabla<T>;
  /** Usado por el guardián de cuota para la reserva atómica (ver migracion.sql). */
  rpc<T = FilaSupabase>(nombre: string, parametros?: Record<string, unknown>): PromiseLike<RespuestaSupabase<T>>;
}
