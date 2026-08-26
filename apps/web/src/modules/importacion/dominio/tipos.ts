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

  /**
   * Columnas añadidas el 26/08. Van con `null` cuando la celda viene vacía y
   * no con cero: es lo que le dice a la base «no me lo digas», para que una
   * carga parcial no borre lo que ya estaba cargado.
   */
  codigo_fabricante: string | null;
  ubicacion: string | null;
  proveedor: string | null;
  stock_maximo: number | null;
  precio_mercado: number | null;
  /** En kilos. Sin él no se puede emitir una guía: `guia_peso_pos` la rechaza. */
  peso: number | null;
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
  /**
   * Proveedores nombrados en el archivo que no están en el maestro.
   *
   * NO frenan la carga y NO se crean solos: un proveedor lleva RUC,
   * condiciones de pago y plazo de entrega, y darlo de alta desde un nombre
   * suelto llenaría el maestro de fichas huecas. La fila entra sin proveedor
   * y se informa para darlos de alta bien.
   */
  proveedores_desconocidos: string[];
  /**
   * Cuántas filas traen peso.
   *
   * Es el número que hay que mirar en la carga real: `guia_peso_pos` rechaza
   * una guía con peso cero, y hoy no hay un solo producto con peso.
   */
  con_peso: number;
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

/**
 * Aviso sobre CÓMO se va a leer el archivo, no sobre un error en él.
 *
 * Un `ProblemaArchivo` dice «esta fila se omitió». Un aviso dice «esto se va a
 * interpretar así, y conviene que lo sepas antes de aplicar». Son cosas
 * distintas y mezclarlas haría que un aviso importante se leyera como una
 * fila más que se cayó.
 */
export interface AvisoLectura {
  titulo: string;
  detalle: string;
}

export type ResultadoAnalisis =
  | {
      ok: true;
      resumen: ResumenImportacion;
      /** Las filas válidas, para mandarlas de vuelta al confirmar. */
      filas: FilaPlantilla[];
      problemas: ProblemaArchivo[];
      avisos: AvisoLectura[];
    }
  | { ok: false; error: string; problemas?: ProblemaArchivo[] };
