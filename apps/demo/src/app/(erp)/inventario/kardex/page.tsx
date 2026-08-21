import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ScrollText, ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Scale } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { SearchBox, FiltroSelect, Paginacion } from "@/components/ui/client";
import { Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge, EmptyState, SkeletonTable } from "@/components/ui/primitives";
import { TIPO_MOVIMIENTO } from "@/components/ui/estados";
import { MiniStat } from "@/components/ui/kpi";
import { money, num, fechaHora, truncar } from "@/lib/utils";

export const metadata: Metadata = { title: "Kardex valorizado" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 40;
type Params = Promise<{ [k: string]: string | undefined }>;

const ENTRADAS = ["ingreso", "ajuste_positivo", "transferencia_entrada", "regularizacion"];

async function FichaProducto({ id }: { id: string }) {
  const supabase = await createClient();
  const { data: p } = await supabase.from("v_stock_productos").select("*").eq("id", id).single();
  if (!p) return null;

  const { data: movs } = await supabase
    .from("movimientos_inventario")
    .select("tipo, cantidad, costo_unitario")
    .eq("producto_id", id);

  const entradas = (movs ?? []).filter((m) => ENTRADAS.includes(m.tipo));
  const salidas = (movs ?? []).filter((m) => !ENTRADAS.includes(m.tipo));

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href={`/productos/${p.id}`} className="text-[15px] font-bold text-brand-700 hover:underline">
              {p.sku}
            </Link>
            <Badge tone="brand" size="sm">{p.marca}</Badge>
          </div>
          <p className="mt-1 text-[12.5px] text-muted">{p.descripcion}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Ingresos" valor={num(entradas.reduce((s, m) => s + Number(m.cantidad), 0), 0)} icon={<ArrowDownToLine />} tono="success" />
          <MiniStat label="Salidas" valor={num(salidas.reduce((s, m) => s + Number(m.cantidad), 0), 0)} icon={<ArrowUpFromLine />} tono="danger" />
          <MiniStat label="Saldo actual" valor={num(p.stock_total, 0)} icon={<Scale />} />
          <MiniStat label="Valorizado" valor={money(p.valorizado)} tono="brand" />
        </div>
      </div>
    </Card>
  );
}

async function TablaKardex({ params }: { params: Params }) {
  const sp = await params;
  const supabase = await createClient();

  const page = Math.max(Number(sp.page ?? 1), 1);
  const producto = sp.producto ?? "";
  const tipo = sp.tipo ?? "";
  const almacen = sp.almacen ?? "";
  const q = (sp.q ?? "").trim();

  let consulta = supabase
    .from("movimientos_inventario")
    .select(
      "id, fecha, tipo, cantidad, costo_unitario, saldo_cantidad, saldo_valorizado, costo_promedio, referencia_numero, referencia_tipo, motivo, productos(id, sku, descripcion, unidad), almacenes(codigo, nombre), profiles(nombre)",
      { count: "exact" }
    );

  if (producto) consulta = consulta.eq("producto_id", producto);
  if (tipo) consulta = consulta.eq("tipo", tipo);
  if (almacen) consulta = consulta.eq("almacen_id", almacen);
  if (q) consulta = consulta.ilike("referencia_numero", `%${q}%`);

  const { data, count } = await consulta
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .range((page - 1) * POR_PAGINA, page * POR_PAGINA - 1);

  const total = count ?? 0;

  if (!data?.length) {
    return (
      <Card>
        <EmptyState icon={<ScrollText />} titulo="Sin movimientos" descripcion="No hay movimientos que coincidan con los filtros." />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <tr>
            <th>Fecha</th>
            <th>Producto</th>
            <th>Movimiento</th>
            <th>Documento</th>
            <th>Almacén</th>
            <th className="text-right">Cant.</th>
            <th className="text-right">Costo unit.</th>
            <th className="text-right">Saldo</th>
            <th className="text-right">Valorizado</th>
            <th>Responsable</th>
          </tr>
        </THead>
        <TBody>
          {data.map((m) => {
            const cfg = TIPO_MOVIMIENTO[m.tipo] ?? { label: m.tipo, tone: "neutral" as const };
            const prod = m.productos as unknown as { id: string; sku: string; descripcion: string; unidad: string } | null;
            const alm = m.almacenes as unknown as { codigo: string; nombre: string } | null;
            const usr = m.profiles as unknown as { nombre: string } | null;
            const entra = ENTRADAS.includes(m.tipo);
            return (
              <tr key={m.id}>
                <td className="whitespace-nowrap text-[11.5px] text-muted tabular">{fechaHora(m.fecha)}</td>
                <td className="max-w-[230px]">
                  {prod && (
                    <Link href={`/productos/${prod.id}`} className="block truncate text-[12px] font-semibold text-brand-700 hover:underline">
                      {prod.sku}
                    </Link>
                  )}
                  <span className="block truncate text-[10.5px] text-subtle">
                    {truncar(prod?.descripcion ?? "", 46)}
                  </span>
                </td>
                <td>
                  <Badge tone={cfg.tone} size="xs">{cfg.label}</Badge>
                  {m.motivo && (
                    <span className="mt-0.5 block max-w-[200px] truncate text-[10px] text-subtle">{m.motivo}</span>
                  )}
                </td>
                <td className="text-[11.5px] font-medium text-fg tabular">{m.referencia_numero ?? "—"}</td>
                <td className="text-[11px] text-muted">{alm?.codigo ?? "—"}</td>
                <td
                  className="text-right text-[12.5px] font-semibold tabular"
                  style={{ color: entra ? "var(--ok)" : "var(--danger)" }}
                >
                  {entra ? "+" : "−"}{num(m.cantidad, 0)}
                </td>
                <td className="text-right text-[11.5px] text-muted tabular">{money(m.costo_unitario)}</td>
                <td className="text-right text-[12px] font-medium text-fg tabular">{num(m.saldo_cantidad, 0)}</td>
                <td className="text-right text-[11.5px] text-muted tabular">{money(m.saldo_valorizado)}</td>
                <td className="text-[11px] text-muted">{usr?.nombre?.split(" ")[0] ?? "—"}</td>
              </tr>
            );
          })}
        </TBody>
      </Table>
      <Paginacion page={page} totalPages={Math.ceil(total / POR_PAGINA)} total={total} porPagina={POR_PAGINA} />
    </Card>
  );
}

export default async function KardexPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: almacenes } = await supabase.from("almacenes").select("id, nombre").order("codigo");

  return (
    <>
      <PageHeader
        titulo="Kardex valorizado"
        descripcion="Trazabilidad completa y auditable: qué se compró, a qué costo, de qué proveedor, cuándo entró y a quién se vendió."
        acciones={
          <Link
            href="/inventario"
            className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
          >
            <ArrowLeft className="size-4" />
            Volver a stock
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
          <SearchBox placeholder="Buscar por número de documento…" className="min-w-[220px] flex-1 sm:max-w-sm" />
          <FiltroSelect
            param="tipo"
            placeholder="Todos los movimientos"
            opciones={Object.entries(TIPO_MOVIMIENTO).map(([v, c]) => ({ value: v, label: c.label }))}
          />
          <FiltroSelect
            param="almacen"
            placeholder="Todos los almacenes"
            opciones={(almacenes ?? []).map((a) => ({ value: a.id, label: a.nombre }))}
          />
        </div>
      </PageHeader>

      <Contenedor className="space-y-4">
        {sp.producto && (
          <Suspense fallback={<div className="card h-24" />}>
            <FichaProducto id={sp.producto} />
          </Suspense>
        )}
        <Suspense fallback={<SkeletonTable rows={14} cols={10} />}>
          <TablaKardex params={searchParams} />
        </Suspense>
      </Contenedor>
    </>
  );
}
