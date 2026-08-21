import type { Rol } from "@rodatech/config";

export interface ItemNav {
  etiqueta: string;
  ruta: string;
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
      { etiqueta: "Tablero", ruta: "/dashboard" },
      { etiqueta: "Cotizaciones", ruta: "/cotizaciones" },
      { etiqueta: "Guías de remisión", ruta: "/guias" },
      { etiqueta: "Facturación", ruta: "/facturacion" },
      { etiqueta: "Cobranzas", ruta: "/cobranzas", roles: ["gerencia", "admin", "cobranzas"] },
    ],
  },
  {
    titulo: "Catálogo",
    items: [
      { etiqueta: "Productos", ruta: "/productos" },
      // Quien mantiene el maestro es Compras; gerencia y admin pueden todo.
      {
        etiqueta: "Cargar productos",
        ruta: "/productos/cargar",
        roles: ["gerencia", "admin", "compras"],
      },
      { etiqueta: "Equivalencias", ruta: "/equivalencias" },
      { etiqueta: "Clientes", ruta: "/clientes" },
      { etiqueta: "Proveedores", ruta: "/proveedores", roles: ["gerencia", "admin", "compras"] },
    ],
  },
  {
    titulo: "Almacén",
    items: [
      { etiqueta: "Inventario", ruta: "/inventario" },
      { etiqueta: "Kardex", ruta: "/inventario/kardex" },
      { etiqueta: "Recepciones", ruta: "/recepciones", roles: ["gerencia", "admin", "almacen", "compras"] },
      // El cuadre lo pidió Willy como "un botón que se usa con cuidado" (26:49).
      { etiqueta: "Ajuste de inventario", ruta: "/inventario/ajuste", roles: ["gerencia"] },
    ],
  },
  {
    titulo: "Abastecimiento",
    items: [
      { etiqueta: "Compras", ruta: "/compras", roles: ["gerencia", "admin", "compras"] },
      { etiqueta: "Importaciones", ruta: "/importaciones", roles: ["gerencia", "admin", "compras"] },
    ],
  },
  {
    titulo: "Gestión",
    items: [
      { etiqueta: "Reportes", ruta: "/reportes", roles: ["gerencia", "admin"] },
      { etiqueta: "Alertas", ruta: "/alertas" },
      { etiqueta: "Configuración", ruta: "/configuracion", roles: ["gerencia", "admin"] },
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
