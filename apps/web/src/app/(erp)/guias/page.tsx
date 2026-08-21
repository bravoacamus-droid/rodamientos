import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Guías de remisión" };

export default function PaginaGuias() {
  return (
    <EnConstruccion
      titulo="Guías de remisión"
      fase="Fase 5"
      descripcion="Guía de remisión electrónica. Es el módulo que no existía en la demo y el de mayor riesgo técnico."
      hara={[
    "Generar la guía desde una cotización aprobada, arrastrando el número de orden de compra del cliente",
    "Ubigeo con autocompletado: se escribe parte del distrito y la dirección se concatena",
    "Peso obligatorio por ítem — se precarga desde el maestro de productos",
    "Transportista privado por defecto, con placa y conductor",
    "Emisión ante SUNAT por API REST con OAuth2 (la GRE es obligatoria desde el 01/07/2026)",
    "Anular: SUNAT no tiene API de baja, así que el ERP marca el estado y guía al portal SOL",
      ]}
    />
  );
}
