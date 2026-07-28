import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Boxes, Package, AlertTriangle, TrendingDown, ArrowLeftRight, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { SearchBox, FiltroSelect, Paginacion } from "@/components/ui/client";
import { Card, Table, THead, TBody, Badge, EmptyState, SkeletonTable } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { MiniStat } from "@/components/ui/kpi";
import { money, num, truncar } from "@/lib/utils";

export const metadata: Metadata = { title: "Maestro de productos" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 25;

type Params = Promise<{ [k: string]: string | undefined }>;

async function Resumen() {
  const supabase = await createClient();
  const [{ count: total }, { data: stock }] = await Promise.all([
    supabase.from("productos").select("id", { count: "exact", head: true }).eq("activo", true),
    supabase.from("v_stock_productos").select("estado_stock, valorizado").eq("activo", true),
  ]);

  const filas = stock ?? [];
  const valorizado = filas.reduce((s, f) => s + Number(f.valorizado ?? 0), 0);
  const criticos = filas.filter((f) => f.estado_stock === "critico" || f.estado_stock === "agotado").length;
  const bajos = filas.filter((f) => f.estado_stock === "bajo").length;

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <MiniStat label="SKU activos en catálogo" valor={num(total ?? 0, 0)} icon={<Boxes />} />
      <MiniStat label="Inventario valorizado" valor={money(valorizado)} icon={<Layers />} tono="brand" />
      <MiniStat label="En quiebre o crítico" valor={num(criticos, 0)} icon={<AlertTriangle />} tono="danger" />
      <MiniStat label="Con stock bajo" valor={num(bajos, 0)} icon={<TrendingDown />} tono="warning" />
    </div>
  );
}

async function TablaProductos({ params }: { params: Params }) {
  const sp = await params;
  const supabase = await createClient();

  const page = Math.max(Number(sp.page ?? 1), 1);
  const q = (sp.q ?? "").trim();
  const marca = sp.marca ?? "";
  const categoria = sp.categoria ?? "";
  const estado = sp.estado ?? "";

  let consulta = supabase
    .from("v_stock_productos")
    .select("*", { count: "exact" })
    .eq("activo", true);

  if (q) consulta = consulta.or(
    `sku.ilike.%${q}%,codigo_fabricante.ilike.%${q}%,descripcion.ilike.%${q}%`
  );
  if (marca) consulta = consulta.eq("marca", marca);
  if (categoria) consulta = consulta.eq("categoria_slug", categoria);
  if (estado) consulta = consulta.eq("estado_stock", estado);

  const { data, count } = await consulta
    .order("sku", { ascending: true })
    .range((page - 1) * POR_PAGINA, page * POR_PAGINA - 1);

  const total = count ?? 0;

  if (!data?.length) {
    return (
      <Card>
        <EmptyState
          icon={<Package />}
          titulo="Sin resultados"
          descripcion="No se encontraron productos con los filtros aplicados. Pruebe con otro código o marca."
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <tr>
            <th>SKU / Código</th>
            <th>Descripción</th>
            <th>Marca</th>
            <th className="text-right">Stock</th>
            <th className="text-right">Costo prom.</th>
            <th className="text-right">Mayorista</th>
            <th className="text-right">Fábrica</th>
            <th>Estado</th>
          </tr>
        </THead>
        <TBody>
          {data.map((p) => (
            <tr key={p.id}>
              <td>
                <Link href={`/productos/${p.id}`} className="group block">
                  <span className="block text-[12.5px] font-semibold text-brand-700 group-hover:underline">
                    {p.sku}
                  </span>
                  <span className="block text-[11px] text-subtle tabular">{p.codigo_fabricante}</span>
                </Link>
              </td>
              <td className="max-w-[340px]">
                <span className="block text-[12.5px] text-fg">{truncar(p.descripcion, 74)}</span>
                {p.ubicacion && (
                  <span className="block text-[10.5px] text-subtle">Ubicación {p.ubicacion}</span>
                )}
              </td>
              <td>
                <Badge tone={p.marca_segmento === "premium" ? "brand" : p.marca_segmento === "economica" ? "neutral" : "info"} size="xs">
                  {p.marca ?? "—"}
                </Badge>
              </td>
              <td className="text-right tabular">
                <span
                  className="text-[12.5px] font-semibold"
                  style={{ color: Number(p.stock_total) < 0 ? "var(--danger)" : undefined }}
                >
                  {num(p.stock_total, 0)}
                </span>
                <span className="ml-1 text-[10.5px] text-subtle">{p.unidad}</span>
              </td>
              <td className="text-right text-[12.5px] text-muted tabular">{money(p.costo_promedio)}</td>
              <td className="text-right text-[12.5px] font-medium text-fg tabular">
                {money(p.precio_mayorista)}
              </td>
              <td className="text-right text-[12.5px] text-muted tabular">{money(p.precio_fabrica)}</td>
              <td>
                <EstadoBadge tipo="stock" valor={p.estado_stock} size="xs" />
              </td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Paginacion
        page={page}
        totalPages={Math.ceil(total / POR_PAGINA)}
        total={total}
        porPagina={POR_PAGINA}
      />
    </Card>
  );
}

export default async function ProductosPage({ searchParams }: { searchParams: Params }) {
  const supabase = await createClient();
  const [{ data: marcas }, { data: categorias }] = await Promise.all([
    supabase.from("marcas").select("nombre").eq("activo", true).order("orden"),
    supabase.from("categorias").select("nombre, slug").order("orden"),
  ]);

  return (
    <>
      <PageHeader
        titulo="Maestro de productos"
        descripcion="Catálogo multimarca con atributos técnicos, listas de precio y stock consolidado por almacén."
        acciones={
          <Link
            href="/equivalencias"
            className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
          >
            <ArrowLeftRight className="size-4" />
            Buscar equivalencias
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
          <SearchBox
            placeholder="Buscar por código, SKU o descripción…"
            className="min-w-[240px] flex-1 sm:max-w-md"
          />
          <FiltroSelect
            param="marca"
            placeholder="Todas las marcas"
            opciones={(marcas ?? []).map((m) => ({ value: m.nombre, label: m.nombre }))}
          />
          <FiltroSelect
            param="categoria"
            placeholder="Todas las líneas"
            opciones={(categorias ?? []).map((c) => ({ value: c.slug, label: c.nombre }))}
          />
          <FiltroSelect
            param="estado"
            placeholder="Cualquier stock"
            opciones={[
              { value: "agotado", label: "Agotado" },
              { value: "critico", label: "Crítico" },
              { value: "bajo", label: "Bajo" },
              { value: "normal", label: "Normal" },
            ]}
          />
        </div>
      </PageHeader>

      <Contenedor className="space-y-4">
        <Suspense fallback={<div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-[62px]" />)}</div>}>
          <Resumen />
        </Suspense>
        <Suspense fallback={<SkeletonTable rows={12} cols={8} />}>
          <TablaProductos params={searchParams} />
        </Suspense>
      </Contenedor>
    </>
  );
}
