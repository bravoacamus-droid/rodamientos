import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardList, Siren, PackageCheck, Clock, AlertTriangle, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { SearchBox, FiltroSelect, Paginacion } from "@/components/ui/client";
import { Card, Table, THead, TBody, Badge, EmptyState, SkeletonTable } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { MiniStat } from "@/components/ui/kpi";
import { money, num, fecha } from "@/lib/utils";

export const metadata: Metadata = { title: "Pedidos y emergencias" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 25;
type Params = Promise<{ [k: string]: string | undefined }>;

async function Resumen() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pedidos")
    .select("estado, total, es_emergencia, requiere_aprobacion, aprobado_en");

  const filas = data ?? [];
  const enCurso = filas.filter((f) => ["pendiente", "aprobado", "preparacion"].includes(f.estado));
  const emergencias = filas.filter((f) => f.es_emergencia);
  const porAprobar = emergencias.filter((f) => f.requiere_aprobacion && !f.aprobado_en && f.estado !== "anulado");

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <MiniStat label="Pedidos en curso" valor={num(enCurso.length, 0)} icon={<Clock />} />
      <MiniStat label="Monto en curso" valor={money(enCurso.reduce((s, f) => s + Number(f.total), 0))} icon={<ClipboardList />} tono="brand" />
      <MiniStat label="Emergencias históricas" valor={num(emergencias.length, 0)} icon={<Siren />} tono="warning" />
      <MiniStat label="Pendientes de aprobar" valor={num(porAprobar.length, 0)} icon={<AlertTriangle />} tono={porAprobar.length ? "danger" : "success"} href="/pedidos?emergencia=1" />
    </div>
  );
}

async function Tabla({ params }: { params: Params }) {
  const sp = await params;
  const supabase = await createClient();

  const page = Math.max(Number(sp.page ?? 1), 1);
  const q = (sp.q ?? "").trim();
  const estado = sp.estado ?? "";
  const emergencia = sp.emergencia === "1";

  let consulta = supabase
    .from("pedidos")
    .select(
      "id, numero, fecha, fecha_entrega, total, estado, es_emergencia, requiere_aprobacion, aprobado_en, orden_compra_cliente, clientes(razon_social, ruc), profiles!pedidos_vendedor_id_fkey(nombre)",
      { count: "exact" }
    );

  if (q) consulta = consulta.ilike("numero", `%${q.toUpperCase()}%`);
  if (estado) consulta = consulta.eq("estado", estado);
  if (emergencia) consulta = consulta.eq("es_emergencia", true).is("aprobado_en", null).neq("estado", "anulado");

  const { data, count } = await consulta
    .order("fecha", { ascending: false })
    .order("numero", { ascending: false })
    .range((page - 1) * POR_PAGINA, page * POR_PAGINA - 1);

  const total = count ?? 0;

  if (!data?.length) {
    return (
      <Card>
        <EmptyState icon={<ClipboardList />} titulo="Sin pedidos" descripcion="No hay pedidos con los filtros aplicados." />
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
            <th>Entrega</th>
            <th>O/C cliente</th>
            <th>Tipo</th>
            <th className="text-right">Total</th>
            <th>Estado</th>
            <th>Asesor</th>
          </tr>
        </THead>
        <TBody>
          {data.map((p) => {
            const cli = p.clientes as unknown as { razon_social: string; ruc: string } | null;
            const usr = p.profiles as unknown as { nombre: string } | null;
            const porAprobar = p.es_emergencia && p.requiere_aprobacion && !p.aprobado_en;
            return (
              <tr key={p.id} className={porAprobar ? "!bg-[var(--danger-bg)]" : undefined}>
                <td>
                  <Link href={`/pedidos/${p.id}`} className="text-[12.5px] font-semibold text-brand-700 tabular hover:underline">
                    {p.numero}
                  </Link>
                </td>
                <td className="max-w-[250px]">
                  <span className="block truncate text-[12.5px] text-fg">{cli?.razon_social}</span>
                  <span className="block text-[10.5px] text-subtle tabular">{cli?.ruc ?? "—"}</span>
                </td>
                <td className="whitespace-nowrap text-[12px] text-muted tabular">{fecha(p.fecha)}</td>
                <td className="whitespace-nowrap text-[12px] text-muted tabular">{fecha(p.fecha_entrega)}</td>
                <td className="text-[11.5px] text-muted tabular">{p.orden_compra_cliente ?? "—"}</td>
                <td>
                  {p.es_emergencia ? (
                    <Badge tone={porAprobar ? "danger" : "warning"} size="xs">
                      <Siren className="size-2.5" />
                      {porAprobar ? "Por aprobar" : "Emergencia"}
                    </Badge>
                  ) : (
                    <Badge tone="neutral" size="xs">Regular</Badge>
                  )}
                </td>
                <td className="text-right text-[12.5px] font-semibold text-fg tabular">{money(p.total)}</td>
                <td><EstadoBadge tipo="pedido" valor={p.estado} size="xs" /></td>
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

export default async function PedidosPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;

  return (
    <>
      <PageHeader
        titulo="Pedidos y emergencias"
        descripcion="Órdenes de venta con seguimiento de estado y gestión de pedidos de emergencia: venta por reponer con stock negativo controlado y aprobación administrativa."
        acciones={
          <>
            <Link
              href="/pedidos/nuevo?emergencia=1"
              className="inline-flex h-9 items-center gap-2 rounded-md border px-3.5 text-[13px] font-medium transition-colors"
              style={{
                borderColor: "color-mix(in srgb, var(--danger) 30%, transparent)",
                backgroundColor: "var(--danger-bg)",
                color: "var(--danger)",
              }}
            >
              <Siren className="size-4" />
              Pedido de emergencia
            </Link>
            <Link
              href="/pedidos/nuevo"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
            >
              <Plus className="size-4" />
              Nuevo pedido
            </Link>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
          <SearchBox placeholder="Buscar por número de pedido…" className="min-w-[220px] flex-1 sm:max-w-sm" />
          <FiltroSelect
            param="estado"
            placeholder="Todos los estados"
            opciones={[
              { value: "pendiente", label: "Pendiente" },
              { value: "aprobado", label: "Aprobado" },
              { value: "preparacion", label: "En preparación" },
              { value: "despachado", label: "Despachado" },
              { value: "facturado", label: "Facturado" },
              { value: "anulado", label: "Anulado" },
            ]}
          />
          <Link
            href={sp.emergencia === "1" ? "/pedidos" : "/pedidos?emergencia=1"}
            className={`inline-flex h-9.5 items-center gap-2 rounded-md border px-3.5 text-[13px] font-medium transition-colors ${
              sp.emergencia === "1"
                ? "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]"
                : "bg-[var(--surface)] text-fg hover:border-brand-300"
            }`}
          >
            <Siren className="size-4" />
            Solo emergencias por aprobar
          </Link>
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
