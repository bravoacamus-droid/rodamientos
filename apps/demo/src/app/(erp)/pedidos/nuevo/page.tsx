import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient, getSesion } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { ConstructorPedido } from "./constructor";

export const metadata: Metadata = { title: "Nuevo pedido" };
export const dynamic = "force-dynamic";

export default async function NuevoPedidoPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; emergencia?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const sesion = await getSesion();

  const [{ data: clientes }, { data: almacenes }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, codigo, razon_social, ruc, contacto, lista_precio, dias_credito, linea_credito, distrito")
      .eq("activo", true)
      .order("razon_social"),
    supabase.from("almacenes").select("id, codigo, nombre").eq("activo", true).order("codigo"),
  ]);

  // Deuda vigente para advertir si el pedido excede la línea de crédito
  const { data: deudas } = await supabase
    .from("comprobantes")
    .select("cliente_id, saldo")
    .gt("saldo", 0)
    .neq("estado", "anulado");

  const deudaPorCliente: Record<string, number> = {};
  for (const d of deudas ?? []) {
    deudaPorCliente[d.cliente_id] = (deudaPorCliente[d.cliente_id] ?? 0) + Number(d.saldo);
  }

  return (
    <>
      <PageHeader
        titulo="Nuevo pedido"
        descripcion="Orden de venta directa, sin cotización previa. Los pedidos de emergencia permiten despachar con stock por reponer bajo aprobación administrativa."
        acciones={
          <Link
            href="/pedidos"
            className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
          >
            <ArrowLeft className="size-4" />
            Volver
          </Link>
        }
      />
      <Contenedor>
        <ConstructorPedido
          clientes={clientes ?? []}
          almacenes={almacenes ?? []}
          deudaPorCliente={deudaPorCliente}
          vendedorId={sesion?.perfil?.id ?? null}
          rol={sesion?.perfil?.rol ?? "ventas"}
          clienteInicial={sp.cliente ?? null}
          emergenciaInicial={sp.emergencia === "1"}
        />
      </Contenedor>
    </>
  );
}
