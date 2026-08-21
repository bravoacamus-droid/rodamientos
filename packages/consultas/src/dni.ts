/**
 * Consulta de DNI (RENIEC, vía Decolecta).
 *
 * Dato personal (Ley 29733, Protección de Datos Personales, Perú): el log de
 * observabilidad (`consultas_log`, ver `proveedor.ts`) solo guarda un hash de
 * la clave, nunca el número ni el nombre. La caché tiene TTL de 90 días —no
 * permanente— como periodo de retención razonable; ajústalo si la política de
 * datos del proyecto exige otra cosa.
 */

import { TTL } from "./cache";
import { ejecutarConsulta, type ContextoConsultas, type OpcionesConsulta } from "./proveedor";
import type { Resultado } from "./tipos";

export type Persona = {
  numeroDocumento: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombreCompleto: string;
};

/** Valida un DNI peruano: exactamente 8 dígitos. */
export function dniValido(valor: string): boolean {
  return /^\d{8}$/.test(valor);
}

function normalizar(cruda: Record<string, unknown>): Persona {
  const nombres = String(cruda.first_name ?? "");
  const apellidoPaterno = String(cruda.first_last_name ?? "");
  const apellidoMaterno = String(cruda.second_last_name ?? "");
  // `full_name` no está en la tabla de campos de la documentación pero sí en
  // su ejemplo de respuesta; se trata como opcional y se reconstruye si falta.
  const nombreCompleto =
    typeof cruda.full_name === "string" && cruda.full_name.trim() !== ""
      ? cruda.full_name
      : `${apellidoPaterno} ${apellidoMaterno} ${nombres}`.trim();

  return {
    numeroDocumento: String(cruda.document_number ?? ""),
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    nombreCompleto,
  };
}

function invalido(mensaje: string): Resultado<Persona> {
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
 * Consulta un DNI. La validación local (8 dígitos) corre antes que nada: si
 * no pasa, no se toca ni la caché ni el guardián de cuota ni la red.
 */
export async function consultarDni(
  numero: string,
  contexto: ContextoConsultas,
  opciones: OpcionesConsulta = {},
): Promise<Resultado<Persona>> {
  const limpio = numero.replace(/\D/g, "");
  if (!dniValido(limpio)) {
    return invalido("El DNI debe tener exactamente 8 dígitos.");
  }

  const crudo = await ejecutarConsulta<Record<string, unknown>>(
    contexto,
    {
      espacio: "dni",
      clave: limpio,
      ruta: "/v1/reniec/dni",
      parametros: { numero: limpio },
      ttlCacheMs: TTL.DNI_MS,
      ttlNegativoMs: TTL.NEGATIVO_MS,
      endpointLog: "reniec/dni",
    },
    opciones,
  );

  if (!crudo.ok || !crudo.datos) {
    return { ...crudo, datos: null };
  }
  return { ...crudo, datos: normalizar(crudo.datos) };
}
