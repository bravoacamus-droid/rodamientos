import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { FormularioMovimientos } from "./formulario";

export const metadata: Metadata = { title: "Ingresos y ajustes" };
export const dynamic = "force-dynamic";

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: almacenes }, { data: precargado }] = await Promise.all([
    supabase.from("almacenes").select("id, codigo, nombre").eq("activo", true).order("codigo"),
    sp.producto
      ? supabase
          .from("v_stock_productos")
          .select("id, sku, descripcion, unidad, costo_promedio, stock_total")
          .eq("id", sp.producto)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <>
      <PageHeader
        titulo="Ingresos y ajustes de inventario"
        descripcion="Registro individual ítem por ítem o carga masiva por lote. Cada movimiento alimenta el kardex valorizado y recalcula el costo promedio ponderado."
        acciones={
          <Link
            href="/inventario"
            className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
          >
            <ArrowLeft className="size-4" />
            Volver a stock
          </Link>
        }
      />
      <Contenedor>
        <FormularioMovimientos
          almacenes={almacenes ?? []}
          precargado={precargado ?? null}
        />
      </Contenedor>
    </>
  );
}
