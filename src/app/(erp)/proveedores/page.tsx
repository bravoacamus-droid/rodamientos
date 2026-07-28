import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Factory, Ship, Truck, Clock, Mail, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { Card, CardHeader, CardTitle, CardContent, Badge, EmptyState, SkeletonTable } from "@/components/ui/primitives";
import { MiniStat } from "@/components/ui/kpi";
import { money, num, fecha } from "@/lib/utils";

export const metadata: Metadata = { title: "Proveedores" };
export const dynamic = "force-dynamic";

async function Listado() {
  const supabase = await createClient();
  const [{ data: proveedores }, { data: ordenes }] = await Promise.all([
    supabase.from("proveedores").select("*").eq("activo", true).order("tipo").order("razon_social"),
    supabase.from("ordenes_compra").select("proveedor_id, total, moneda, fecha, estado"),
  ]);

  const provs = proveedores ?? [];
  const compras = ordenes ?? [];

  const stats = (id: string) => {
    const suyas = compras.filter((o) => o.proveedor_id === id && o.estado !== "anulada");
    return {
      ordenes: suyas.length,
      total: suyas.reduce((s, o) => s + Number(o.total) * (o.moneda === "USD" ? 3.755 : 1), 0),
      ultima: suyas.map((o) => o.fecha).sort().at(-1) ?? null,
    };
  };

  const locales = provs.filter((p) => p.tipo === "local");
  const exterior = provs.filter((p) => p.tipo === "importacion");

  if (!provs.length) {
    return (
      <Card>
        <EmptyState icon={<Factory />} titulo="Sin proveedores registrados" />
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Proveedores activos" valor={num(provs.length, 0)} icon={<Factory />} />
        <MiniStat label="Proveedores locales" valor={num(locales.length, 0)} icon={<Truck />} tono="brand" />
        <MiniStat label="Del exterior" valor={num(exterior.length, 0)} icon={<Ship />} tono="warning" />
        <MiniStat
          label="Compras acumuladas"
          valor={money(compras.filter((o) => o.estado !== "anulada").reduce((s, o) => s + Number(o.total) * (o.moneda === "USD" ? 3.755 : 1), 0))}
          icon={<Clock />}
          tono="success"
        />
      </div>

      {[
        { titulo: "Proveedores locales", desc: "Abastecimiento inmediato para reposición y pedidos de emergencia", items: locales, icono: <Truck className="size-4 text-subtle" /> },
        { titulo: "Proveedores del exterior", desc: "Importación directa con cálculo de costo puesto en almacén", items: exterior, icono: <Ship className="size-4 text-subtle" /> },
      ].map((grupo) => (
        <Card key={grupo.titulo}>
          <CardHeader>
            <div>
              <CardTitle>{grupo.titulo}</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">{grupo.desc}</p>
            </div>
            {grupo.icono}
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {grupo.items.map((p) => {
              const s = stats(p.id);
              return (
                <div key={p.id} className="rounded-lg border p-3.5 transition-colors hover:border-brand-300">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold text-fg">{p.razon_social}</p>
                      <p className="text-[10.5px] text-subtle tabular">
                        {p.codigo}{p.ruc ? ` · RUC ${p.ruc}` : ""}
                      </p>
                    </div>
                    <Badge tone={p.tipo === "importacion" ? "accent" : "neutral"} size="xs">
                      {p.pais}
                    </Badge>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {(p.marcas_provee ?? []).map((m: string) => (
                      <Badge key={m} tone="brand" size="xs">{m}</Badge>
                    ))}
                  </div>

                  <div className="mt-3 space-y-1 border-t pt-2.5 text-[11px] text-muted">
                    <p className="flex items-center gap-1.5">
                      <Mail className="size-3 shrink-0" />
                      <span className="truncate">{p.email ?? "—"}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Phone className="size-3 shrink-0" />
                      {p.telefono ?? "—"}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Clock className="size-3 shrink-0" />
                      Lead time {p.lead_time_dias} días · pago {p.dias_pago === 0 ? "contado" : `${p.dias_pago} días`}
                    </p>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-2.5">
                    {[
                      ["Órdenes", num(s.ordenes, 0)],
                      ["Comprado", money(s.total)],
                      ["Última", s.ultima ? fecha(s.ultima) : "—"],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <p className="text-[9.5px] uppercase tracking-wide text-subtle">{k}</p>
                        <p className="truncate text-[11.5px] font-semibold text-fg tabular">{v}</p>
                      </div>
                    ))}
                  </div>

                  <Link
                    href={`/compras?q=&tipo=${p.tipo}`}
                    className="mt-3 block text-[11px] font-medium text-brand-600 hover:underline"
                  >
                    Ver órdenes de compra →
                  </Link>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </>
  );
}

export default function ProveedoresPage() {
  return (
    <>
      <PageHeader
        titulo="Proveedores"
        descripcion="Cartera de abastecimiento local y del exterior con marcas representadas, lead time y condiciones de pago."
      />
      <Contenedor className="space-y-4">
        <Suspense fallback={<SkeletonTable rows={6} cols={4} />}>
          <Listado />
        </Suspense>
      </Contenedor>
    </>
  );
}
