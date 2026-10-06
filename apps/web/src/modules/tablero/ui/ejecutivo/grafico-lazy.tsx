"use client";

// Recharts aparte, como en el resto del tablero (`../grafico-lazy.tsx`): un
// Server Component no puede pedir `dynamic(..., { ssr: false })`.

import dynamic from "next/dynamic";
import { Skeleton } from "@rodatech/ui";

export type { Formato, SerieGrafico } from "./graficos";

export const GraficoBarras = dynamic(() => import("./graficos").then((m) => m.GraficoBarras), {
  ssr: false,
  loading: () => <Skeleton className="h-[280px] w-full" />,
});
