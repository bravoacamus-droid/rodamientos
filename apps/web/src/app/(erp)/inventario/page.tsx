import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Inventario" };

export default function PaginaInventario() {
  return (
    <EnConstruccion
      titulo="Inventario"
      fase="Fase 3"
      descripcion="Existencias valorizadas de un solo almacén. La demo tenía multi-almacén; se quitó porque hay una sola sede."
      hara={[
    "Stock actual valorizado, con costo promedio ponderado",
    "Alertas de quiebre y de sobrestock — el capital inmovilizado también avisa",
    "Valorización del inventario, que el sistema actual no da",
    "Las alertas llegan, no hay que entrar a buscarlas",
      ]}
    />
  );
}
