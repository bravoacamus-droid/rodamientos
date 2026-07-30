import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building2, Wallet, TrendingUp, Users, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { SearchBox, FiltroSelect, Paginacion } from "@/components/ui/client";
import { Card, Table, THead, TBody, Badge, EmptyState, SkeletonTable, Progress } from "@/components/ui/primitives";
import { MiniStat } from "@/components/ui/kpi";
import { FormularioCliente } from "@/components/comercial/form-cliente";
import { money, num, fecha } from "@/lib/utils";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 25;
type Params = Promise<{ [k: string]: string | undefined }>;

async function Resumen() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_resumen_clientes").select("*");
  const filas = data ?? [];
  const activos = filas.filter((f) => f.activo);
  const conDeuda = filas.filter((f) => Number(f.deuda) > 0);
  const excedidos = filas.filter((f) => Number(f.linea_credito) > 0 && Number(f.deuda) > Number(f.linea_credito));

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <MiniStat label="Clientes activos" valor={num(activos.length, 0)} icon={<Users />} />
      <MiniStat label="Venta histórica" valor={money(filas.reduce((s, f) => s + Number(f.total_vendido), 0))} icon={<TrendingUp />} tono="brand" />
      <MiniStat label="Con saldo pendiente" valor={num(conDeuda.length, 0)} icon={<Wallet />} tono="warning" />
      <MiniStat label="Línea excedida" valor={num(excedidos.length, 0)} icon={<AlertTriangle />} tono={excedidos.length ? "danger" : "success"} />
    </div>
  );
}

async function Tabla({ params }: { params: Params }) {
  const sp = await params;
  const supabase = await createClient();

  const page = Math.max(Number(sp.page ?? 1), 1);
  const q = (sp.q ?? "").trim();
  const sector = sp.sector ?? "";
  const lista = sp.lista ?? "";

  let consulta = supabase.from("v_resumen_clientes").select("*", { count: "exact" });
  if (q) consulta = consulta.or(`razon_social.ilike.%${q}%,ruc.ilike.%${q}%,codigo.ilike.%${q}%`);
  if (sector) consulta = consulta.eq("sector", sector);
  if (lista) consulta = consulta.eq("lista_precio", lista);

  const { data, count } = await consulta
    .order("total_vendido", { ascending: false })
    .range((page - 1) * POR_PAGINA, page * POR_PAGINA - 1);

  const total = count ?? 0;

  if (!data?.length) {
    return (
      <Card>
        <EmptyState icon={<Building2 />} titulo="Sin clientes" descripcion="Ajuste los filtros de búsqueda." />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <tr>
            <th>Cliente</th>
            <th>Sector</th>
            <th>Lista</th>
            <th className="text-right">Venta histórica</th>
            <th className="text-right">Deuda</th>
            <th className="text-right">Vencido</th>
            <th className="w-40">Uso de la línea</th>
            <th>Última compra</th>
          </tr>
        </THead>
        <TBody>
          {data.map((c) => {
            const uso = Number(c.linea_credito) > 0 ? (Number(c.deuda) / Number(c.linea_credito)) * 100 : 0;
            return (
              <tr key={c.id}>
                <td className="max-w-[280px]">
                  <Link href={`/clientes/${c.id}`} className="block truncate text-[12.5px] font-semibold text-brand-700 hover:underline">
                    {c.razon_social}
                  </Link>
                  <span className="block text-[10.5px] text-subtle tabular">
                    {c.codigo} · {c.ruc ?? "sin RUC"}
                  </span>
                </td>
                <td className="text-[11.5px] text-muted">{c.sector ?? "—"}</td>
                <td>
                  <Badge tone="neutral" size="xs">
                    {c.lista_precio === "fabrica" ? "Fábrica" : c.lista_precio === "importacion" ? "Importación" : "Mayorista"}
                  </Badge>
                </td>
                <td className="text-right text-[12.5px] font-medium text-fg tabular">{money(c.total_vendido)}</td>
                <td className="text-right text-[12px] tabular">
                  <span style={{ color: Number(c.deuda) > 0 ? "var(--warn)" : "var(--fg-subtle)" }}>
                    {money(c.deuda)}
                  </span>
                </td>
                <td className="text-right text-[12px] tabular">
                  <span style={{ color: Number(c.vencido) > 0 ? "var(--danger)" : "var(--fg-subtle)" }}>
                    {money(c.vencido)}
                  </span>
                </td>
                <td>
                  {Number(c.linea_credito) > 0 ? (
                    <>
                      <Progress
                        value={Math.min(uso, 100)}
                        tone={uso > 100 ? "danger" : uso > 80 ? "warning" : "success"}
                      />
                      <span className="mt-1 block text-[10px] text-subtle tabular">
                        {uso.toFixed(0)}% de {money(c.linea_credito)}
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] text-subtle">Solo contado</span>
                  )}
                </td>
                <td className="whitespace-nowrap text-[11.5px] text-muted tabular">
                  {c.ultima_compra ? fecha(c.ultima_compra) : "—"}
                </td>
              </tr>
            );
          })}
        </TBody>
      </Table>
      <Paginacion page={page} totalPages={Math.ceil(total / POR_PAGINA)} total={total} porPagina={POR_PAGINA} />
    </Card>
  );
}

export default async function ClientesPage({ searchParams }: { searchParams: Params }) {
  const supabase = await createClient();
  const { data: sectores } = await supabase.from("clientes").select("sector").not("sector", "is", null);
  const unicos = Array.from(new Set((sectores ?? []).map((s) => s.sector as string))).sort();

  return (
    <>
      <PageHeader
        titulo="Clientes"
        descripcion="Empresas industriales con línea y plazo de crédito propios, historial de consumo y comportamiento de pago."
        acciones={<FormularioCliente />}
      >
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
          <SearchBox placeholder="Buscar por razón social, RUC o código…" className="min-w-[240px] flex-1 sm:max-w-md" />
          <FiltroSelect param="sector" placeholder="Todos los sectores" opciones={unicos.map((s) => ({ value: s, label: s }))} />
          <FiltroSelect
            param="lista"
            placeholder="Todas las listas"
            opciones={[
              { value: "mayorista", label: "Mayorista" },
              { value: "fabrica", label: "Fábrica" },
              { value: "importacion", label: "Importación" },
            ]}
          />
        </div>
      </PageHeader>

      <Contenedor className="space-y-4">
        <Suspense fallback={<div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-[62px]" />)}</div>}>
          <Resumen />
        </Suspense>
        <Suspense fallback={<SkeletonTable rows={12} cols={8} />}>
          <Tabla params={searchParams} />
        </Suspense>
      </Contenedor>
    </>
  );
}
