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
  | "compra" | "porcomprar" | "importacion"
  | "reporte" | "alerta" | "bitacora" | "configuracion";

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
      // Antes que «Compras» a propósito: es la pantalla desde la que se
      // empieza. Willy no abre el ERP para registrar una compra, la abre
      // para saber qué le falta.
      { etiqueta: "Por comprar", ruta: "/compras/por-comprar", icono: "porcomprar", roles: ["gerencia", "admin", "compras"] },
      { etiqueta: "Compras", ruta: "/compras", icono: "compra", roles: ["gerencia", "admin", "compras"] },
      { etiqueta: "Importaciones", ruta: "/importaciones", icono: "importacion", roles: ["gerencia", "admin", "compras"] },
    ],
  },
  {
    titulo: "Gestión",
    items: [
      { etiqueta: "Reportes", ruta: "/reportes", icono: "reporte", roles: ["gerencia", "admin"] },
      { etiqueta: "Alertas", ruta: "/alertas", icono: "alerta" },
      // Dice quién hizo qué, así que la ve quien responde de ello.
      { etiqueta: "Qué ha pasado", ruta: "/actividad", icono: "bitacora", roles: ["gerencia", "admin"] },
      { etiqueta: "Configuración", ruta: "/configuracion", icono: "configuracion", roles: ["gerencia", "admin"] },
    ],
  },
];

/**
 * Cuál de los ítems del menú corresponde a la ruta actual.
 *
 * Gana el MÁS ESPECÍFICO. Con `/compras` y `/compras/por-comprar` en la
 * misma lista, un simple «empieza por» marcaría los dos a la vez, y un menú
 * con dos ítems encendidos no dice dónde estás: dice que el menú está roto.
 * Pasaba ya con `/inventario` contra `/inventario/kardex` y con `/productos`
 * contra `/productos/cargar`.
 *
 * Devuelve la ruta del ítem, o null si ninguno encaja —una pantalla que no
 * está en el menú, como el detalle de un cliente— y entonces no se marca
 * nada, que es la verdad.
 */
export function rutaActiva(
  ruta: string,
  grupos: readonly GrupoNav[] = NAVEGACION,
): string | null {
  let mejor: string | null = null;
  for (const grupo of grupos) {
    for (const item of grupo.items) {
      const encaja = ruta === item.ruta || ruta.startsWith(item.ruta + "/");
      if (encaja && (mejor === null || item.ruta.length > mejor.length)) {
        mejor = item.ruta;
      }
    }
  }
  return mejor;
}

/** Filtra el menú para un rol. Sin rol conocido, solo lo abierto a todos. */
export function menuPara(rol: Rol | null): GrupoNav[] {
  return NAVEGACION.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter((i) => !i.roles || (rol !== null && i.roles.includes(rol))),
  })).filter((grupo) => grupo.items.length > 0);
}
