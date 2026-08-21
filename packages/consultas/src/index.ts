/**
 * @rodatech/consultas — API pública.
 *
 * Consulta de RUC/DNI (SUNAT/RENIEC) y tipo de cambio (SUNAT) vía Decolecta,
 * con control estricto de cuota mensual. Ver README.md para el flujo completo
 * y migracion.sql para las tablas que necesita.
 */

export { ejecutarConsulta } from "./proveedor";
export type { ContextoConsultas, DefinicionConsulta, OpcionesConsulta } from "./proveedor";

export type { ClienteSupabase, ConstructorSelect, ConstructorTabla, FilaSupabase, RespuestaSupabase } from "./cliente";

export type { EstadoCicloCuota, EstadoCuota, Origen, Prioridad, Resultado } from "./tipos";
export type { CodigoError, ErrorConsulta } from "./errores";

export { consultarRuc, rucValido } from "./ruc";
export type { Ruc } from "./ruc";

export { consultarDni, dniValido } from "./dni";
export type { Persona } from "./dni";

export { tipoCambioSunat } from "./tipo-cambio";
export type { ParametrosTipoCambio, TipoCambio } from "./tipo-cambio";

export { calcularEstado, estadoCuota, liberarCuota, marcarAgotado, pasaPrioridad, periodoActual, reservarCuota } from "./cuota";
export type { ConfiguracionCuota, ReservaCuota } from "./cuota";

export { TTL } from "./cache";
