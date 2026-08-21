"use client";
/*
 * "use client" OBLIGATORIO: llama a `router.refresh()`.
 *
 * Está en su propio archivo —y no dentro de estado-error.tsx— justamente para
 * que `EstadoError` siga siendo un Server Component. Así el bloque de error se
 * puede renderizar desde un `error.tsx` o desde una página de servidor sin
 * arrastrar nada más al bundle: lo único que viaja al navegador es este botón.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

import { Button } from "../primitivas/button";

export function BotonReintentar({ etiqueta = "Reintentar" }: { etiqueta?: string }) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = React.useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      loading={pendiente}
      onClick={() => iniciarTransicion(() => router.refresh())}
    >
      {!pendiente && <RotateCw />}
      {etiqueta}
    </Button>
  );
}
