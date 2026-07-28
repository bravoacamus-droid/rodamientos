export type Rol = "admin" | "gerencia" | "ventas" | "almacen" | "compras" | "cobranzas";

export type ItemNav = {
  href: string;
  label: string;
  icon: string;
  roles?: Rol[];
  badge?: "alertas" | "emergencias" | "vencidos";
  descripcion?: string;
  atajo?: string;
};

export type GrupoNav = {
  titulo: string;
  items: ItemNav[];
};

const TODOS: Rol[] = ["admin", "gerencia", "ventas", "almacen", "compras", "cobranzas"];

export const NAVEGACION: GrupoNav[] = [
  {
    titulo: "General",
    items: [
      {
        href: "/dashboard",
        label: "Tablero",
        icon: "LayoutDashboard",
        roles: TODOS,
        descripcion: "Indicadores, ventas, cartera y alertas",
        atajo: "g d",
      },
      {
        href: "/alertas",
        label: "Alertas",
        icon: "Bell",
        roles: TODOS,
        badge: "alertas",
        descripcion: "Recomendaciones automáticas del sistema",
      },
    ],
  },
  {
    titulo: "Catálogo",
    items: [
      {
        href: "/productos",
        label: "Maestro de productos",
        icon: "Boxes",
        roles: TODOS,
        descripcion: "1,500+ SKU con atributos técnicos y listas de precio",
        atajo: "g p",
      },
      {
        href: "/equivalencias",
        label: "Cross-Reference",
        icon: "ArrowLeftRight",
        roles: TODOS,
        descripcion: "Equivalencias entre marcas y alternativas en stock",
        atajo: "g e",
      },
    ],
  },
  {
    titulo: "Inventario",
    items: [
      {
        href: "/inventario",
        label: "Stock y almacenes",
        icon: "Warehouse",
        roles: TODOS,
        descripcion: "Existencias valorizadas por almacén",
        atajo: "g i",
      },
      {
        href: "/inventario/kardex",
        label: "Kardex valorizado",
        icon: "ScrollText",
        roles: ["admin", "gerencia", "almacen", "compras"],
        descripcion: "Trazabilidad completa de cada movimiento",
      },
      {
        href: "/inventario/movimientos",
        label: "Ingresos y ajustes",
        icon: "PackagePlus",
        roles: ["admin", "gerencia", "almacen", "compras"],
        descripcion: "Registro individual y masivo de mercadería",
      },
    ],
  },
  {
    titulo: "Comercial",
    items: [
      {
        href: "/cotizaciones",
        label: "Cotizaciones",
        icon: "FileText",
        roles: ["admin", "gerencia", "ventas", "cobranzas"],
        descripcion: "Cotización inteligente con historial de precios",
        atajo: "g c",
      },
      {
        href: "/pedidos",
        label: "Pedidos y emergencias",
        icon: "ClipboardList",
        roles: ["admin", "gerencia", "ventas", "almacen"],
        badge: "emergencias",
        descripcion: "Órdenes de venta y atención de urgencias",
      },
      {
        href: "/facturacion",
        label: "Facturación",
        icon: "ReceiptText",
        roles: ["admin", "gerencia", "ventas", "cobranzas"],
        descripcion: "Facturas, boletas y notas de crédito brandeadas",
        atajo: "g f",
      },
      {
        href: "/clientes",
        label: "Clientes",
        icon: "Building2",
        roles: ["admin", "gerencia", "ventas", "cobranzas"],
        descripcion: "Ficha comercial, crédito y consumo histórico",
      },
    ],
  },
  {
    titulo: "Abastecimiento",
    items: [
      {
        href: "/compras",
        label: "Órdenes de compra",
        icon: "ShoppingCart",
        roles: ["admin", "gerencia", "compras", "almacen"],
        descripcion: "Compras locales y del exterior",
      },
      {
        href: "/importaciones",
        label: "Importaciones",
        icon: "Ship",
        roles: ["admin", "gerencia", "compras"],
        descripcion: "Costo puesto en almacén (landed cost)",
        atajo: "g m",
      },
      {
        href: "/proveedores",
        label: "Proveedores",
        icon: "Factory",
        roles: ["admin", "gerencia", "compras"],
        descripcion: "Locales y del exterior con lead time",
      },
    ],
  },
  {
    titulo: "Finanzas",
    items: [
      {
        href: "/cobranzas",
        label: "Crédito y cobranzas",
        icon: "Wallet",
        roles: ["admin", "gerencia", "cobranzas", "ventas"],
        badge: "vencidos",
        descripcion: "Cartera, aging y estados de cuenta",
        atajo: "g b",
      },
      {
        href: "/reportes",
        label: "Reportería y BI",
        icon: "ChartNoAxesCombined",
        roles: ["admin", "gerencia", "ventas", "compras", "cobranzas"],
        descripcion: "Tableros dinámicos y proyecciones",
        atajo: "g r",
      },
    ],
  },
  {
    titulo: "Sistema",
    items: [
      {
        href: "/configuracion",
        label: "Configuración",
        icon: "Settings",
        roles: ["admin", "gerencia"],
        descripcion: "Empresa, series, usuarios y parámetros",
      },
    ],
  },
];

export function navegacionPorRol(rol: Rol | undefined): GrupoNav[] {
  if (!rol) return [];
  return NAVEGACION.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(rol)),
  })).filter((g) => g.items.length > 0);
}

export function puedeAcceder(rol: Rol | undefined, href: string): boolean {
  if (!rol) return false;
  const item = NAVEGACION.flatMap((g) => g.items).find(
    (i) => href === i.href || href.startsWith(`${i.href}/`)
  );
  if (!item) return true;
  return !item.roles || item.roles.includes(rol);
}
