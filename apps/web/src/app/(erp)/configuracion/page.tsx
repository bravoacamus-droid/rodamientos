import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Configuración" };

export default function PaginaConfiguracion() {
  return (
    <EnConstruccion
      titulo="Configuración"
      fase="Fase 1"
      descripcion="Datos de la empresa, series, catálogos y usuarios."
      hara={[
    "Datos fiscales de Rodatech para los comprobantes",
    "Series y correlativos, con el número inicial de cada una",
    "Marcas, familias, subfamilias, tipos y unidades",
    "Usuarios y su rol",
    "Certificado digital y credenciales SUNAT",
      ]}
    />
  );
}
