import {
  ArrowLeftRight,
  Banknote,
  Bell,
  Boxes,
  Building2,
  CarFront,
  ChartColumn,
  Factory,
  FileBadge,
  FileClock,
  FileText,
  FileUp,
  History,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
  PackageCheck,
  PackageOpen,
  PackagePlus,
  ReceiptText,
  Settings,
  Ship,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
  Tags,
  Truck,
  User,
  Users,
  ChartPie,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import type { NombreIcono } from "@/lib/navegacion";

/**
 * Los iconos del menú.
 *
 * Salen de lucide-react, como los del resto de pantallas (CLAUDE.md §5):
 * dibujados a mano no calzaban en trazo ni en tamaño con los de al lado. Van
 * con `currentColor` para que hereden el estado activo sin duplicar reglas.
 *
 * Cada uno intenta decir algo del oficio: el catálogo es una etiqueta de
 * producto, el inventario son cajas apiladas, el kardex es un historial. El
 * de equivalencias son dos flechas en sentidos contrarios: una pieza por otra.
 */

const ICONOS: Record<NombreIcono, LucideIcon> = {
  // Tablero: cuatro paneles.
  tablero: LayoutDashboard,
  // Cotización: hoja con líneas.
  cotizacion: FileText,
  // Listos para entregar: una caja con el visto puesto.
  listos: PackageCheck,
  // Guía: camión.
  guia: Truck,
  // Factura: comprobante con el borde dentado de abajo.
  factura: ReceiptText,
  // Cobranza: billete.
  cobranza: Banknote,
  // Producto: etiqueta con su perforación.
  producto: Tag,
  // Kit: una caja con lo que lleva dentro. Willy los llama por su código, así
  // que el icono solo tiene que decir «esto es un conjunto».
  kit: PackageOpen,
  // Cargar: hoja con flecha hacia arriba.
  cargar: FileUp,
  // Equivalencias: dos flechas, una pieza por otra.
  equivalencia: ArrowLeftRight,
  // Cliente: persona.
  cliente: User,
  // Proveedor: nave.
  proveedor: Factory,
  // Inventario: cajas apiladas.
  inventario: Boxes,
  // Kardex: historial, un reloj sobre una hoja.
  kardex: FileClock,
  // Recepción: caja con lo que entra.
  recepcion: PackagePlus,
  // Ajuste: dos deslizadores.
  ajuste: SlidersHorizontal,
  // Compra: carrito.
  compra: ShoppingCart,
  // Por comprar: una lista con lo que falta marcado. No es un carrito:
  // pegado al de Compras, dos carritos no se distinguen de un vistazo, y
  // esta pantalla no es comprar, es saber qué falta.
  porcomprar: ListTodo,
  // Precios: dos etiquetas de precio, que es de lo que va — comparar dos
  // ofertas de lo mismo. Un símbolo de moneda solo se confundiría con
  // cobranzas.
  precios: Tags,
  // Importación: el barco, que es por donde llega.
  importacion: Ship,
  // Bitácora: un reloj con la aguja hacia atrás.
  bitacora: History,
  // Reporte: barras.
  reporte: ChartColumn,
  // Los tres reportes del tablero (07/10): distintos de los iconos de sus
  // módulos, que están en el mismo menú, y todos con algo de gráfico.
  panelClientes: UsersRound,
  panelCotizaciones: ChartPie,
  panelFacturacion: TrendingUp,
  // Alerta: campana.
  alerta: Bell,
  // Transporte: el vehículo de frente. Distinto del camión de perfil de la
  // guía —que es el documento—: aquí se mantiene el vehículo, no el papel.
  transporte: CarFront,
  // Empresa: un edificio. La ficha fiscal de la casa.
  empresa: Building2,
  // SUNAT y numeración: un documento sellado. El sello es lo que lo distingue
  // de los otros papeles del menú: aquí se decide con qué serie sale.
  sunat: FileBadge,
  // Usuarios: dos personas. Quién entra y con qué rol.
  usuarios: Users,
  // Configuración: engranaje.
  configuracion: Settings,
};

export function IconoNav({
  nombre,
  className = "size-4",
}: {
  nombre: NombreIcono;
  className?: string;
}) {
  const Icono = ICONOS[nombre];
  // 1.7 y no el 2 de lucide: es el grosor que ya tenía el menú, y a 16-18 px
  // con dieciocho iconos en columna el trazo de 2 se lee más pesado que el
  // texto de al lado.
  return <Icono className={className} strokeWidth={1.7} aria-hidden="true" />;
}
