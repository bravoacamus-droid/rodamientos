import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Building2, Wallet, TrendingUp, FileText, Package, Mail, Phone, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge, EmptyState, Progress } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { GraficoBarrasH } from "@/components/charts/graficos";
import { money, num, pct, fecha, whatsappUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("clientes").select("razon_social").eq("id", id).single();
  return { title: data?.razon_social ?? "Cliente" };
}

export default async function ClientePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: c } = await supabase.from("v_resumen_clientes").select("*").eq("id", id).single();
  if (!c) notFound();

  const [{ data: comprobantes }, { data: cotizaciones }, { data: items }] = await Promise.all([
    supabase
      .from("comprobantes")
      .select("id, numero, tipo, fecha_emision, fecha_vencimiento, total, saldo, estado")
      .eq("cliente_id", id)
      .order("fecha_emision", { ascending: false })
      .limit(12),
    supabase
      .from("cotizaciones")
      .select("id, numero, fecha, total, estado, margen_pct")
      .eq("cliente_id", id)
      .order("fecha", { ascending: false })
      .limit(8),
    supabase
      .from("comprobante_items")
      .select("codigo, descripcion, cantidad, subtotal, comprobantes!inner(cliente_id, estado)")
      .eq("comprobantes.cliente_id", id)
      .neq("comprobantes.estado", "anulado")
      .limit(500),
  ]);

  const topProductos = Object.entries(
    (items ?? []).reduce<Record<string, number>>((acc, i) => {
      acc[i.codigo] = (acc[i.codigo] ?? 0) + Number(i.subtotal);
      return acc;
    }, {})
  )
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const uso = Number(c.linea_credito) > 0 ? (Number(c.deuda) / Number(c.linea_credito)) * 100 : 0;
  const wa = whatsappUrl(c.whatsapp ?? c.telefono, `Estimados ${c.razon_social},`);

  return (
    <>
      <PageHeader
        titulo={c.razon_social}
        descripcion={`${c.codigo} · RUC ${c.ruc ?? "—"} · ${c.sector ?? "Sin sector"}`}
        badge={
          <>
            <Badge tone={c.activo ? "success" : "neutral"} size="sm">
              {c.activo ? "Activo" : "Inactivo"}
            </Badge>
            <Badge tone="neutral" size="sm">
              Lista {c.lista_precio === "fabrica" ? "fábrica" : c.lista_precio === "importacion" ? "importación" : "mayorista"}
            </Badge>
          </>
        }
        acciones={
          <>
            <Link
              href="/clientes"
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
            >
              <ArrowLeft className="size-4" />
              Volver
            </Link>
            <Link
              href={`/cotizaciones/nueva?cliente=${id}`}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
            >
              <FileText className="size-4" />
              Nueva cotización
            </Link>
          </>
        }
      />

      <Contenedor className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Venta histórica</p>
            <p className="mt-2 text-[24px] font-bold leading-none text-fg tabular">{money(c.total_vendido)}</p>
            <p className="mt-2 text-[11.5px] text-muted">
              {num(c.documentos, 0)} documentos · margen {money(c.margen)}
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Deuda actual</p>
            <p
              className="mt-2 text-[24px] font-bold leading-none tabular"
              style={{ color: Number(c.vencido) > 0 ? "var(--danger)" : "var(--fg)" }}
            >
              {money(c.deuda)}
            </p>
            <p className="mt-2 text-[11.5px] text-muted">{money(c.vencido)} vencido</p>
          </Card>

          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Línea de crédito</p>
            <p className="mt-2 text-[24px] font-bold leading-none text-fg tabular">{money(c.linea_credito)}</p>
            <Progress
              className="mt-2"
              value={Math.min(uso, 100)}
              tone={uso > 100 ? "danger" : uso > 80 ? "warning" : "success"}
            />
            <p className="mt-1.5 text-[11.5px] text-muted">
              Disponible {money(c.credito_disponible)} · plazo {c.dias_credito} días
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Actividad comercial</p>
            <p className="mt-2 text-[24px] font-bold leading-none text-fg tabular">{num(c.cotizaciones, 0)}</p>
            <p className="mt-2 text-[11.5px] text-muted">
              cotizaciones · última compra {c.ultima_compra ? fecha(c.ultima_compra) : "—"}
            </p>
          </Card>
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Datos de contacto</CardTitle>
              <Building2 className="size-4 text-subtle" />
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[
                [<MapPin key="m" className="size-3.5" />, `${c.direccion ?? "—"}${c.distrito ? `, ${c.distrito}` : ""}`],
                [<Mail key="e" className="size-3.5" />, c.email ?? "—"],
                [<Phone key="t" className="size-3.5" />, `${c.telefono ?? "—"}${c.whatsapp ? ` · ${c.whatsapp}` : ""}`],
              ].map(([icon, texto], i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-subtle">{icon}</span>
                  <span className="text-[12px] text-fg">{texto}</span>
                </div>
              ))}
              <div className="border-t pt-2.5">
                <p className="text-[11px] text-subtle">Contacto principal</p>
                <p className="text-[12.5px] font-medium text-fg">{c.contacto ?? "—"}</p>
              </div>
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex h-8 items-center gap-2 rounded-md border px-3 text-[12px] font-medium text-fg transition-colors hover:border-brand-300"
                >
                  Escribir por WhatsApp
                </a>
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Productos más comprados</CardTitle>
                <p className="mt-0.5 text-[11.5px] text-muted">Venta acumulada por SKU con este cliente</p>
              </div>
              <Package className="size-4 text-subtle" />
            </CardHeader>
            <CardContent>
              {topProductos.length ? (
                <GraficoBarrasH data={topProductos} anchoEje={140} />
              ) : (
                <EmptyState titulo="Sin compras registradas" />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>Comprobantes emitidos</CardTitle>
                <p className="mt-0.5 text-[11.5px] text-muted">Últimos 12 documentos</p>
              </div>
              <Wallet className="size-4 text-subtle" />
            </CardHeader>
            {(comprobantes ?? []).length === 0 ? (
              <EmptyState titulo="Sin comprobantes" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <th>Documento</th>
                    <th>Emisión</th>
                    <th>Vencimiento</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Saldo</th>
                    <th>Estado</th>
                  </tr>
                </THead>
                <TBody>
                  {(comprobantes ?? []).map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/facturacion/${d.id}`} className="text-[12px] font-semibold text-brand-700 tabular hover:underline">
                          {d.numero}
                        </Link>
                      </td>
                      <td className="text-[11.5px] text-muted tabular">{fecha(d.fecha_emision)}</td>
                      <td className="text-[11.5px] text-muted tabular">{fecha(d.fecha_vencimiento)}</td>
                      <td className="text-right text-[12px] tabular">{money(d.total)}</td>
                      <td className="text-right text-[12px] font-medium tabular">
                        <span style={{ color: Number(d.saldo) > 0 ? "var(--warn)" : "var(--ok)" }}>
                          {money(d.saldo)}
                        </span>
                      </td>
                      <td><EstadoBadge tipo="comprobante" valor={d.estado} size="xs" /></td>
                    </tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>Cotizaciones</CardTitle>
                <p className="mt-0.5 text-[11.5px] text-muted">Pipeline comercial reciente</p>
              </div>
              <TrendingUp className="size-4 text-subtle" />
            </CardHeader>
            {(cotizaciones ?? []).length === 0 ? (
              <EmptyState titulo="Sin cotizaciones" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <th>Número</th>
                    <th>Fecha</th>
                    <th className="text-right">Margen</th>
                    <th className="text-right">Total</th>
                    <th>Estado</th>
                  </tr>
                </THead>
                <TBody>
                  {(cotizaciones ?? []).map((q) => (
                    <tr key={q.id}>
                      <td>
                        <Link href={`/cotizaciones/${q.id}`} className="text-[12px] font-semibold text-brand-700 tabular hover:underline">
                          {q.numero}
                        </Link>
                      </td>
                      <td className="text-[11.5px] text-muted tabular">{fecha(q.fecha)}</td>
                      <td className="text-right text-[11.5px] tabular">
                        <span style={{ color: Number(q.margen_pct) < 15 ? "var(--danger)" : "var(--fg-muted)" }}>
                          {pct(q.margen_pct, 0)}
                        </span>
                      </td>
                      <td className="text-right text-[12px] font-medium tabular">{money(q.total)}</td>
                      <td><EstadoBadge tipo="cotizacion" valor={q.estado} size="xs" /></td>
                    </tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      </Contenedor>
    </>
  );
}
