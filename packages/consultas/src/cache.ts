/**
 * Caché con TTL en Postgres — la segunda mitad del control de gasto.
 *
 * Se consulta ANTES del guardián de cuota: un acierto de caché no debe
 * incrementar el contador. Invertir este orden es el error clásico de la
 * especificación (sección 8): descuenta cupo por respuestas que salieron de
 * memoria.
 */

import type { ClienteSupabase } from "./cliente";

const TABLA_CACHE = "consultas_cache";

/** TTL en milisegundos. `null` = permanente (dato histórico que no cambia). */
export const TTL = {
  RUC_MS: 30 * 24 * 60 * 60 * 1000,
  DNI_MS: 90 * 24 * 60 * 60 * 1000,
  NEGATIVO_MS: 24 * 60 * 60 * 1000,
} as const;

type FilaCache = {
  ok: boolean;
  payload: unknown;
  creado_en: string;
  expira_en: string | null;
};

export type ResultadoCache<T> =
  | { estado: "vacio" }
  | { estado: "vigente"; ok: true; datos: T; obtenidoEn: string }
  | { estado: "vigente"; ok: false; obtenidoEn: string }
  | { estado: "rancio"; ok: true; datos: T; obtenidoEn: string };

/**
 * Lee la caché. Si la entrada es negativa (documento inexistente) y sigue
 * vigente, se informa como tal sin gastar cuota. Si la entrada positiva ya
 * venció, se devuelve como "rancio" —solo se usa como último recurso cuando
 * no hay cupo (ver `proveedor.ts`, sección 4.6 de la especificación—.
 */
export async function leerCache<T>(
  cliente: ClienteSupabase,
  espacio: string,
  clave: string,
): Promise<ResultadoCache<T>> {
  const { data } = await cliente
    .from<FilaCache>(TABLA_CACHE)
    .select("ok,payload,creado_en,expira_en")
    .eq("espacio", espacio)
    .eq("clave", clave)
    .maybeSingle();

  if (!data) return { estado: "vacio" };

  const vigente = data.expira_en === null || new Date(data.expira_en).getTime() > Date.now();

  if (!data.ok) {
    // Caché negativa: solo tiene sentido mientras esté vigente. Si venció, se
    // trata como si no existiera, para permitir un nuevo intento.
    return vigente ? { estado: "vigente", ok: false, obtenidoEn: data.creado_en } : { estado: "vacio" };
  }

  return {
    estado: vigente ? "vigente" : "rancio",
    ok: true,
    datos: data.payload as T,
    obtenidoEn: data.creado_en,
  };
}

/** Escribe (o reemplaza) la entrada de caché. `ttlMs = null` la hace permanente. */
export async function escribirCache<T>(
  cliente: ClienteSupabase,
  espacio: string,
  clave: string,
  ok: boolean,
  payload: T | null,
  ttlMs: number | null,
): Promise<void> {
  const expira_en = ttlMs === null ? null : new Date(Date.now() + ttlMs).toISOString();
  await cliente.from(TABLA_CACHE).upsert(
    { espacio, clave, ok, payload, creado_en: new Date().toISOString(), expira_en },
    { onConflict: "espacio,clave" },
  );
}

const vuelosEnCurso = new Map<string, Promise<unknown>>();

/**
 * Deduplicación "single-flight": si dos consultas simultáneas piden la misma
 * clave, solo una ejecuta `tarea`; el resto espera y recibe el mismo
 * resultado. Es deduplicación por instancia de proceso —no sustituye al
 * guardián de cuota, que sí es atómico entre instancias vía Postgres—; evita
 * que una ráfaga de clics duplicados en la misma instancia dispare dos
 * llamadas al proveedor por el mismo documento.
 */
export function unaSolaVez<T>(clave: string, tarea: () => Promise<T>): Promise<T> {
  const enCurso = vuelosEnCurso.get(clave);
  if (enCurso) return enCurso as Promise<T>;
  const promesa = tarea().finally(() => {
    vuelosEnCurso.delete(clave);
  });
  vuelosEnCurso.set(clave, promesa);
  return promesa;
}
