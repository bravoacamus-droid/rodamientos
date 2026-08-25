/**
 * Módulo de cobranzas: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaCobranzas } from "./ui/pagina";

// Las reglas de cobro son puras y las va a necesitar cualquier pantalla que
// enseñe deuda: la ficha del cliente, sin ir más lejos.
export {
  COLOR_TRAMO,
  avisosPago,
  bloqueosPago,
  etiquetaAtraso,
  prioridad,
  quedaSaldado,
  repartoEnCuotas,
  tonoTramo,
} from "./dominio/cobro";

export {
  CANALES,
  ETIQUETA_CANAL,
  ETIQUETA_MEDIO,
  MEDIOS_SIN_CAJA,
  type ClienteEnCartera,
  type CuotaComprobante,
  type DocumentoPorCobrar,
  type FiltrosCartera,
  type Gestion,
  type MedioPago,
  type PagoRegistrado,
  type TramoAging,
} from "./dominio/tipos";
