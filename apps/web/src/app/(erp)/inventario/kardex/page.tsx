import type { Metadata } from "next";
import { EnConstruccion } from "@/componentes/en-construccion";

export const metadata: Metadata = { title: "Kardex" };

export default function PaginaKardex() {
  return (
    <EnConstruccion
      titulo="Kardex"
      fase="Fase 3"
      descripcion="Historia valorizada de cada producto, solo de lectura."
      hara={[
    "Todo movimiento con su costo y su saldo después de aplicarlo",
    "Costo promedio ponderado recalculado en cada entrada",
    "Trazabilidad hasta el documento que originó el movimiento",
      ]}
    />
  );
}
