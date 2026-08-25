/**
 * Tipos del módulo de reportes.
 *
 * Todo sale de las vistas analíticas que ya existen en la base
 * (`v_ventas_mensuales`, `v_top_productos`, `v_cartera`…). Ninguna consulta de
 * aquí agrega en JavaScript lo que Postgres ya sabe agregar: con 2.000 SKU y
 * años de movimientos, traer las filas para sumarlas en el servidor de Next
 * sería mover megabytes para calcular una columna.
 */

/** Un mes de la serie de ventas. */
export interface MesVentas {
  /** `aaaa-mm-01`. */
  mes: string;
  /** Etiqueta corta para el eje: «ago 26». */
  etiqueta: string;
  documentos: number;
  ventaNeta: number;
  igv: number;
  total: number;
  costo: number;
  margen: number;
  margenPct: number;
}

/** Una fila del ranking de productos. */
export interface ProductoVendido {
  id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  subfamilia: string | null;
  unidades: number;
  venta: number;
  costo: number;
  margen: number;
  margenPct: number;
  clientes: number;
  ultimaVenta: string | null;
}

/** Un tramo del aging de cobranzas. */
export interface TramoCartera {
  tramo: string;
  documentos: number;
  saldo: number;
}

/** Una familia en la valorización del inventario. */
export interface FamiliaValorizada {
  familia: string;
  skus: number;
  unidades: number;
  valorCosto: number;
  valorVenta: number;
  margenPotencial: number;
}

/** El embudo comercial: qué se cotizó, qué se despachó, qué se facturó. */
export interface Embudo {
  cotizado: number;
  cotizaciones: number;
  despachado: number;
  guias: number;
  facturado: number;
  comprobantes: number;
  cobrado: number;
  porCobrar: number;
}

/** Los indicadores de la cabecera. */
export interface ResumenReportes {
  ventaMes: number;
  ventaMesAnterior: number;
  margenPct: number;
  porCobrar: number;
  vencido: number;
  inventarioCosto: number;
  skusBajoMinimo: number;
}

/** El periodo que se está mirando. Viaja en los search params. */
export interface FiltrosReportes {
  desde?: string;
  hasta?: string;
  meses?: string;
}
