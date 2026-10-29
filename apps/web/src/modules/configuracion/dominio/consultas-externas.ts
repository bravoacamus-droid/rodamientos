/**
 * Cuánto se gasta de las consultas a Decolecta (RUC, DNI y tipo de cambio).
 *
 * Luis, 29/10: «en SUNAT configuración también podemos poner un contador para
 * que vaya contando las peticiones». El contador existía desde la 003
 * (`consultas_cuota`) y la bitácora también (`consultas_log`); ninguna
 * pantalla las leía.
 *
 * Lógica pura: recibe las filas de la bitácora de un ciclo y las cuenta.
 */

export type TipoConsulta = "ruc" | "dni" | "tipo_cambio";

export interface FilaBitacoraConsulta {
  endpoint: string;
  desde_cache: boolean;
  status_code: number | null;
}

export interface ConteoConsulta {
  tipo: TipoConsulta;
  /** Salieron a Decolecta: gastaron una consulta. */
  pedidas: number;
  /** Se respondieron con lo guardado: no gastaron nada. */
  deMemoria: number;
}

const TIPO_POR_ENDPOINT: Record<string, TipoConsulta> = {
  "sunat/ruc": "ruc",
  "reniec/dni": "dni",
  "tipo-cambio/sunat": "tipo_cambio",
};

export const NOMBRE_CONSULTA: Record<TipoConsulta, string> = {
  ruc: "RUC (empresas)",
  dni: "DNI (personas)",
  tipo_cambio: "Tipo de cambio",
};

/** Una fila por tipo, siempre las tres y en el mismo orden. */
export function contarConsultas(filas: readonly FilaBitacoraConsulta[]): ConteoConsulta[] {
  const conteo: Record<TipoConsulta, ConteoConsulta> = {
    ruc: { tipo: "ruc", pedidas: 0, deMemoria: 0 },
    dni: { tipo: "dni", pedidas: 0, deMemoria: 0 },
    tipo_cambio: { tipo: "tipo_cambio", pedidas: 0, deMemoria: 0 },
  };
  for (const f of filas) {
    const tipo = TIPO_POR_ENDPOINT[f.endpoint];
    if (!tipo) continue;
    if (f.desde_cache) conteo[tipo].deMemoria += 1;
    else conteo[tipo].pedidas += 1;
  }
  return [conteo.ruc, conteo.dni, conteo.tipo_cambio];
}

/** Ámbar desde el 75 %, rojo desde el 90 %: los umbrales del paquete (`calcularEstado`). */
export function nivelDeUso(usadas: number, limite: number): "bien" | "atento" | "casi" {
  if (limite <= 0) return "casi";
  const pct = (usadas / limite) * 100;
  if (pct >= 90) return "casi";
  if (pct >= 75) return "atento";
  return "bien";
}
