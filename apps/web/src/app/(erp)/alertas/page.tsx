import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Alertas" };

export default function PaginaAlertas() {
  return (
    <EnConstruccion
      titulo="Alertas"
      fase="Fase 3"
      descripcion="Motor de reglas sobre la operación. La diferencia con la demo: estas notifican."
      hara={[
    "Stock por agotarse y reposición sugerida por rotación",
    "Sobrestock y capital inmovilizado",
    "Créditos vencidos y por vencer, y línea de crédito excedida",
    "Margen bajo en una cotización",
    "Llegan al usuario en vez de esperar a que entre a mirar",
      ]}
    />
  );
}
