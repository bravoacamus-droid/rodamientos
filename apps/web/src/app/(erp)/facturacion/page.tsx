import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Facturación" };

export default function PaginaFacturacion() {
  return (
    <EnConstruccion
      titulo="Facturación"
      fase="Fase 4"
      descripcion="Comprobantes electrónicos ante SUNAT. El conector ya está portado y con 88 pruebas en verde."
      hara={[
    "Factura, boleta, nota de crédito y nota de débito",
    "Correlativos que continúan desde el número del sistema actual, no desde cero",
    "Detracción y retención (SPOT) con su texto legal en el documento",
    "Contado o crédito con cuotas: 30 días lo normal, hasta 60",
    "Arrastra número de cotización, orden de compra y guía",
    "Estado de envío, ticket y CDR guardados por comprobante",
      ]}
    />
  );
}
