import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Importaciones" };

export default function PaginaImportaciones() {
  return (
    <EnConstruccion
      titulo="Importaciones"
      fase="Fase 3"
      descripcion="Compras del exterior. Versión simple: son envíos pequeños por DHL, no contenedores."
      hara={[
    "Registro de gastos de importación: flete, seguro y aduana",
    "Prorrateo sobre el costo unitario puesto en almacén",
    "Sin el landed cost completo de la demo, que no corresponde a cómo se compra",
      ]}
    />
  );
}
