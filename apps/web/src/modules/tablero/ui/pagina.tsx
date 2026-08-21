import { Suspense } from "react";
import { Skeleton } from "@rodatech/ui";

import { PanelAlertas } from "./panel-alertas";
import { PanelCartera } from "./panel-cartera";
import { SeccionVentas } from "./ventas";

/**
 * Tablero.
 *
 * Conserva la composición de la demo: indicadores del mes, evolución de venta
 * y margen, cartera y alertas prioritarias.
 *
 * Cada bloque va en su propio Suspense y consulta por separado. Así el panel
 * de alertas aparece sin esperar a que se agreguen 12 meses de ventas, en vez
 * de que toda la pantalla quede en blanco hasta que la más lenta termine.
 */
export default function PaginaTablero() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tablero</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Cómo va el mes, la cartera y lo que necesita atención.
        </p>
      </div>

      <Suspense fallback={<Skeleton className="h-[26rem] w-full" />}>
        <SeccionVentas />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <PanelCartera />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <PanelAlertas />
        </Suspense>
      </div>
    </div>
  );
}
