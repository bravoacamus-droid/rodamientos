import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftRight, Search, CheckCircle2, XCircle, Sparkles, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { SearchBox } from "@/components/ui/client";
import { Card, CardHeader, CardTitle, CardContent, Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { money, num, truncar } from "@/lib/utils";

export const metadata: Metadata = { title: "Cross-Reference" };
export const dynamic = "force-dynamic";

type Params = Promise<{ q?: string }>;

const SEGMENTOS: Record<string, { label: string; tone: "brand" | "info" | "neutral" }> = {
  premium: { label: "Prestigio", tone: "brand" },
  estandar: { label: "Estándar", tone: "info" },
  economica: { label: "Económica", tone: "neutral" },
};

type Equivalente = {
  id: string; sku: string; codigo_fabricante: string; descripcion: string;
  marca: string; marca_segmento: string; tipo: string; nota: string;
  stock: number; precio_mayorista: number; estado_stock: string;
};

async function Resultados({ params }: { params: Params }) {
  const { q } = await params;
  const termino = (q ?? "").trim();

  if (!termino) {
    return (
      <Card>
        <EmptyState
          icon={<Search />}
          titulo="Busque un código para ver sus equivalencias"
          descripcion="Escriba el código del rodamiento (por ejemplo 6205-2RS, 22217, UCP208 o 30208) y el sistema mostrará el producto exacto junto con sus equivalentes en otras marcas y el stock disponible de cada uno."
        />
      </Card>
    );
  }

  const supabase = await createClient();
  const { data: encontrados } = await supabase.rpc("buscar_productos", {
    p_q: termino,
    p_limit: 6,
  });

  const base = (encontrados ?? []) as {
    id: string; sku: string; codigo_fabricante: string; descripcion: string;
    marca: string; categoria: string; stock: number; precio_mayorista: number;
    costo_promedio: number; estado_stock: string;
  }[];

  if (!base.length) {
    return (
      <Card>
        <EmptyState
          icon={<XCircle />}
          titulo={`Sin coincidencias para «${termino}»`}
          descripcion="Verifique el código o pruebe con una parte de él. El buscador acepta códigos de fabricante, SKU internos y palabras de la descripción."
        />
      </Card>
    );
  }

  const equivalencias = await Promise.all(
    base.map(async (p) => {
      const { data } = await supabase.rpc("equivalencias_de", { p_producto: p.id });
      return { producto: p, equivalentes: ((data ?? []) as Equivalente[]) };
    })
  );

  return (
    <div className="space-y-4">
      {equivalencias.map(({ producto, equivalentes }) => {
        const conStock = equivalentes.filter((e) => Number(e.stock) > 0);
        const porSegmento = ["premium", "estandar", "economica"].map((seg) => ({
          seg,
          items: equivalentes
            .filter((e) => e.marca_segmento === seg)
            .sort((a, b) => Number(b.stock) - Number(a.stock)),
        })).filter((g) => g.items.length);

        return (
          <Card key={producto.id}>
            <CardHeader>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/productos/${producto.id}`}
                    className="text-[15px] font-bold tracking-tight text-brand-700 hover:underline"
                  >
                    {producto.sku}
                  </Link>
                  <Badge tone="brand" size="sm">{producto.marca}</Badge>
                  <EstadoBadge tipo="stock" valor={producto.estado_stock} size="sm" />
                </div>
                <p className="mt-1 text-[12.5px] text-muted">{producto.descripcion}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px]">
                  <span className="text-muted">
                    Stock:{" "}
                    <span
                      className="font-semibold tabular"
                      style={{ color: Number(producto.stock) > 0 ? "var(--ok)" : "var(--danger)" }}
                    >
                      {num(producto.stock, 0)} und
                    </span>
                  </span>
                  <span className="text-muted">
                    Precio:{" "}
                    <span className="font-semibold text-fg tabular">
                      {money(producto.precio_mayorista)}
                    </span>
                  </span>
                  <span className="text-muted">
                    Línea: <span className="font-medium text-fg">{producto.categoria}</span>
                  </span>
                </div>
              </div>
              <Badge tone={equivalentes.length ? "accent" : "neutral"} size="sm">
                {equivalentes.length} equivalente{equivalentes.length === 1 ? "" : "s"}
              </Badge>
            </CardHeader>

            <CardContent>
              {Number(producto.stock) <= 0 && conStock.length > 0 && (
                <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-[var(--ok)]/25 bg-[var(--ok-bg)] px-3 py-2.5">
                  <Sparkles className="mt-0.5 size-4 shrink-0" style={{ color: "var(--ok)" }} />
                  <div>
                    <p className="text-[12.5px] font-semibold" style={{ color: "var(--ok)" }}>
                      Sugerencia automática: el ítem solicitado no tiene stock
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      Puede ofrecer de inmediato{" "}
                      <span className="font-semibold text-fg">{conStock[0].sku}</span> ({conStock[0].marca})
                      con {num(conStock[0].stock, 0)} unidades disponibles a{" "}
                      {money(conStock[0].precio_mayorista)}.
                    </p>
                  </div>
                </div>
              )}

              {!equivalentes.length ? (
                <p className="py-6 text-center text-[12.5px] text-muted">
                  Este código aún no tiene equivalencias registradas en el maestro.
                </p>
              ) : (
                <div className="space-y-4">
                  {porSegmento.map(({ seg, items }) => (
                    <div key={seg}>
                      <div className="mb-2 flex items-center gap-2">
                        <Badge tone={SEGMENTOS[seg]?.tone ?? "neutral"} size="xs">
                          {SEGMENTOS[seg]?.label ?? seg}
                        </Badge>
                        <div className="h-px flex-1 bg-[var(--border-soft)]" />
                        <span className="text-[10.5px] text-subtle">{items.length} opción(es)</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {items.map((e) => {
                          const hay = Number(e.stock) > 0;
                          return (
                            <Link
                              key={e.id}
                              href={`/productos/${e.id}`}
                              className="group rounded-lg border px-3 py-2.5 transition-all duration-150 hover:elev-2 hover:border-brand-300"
                              style={hay ? { borderColor: "color-mix(in srgb, var(--ok) 30%, transparent)" } : undefined}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-[12.5px] font-semibold text-fg group-hover:text-brand-700">
                                    {e.sku}
                                  </p>
                                  <p className="truncate text-[10.5px] text-subtle">{e.marca}</p>
                                </div>
                                {hay ? (
                                  <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--ok)" }} />
                                ) : (
                                  <XCircle className="size-4 shrink-0 text-subtle" />
                                )}
                              </div>
                              <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-muted">
                                {truncar(e.descripcion, 62)}
                              </p>
                              <div className="mt-2 flex items-center justify-between border-t border-[var(--border-soft)] pt-2">
                                <span
                                  className="text-[11px] font-semibold tabular"
                                  style={{ color: hay ? "var(--ok)" : "var(--fg-subtle)" }}
                                >
                                  {num(e.stock, 0)} und
                                </span>
                                <span className="text-[12px] font-semibold text-fg tabular">
                                  {money(e.precio_mayorista)}
                                </span>
                              </div>
                              <div className="mt-1.5">
                                <Badge tone={e.tipo === "exacta" ? "success" : "warning"} size="xs">
                                  {e.tipo === "exacta" ? "Intercambiable" : e.tipo === "similar" ? "Dimensión similar" : "Sustituto"}
                                </Badge>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default async function EquivalenciasPage({ searchParams }: { searchParams: Params }) {
  return (
    <>
      <PageHeader
        titulo="Cross-Reference · equivalencias entre marcas"
        descripcion="El corazón del negocio de rodamientos: busque un código y obtenga el producto exacto junto con sus equivalentes en otras marcas, ordenados por prestigio y disponibilidad."
      >
        <div className="px-4 pb-4 sm:px-6">
          <SearchBox
            autoFocus
            placeholder="Ingrese el código: 6205-2RS, 22217, UCP208, 30208, A-42, RETEN 35x62x10…"
            className="max-w-2xl"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-subtle">Ejemplos:</span>
            {["6205", "6308-2RS", "22217", "30208", "UCP208", "NU210"].map((c) => (
              <Link
                key={c}
                href={`/equivalencias?q=${encodeURIComponent(c)}`}
                className="rounded-full border bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                {c}
              </Link>
            ))}
          </div>
        </div>
      </PageHeader>

      <Contenedor className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
          <p className="text-[11.5px] leading-relaxed text-brand-800">
            Las equivalencias <strong>intercambiables</strong> comparten el código de fabricante y son
            reemplazo directo. Las de <strong>dimensión similar</strong> comparten medidas pero varían
            en sellado o juego interno: valide la aplicación con el cliente antes de ofrecerlas.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="card p-5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-72" />
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <Skeleton key={j} className="h-24 rounded-lg" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          }
        >
          <Resultados params={searchParams} />
        </Suspense>
      </Contenedor>
    </>
  );
}
