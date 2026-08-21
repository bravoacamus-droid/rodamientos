import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Cobranzas" };

export default function PaginaCobranzas() {
  return (
    <EnConstruccion
      titulo="Cobranzas"
      fase="Fase 4"
      descripcion="Cartera, pagos y seguimiento del crédito por cliente."
      hara={[
    "Aging de cartera: 1-15, 16-30, 31-60 y más de 60 días",
    "Pagos parciales que reparten sobre las cuotas, de la más antigua a la más nueva",
    "Línea de crédito y plazo por cliente, con aviso al excederse",
    "Gestiones de cobranza y estado de cuenta en PDF",
      ]}
    />
  );
}
