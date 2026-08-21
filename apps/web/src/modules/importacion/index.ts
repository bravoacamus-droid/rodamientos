/**
 * Módulo de importación: superficie pública.
 *
 * Ver apps/web/src/modules/README.md.
 */

export { default as PaginaImportacion } from "./ui/pagina";

// La lectura de la plantilla es pura y no depende de Excel: la reutilizará el
// importador de clientes y el de proveedores, que usan el mismo mecanismo de
// cabecera tolerante y de conversión de números.
export {
  aNumero,
  columnasQueFaltan,
  detectarCabecera,
  leerFilas,
  normalizarCabecera,
  COLUMNAS,
} from "./dominio/plantilla";

export type {
  AccionFila,
  DiagnosticoFila,
  FilaPlantilla,
  ProblemaArchivo,
  ResultadoAnalisis,
  ResumenImportacion,
} from "./dominio/tipos";
