import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Proveedores" };

export default function PaginaProveedores() {
  return (
    <EnConstruccion
      titulo="Proveedores"
      fase="Fase 1"
      descripcion="Proveedores locales y del exterior."
      hara={[
    "Alta por RUC igual que clientes",
    "Marcas que provee cada uno, para sugerir a quién comprarle al reponer",
    "País: distinto de Perú marca la compra como importación",
      ]}
    />
  );
}
