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
  /** El costo del mes. En cero significa que NO SE SABE el margen (059). */
  costoMes: number;
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

// ---------------------------------------------------------------------------
// Informes por rango (26/08)
// ---------------------------------------------------------------------------

/** Un punto de la serie de ventas, ya con la etiqueta del eje resuelta. */
export interface PuntoVentas {
  /** El inicio del periodo, en `aaaa-mm-dd`. */
  periodo: string;
  /** Cómo se lee en el eje: «25 ago», «ago 26», «2026». */
  etiqueta: string;
  documentos: number;
  venta: number;
  costo: number;
  margen: number;
  /** Sobre el COSTO, como todo el sistema desde la 023. */
  margenPct: number;
  unidades: number;
}

/**
 * Un punto de la serie de compras.
 *
 * Mide lo que se PIDIÓ y cuándo, no lo que entró al almacén. Willy lo pidió
 * así: «que se va a jalar directamente las órdenes de compra».
 */
export interface PuntoCompras {
  periodo: string;
  etiqueta: string;
  ordenes: number;
  proveedores: number;
  subtotal: number;
  /** Gastos de importación. Son costo; el IGV no, que es crédito fiscal. */
  gastos: number;
  costoTotal: number;
}

/** Un producto del ranking, con el cliente que más se lleva. */
export interface ProductoConCliente {
  id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidades: number;
  venta: number;
  costo: number;
  margen: number;
  margenPct: number;
  /** Cuántos clientes distintos lo compraron en el rango. */
  clientes: number;
  documentos: number;
  /**
   * El que más se llevó, y su peso sobre el total.
   *
   * Es lo que Willy pidió (9:01): «si yo compro una mercadería, ¿para quién va
   * dirigida?». Si uno solo se lleva el 90 %, reponer es una conversación con
   * él, no una apuesta.
   */
  clientePrincipal: string | null;
  clientePrincipalId: string | null;
  clientePrincipalPct: number;
  ultimaVenta: string | null;
}

/** Un cliente del ranking, con cada cuánto compra. */
export interface ClienteFrecuente {
  id: string;
  cliente: string;
  documento: string | null;
  documentos: number;
  venta: number;
  costo: number;
  margen: number;
  margenPct: number;
  primeraCompra: string;
  ultimaCompra: string;
  /**
   * Promedio de días entre compras. Null con un solo documento: no hay
   * intervalo que medir, y un cero diría «compra todos los días».
   */
  diasEntreCompras: number | null;
  /** Contra hoy, no contra el fin del rango: no cuenta días que no han pasado. */
  diasSinComprar: number;
}
