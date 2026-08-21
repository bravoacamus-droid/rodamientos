import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Clientes" };

export default function PaginaClientes() {
  return (
    <EnConstruccion
      titulo="Clientes"
      fase="Fase 1"
      descripcion="Cartera de clientes con consulta automática de RUC."
      hara={[
    "Alta pegando el RUC: los datos se traen solos vía Decolecta",
    "Control de cuota propio — son 100 consultas gratis al mes y no se pueden quemar sin aviso",
    "Si la cuota se agota, el alta sigue funcionando a mano en vez de romperse",
    "Condición de pago, días de crédito y línea de crédito por cliente",
      ]}
    />
  );
}
