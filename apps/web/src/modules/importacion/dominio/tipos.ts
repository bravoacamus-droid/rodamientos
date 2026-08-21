/**
 * Tipos del importador del maestro de productos.
 *
 * El vocabulario es el de la plantilla que llena el cliente
 * (docs/plantillas/Rodatech - Maestro de productos.xlsx), no el de la base:
 * quien lee un error tiene que reconocer la columna que tiene delante.
 */

/** Una fila de la plantilla, ya mapeada y con los números convertidos. */
export interface FilaPlantilla {
  /** Número de fila EN EL EXCEL, para que el mensaje sea accionable. */
  fila: number;
  codigo: string;
  familia: string;
  subfamilia: string;
  tipo: string;
  marca: string;
  stock: number;
  stock_minimo: number;
  precio_compra: number;
  precio_venta: number;
  precio_minimo: number;
}

export type AccionFila = "nuevo" | "actualizado" | "rechazado";

/** Dictamen de la base para una fila. */
export interface DiagnosticoFila {
  fila: number;
  codigo: string;
  accion: AccionFila;
  /** Solo cuando `accion` es "rechazado". */
  motivo: string | null;
  precio_venta: number;
  precio_minimo: number;
}

/** Lo que devuelve `importar_productos()`, en los dos modos. */
export interface ResumenImportacion {
  simulado: boolean;
  total: number;
  nuevos: number;
  actualizados: number;
  rechazados: number;
  marcas_nuevas: string[];
  /** Cuántos productos nuevos traen stock, que entra como movimiento. */
  stock_inicial: number;
  /**
   * Cuántas filas traen stock para un producto que YA existía. Ese stock no se
   * toca: sobrescribir el saldo desde un Excel rompería la trazabilidad del
   * kardex. Se avisa para que nadie crea que se cargó.
   */
  stock_ignorado: number;
  detalle: DiagnosticoFila[];
}

/** Problema detectado ANTES de llegar a la base: en el propio archivo. */
export interface ProblemaArchivo {
  fila: number | null;
  mensaje: string;
}

export type ResultadoAnalisis =
  | {
      ok: true;
      resumen: ResumenImportacion;
      /** Las filas válidas, para mandarlas de vuelta al confirmar. */
      filas: FilaPlantilla[];
      problemas: ProblemaArchivo[];
    }
  | { ok: false; error: string; problemas?: ProblemaArchivo[] };
