/**
 * Módulo de proveedores: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaProveedores } from "./ui/pagina";
export { default as PaginaFormularioProveedor } from "./ui/pagina-formulario";
export { default as PaginaDetalleProveedor } from "./ui/pagina-detalle";

// Las reglas del documento son puras y están probadas. Las reutilizará el
// módulo de compras al dar de alta un proveedor sobre la marcha.
export {
  codigoDeProveedor,
  esConsultable,
  normalizarDocumento,
  revisarDocumento,
  variante,
  type RevisionDocumento,
} from "./dominio/documento";

export {
  ETIQUETA_DOCUMENTO,
  ETIQUETA_TIPO,
  PAIS_POR_DEFECTO,
  type FiltrosProveedores,
  type ProveedorDetalle,
  type ProveedorEditable,
  type ProveedorLista,
  type TipoCompra,
  type TipoDocumento,
} from "./dominio/tipos";
