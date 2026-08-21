import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Compras" };

export default function PaginaCompras() {
  return (
    <EnConstruccion
      titulo="Compras"
      fase="Fase 3"
      descripcion="Compras locales. Sin orden de compra formal obligatoria, porque en la práctica no se usa."
      hara={[
    "Registro de compra directo, con o sin orden previa",
    "Enlace a la recepción, que es la que mueve el stock",
    "Historial de precios por proveedor",
      ]}
    />
  );
}
