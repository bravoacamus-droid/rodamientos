import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Recepciones" };

export default function PaginaRecepciones() {
  return (
    <EnConstruccion
      titulo="Recepciones"
      fase="Fase 3"
      descripcion="Recepción de mercadería. Es aquí donde el stock entra, no con la orden ni con la factura."
      hara={[
    "Recepción total o parcial, con el pendiente calculado",
    "Actualiza stock y costo promedio en una sola operación por lote, no una llamada por línea",
    "Regulariza automáticamente las ventas por reponer que estaban esperando",
      ]}
    />
  );
}
