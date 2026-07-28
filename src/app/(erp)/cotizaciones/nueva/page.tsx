import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient, getSesion } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { ConstructorCotizacion } from "./constructor";

export const metadata: Metadata = { title: "Nueva cotización" };
export const dynamic = "force-dynamic";

export default async function NuevaCotizacionPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string; cliente?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const sesion = await getSesion();

  const [{ data: clientes }, { data: precargado }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, codigo, razon_social, ruc, contacto, lista_precio, dias_credito, linea_credito, distrito")
      .eq("activo", true)
      .order("razon_social"),
    sp.producto
      ? supabase.rpc("buscar_productos", { p_q: sp.producto, p_limit: 1 })
      : Promise.resolve({ data: null }),
  ]);

  let inicial = null;
  if (sp.producto) {
    const { data } = await supabase
      .from("v_stock_productos")
      .select("id, sku, codigo_fabricante, descripcion, marca, categoria, stock_total, precio_mayorista, precio_fabrica, precio_importacion, costo_promedio, estado_stock, unidad")
      .eq("id", sp.producto)
      .maybeSingle();
    if (data) inicial = data;
  }
  void precargado;

  return (
    <>
      <PageHeader
        titulo="Nueva cotización"
        descripcion="Cotización inteligente: el sistema muestra el precio vigente, el historial de precios con este cliente y el margen de cada línea en tiempo real."
        acciones={
          <Link
            href="/cotizaciones"
            className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
          >
            <ArrowLeft className="size-4" />
            Volver
          </Link>
        }
      />
      <Contenedor>
        <ConstructorCotizacion
          clientes={clientes ?? []}
          vendedorId={sesion?.perfil?.id ?? null}
          clienteInicial={sp.cliente ?? null}
          productoInicial={inicial}
        />
      </Contenedor>
    </>
  );
}
