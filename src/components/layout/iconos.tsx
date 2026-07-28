/**
 * Registro explícito de los íconos de navegación.
 * Evita `import * as Icons from "lucide-react"`, que arrastra la librería
 * completa al bundle compartido de toda la aplicación.
 */
import {
  LayoutDashboard, Bell, Boxes, ArrowLeftRight, Warehouse, ScrollText,
  PackagePlus, FileText, ClipboardList, ReceiptText, Building2, ShoppingCart,
  Ship, Factory, Wallet, ChartNoAxesCombined, Settings, Circle,
  type LucideIcon,
} from "lucide-react";

export const ICONOS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Bell,
  Boxes,
  ArrowLeftRight,
  Warehouse,
  ScrollText,
  PackagePlus,
  FileText,
  ClipboardList,
  ReceiptText,
  Building2,
  ShoppingCart,
  Ship,
  Factory,
  Wallet,
  ChartNoAxesCombined,
  Settings,
};

export function iconoNav(nombre: string): LucideIcon {
  return ICONOS[nombre] ?? Circle;
}
