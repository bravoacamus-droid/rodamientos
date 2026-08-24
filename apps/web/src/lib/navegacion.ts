import type { Rol } from "@rodatech/config";

/**
 * Los iconos del menú. Uno por ítem, ninguno decorativo.
 *
 * Es el NOMBRE, no el componente: este archivo lo importa el layout del
 * servidor, y guardar aquí un icono obligaría a marcar el módulo como cliente
 * y arrastraría los diecinueve trazos a cada página. El nombre se resuelve en
 * la barra lateral, que ya es cliente.
 */
export type NombreIcono =
  | "tablero" | "cotizacion" | "guia" | "factura" | "cobranza"
  | "producto" | "cargar" | "equivalencia" | "cliente" | "proveedor"
  | "inventario" | "kardex" | "recepcion" | "ajuste"
  | "compra" | "importacion"
  | "reporte" | "alerta" | "configuracion";

export interface ItemNav {
  etiqueta: string;
  ruta: string;
  icono: NombreIcono;
  /** Roles que ven el ítem. Vacío = todos los autenticados. */
  roles?: readonly Rol[];
}

export interface GrupoNav {
  titulo: string;
  items: readonly ItemNav[];
}

/**
 * Menú del ERP.
 *
 * Refleja el alcance v2: sin bancos, sin multi-almacén ni transferencias, sin
 * listas de precio múltiples. Ver docs/PLAN-V2.md §2.11.
 *
 * Esto es solo la navegación. Que un rol NO vea un ítem no lo protege: la
 * autorización real vive en RLS y en la validación de cada Server Action.
 */
export const NAVEGACION: readonly GrupoNav[] = [
  {
    titulo: "Operación",
    items: [
      { etiqueta: "Tablero", ruta: "/dashboard", icono: "tablero" },
      { etiqueta: "Cotizaciones", ruta: "/cotizaciones", icono: "cotizacion" },
      { etiqueta: "Guías de remisión", ruta: "/guias", icono: "guia" },
      { etiqueta: "Facturación", ruta: "/facturacion", icono: "factura" },
      { etiqueta: "Cobranzas", ruta: "/cobranzas", icono: "cobranza", roles: ["gerencia", "admin", "cobranzas"] },
    ],
  },
  {
    titulo: "Catálogo",
    items: [
      { etiqueta: "Productos", ruta: "/productos", icono: "producto" },
      // Quien mantiene el maestro es Compras; gerencia y admin pueden todo.
      {
        etiqueta: "Cargar productos",
        ruta: "/productos/cargar", icono: "cargar",
        roles: ["gerencia", "admin", "compras"],
      },
      { etiqueta: "Equivalencias", ruta: "/equivalencias", icono: "equivalencia" },
      { etiqueta: "Clientes", ruta: "/clientes", icono: "cliente" },
      { etiqueta: "Proveedores", ruta: "/proveedores", icono: "proveedor", roles: ["gerencia", "admin", "compras"] },
    ],
  },
  {
    titulo: "Almacén",
    items: [
      { etiqueta: "Inventario", ruta: "/inventario", icono: "inventario" },
      { etiqueta: "Kardex", ruta: "/inventario/kardex", icono: "kardex" },
      { etiqueta: "Recepciones", ruta: "/recepciones", icono: "recepcion", roles: ["gerencia", "admin", "almacen", "compras"] },
      // El cuadre lo pidió Willy como "un botón que se usa con cuidado" (26:49).
      { etiqueta: "Ajuste de inventario", ruta: "/inventario/ajuste", icono: "ajuste", roles: ["gerencia"] },
    ],
  },
  {
    titulo: "Abastecimiento",
    items: [
      { etiqueta: "Compras", ruta: "/compras", icono: "compra", roles: ["gerencia", "admin", "compras"] },
      { etiqueta: "Importaciones", ruta: "/importaciones", icono: "importacion", roles: ["gerencia", "admin", "compras"] },
    ],
  },
  {
    titulo: "Gestión",
    items: [
      { etiqueta: "Reportes", ruta: "/reportes", icono: "reporte", roles: ["gerencia", "admin"] },
      { etiqueta: "Alertas", ruta: "/alertas", icono: "alerta" },
      { etiqueta: "Configuración", ruta: "/configuracion", icono: "configuracion", roles: ["gerencia", "admin"] },
    ],
  },
];

/** Filtra el menú para un rol. Sin rol conocido, solo lo abierto a todos. */
export function menuPara(rol: Rol | null): GrupoNav[] {
  return NAVEGACION.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter((i) => !i.roles || (rol !== null && i.roles.includes(rol))),
  })).filter((grupo) => grupo.items.length > 0);
}
