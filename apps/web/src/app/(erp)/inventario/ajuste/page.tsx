import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Ajuste de inventario" };

export default function PaginaAjusteInventario() {
  return (
    <EnConstruccion
      titulo="Ajuste de inventario"
      fase="Fase 3"
      descripcion="El botón de cuadre. Solo gerencia, y con motivo obligatorio: es el único sitio donde el stock se mueve sin un documento detrás."
      hara={[
    "Cuadre inicial al arrancar el sistema con el stock real",
    "Corrección de descuadres puntuales, siempre con motivo",
    "Cada ajuste queda en el kardex con su autor y su fecha",
    "Restringido a gerencia en la interfaz y también en la base de datos",
      ]}
    />
  );
}
