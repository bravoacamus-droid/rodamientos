/**
 * Normalización de errores de Decolecta.
 *
 * La API mezcla dos formas de error: el endpoint de RUC básico devuelve 422
 * con `{ "message": "ruc no valido" }`, y el resto devuelve 400/otros con
 * `{ "error": "Invalid request" }`. Nada fuera de este archivo debe fijarse
 * en cuál de las dos formas llegó: todo se traduce a `ErrorConsulta`.
 *
 * También es aquí donde se decide qué es reintentable y qué es cacheable en
 * negativo, siguiendo la tabla de la sección 7 de la especificación:
 *   - 400/404/422 → deterministas, se cachean en negativo, NUNCA se reintentan.
 *   - 401/403/402 → problema de configuración, alerta, no se reintenta.
 *   - 429 → el proveedor dice que no hay cupo; nunca se cachea (no es un dato
 *     del documento, es un estado transitorio de la cuenta).
 *   - 5xx → transitorio: se reintenta con backoff, nunca se cachea.
 */

export type CodigoError =
  | "VALIDACION_LOCAL"
  | "PETICION_INVALIDA"
  | "DOCUMENTO_INVALIDO"
  | "NO_AUTORIZADO"
  | "PAGO_REQUERIDO"
  | "NO_ENCONTRADO"
  | "CUOTA_PROVEEDOR_AGOTADA"
  | "ERROR_PROVEEDOR"
  | "TIMEOUT"
  | "RED"
  | "SIN_CONFIGURAR"
  | "CUOTA_LOCAL_AGOTADA";

export type ErrorConsulta = {
  codigo: CodigoError;
  /** Código HTTP devuelto por el proveedor, o null si nunca llegó a responder. */
  httpStatus: number | null;
  /** Mensaje en español, listo para mostrar al usuario final. */
  mensaje: string;
  /** Lo que dijo el proveedor tal cual, solo para logs internos (nunca al usuario). */
  mensajeCrudo: string | null;
  /** ¿Tiene sentido reintentar (mismo documento, otro intento)? */
  reintentable: boolean;
  /** ¿Se puede guardar como caché negativa? Solo errores deterministas. */
  cacheable: boolean;
};

function extraerMensajeCrudo(cuerpo: unknown): string | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const obj = cuerpo as Record<string, unknown>;
  // RUC básico (422): { message }. Resto de endpoints: { error }.
  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.error === "string") return obj.error;
  return null;
}

/** Traduce un status HTTP + cuerpo de Decolecta a la estructura interna. */
export function normalizarError(status: number, cuerpo: unknown): ErrorConsulta {
  const mensajeCrudo = extraerMensajeCrudo(cuerpo);

  if (status === 400) {
    return {
      codigo: "PETICION_INVALIDA",
      httpStatus: 400,
      mensaje: "La consulta no tiene un formato válido.",
      mensajeCrudo,
      reintentable: false,
      cacheable: true,
    };
  }
  if (status === 401 || status === 403) {
    return {
      codigo: "NO_AUTORIZADO",
      httpStatus: status,
      mensaje: "El token de Decolecta no es válido o venció. Revisa la variable DECOLECTA_TOKEN.",
      mensajeCrudo,
      reintentable: false,
      cacheable: false,
    };
  }
  if (status === 402) {
    return {
      codigo: "PAGO_REQUERIDO",
      httpStatus: 402,
      mensaje: "El plan de Decolecta está vencido o con pago pendiente.",
      mensajeCrudo,
      reintentable: false,
      cacheable: false,
    };
  }
  if (status === 404) {
    return {
      codigo: "NO_ENCONTRADO",
      httpStatus: 404,
      mensaje: "No se encontró ese documento.",
      mensajeCrudo,
      reintentable: false,
      cacheable: true,
    };
  }
  if (status === 422) {
    return {
      codigo: "DOCUMENTO_INVALIDO",
      httpStatus: 422,
      mensaje: "El documento no existe según SUNAT/RENIEC.",
      mensajeCrudo,
      reintentable: false,
      cacheable: true,
    };
  }
  if (status === 429) {
    return {
      codigo: "CUOTA_PROVEEDOR_AGOTADA",
      httpStatus: 429,
      mensaje: "Decolecta indica que se agotó la cuota de la cuenta. Se bloquean las consultas hasta el próximo ciclo.",
      mensajeCrudo,
      reintentable: false,
      cacheable: false,
    };
  }
  if (status >= 500) {
    return {
      codigo: "ERROR_PROVEEDOR",
      httpStatus: status,
      mensaje: "El proveedor de consultas no está respondiendo. Escribe los datos a mano por ahora.",
      mensajeCrudo,
      reintentable: true,
      cacheable: false,
    };
  }
  return {
    codigo: "ERROR_PROVEEDOR",
    httpStatus: status,
    mensaje: `El proveedor respondió con un error inesperado (${status}).`,
    mensajeCrudo,
    reintentable: false,
    cacheable: false,
  };
}
