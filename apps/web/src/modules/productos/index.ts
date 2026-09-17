/**
 * Módulo de productos: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaProductos } from "./ui/pagina";
export { default as PaginaFormularioProducto } from "./ui/pagina-formulario";
export { default as PaginaDetalleProducto } from "./ui/pagina-detalle";

// Kits (085): varios productos que se cotizan y facturan como uno.
export { PaginaKits } from "./ui/kits/pagina";
export { default as PaginaFormularioKit } from "./ui/kits/pagina-formulario";

export type {
  EstadoStock,
  FiltrosProductos,
  ProductoLista,
} from "./dominio/tipos";
