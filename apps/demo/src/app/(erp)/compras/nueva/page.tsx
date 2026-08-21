import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient, getSesion } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { ConstructorOrdenCompra } from "./constructor";

export const metadata: Metadata = { title: "Nueva orden de compra" };
export const dynamic = "force-dynamic";

export default async function NuevaOrdenCompraPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; proveedor?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const sesion = await getSesion();

  const [{ data: proveedores }, { data: almacenes }, { data: sugerencias }] = await Promise.all([
    supabase
      .from("proveedores")
      .select("id, codigo, razon_social, ruc, tipo, pais, moneda, contacto, email, dias_pago, lead_time_dias, marcas_provee")
      .eq("activo", true)
      .order("tipo")
      .order("razon_social"),
    supabase.from("almacenes").select("id, codigo, nombre").eq("activo", true).order("codigo"),
    // El análisis de reposición trae la sugerencia con los números que la sustentan
    supabase.rpc("analisis_reposicion", { p_horizonte_dias: 45, p_limite: 60 }),
  ]);

  return (
    <>
      <PageHeader
        titulo="Nueva orden de compra"
        descripcion="Abastecimiento local o del exterior. Las órdenes de importación habilitan el expediente con prorrateo de gastos para obtener el costo puesto en almacén."
        acciones={
          <Link
            href="/compras"
            className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
          >
            <ArrowLeft className="size-4" />
            Volver
          </Link>
        }
      />
      <Contenedor>
        <ConstructorOrdenCompra
          proveedores={proveedores ?? []}
          almacenes={almacenes ?? []}
          sugerencias={(sugerencias ?? []) as never}
          compradorId={sesion?.perfil?.id ?? null}
          tipoInicial={sp.tipo === "importacion" ? "importacion" : "local"}
          proveedorInicial={sp.proveedor ?? null}
        />
      </Contenedor>
    </>
  );
}
