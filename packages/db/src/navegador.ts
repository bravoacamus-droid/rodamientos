"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requerirEnv } from "@rodatech/config";

import type { Database } from "./tipos";

let instancia: ReturnType<typeof crear> | undefined;

function crear() {
  return createBrowserClient<Database>(
    requerirEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requerirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}

/**
 * Cliente de Supabase para el navegador. Singleton: una sola conexión por
 * pestaña, si no cada componente abriría su propio canal de realtime.
 *
 * Uso previsto: LECTURA reactiva y suscripciones en tiempo real.
 *
 * Las escrituras NO van por aquí — van por Server Actions. Esa fue la falla
 * de arquitectura de la demo: todas las mutaciones salían del navegador, una
 * llamada por línea de documento, y eso convertía cada emisión en decenas de
 * viajes de ida y vuelta. Ver docs/PLAN-V2.md §1.
 */
export function clienteNavegador() {
  instancia ??= crear();
  return instancia;
}
