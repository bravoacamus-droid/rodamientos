import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileText, Plus, TrendingUp, CheckCircle2, Clock, Percent } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { SearchBox, FiltroSelect, Paginacion } from "@/components/ui/client";
import { Card, Table, THead, TBody, EmptyState, SkeletonTable, Badge } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { MiniStat } from "@/components/ui/kpi";
import { money, num, pct, fecha, inicioDeMesISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Cotizaciones" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 25;
type Params = Promise<{ [k: string]: string | undefined }>;

async function Resumen() {
  const supabase = await createClient();
  const desde = inicioDeMesISO();
  const { data } = await supabase
    .from("cotizaciones")
    .select("estado, total, margen_pct")
    .gte("fecha", desde);

  const filas = data ?? [];
  const ganadas = filas.filter((f) => ["aceptada", "convertida"].includes(f.estado));
  const abiertas = filas.filter((f) =>
    ["borrador", "enviada", "en_negociacion"].includes(f.estado)
  );
  const conversion = filas.length ? (ganadas.length / filas.length) * 100 : 0;
  const margenProm = filas.length
    ? filas.reduce((s, f) => s + Number(f.margen_pct ?? 0), 0) / filas.length
    : 0;

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <MiniStat label="Cotizado en el mes" valor={money(filas.reduce((s, f) => s + Number(f.total), 0))} icon={<FileText />} tono="brand" />
      <MiniStat label="Ganado en el mes" valor={money(ganadas.reduce((s, f) => s + Number(f.total), 0))} icon={<CheckCircle2 />} tono="success" />
      <MiniStat label="Tasa de conversión" valor={pct(conversion, 0)} icon={<TrendingUp />} tono={conversion >= 35 ? "success" : "warning"} />
      <MiniStat label="Abiertas por cerrar" valor={num(abiertas.length, 0)} icon={<Clock />} />
    </div>
  );
}

async function Tabla({ params }: { params: Params }) {
  const sp = await params;
  const supabase = await createClient();

  const page = Math.max(Number(sp.page ?? 1), 1);
  const q = (sp.q ?? "").trim();
  const estado = sp.estado ?? "";

  let consulta = supabase
    .from("cotizaciones")
    .select(
      "id, numero, fecha, fecha_vencimiento, total, estado, margen_pct, lista_precio, clientes(razon_social, ruc), profiles(nombre)",
      { count: "exact" }
    );

  if (q) consulta = consulta.ilike("numero", `%${q.toUpperCase()}%`);
  if (estado) consulta = consulta.eq("estado", estado);

  const { data, count } = await consulta
    .order("fecha", { ascending: false })
    .order("numero", { ascending: false })
    .range((page - 1) * POR_PAGINA, page * POR_PAGINA - 1);

  const total = count ?? 0;
  const hoy = new Date().toISOString().slice(0, 10);

  if (!data?.length) {
    return (
      <Card>
        <EmptyState
          icon={<FileText />}
          titulo="Sin cotizaciones"
          descripcion="Aún no hay cotizaciones que coincidan con los filtros aplicados."
          accion={
            <Link
              href="/cotizaciones/nueva"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-3.5 text-[13px] font-medium text-white hover:bg-brand-700"
            >
              <Plus className="size-4" />
              Nueva cotización
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <tr>
            <th>Número</th>
            <th>Cliente</th>
            <th>Fecha</th>
            <th>Vencimiento</th>
            <th>Lista</th>
            <th className="text-right">Margen</th>
            <th className="text-right">Total</th>
            <th>Estado</th>
            <th>Asesor</th>
          </tr>
        </THead>
        <TBody>
          {data.map((c) => {
            const cli = c.clientes as unknown as { razon_social: string; ruc: string } | null;
            const usr = c.profiles as unknown as { nombre: string } | null;
            const vencida =
              c.fecha_vencimiento < hoy &&
              ["borrador", "enviada", "en_negociacion"].includes(c.estado);
            const margen = Number(c.margen_pct ?? 0);
            return (
              <tr key={c.id}>
                <td>
                  <Link href={`/cotizaciones/${c.id}`} className="text-[12.5px] font-semibold text-brand-700 tabular hover:underline">
                    {c.numero}
                  </Link>
                </td>
                <td className="max-w-[260px]">
                  <span className="block truncate text-[12.5px] text-fg">{cli?.razon_social}</span>
                  <span className="block text-[10.5px] text-subtle tabular">{cli?.ruc ?? "—"}</span>
                </td>
                <td className="whitespace-nowrap text-[12px] text-muted tabular">{fecha(c.fecha)}</td>
                <td className="whitespace-nowrap text-[12px] tabular">
                  <span style={{ color: vencida ? "var(--danger)" : "var(--fg-muted)" }}>
                    {fecha(c.fecha_vencimiento)}
                  </span>
                </td>
                <td>
                  <Badge tone="neutral" size="xs">
                    {c.lista_precio === "fabrica" ? "Fábrica" : c.lista_precio === "importacion" ? "Importación" : "Mayorista"}
                  </Badge>
                </td>
                <td className="text-right text-[12px] font-medium tabular">
                  <span style={{ color: margen < 15 ? "var(--danger)" : margen > 30 ? "var(--ok)" : "var(--fg-muted)" }}>
                    {pct(margen, 1)}
                  </span>
                </td>
                <td className="text-right text-[12.5px] font-semibold text-fg tabular">{money(c.total)}</td>
                <td><EstadoBadge tipo="cotizacion" valor={c.estado} size="xs" /></td>
                <td className="text-[11.5px] text-muted">{usr?.nombre?.split(" ")[0] ?? "—"}</td>
              </tr>
            );
          })}
        </TBody>
      </Table>
      <Paginacion page={page} totalPages={Math.ceil(total / POR_PAGINA)} total={total} porPagina={POR_PAGINA} />
    </Card>
  );
}

export default async function CotizacionesPage({ searchParams }: { searchParams: Params }) {
  return (
    <>
      <PageHeader
        titulo="Cotizaciones"
        descripcion="Cotización inteligente con historial de precios por cliente, control de margen en tiempo real y exportación a PDF brandeado."
        acciones={
          <Link
            href="/cotizaciones/nueva"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
          >
            <Plus className="size-4" />
            Nueva cotización
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
          <SearchBox placeholder="Buscar por número de cotización…" className="min-w-[220px] flex-1 sm:max-w-sm" />
          <FiltroSelect
            param="estado"
            placeholder="Todos los estados"
            opciones={[
              { value: "borrador", label: "Borrador" },
              { value: "enviada", label: "Enviada" },
              { value: "en_negociacion", label: "En negociación" },
              { value: "aceptada", label: "Aceptada" },
              { value: "convertida", label: "Convertida" },
              { value: "rechazada", label: "Rechazada" },
              { value: "vencida", label: "Vencida" },
            ]}
          />
        </div>
      </PageHeader>

      <Contenedor className="space-y-4">
        <Suspense fallback={<div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-[62px]" />)}</div>}>
          <Resumen />
        </Suspense>
        <Suspense fallback={<SkeletonTable rows={12} cols={9} />}>
          <Tabla params={searchParams} />
        </Suspense>
      </Contenedor>
    </>
  );
}
