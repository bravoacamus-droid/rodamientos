import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  Bell, Package, Wallet, Users, Siren, TrendingUp, ShoppingCart, Boxes,
  AlertTriangle, Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { FiltroSelect } from "@/components/ui/client";
import { Card, CardHeader, CardTitle, CardContent, Badge, EmptyState, SkeletonTable } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { MiniStat } from "@/components/ui/kpi";
import { BotonRegenerar } from "./acciones";
import { money, num, haceTiempo } from "@/lib/utils";

export const metadata: Metadata = { title: "Alertas" };
export const dynamic = "force-dynamic";

type Params = Promise<{ tipo?: string; severidad?: string }>;

const TIPOS: Record<string, { label: string; icon: React.ReactNode; desc: string }> = {
  stock_bajo:      { label: "Stock por agotarse",   icon: <Package />,       desc: "Ítems con rotación cuyo saldo cayó al mínimo" },
  stock_negativo:  { label: "Stock negativo",       icon: <AlertTriangle />, desc: "Saldos por regularizar tras atender emergencias" },
  reposicion:      { label: "Reposición sugerida",  icon: <ShoppingCart />,  desc: "Cobertura menor a 30 días según rotación" },
  sin_rotacion:    { label: "Capital inmovilizado", icon: <Boxes />,         desc: "Sin salidas en 120 días con stock valorizado" },
  credito_vencido: { label: "Créditos vencidos",    icon: <Wallet />,        desc: "Documentos con saldo pasada la fecha de pago" },
  credito_vence:   { label: "Créditos por vencer",  icon: <Wallet />,        desc: "Vencimientos dentro de los próximos 10 días" },
  linea_credito:   { label: "Línea excedida",       icon: <Users />,         desc: "Clientes por encima de su línea autorizada" },
  emergencia:      { label: "Emergencias",          icon: <Siren />,         desc: "Pedidos urgentes pendientes de autorización" },
  margen_bajo:     { label: "Margen bajo",          icon: <TrendingUp />,    desc: "Cotizaciones vigentes bajo el margen mínimo" },
};

async function Panel({ params }: { params: Params }) {
  const sp = await params;
  const supabase = await createClient();

  let consulta = supabase.from("alertas").select("*").eq("archivada", false);
  if (sp.tipo) consulta = consulta.eq("tipo", sp.tipo);
  if (sp.severidad) consulta = consulta.eq("severidad", sp.severidad);

  const [{ data: filtradas }, { data: todas }] = await Promise.all([
    consulta.order("severidad", { ascending: true }).order("valor", { ascending: false }).limit(200),
    supabase.from("alertas").select("tipo, severidad, valor").eq("archivada", false),
  ]);

  const alertas = filtradas ?? [];
  const globales = todas ?? [];

  const porTipo = Object.entries(
    globales.reduce<Record<string, number>>((acc, a) => {
      acc[a.tipo] = (acc[a.tipo] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  const criticas = globales.filter((a) => ["critica", "alta"].includes(a.severidad)).length;
  const montoCredito = globales
    .filter((a) => a.tipo === "credito_vencido")
    .reduce((s, a) => s + Number(a.valor ?? 0), 0);
  const montoInmovilizado = globales
    .filter((a) => a.tipo === "sin_rotacion")
    .reduce((s, a) => s + Number(a.valor ?? 0), 0);

  const orden = { critica: 0, alta: 1, media: 2, baja: 3, info: 4 } as Record<string, number>;
  const ordenadas = [...alertas].sort((a, b) => (orden[a.severidad] ?? 9) - (orden[b.severidad] ?? 9));

  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Alertas activas" valor={num(globales.length, 0)} icon={<Bell />} tono="brand" />
        <MiniStat label="Alta prioridad" valor={num(criticas, 0)} icon={<AlertTriangle />} tono={criticas ? "danger" : "success"} />
        <MiniStat label="Crédito vencido detectado" valor={money(montoCredito)} icon={<Wallet />} tono="warning" />
        <MiniStat label="Capital inmovilizado" valor={money(montoInmovilizado)} icon={<Boxes />} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Por tipo de regla</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Link
              href="/alertas"
              className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[12.5px] transition-colors ${
                !sp.tipo ? "bg-brand-50 font-medium text-brand-800" : "text-fg hover:bg-[var(--surface-2)]"
              }`}
            >
              <span>Todas las alertas</span>
              <Badge tone="neutral" size="xs">{globales.length}</Badge>
            </Link>
            {porTipo.map(([tipo, n]) => {
              const cfg = TIPOS[tipo];
              const activo = sp.tipo === tipo;
              return (
                <Link
                  key={tipo}
                  href={`/alertas?tipo=${tipo}`}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
                    activo ? "bg-brand-50" : "hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <span className={`shrink-0 [&_svg]:size-3.5 ${activo ? "text-brand-600" : "text-subtle"}`}>
                    {cfg?.icon ?? <Bell />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[12.5px] ${activo ? "font-medium text-brand-800" : "text-fg"}`}>
                      {cfg?.label ?? tipo}
                    </span>
                    <span className="block truncate text-[10px] text-subtle">{cfg?.desc}</span>
                  </span>
                  <Badge tone={activo ? "brand" : "neutral"} size="xs">{n}</Badge>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>
                {sp.tipo ? TIPOS[sp.tipo]?.label ?? "Alertas" : "Todas las alertas"}
              </CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {alertas.length} alerta(s) ordenadas por prioridad e impacto económico
              </p>
            </div>
            <FiltroSelect
              param="severidad"
              placeholder="Cualquier severidad"
              opciones={[
                { value: "critica", label: "Crítica" },
                { value: "alta", label: "Alta" },
                { value: "media", label: "Media" },
                { value: "baja", label: "Baja" },
              ]}
            />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {ordenadas.length === 0 ? (
              <EmptyState
                icon={<Sparkles />}
                titulo="Sin alertas para este filtro"
                descripcion="La operación está bajo control en este frente."
              />
            ) : (
              <ul className="divide-y divide-[var(--border-soft)]">
                {ordenadas.map((a) => {
                  const cfg = TIPOS[a.tipo];
                  const critica = ["critica", "alta"].includes(a.severidad);
                  return (
                    <li key={a.id}>
                      <Link
                        href={a.accion_url ?? "#"}
                        className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-[var(--surface-2)]"
                      >
                        <span
                          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4"
                          style={{
                            backgroundColor: critica ? "var(--danger-bg)" : "var(--warn-bg)",
                            color: critica ? "var(--danger)" : "var(--warn)",
                          }}
                        >
                          {cfg?.icon ?? <Bell />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[12.5px] font-semibold text-fg">{a.titulo}</span>
                            <EstadoBadge tipo="severidad" valor={a.severidad} size="xs" />
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                            {a.mensaje}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[10.5px] text-subtle">
                          {haceTiempo(a.generada_en)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default async function AlertasPage({ searchParams }: { searchParams: Params }) {
  return (
    <>
      <PageHeader
        titulo="Inteligencia y alertas"
        descripcion="El sistema trabaja a su favor: reglas sobre su propio histórico que detectan stock por agotarse, reposiciones sugeridas, capital inmovilizado, créditos por vencer, desviaciones de margen y emergencias sin autorizar."
        acciones={<BotonRegenerar />}
      />
      <Contenedor className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2.5">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-600" />
          <p className="text-[11.5px] leading-relaxed text-brand-800">
            <strong>Nivel 1 · incluido:</strong> alertas y recomendaciones basadas en reglas y en el
            histórico de la operación. La capa predictiva con IA (Nivel 2) —pronóstico de demanda por
            temporada, cantidades óptimas de importación y recomendación de precios— se incorpora sobre
            esta misma base cuando el volumen de datos lo amerite.
          </p>
        </div>
        <Suspense fallback={<SkeletonTable rows={10} cols={3} />}>
          <Panel params={searchParams} />
        </Suspense>
      </Contenedor>
    </>
  );
}
