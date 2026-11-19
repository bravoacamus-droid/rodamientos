/**
 * Lo que necesitan las rutas de exportación del kardex (19/11). Aparte del
 * índice del módulo porque es solo de servidor: el índice lo importan también
 * componentes de cliente.
 */
export { excelKardex, pdfKardex } from "./api/exportar-kardex";
export { leerFiltrosKardex } from "./dominio/filtros-kardex";
