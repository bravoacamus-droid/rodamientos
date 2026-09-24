import type { Rol } from "./tipos";

/**
 * Los permisos, agrupados como se piensan y no como están guardados.
 *
 * `permisos_rol` es una matriz tabla×rol: 35 tablas por 6 roles son 210
 * casillas, y los nombres son `comprobante_cuotas` o `proveedor_marcas`. Eso
 * no es una pantalla, es un volcado — y va contra la primera regla del
 * proyecto: *nada de jerga*. Nadie va a decidir si ventas escribe en
 * `guia_items`; lo que se decide es si **ventas puede despachar**.
 *
 * Así que la pantalla enseña ÁREAS, ocho, con los nombres del menú. Marcar un
 * área escribe todas sus tablas de golpe, que es justo lo que se quería decir.
 *
 * ---------------------------------------------------------------------------
 * Lo que NO está aquí, y es a propósito
 * ---------------------------------------------------------------------------
 * `permisos_rol` no controla:
 *
 *   · **Quién cambia un rol** — eso es el trigger de la 077, gerencia y punto.
 *   · **El ajuste de inventario** — su política es `es_gerencia()` directa
 *     (006), no pasa por la matriz.
 *   · **La propia matriz** — misma política. Por eso no hay forma de quitarse
 *     el acceso a esta pantalla desde esta pantalla, que sería la peor manera
 *     posible de quedarse fuera.
 *
 * Si algún día una tabla entra en la matriz y nadie la mete en un área, la
 * pantalla la enseña igual en «Otros permisos» con su nombre técnico. Es feo a
 * propósito: un permiso que no se ve es un permiso que nadie revisa, y en este
 * proyecto eso ya ha pasado treinta veces.
 */
export type Area = {
  clave: string;
  etiqueta: string;
  /** Qué significa en la práctica marcar esta casilla. */
  ayuda: string;
  tablas: readonly string[];
};

export const AREAS: readonly Area[] = [
  {
    clave: "ventas",
    etiqueta: "Ventas y documentos",
    ayuda: "Hacer cotizaciones, guías de remisión y facturas.",
    tablas: [
      "cotizaciones",
      "cotizacion_items",
      "guias_remision",
      "guia_items",
      "comprobantes",
      "comprobante_items",
      "comprobante_cuotas",
      // Los textos con los que se manda una cotización por WhatsApp. Van aquí
      // y no en «Avisos»: quien los escribe es quien vende.
      "plantillas_mensaje",
    ],
  },
  {
    clave: "clientes",
    etiqueta: "Clientes y cobranza",
    ayuda: "Dar de alta clientes, anotar pagos y gestiones de cobro.",
    tablas: ["clientes", "cliente_contactos", "pagos", "gestiones_cobranza"],
  },
  {
    clave: "transporte",
    etiqueta: "Transporte",
    ayuda: "Agencias, conductores y vehículos que salen en la guía de remisión.",
    tablas: ["agencias_transporte", "conductores", "vehiculos"],
  },
  {
    clave: "catalogo",
    etiqueta: "Catálogo de productos",
    ayuda: "Crear y editar productos, marcas, familias y equivalencias. Aquí viven los precios de venta.",
    tablas: [
      "productos",
      "marcas",
      "familias",
      "subfamilias",
      "tipos",
      "producto_equivalencias",
      "unidades_medida",
    ],
  },
  {
    clave: "almacen",
    etiqueta: "Almacén y stock",
    ayuda: "Recibir mercadería y mover existencias.",
    tablas: [
      "stock",
      "movimientos_inventario",
      "recepciones",
      "recepcion_items",
      // Los papeles que manda el proveedor con la mercadería (migración 050).
      "recepcion_adjuntos",
    ],
  },
  {
    clave: "compras",
    etiqueta: "Compras y proveedores",
    ayuda: "Proveedores, órdenes de compra y gastos de importación. Aquí se ven los costos.",
    tablas: [
      "proveedores",
      "proveedor_marcas",
      "compras",
      "compra_items",
      "gastos_importacion",
      // Quién vende qué y a qué precio. Se llena sola con cada ronda (046).
      "proveedor_productos",
    ],
  },
  {
    clave: "consultas",
    etiqueta: "Traer datos por RUC o DNI",
    ayuda: "Usar el botón que busca la razón social en SUNAT y RENIEC.",
    tablas: ["consultas_cache", "consultas_cuota", "consultas_log"],
  },
  {
    clave: "configuracion",
    etiqueta: "Datos de la empresa y series",
    ayuda: "Cambiar los datos fiscales y la numeración de los documentos.",
    tablas: [
      "empresa",
      "series_documento",
      "motivos_traslado",
      "motivos_nota",
      // Las cuentas que se imprimen en la cotización (064).
      "cuentas_bancarias",
    ],
  },
  {
    clave: "avisos",
    etiqueta: "Avisos y bitácora",
    ayuda: "Marcar avisos como vistos y dejar rastro de lo que se hace.",
    tablas: ["alertas", "actividad", "fallos"],
  },
];

/** Una fila de la matriz tal como está guardada. */
export type PermisoGuardado = { tabla: string; rol: Rol; escribir: boolean };

/** Cómo se ve un área para un rol: todo, nada, o a medias. */
export type EstadoArea = "todo" | "nada" | "mezcla";

/**
 * En qué estado está un área para un rol.
 *
 * «Mezcla» existe porque la matriz se sembró tabla a tabla (007) y nada obliga
 * a que un área esté entera. Enseñarlo como un simple sí/no mentiría, y al
 * primer clic se llevaría por delante permisos que alguien puso a mano.
 */
export function estadoDelArea(
  area: Area,
  rol: Rol,
  guardados: readonly PermisoGuardado[],
): EstadoArea {
  const puestos = new Set(
    guardados.filter((p) => p.rol === rol && p.escribir).map((p) => p.tabla),
  );
  const conPermiso = area.tablas.filter((t) => puestos.has(t)).length;

  if (conPermiso === 0) return "nada";
  if (conPermiso === area.tablas.length) return "todo";
  return "mezcla";
}

/**
 * Las tablas que están en la matriz y en ningún área.
 *
 * No devuelve nunca nada hoy. Lo devolverá el día que alguien añada una tabla
 * a `permisos_rol` y se olvide de esta pantalla — y entonces saldrá en la
 * pantalla en vez de quedarse invisible, que es el fallo que este proyecto
 * comete una y otra vez.
 */
export function tablasSinArea(guardados: readonly PermisoGuardado[]): string[] {
  const clasificadas = new Set(AREAS.flatMap((a) => a.tablas));
  const sueltas = new Set(
    guardados.map((p) => p.tabla).filter((t) => !clasificadas.has(t)),
  );
  return [...sueltas].sort();
}
