import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Equivalencias" };

export default function PaginaEquivalencias() {
  return (
    <EnConstruccion
      titulo="Equivalencias"
      fase="Fase 2"
      descripcion="Cross-reference entre marcas: se busca un código y salen sus equivalentes."
      hara={[
    "Equivalencias explícitas entre marcas, en ambos sentidos",
    "Cuando no hay equivalencia declarada, cae a la tipo con banda de precio y luego a la subfamilia",
    "Ordena por disponibilidad: primero lo que hay en stock",
      ]}
    />
  );
}
