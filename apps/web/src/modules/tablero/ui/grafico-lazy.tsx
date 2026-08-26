"use client";

// Envoltorio de carga diferida.
//
// Existe solo porque `dynamic(..., { ssr: false })` no está permitido dentro de
// un Server Component en Next 15. El componente de servidor (`ventas.tsx`)
// importa este envoltorio, y este hace la carga diferida de Recharts.
//
// Con esto los ~90 kB de la librería quedan en un chunk aparte que solo se
// descarga cuando hay un gráfico en pantalla.

import dynamic from "next/dynamic";
import { Skeleton } from "@rodatech/ui";

import type { PuntoSerie } from "../api/consultas";

const Grafico = dynamic(
  () => import("./grafico-ventas").then((m) => m.GraficoVentas),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

export function GraficoVentasLazy({ meses }: { meses: PuntoSerie[] }) {
  return <Grafico meses={meses} />;
}
