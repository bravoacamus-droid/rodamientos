/**
 * Tipos del esquema, más alias de dominio.
 *
 * Los tipos crudos vienen generados desde Postgres (./tipos.generados). Aquí
 * se les pone nombre de negocio, para que el resto del código hable de
 * `Producto` y no de `Database["public"]["Tables"]["productos"]["Row"]`.
 */

import type { Database } from "./tipos.generados";

export type { Database, Json } from "./tipos.generados";

type Tablas = Database["public"]["Tables"];
type Vistas = Database["public"]["Views"];
type Enums = Database["public"]["Enums"];

/** Enum de Postgres, por nombre. */
export type Enum<T extends keyof Enums> = Enums[T];

// --- Enums de dominio -------------------------------------------------------
// Nombres de negocio para los enums del esquema. Antes `Rol` estaba escrito a
// mano en el stub; ahora sale de `rol_usuario`, así que agregar un rol en
// Postgres y no actualizarlo aquí ya no es posible: lo rompe el typecheck.
export type Rol = Enum<"rol_usuario">;
export type CondicionPago = Enum<"condicion_pago">;
export type EstadoCompra = Enum<"estado_compra">;
export type EstadoComprobante = Enum<"estado_comprobante">;
export type EstadoCotizacion = Enum<"estado_cotizacion">;
export type EstadoGuia = Enum<"estado_guia">;
export type EstadoSunat = Enum<"estado_sunat">;

/** Fila tal como sale de un select. */
export type Fila<T extends keyof Tablas> = Tablas[T]["Row"];
/** Payload de insert, con los campos que tienen default como opcionales. */
export type NuevaFila<T extends keyof Tablas> = Tablas[T]["Insert"];
/** Payload de update: todo opcional. */
export type CambioFila<T extends keyof Tablas> = Tablas[T]["Update"];

/** Fila de una vista. */
export type FilaVista<T extends keyof Vistas> = Vistas[T]["Row"];

// --- Alias de dominio -------------------------------------------------------

export type Perfil = Fila<"perfiles">;
export type Producto = Fila<"productos">;
export type Familia = Fila<"familias">;
export type Subfamilia = Fila<"subfamilias">;
export type Tipo = Fila<"tipos">;
export type Marca = Fila<"marcas">;
export type Cliente = Fila<"clientes">;
export type Proveedor = Fila<"proveedores">;
export type Cotizacion = Fila<"cotizaciones">;
export type CotizacionItem = Fila<"cotizacion_items">;
export type Comprobante = Fila<"comprobantes">;
export type GuiaRemision = Fila<"guias_remision">;
export type Compra = Fila<"compras">;
export type MovimientoInventario = Fila<"movimientos_inventario">;
export type Alerta = Fila<"alertas">;

/**
 * Resultado de una consulta paginada por keyset.
 *
 * No lleva `total`: contar el catálogo entero en cada página es justo lo que
 * hace lenta la paginación por offset. Si una pantalla necesita el total, lo
 * pide aparte y cacheado.
 */
export interface Pagina<T> {
  filas: T[];
  /** Cursor de la siguiente página, o null si esta es la última. */
  siguiente: string | null;
}
