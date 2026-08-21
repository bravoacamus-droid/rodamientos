/**
 * Consulta de RUC (SUNAT, endpoint básico de Decolecta).
 *
 * La validación local del dígito verificador es el ahorro de cuota más
 * grande de todo el paquete: un RUC de 10 dígitos, o con el dígito
 * verificador equivocado, jamás sale a la red.
 */

import { TTL } from "./cache";
import { ejecutarConsulta, type ContextoConsultas, type OpcionesConsulta } from "./proveedor";
import type { Resultado } from "./tipos";

export type Ruc = {
  numeroDocumento: string;
  razonSocial: string;
  estado: string | null;
  condicion: string | null;
  direccion: string | null;
  ubigeo: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  esAgenteRetencion: boolean;
  esBuenContribuyente: boolean;
};

const PREFIJOS_VALIDOS = ["10", "15", "17", "20"];
const PESOS_MODULO_11 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Valida un RUC peruano: 11 dígitos, prefijo de tipo de contribuyente válido
 * (10 = persona natural, 15 = otro, 17 = otro, 20 = persona jurídica) y
 * dígito verificador módulo 11.
 */
export function rucValido(valor: string): boolean {
  if (!/^\d{11}$/.test(valor)) return false;
  if (!PREFIJOS_VALIDOS.includes(valor.slice(0, 2))) return false;

  let suma = 0;
  for (let i = 0; i < PESOS_MODULO_11.length; i++) {
    suma += (PESOS_MODULO_11[i] ?? 0) * Number(valor[i] ?? "0");
  }
  const resto = 11 - (suma % 11);
  const digitoVerificador = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return digitoVerificador === Number(valor[10]);
}

/** Decolecta devuelve "-" en los campos de dirección que no aplican; se limpia a null. */
function limpiar(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  return v === "" || v === "-" ? null : v;
}

function normalizar(cruda: Record<string, unknown>): Ruc {
  return {
    numeroDocumento: String(cruda.numero_documento ?? ""),
    razonSocial: String(cruda.razon_social ?? ""),
    estado: limpiar(cruda.estado),
    condicion: limpiar(cruda.condicion),
    direccion: limpiar(cruda.direccion),
    ubigeo: limpiar(cruda.ubigeo),
    distrito: limpiar(cruda.distrito),
    provincia: limpiar(cruda.provincia),
    departamento: limpiar(cruda.departamento),
    esAgenteRetencion: Boolean(cruda.es_agente_retencion),
    esBuenContribuyente: Boolean(cruda.es_buen_contribuyente),
  };
}

function invalido(mensaje: string): Resultado<Ruc> {
  return { ok: false, origen: "invalido", datos: null, cuota: null, mensaje, errorCodigo: "VALIDACION_LOCAL", obtenidoEn: null };
}

/**
 * Consulta un RUC. La validación local corre antes que nada: si no pasa, no
 * se toca ni la caché ni el guardián de cuota ni la red.
 */
export async function consultarRuc(
  numero: string,
  contexto: ContextoConsultas,
  opciones: OpcionesConsulta = {},
): Promise<Resultado<Ruc>> {
  const limpio = numero.replace(/\D/g, "");
  if (!rucValido(limpio)) {
    return invalido("El RUC debe tener 11 dígitos, empezar por 10, 15, 17 o 20, y tener un dígito verificador correcto.");
  }

  const crudo = await ejecutarConsulta<Record<string, unknown>>(
    contexto,
    {
      espacio: "ruc",
      clave: limpio,
      ruta: "/v1/sunat/ruc",
      parametros: { numero: limpio },
      ttlCacheMs: TTL.RUC_MS,
      ttlNegativoMs: TTL.NEGATIVO_MS,
      endpointLog: "sunat/ruc",
    },
    opciones,
  );

  if (!crudo.ok || !crudo.datos) {
    return { ...crudo, datos: null };
  }
  return { ...crudo, datos: normalizar(crudo.datos) };
}
