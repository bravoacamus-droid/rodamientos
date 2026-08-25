/**
 * Endpoints de los web services de SUNAT.
 * Verificados contra Greenter (Ws\Services\SunatEndpoints).
 */
import type { Ambiente } from "../index";

/** billService de comprobantes (factura, boleta, notas, resumen, baja). */
export function endpointFacturacion(ambiente: Ambiente): string {
  return ambiente === "produccion"
    ? "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService"
    : "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService";
}

/**
 * La guía de remisión YA NO VA POR SOAP. Esta función existe solo para que
 * quien la busque se entere aquí y no después de un día de trabajo.
 *
 * Devolvía el billService `ol-ti-itemision-guia-gem`, que es el sistema
 * anterior. Sigue en pie —el WSDL responde— y por eso es una trampa: no falla,
 * simplemente pertenece a un régimen que ya no es el vigente.
 *
 * Lo que manda hoy, según `docs/INVESTIGACION-GRE.md`:
 *
 *   · El Anexo N.° 13 en la versión de la RS 000108-2026/SUNAT (vigente desde
 *     el 01/06/2026) establece envío por **servicio REST**: POST de un ZIP más
 *     su hash, que devuelve un TICKET. Es asíncrono, no como la factura.
 *   · El PDF oficial «Servicios WEB Disponibles» de mayo de 2026 ya no lista
 *     ninguna URL de guía, ni en beta ni en producción.
 *   · Autenticación **OAuth2**, y hacen falta las cuatro credenciales a la
 *     vez: `client_id`, `client_secret`, usuario SOL (RUC+usuario) y clave SOL.
 *   · **No hay ambiente de pruebas.** SUNAT no publica beta para la GRE.
 *   · **No hay API de baja.** Anular es manual desde el portal SOL.
 *
 * Las rutas de reemplazo están abajo, en {@link RUTAS_GRE}.
 *
 * @throws siempre. Es deliberado.
 */
export function endpointGuias(_ambiente: Ambiente): never {
  throw new Error(
    "La GRE no se emite por SOAP desde la RS 000108-2026/SUNAT: va por REST " +
      "con OAuth2 y ticket. El billService ol-ti-itemision-guia-gem sigue " +
      "respondiendo, pero es el régimen anterior. Ver RUTAS_GRE en este mismo " +
      "archivo y docs/INVESTIGACION-GRE.md.",
  );
}

/**
 * Rutas del servicio REST de la GRE, para cuando se cablee el módulo.
 *
 * Todavía no las consume nadie: el conector no tiene métodos de guía. Están
 * aquí, y no en el módulo que las vaya a usar, para que la sustitución de
 * `endpointGuias` esté a la vista de quien lea el error.
 *
 * `HOST_ENVIO` es ambiguo en las fuentes: el README de `greenter/gre-api` usa
 * `https://api.sunat.gob.pe`, y su propio `openapi.yaml` usa
 * `https://api-cpe.sunat.gob.pe`. Comprobados los dos el 20/08/2026: ambos
 * devuelven 401 y no 404, así que parecen el mismo gateway. Se elige
 * `api-cpe` porque es el que coincide con el `scope` del token, y se deja
 * configurable justamente por la duda.
 *
 * No lleva variante de beta a propósito: no existe.
 */
export const RUTAS_GRE = {
  /** POST. `{client_id}` se sustituye al construir la petición del token. */
  token: "https://api-seguridad.sunat.gob.pe/v1/clientessol/{client_id}/oauth2/token/",
  /** Host de envío y consulta. Configurable: ver la ambigüedad de arriba. */
  hostEnvio: "https://api-cpe.sunat.gob.pe",
  /** POST bajo `hostEnvio`. Devuelve un ticket, no un CDR. */
  enviar: "/v1/contribuyente/gem/comprobantes/{filename}",
  /** GET bajo `hostEnvio`. Es donde aparece el CDR, ya procesado. */
  consultarTicket: "/v1/contribuyente/gem/comprobantes/envios/{numTicket}",
} as const;
