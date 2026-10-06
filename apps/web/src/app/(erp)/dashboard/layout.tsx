import { Suspense } from "react";

import { PestanasTablero } from "@/modules/tablero";

/**
 * La cabecera común de las cuatro vistas del tablero (06/10): el título y las
 * pestañas. Cada vista trae debajo su propio filtro, porque Resumen abre en
 * «este mes» y las otras tres en «los últimos 12 meses».
 */
export default function LayoutTablero({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tablero</h1>
          <p className="text-base text-[var(--fg-muted)]">
            Cómo va el negocio: en general, por clientes, por cotizaciones y por facturación.
          </p>
        </div>
        {/* useSearchParams pide su Suspense; el hueco tiene la altura de las pestañas. */}
        <Suspense fallback={<div className="h-11" />}>
          <PestanasTablero />
        </Suspense>
      </div>
      {children}
    </div>
  );
}
