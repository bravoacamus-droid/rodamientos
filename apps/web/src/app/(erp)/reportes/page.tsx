import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Reportes" };

export default function PaginaReportes() {
  return (
    <EnConstruccion
      titulo="Reportes"
      fase="Fase 6"
      descripcion="Tableros de análisis sobre la operación real."
      hara={[
    "Ventas contra compras por periodo",
    "Top de productos por venta y por margen",
    "Ranking de clientes y participación por sector",
    "Rentabilidad por SKU",
      ]}
    />
  );
}
