import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Ship, Anchor, Container, TrendingUp, Percent } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge, EmptyState, SkeletonTable, Progress } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { MiniStat } from "@/components/ui/kpi";
import { money, num, pct, fecha } from "@/lib/utils";

export const metadata: Metadata = { title: "Importaciones" };
export const dynamic = "force-dynamic";

const ETAPAS = ["registrada", "embarcada", "en_aduana", "nacionalizada", "recibida"];

async function Listado() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("importaciones")
    .select(
      "*, ordenes_compra(id, numero, moneda), proveedores(razon_social, pais)"
    )
    .order("fecha_embarque", { ascending: false });

  const imps = data ?? [];
  if (!imps.length) {
    return (
      <Card>
        <EmptyState icon={<Ship />} titulo="Sin importaciones registradas" />
      </Card>
    );
  }

  const totalFob = imps.reduce((s, i) => s + Number(i.valor_fob), 0);
  const totalGastos = imps.reduce((s, i) => s + Number(i.total_gastos), 0);
  const enCurso = imps.filter((i) => i.estado !== "recibida");
  const factorProm = imps.reduce((s, i) => s + Number(i.factor_landed), 0) / imps.length;

  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Valor FOB acumulado" valor={money(totalFob)} icon={<Container />} tono="brand" />
        <MiniStat label="Gastos de nacionalización" valor={money(totalGastos)} icon={<Anchor />} tono="warning" />
        <MiniStat label="Factor landed promedio" valor={`×${factorProm.toFixed(3)}`} icon={<TrendingUp />} />
        <MiniStat label="Embarques en curso" valor={num(enCurso.length, 0)} icon={<Ship />} tono={enCurso.length ? "warning" : "success"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {imps.map((i) => {
          const oc = i.ordenes_compra as unknown as { id: string; numero: string; moneda: string } | null;
          const prov = i.proveedores as unknown as { razon_social: string; pais: string } | null;
          const etapa = ETAPAS.indexOf(i.estado);
          const incremento = (Number(i.factor_landed) - 1) * 100;
          return (
            <Link key={i.id} href={`/importaciones/${i.id}`}>
              <Card hover className="h-full p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold text-brand-700">{i.numero}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted">{prov?.razon_social}</p>
                  </div>
                  <EstadoBadge tipo="importacion" valor={i.estado} size="xs" />
                </div>

                <div className="mt-3">
                  <Progress value={etapa + 1} max={ETAPAS.length} tone={i.estado === "recibida" ? "success" : "brand"} />
                  <div className="mt-1.5 flex justify-between text-[9.5px] uppercase tracking-wide text-subtle">
                    <span>Embarque</span>
                    <span>Aduana</span>
                    <span>Almacén</span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-y-2 border-t pt-3">
                  {[
                    ["Valor FOB", money(i.valor_fob)],
                    ["Gastos", money(i.total_gastos)],
                    ["Costo en almacén", money(i.costo_total_almacen)],
                    ["Incremento", pct(incremento)],
                  ].map(([k, v], idx) => (
                    <div key={k}>
                      <p className="text-[10px] uppercase tracking-wide text-subtle">{k}</p>
                      <p
                        className="text-[12.5px] font-semibold tabular"
                        style={{ color: idx === 3 ? "var(--warn)" : "var(--fg)" }}
                      >
                        {v}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-[10.5px] text-subtle">
                  <span>{oc?.numero}</span>
                  <span>{i.puerto_origen} → {i.puerto_destino}</span>
                </div>
                <div className="mt-1 text-[10.5px] text-subtle">
                  Llegada estimada: {fecha(i.fecha_llegada)}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export default function ImportacionesPage() {
  return (
    <>
      <PageHeader
        titulo="Importaciones y costo puesto en almacén"
        descripcion="Expedientes de importación con prorrateo automático de flete, seguro, derechos arancelarios, IPM, agente de aduana, almacenaje portuario y transporte interno hasta el costo final por ítem."
        acciones={
          <Link
            href="/compras?tipo=importacion"
            className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
          >
            <Container className="size-4" />
            Órdenes del exterior
          </Link>
        }
      />
      <Contenedor className="space-y-4">
        <Suspense fallback={<SkeletonTable rows={6} cols={5} />}>
          <Listado />
        </Suspense>
      </Contenedor>
    </>
  );
}
