/**
 * Tipo de cambio SUNAT (vía Decolecta).
 *
 * Los precios se devuelven como STRING, tal cual los entrega el proveedor:
 * este paquete nunca los convierte a `number` binario para no perder
 * precisión monetaria (especificación, sección 2.1). Conviértelos con una
 * librería decimal en el punto de uso si necesitas operar con ellos.
 *
 * TTL: una fecha pasada es un hecho inmutable → caché permanente. La fecha de
 * hoy puede cambiar hasta que SUNAT publique → caché hasta la medianoche UTC
 * siguiente. Un mes ya cerrado → permanente; el mes en curso, 24 h.
 */

import { ejecutarConsulta, type ContextoConsultas, type OpcionesConsulta } from "./proveedor";
import type { Resultado } from "./tipos";

export type TipoCambio = {
  /** Precio de compra, como string decimal (ver nota de precisión arriba). */
  compra: string;
  /** Precio de venta, como string decimal. */
  venta: string;
  monedaBase: string;
  monedaCotizada: string;
  fecha: string;
};

export type ParametrosTipoCambio = { fecha: string } | { mes: number; anio: number } | Record<string, never>;

const UN_DIA_MS = 24 * 60 * 60 * 1000;

function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() <= Date.now();
}

function esMesAnioValido(mes: number, anio: number): boolean {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return false;
  const anioActual = new Date().getUTCFullYear();
  return Number.isInteger(anio) && anio >= 2000 && anio <= anioActual;
}

function msHastaMedianocheUtc(): number {
  const ahora = new Date();
  const manana = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 1));
  return manana.getTime() - Date.now();
}

function normalizarFila(cruda: Record<string, unknown>): TipoCambio {
  return {
    compra: String(cruda.buy_price ?? ""),
    venta: String(cruda.sell_price ?? ""),
    monedaBase: String(cruda.base_currency ?? "USD"),
    monedaCotizada: String(cruda.quote_currency ?? "PEN"),
    fecha: String(cruda.date ?? ""),
  };
}

function invalido(mensaje: string): Resultado<TipoCambio[]> {
  return {
    ok: false,
    origen: "invalido",
    datos: null,
    cuota: null,
    mensaje,
    errorCodigo: "VALIDACION_LOCAL",
    obtenidoEn: null,
  };
}

/**
 * Tipo de cambio SUNAT. Sin parámetros trae el vigente del día; con `fecha`,
 * el de ese día; con `mes`+`anio`, el mes completo en una sola llamada —traer
 * 30 días sueltos gastaría 30 peticiones en vez de 1—.
 */
export async function tipoCambioSunat(
  parametros: ParametrosTipoCambio,
  contexto: ContextoConsultas,
  opciones: OpcionesConsulta = {},
): Promise<Resultado<TipoCambio[]>> {
  let clave: string;
  let parametrosHttp: Record<string, string | undefined>;
  let ttlCacheMs: number | null;

  if ("fecha" in parametros) {
    if (!esFechaValida(parametros.fecha)) {
      return invalido("La fecha debe tener formato AAAA-MM-DD y no ser futura.");
    }
    const hoy = new Date().toISOString().slice(0, 10);
    clave = `fecha:${parametros.fecha}`;
    parametrosHttp = { date: parametros.fecha };
    ttlCacheMs = parametros.fecha === hoy ? msHastaMedianocheUtc() : null;
  } else if ("mes" in parametros) {
    if (!esMesAnioValido(parametros.mes, parametros.anio)) {
      return invalido("El mes debe ser 1-12 y el año entre 2000 y el año actual.");
    }
    const ahora = new Date();
    const esMesActual = parametros.anio === ahora.getUTCFullYear() && parametros.mes === ahora.getUTCMonth() + 1;
    clave = `mes:${parametros.anio}-${String(parametros.mes).padStart(2, "0")}`;
    parametrosHttp = { month: String(parametros.mes), year: String(parametros.anio) };
    ttlCacheMs = esMesActual ? UN_DIA_MS : null;
  } else {
    clave = `hoy:${new Date().toISOString().slice(0, 10)}`;
    parametrosHttp = {};
    ttlCacheMs = msHastaMedianocheUtc();
  }

  const crudo = await ejecutarConsulta<unknown>(
    contexto,
    {
      espacio: "tipo_cambio",
      clave,
      ruta: "/v1/tipo-cambio/sunat",
      parametros: parametrosHttp,
      ttlCacheMs,
      ttlNegativoMs: UN_DIA_MS,
      endpointLog: "tipo-cambio/sunat",
    },
    opciones,
  );

  if (!crudo.ok || !crudo.datos) {
    return { ...crudo, datos: null };
  }
  const arreglo = Array.isArray(crudo.datos) ? crudo.datos : [crudo.datos];
  return { ...crudo, datos: (arreglo as Record<string, unknown>[]).map(normalizarFila) };
}
