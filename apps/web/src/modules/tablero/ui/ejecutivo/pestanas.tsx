"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FileText, LayoutDashboard, Receipt, Users } from "lucide-react";

/**
 * Las cuatro vistas del tablero.
 *
 * Luis, 06/10: *«vamos a manejar los dashboards correspondientes […] por
 * módulos»*. Son pestañas y no cuatro entradas del menú porque son la MISMA
 * pregunta —cómo va el negocio— mirada desde cuatro sitios, con el mismo
 * filtro de fechas: al cambiar de pestaña el periodo se conserva.
 *
 * Con aspecto de botón, no de enlace subrayado (CLAUDE.md §1): cada una con
 * su icono, su borde y la elegida rellena. En el teléfono, dos por fila.
 */

const PESTANAS = [
  { ruta: "/dashboard", texto: "Resumen", icono: LayoutDashboard },
  { ruta: "/dashboard/clientes", texto: "Clientes", icono: Users },
  { ruta: "/dashboard/cotizaciones", texto: "Cotizaciones", icono: FileText },
  { ruta: "/dashboard/facturacion", texto: "Facturación", icono: Receipt },
] as const;

/** Lo que viaja de una pestaña a otra: el periodo y la comparación. */
const CONSERVAR = ["atajo", "desde", "hasta", "grano", "comparar", "cliente"];

export function PestanasTablero() {
  const ruta = usePathname();
  const params = useSearchParams();

  const query = new URLSearchParams();
  for (const k of CONSERVAR) {
    const v = params.get(k);
    if (v) query.set(k, v);
  }
  const q = query.toString();

  return (
    <nav aria-label="Vistas del tablero" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {PESTANAS.map(({ ruta: r, texto, icono: Icono }) => {
        const activa = ruta === r;
        return (
          <Link
            key={r}
            href={q ? `${r}?${q}` : r}
            aria-current={activa ? "page" : undefined}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-base font-semibold transition-colors sm:justify-start ${
              activa
                ? "border-brand-600 bg-brand-600 text-white shadow-sm dark:border-brand-500 dark:bg-brand-500"
                : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--fg)] hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950"
            }`}
          >
            <Icono className="size-5 shrink-0" aria-hidden="true" />
            {texto}
          </Link>
        );
      })}
    </nav>
  );
}
