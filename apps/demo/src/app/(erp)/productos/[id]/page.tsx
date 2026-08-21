import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  ArrowLeft, Package, ArrowLeftRight, History, Warehouse, Tag, Ruler,
  TrendingUp, ShoppingCart, AlertTriangle, CircleDot,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import {
  Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge,
  EmptyState, Skeleton, Progress,
} from "@/components/ui/primitives";
import { EstadoBadge, TIPO_MOVIMIENTO } from "@/components/ui/estados";
import { EditorEquivalencias } from "@/components/comercial/editor-equivalencias";
import { FormularioProducto } from "@/components/comercial/form-producto";
import { money, num, pct, fecha, fechaHora } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("productos").select("sku").eq("id", id).single();
  return { title: data?.sku ?? "Producto" };
}

/* ------------------------------------------------------- Equivalencias */

async function Equivalencias({
  id,
  sku,
  codigo,
}: {
  id: string;
  sku: string;
  codigo: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("equivalencias_de", { p_producto: id });
  const eq = (data ?? []) as {
    id: string; sku: string; codigo_fabricante: string; descripcion: string;
    marca: string; marca_segmento: string; tipo: string; nota: string | null;
    stock: number; precio_mayorista: number; estado_stock: string;
  }[];

  const disponibles = eq.filter((e) => Number(e.stock) > 0);

  return (
    <>
      {disponibles.length > 0 && (
        <div className="mx-5 mb-3 rounded-lg border border-[var(--ok)]/25 bg-[var(--ok-bg)] px-3 py-2">
          <p className="text-[11.5px] font-medium" style={{ color: "var(--ok)" }}>
            {disponibles.length} equivalente(s) con stock disponible para ofrecer de inmediato.
          </p>
        </div>
      )}
      <div className="px-5 pb-4">
        <EditorEquivalencias
          productoId={id}
          productoSku={sku}
          codigoFabricante={codigo}
          equivalentes={eq}
        />
      </div>
    </>
  );
}

/* ----------------------------------------------------------- Historial */

async function HistorialPrecios({ id }: { id: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("historial_producto", { p_producto: id, p_limit: 15 });
  const h = (data ?? []) as {
    fecha: string; documento: string; origen: string; cliente: string;
    cantidad: number; precio_unitario: number; estado: string;
  }[];

  if (!h.length) {
    return (
      <EmptyState
        icon={<History />}
        titulo="Sin historial comercial"
        descripcion="Este producto todavía no ha sido cotizado ni vendido."
      />
    );
  }

  const precios = h.map((x) => Number(x.precio_unitario));
  const min = Math.min(...precios);
  const max = Math.max(...precios);
  const prom = precios.reduce((s, p) => s + p, 0) / precios.length;

  return (
    <>
      <div className="mx-5 mb-3 grid grid-cols-3 gap-2">
        {[
          ["Precio mínimo", money(min)],
          ["Promedio", money(prom)],
          ["Máximo", money(max)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-subtle">{k}</p>
            <p className="mt-0.5 text-[13px] font-semibold text-fg tabular">{v}</p>
          </div>
        ))}
      </div>
      <Table>
        <THead>
          <tr>
            <th>Fecha</th>
            <th>Documento</th>
            <th>Cliente</th>
            <th className="text-right">Cant.</th>
            <th className="text-right">Precio</th>
          </tr>
        </THead>
        <TBody>
          {h.map((x, i) => (
            <tr key={`${x.documento}-${i}`}>
              <td className="whitespace-nowrap text-[12px] text-muted tabular">{fecha(x.fecha)}</td>
              <td>
                <span className="block text-[12px] font-medium text-fg tabular">{x.documento}</span>
                <Badge tone={x.origen === "Venta" ? "success" : "info"} size="xs">
                  {x.origen}
                </Badge>
              </td>
              <td className="max-w-[220px] truncate text-[12px] text-fg">{x.cliente}</td>
              <td className="text-right text-[12px] tabular">{num(x.cantidad, 0)}</td>
              <td className="text-right text-[12.5px] font-semibold text-fg tabular">
                {money(x.precio_unitario)}
              </td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}

/* -------------------------------------------------------------- Kardex */

async function KardexProducto({ id }: { id: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("movimientos_inventario")
    .select("id, fecha, tipo, cantidad, costo_unitario, saldo_cantidad, referencia_numero, motivo, almacenes(nombre)")
    .eq("producto_id", id)
    .order("fecha", { ascending: false })
    .limit(20);

  if (!data?.length) {
    return <EmptyState icon={<Warehouse />} titulo="Sin movimientos de almacén" />;
  }

  return (
    <Table>
      <THead>
        <tr>
          <th>Fecha</th>
          <th>Movimiento</th>
          <th>Documento</th>
          <th>Almacén</th>
          <th className="text-right">Cantidad</th>
          <th className="text-right">Costo unit.</th>
          <th className="text-right">Saldo</th>
        </tr>
      </THead>
      <TBody>
        {data.map((m) => {
          const cfg = TIPO_MOVIMIENTO[m.tipo] ?? { label: m.tipo, tone: "neutral" as const };
          const alm = m.almacenes as unknown as { nombre: string } | null;
          const entra = ["ingreso", "ajuste_positivo", "transferencia_entrada", "regularizacion"].includes(m.tipo);
          return (
            <tr key={m.id}>
              <td className="whitespace-nowrap text-[12px] text-muted tabular">{fechaHora(m.fecha)}</td>
              <td>
                <Badge tone={cfg.tone} size="xs">{cfg.label}</Badge>
                {m.motivo && (
                  <span className="mt-0.5 block max-w-[220px] truncate text-[10.5px] text-subtle">
                    {m.motivo}
                  </span>
                )}
              </td>
              <td className="text-[12px] font-medium text-fg tabular">{m.referencia_numero ?? "—"}</td>
              <td className="text-[11.5px] text-muted">{alm?.nombre ?? "—"}</td>
              <td
                className="text-right text-[12.5px] font-semibold tabular"
                style={{ color: entra ? "var(--ok)" : "var(--danger)" }}
              >
                {entra ? "+" : "−"}{num(m.cantidad, 0)}
              </td>
              <td className="text-right text-[12px] text-muted tabular">{money(m.costo_unitario)}</td>
              <td className="text-right text-[12.5px] font-medium text-fg tabular">
                {num(m.saldo_cantidad, 0)}
              </td>
            </tr>
          );
        })}
      </TBody>
    </Table>
  );
}

/* --------------------------------------------------------------- Página */

export default async function ProductoPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: p }, { data: stockAlm }, { data: marcas }, { data: categorias }] =
    await Promise.all([
      supabase.from("v_stock_productos").select("*").eq("id", id).single(),
      supabase
        .from("stock")
        .select("cantidad, reservado, almacenes(codigo, nombre)")
        .eq("producto_id", id),
      supabase.from("marcas").select("id, nombre").eq("activo", true).order("orden"),
      supabase.from("categorias").select("id, nombre, slug").order("orden"),
    ]);

  if (!p) notFound();

  const attrs = (p.atributos ?? {}) as Record<string, string | number>;
  const margen = p.precio_mayorista > 0
    ? ((p.precio_mayorista - p.costo_promedio) / p.precio_mayorista) * 100
    : 0;

  return (
    <>
      <PageHeader
        titulo={p.sku}
        descripcion={p.descripcion}
        badge={
          <>
            <Badge tone="brand" size="sm">{p.marca}</Badge>
            <EstadoBadge tipo="stock" valor={p.estado_stock} />
          </>
        }
        acciones={
          <>
            <Link
              href="/productos"
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
            >
              <ArrowLeft className="size-4" />
              Volver al catálogo
            </Link>
            <FormularioProducto
              modo="editar"
              marcas={marcas ?? []}
              categorias={categorias ?? []}
              producto={{
                id: p.id,
                sku: p.sku,
                codigo_fabricante: p.codigo_fabricante,
                descripcion: p.descripcion,
                marca_id: p.marca_id ?? "",
                categoria_id: p.categoria_id ?? "",
                unidad: p.unidad,
                costo_promedio: Number(p.costo_promedio),
                precio_mayorista: Number(p.precio_mayorista),
                precio_fabrica: Number(p.precio_fabrica),
                precio_importacion: Number(p.precio_importacion),
                stock_minimo: Number(p.stock_minimo),
                stock_maximo: Number(p.stock_minimo) * 5,
                ubicacion: p.ubicacion ?? "",
                peso_kg: 0,
                activo: p.activo,
                atributos: Object.entries(attrs).map(
                  ([k, v]) => [k, String(v)] as [string, string]
                ),
              }}
            />
          </>
        }
      />

      <Contenedor className="space-y-4">
        {/* ------------------------------------------------ Resumen */}
        <div className="grid gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Stock total</p>
            <p
              className="mt-2 text-[26px] font-bold leading-none tabular"
              style={{ color: Number(p.stock_total) < 0 ? "var(--danger)" : "var(--fg)" }}
            >
              {num(p.stock_total, 0)}{" "}
              <span className="text-[13px] font-medium text-subtle">{p.unidad}</span>
            </p>
            <p className="mt-2 text-[11.5px] text-muted">
              Mínimo {num(p.stock_minimo, 0)} · valorizado {money(p.valorizado)}
            </p>
            <Progress
              className="mt-2"
              value={Math.max(Number(p.stock_total), 0)}
              max={Math.max(Number(p.stock_minimo) * 3, Number(p.stock_total), 1)}
              tone={p.estado_stock === "normal" ? "success" : p.estado_stock === "bajo" ? "warning" : "danger"}
            />
          </Card>

          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Costo promedio</p>
            <p className="mt-2 text-[26px] font-bold leading-none text-fg tabular">
              {money(p.costo_promedio)}
            </p>
            <p className="mt-2 text-[11.5px] text-muted">Método: promedio ponderado</p>
          </Card>

          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Precio mayorista</p>
            <p className="mt-2 text-[26px] font-bold leading-none text-brand-700 tabular">
              {money(p.precio_mayorista)}
            </p>
            <p
              className="mt-2 text-[11.5px] font-medium"
              style={{ color: margen < 15 ? "var(--danger)" : "var(--ok)" }}
            >
              Margen {pct(margen)}
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Otras listas</p>
            <div className="mt-2 space-y-1.5">
              {[
                ["Fábrica", p.precio_fabrica],
                ["Importación", p.precio_importacion],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-center justify-between">
                  <span className="text-[11.5px] text-muted">{k}</span>
                  <span className="text-[13px] font-semibold text-fg tabular">{money(Number(v))}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {/* --------------------------------------- Ficha técnica */}
          <Card>
            <CardHeader>
              <CardTitle>Ficha técnica</CardTitle>
              <Ruler className="size-4 text-subtle" />
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                ["Código de fabricante", p.codigo_fabricante],
                ["Marca", p.marca],
                ["Línea", p.categoria],
                ["Unidad de medida", p.unidad],
                ["Ubicación en almacén", p.ubicacion ?? "—"],
                ...Object.entries(attrs).map(([k, v]) => [
                  k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                  String(v),
                ]),
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-start justify-between gap-3 border-b border-[var(--border-soft)] pb-1.5 last:border-0">
                  <span className="text-[11.5px] text-muted">{k}</span>
                  <span className="text-right text-[12px] font-medium text-fg">{v}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* --------------------------------------- Stock por almacén */}
          <Card>
            <CardHeader>
              <CardTitle>Existencias por almacén</CardTitle>
              <Warehouse className="size-4 text-subtle" />
            </CardHeader>
            <CardContent className="space-y-2">
              {(stockAlm ?? []).length === 0 && (
                <p className="text-[12px] text-muted">Sin existencias registradas.</p>
              )}
              {(stockAlm ?? []).map((s, i) => {
                const alm = s.almacenes as unknown as { codigo: string; nombre: string } | null;
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2">
                    <div>
                      <p className="text-[12.5px] font-medium text-fg">{alm?.nombre}</p>
                      <p className="text-[10.5px] text-subtle">{alm?.codigo}</p>
                    </div>
                    <p
                      className="text-[15px] font-bold tabular"
                      style={{ color: Number(s.cantidad) < 0 ? "var(--danger)" : "var(--fg)" }}
                    >
                      {num(s.cantidad, 0)}
                    </p>
                  </div>
                );
              })}
              {Number(p.stock_total) < 0 && (
                <div className="flex gap-2 rounded-lg border border-[var(--danger)]/25 bg-[var(--danger-bg)] px-3 py-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--danger)" }} />
                  <p className="text-[11px]" style={{ color: "var(--danger)" }}>
                    Saldo negativo por atención de un pedido de emergencia. Se regulariza con el
                    ingreso de la mercadería pendiente.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* --------------------------------------- Acciones */}
          <Card>
            <CardHeader>
              <CardTitle>Acciones rápidas</CardTitle>
              <CircleDot className="size-4 text-subtle" />
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { href: `/cotizaciones/nueva?producto=${p.id}`, icon: TrendingUp, label: "Cotizar este producto", desc: "Crear cotización con el precio vigente" },
                { href: `/equivalencias?q=${encodeURIComponent(p.codigo_fabricante)}`, icon: ArrowLeftRight, label: "Ver cross-reference", desc: "Equivalentes en otras marcas" },
                { href: `/inventario/kardex?producto=${p.id}`, icon: History, label: "Kardex completo", desc: "Trazabilidad valorizada del ítem" },
                { href: `/inventario/movimientos?producto=${p.id}`, icon: ShoppingCart, label: "Registrar ingreso", desc: "Ingreso individual o ajuste" },
              ].map(({ href, icon: Icon, label, desc }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-start gap-3 rounded-lg border px-3 py-2 transition-colors hover:border-brand-300 hover:bg-[var(--surface-2)]"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  <span>
                    <span className="block text-[12.5px] font-medium text-fg">{label}</span>
                    <span className="block text-[10.5px] text-muted">{desc}</span>
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ------------------------------------------------ Cross-reference */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Cross-reference · equivalencias entre marcas</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Alternativas intercambiables ordenadas por disponibilidad, para responder de inmediato
                cuando el ítem solicitado no tiene stock.
              </p>
            </div>
            <ArrowLeftRight className="size-4 text-subtle" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Suspense fallback={<div className="px-5 pb-5"><Skeleton className="h-32 w-full" /></div>}>
              <Equivalencias id={id} sku={p.sku} codigo={p.codigo_fabricante} />
            </Suspense>
          </CardContent>
        </Card>

        <div className="grid gap-3 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Historial de precios por cliente</CardTitle>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  A quién se vendió, cuándo y a qué precio
                </p>
              </div>
              <History className="size-4 text-subtle" />
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Suspense fallback={<div className="px-5 pb-5"><Skeleton className="h-40 w-full" /></div>}>
                <HistorialPrecios id={id} />
              </Suspense>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Trazabilidad de almacén</CardTitle>
                <p className="mt-0.5 text-[11.5px] text-muted">Últimos 20 movimientos del kardex</p>
              </div>
              <Package className="size-4 text-subtle" />
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Suspense fallback={<div className="px-5 pb-5"><Skeleton className="h-40 w-full" /></div>}>
                <KardexProducto id={id} />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </Contenedor>
    </>
  );
}
