import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Warehouse, PackagePlus, ScrollText, Layers, AlertTriangle, TrendingDown, Boxes } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { SearchBox, FiltroSelect, Paginacion } from "@/components/ui/client";
import { Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge, EmptyState, SkeletonTable, Progress } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { MiniStat } from "@/components/ui/kpi";
import { GraficoBarrasH } from "@/components/charts/graficos";
import { money, num, truncar } from "@/lib/utils";

export const metadata: Metadata = { title: "Stock y almacenes" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 25;
type Params = Promise<{ [k: string]: string | undefined }>;

async function ResumenInventario() {
  const supabase = await createClient();
  const [{ data: v }, { data: almacenes }] = await Promise.all([
    supabase.from("v_stock_productos").select("estado_stock, valorizado, categoria, stock_total").eq("activo", true),
    supabase.from("stock").select("cantidad, almacenes(nombre)"),
  ]);

  const filas = v ?? [];
  const valorizado = filas.reduce((s, f) => s + Number(f.valorizado ?? 0), 0);
  const criticos = filas.filter((f) => ["critico", "agotado"].includes(f.estado_stock)).length;
  const negativos = filas.filter((f) => Number(f.stock_total) < 0).length;

  const porCategoria = Object.entries(
    filas.reduce<Record<string, number>>((acc, f) => {
      const k = f.categoria ?? "Sin línea";
      acc[k] = (acc[k] ?? 0) + Number(f.valorizado ?? 0);
      return acc;
    }, {})
  )
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const porAlmacen = Object.entries(
    (almacenes ?? []).reduce<Record<string, number>>((acc, s) => {
      const alm = s.almacenes as unknown as { nombre: string } | null;
      const k = alm?.nombre ?? "—";
      acc[k] = (acc[k] ?? 0) + Number(s.cantidad ?? 0);
      return acc;
    }, {})
  ).map(([nombre, valor]) => ({ nombre, valor }));

  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Inventario valorizado" valor={money(valorizado)} icon={<Layers />} tono="brand" />
        <MiniStat label="SKU con existencias" valor={num(filas.filter((f) => Number(f.stock_total) > 0).length, 0)} icon={<Boxes />} />
        <MiniStat label="En quiebre o crítico" valor={num(criticos, 0)} icon={<AlertTriangle />} tono="danger" />
        <MiniStat label="Saldos negativos" valor={num(negativos, 0)} icon={<TrendingDown />} tono={negativos ? "warning" : "success"} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Valorizado por línea de producto</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">Capital inmovilizado en cada familia del catálogo</p>
            </div>
          </CardHeader>
          <CardContent>
            <GraficoBarrasH data={porCategoria} anchoEje={158} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Unidades por almacén</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">Distribución física del inventario</p>
            </div>
            <Warehouse className="size-4 text-subtle" />
          </CardHeader>
          <CardContent className="space-y-3">
            {porAlmacen.map((a) => {
              const total = porAlmacen.reduce((s, x) => s + x.valor, 0) || 1;
              return (
                <div key={a.nombre}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[12px] text-fg">{a.nombre}</span>
                    <span className="text-[12px] font-semibold text-fg tabular">{num(a.valor, 0)}</span>
                  </div>
                  <Progress value={a.valor} max={total} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function TablaStock({ params }: { params: Params }) {
  const sp = await params;
  const supabase = await createClient();

  const page = Math.max(Number(sp.page ?? 1), 1);
  const q = (sp.q ?? "").trim();
  const estado = sp.estado ?? "";
  const categoria = sp.categoria ?? "";
  const orden = sp.orden ?? "valorizado";

  let consulta = supabase.from("v_stock_productos").select("*", { count: "exact" }).eq("activo", true);
  if (q) consulta = consulta.or(`sku.ilike.%${q}%,codigo_fabricante.ilike.%${q}%,descripcion.ilike.%${q}%`);
  if (estado) consulta = consulta.eq("estado_stock", estado);
  if (categoria) consulta = consulta.eq("categoria_slug", categoria);

  const columna = orden === "stock" ? "stock_total" : orden === "sku" ? "sku" : "valorizado";
  const { data, count } = await consulta
    .order(columna, { ascending: orden === "sku" })
    .range((page - 1) * POR_PAGINA, page * POR_PAGINA - 1);

  const total = count ?? 0;

  if (!data?.length) {
    return (
      <Card>
        <EmptyState icon={<Warehouse />} titulo="Sin existencias que mostrar" descripcion="Ajuste los filtros de búsqueda." />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <tr>
            <th>SKU</th>
            <th>Descripción</th>
            <th>Ubicación</th>
            <th className="text-right">Stock</th>
            <th className="text-right">Mínimo</th>
            <th className="text-right">Costo prom.</th>
            <th className="text-right">Valorizado</th>
            <th>Estado</th>
            <th />
          </tr>
        </THead>
        <TBody>
          {data.map((p) => (
            <tr key={p.id}>
              <td>
                <Link href={`/productos/${p.id}`} className="text-[12.5px] font-semibold text-brand-700 hover:underline">
                  {p.sku}
                </Link>
                <span className="block text-[10.5px] text-subtle">{p.marca}</span>
              </td>
              <td className="max-w-[300px] text-[12.5px] text-fg">{truncar(p.descripcion, 62)}</td>
              <td className="text-[11.5px] text-muted tabular">{p.ubicacion ?? "—"}</td>
              <td className="text-right tabular">
                <span
                  className="text-[12.5px] font-semibold"
                  style={{ color: Number(p.stock_total) < 0 ? "var(--danger)" : undefined }}
                >
                  {num(p.stock_total, 0)}
                </span>
              </td>
              <td className="text-right text-[12px] text-muted tabular">{num(p.stock_minimo, 0)}</td>
              <td className="text-right text-[12px] text-muted tabular">{money(p.costo_promedio)}</td>
              <td className="text-right text-[12.5px] font-medium text-fg tabular">{money(p.valorizado)}</td>
              <td><EstadoBadge tipo="stock" valor={p.estado_stock} size="xs" /></td>
              <td>
                <Link
                  href={`/inventario/kardex?producto=${p.id}`}
                  className="text-[11px] font-medium text-brand-600 hover:underline"
                >
                  Kardex
                </Link>
              </td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Paginacion page={page} totalPages={Math.ceil(total / POR_PAGINA)} total={total} porPagina={POR_PAGINA} />
    </Card>
  );
}

export default async function InventarioPage({ searchParams }: { searchParams: Params }) {
  const supabase = await createClient();
  const { data: categorias } = await supabase.from("categorias").select("nombre, slug").order("orden");

  return (
    <>
      <PageHeader
        titulo="Stock y almacenes"
        descripcion="Existencias en tiempo real valorizadas al costo promedio ponderado, con alertas de stock mínimo por ítem."
        acciones={
          <>
            <Link
              href="/inventario/movimientos"
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
            >
              <PackagePlus className="size-4" />
              Ingresos y ajustes
            </Link>
            <Link
              href="/inventario/kardex"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
            >
              <ScrollText className="size-4" />
              Kardex valorizado
            </Link>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
          <SearchBox placeholder="Buscar SKU, código o descripción…" className="min-w-[240px] flex-1 sm:max-w-md" />
          <FiltroSelect
            param="estado"
            placeholder="Cualquier estado"
            opciones={[
              { value: "agotado", label: "Agotado" },
              { value: "critico", label: "Crítico" },
              { value: "bajo", label: "Bajo" },
              { value: "normal", label: "Normal" },
            ]}
          />
          <FiltroSelect
            param="categoria"
            placeholder="Todas las líneas"
            opciones={(categorias ?? []).map((c) => ({ value: c.slug, label: c.nombre }))}
          />
          <FiltroSelect
            param="orden"
            placeholder="Ordenar por valorizado"
            opciones={[
              { value: "valorizado", label: "Mayor valorizado" },
              { value: "stock", label: "Mayor stock" },
              { value: "sku", label: "SKU (A-Z)" },
            ]}
          />
        </div>
      </PageHeader>

      <Contenedor className="space-y-4">
        <Suspense fallback={<div className="h-40 card" />}>
          <ResumenInventario />
        </Suspense>
        <Suspense fallback={<SkeletonTable rows={12} cols={9} />}>
          <TablaStock params={searchParams} />
        </Suspense>
      </Contenedor>
    </>
  );
}
