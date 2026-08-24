/**
 * Módulo de clientes: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaClientes } from "./ui/pagina";
export { default as PaginaFormularioCliente } from "./ui/pagina-formulario";
export { default as PaginaDetalleCliente } from "./ui/pagina-detalle";

export type {
  ClienteDetalle,
  ClienteEditable,
  ClienteLista,
  CondicionPago,
  FiltrosClientes,
  TipoDocumento,
} from "./dominio/tipos";
