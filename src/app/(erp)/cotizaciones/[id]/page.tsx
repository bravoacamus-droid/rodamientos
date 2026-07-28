import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, User, Calendar, Truck, FileText, TrendingUp } from "lucide-react";
import { createClient, getEmpresa } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { AccionesCotizacion } from "./acciones";
import { money, num, pct, fecha } from "@/lib/utils";
import type { EmpresaPdf } from "@/lib/pdf/documentos";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("cotizaciones").select("numero").eq("id", id).single();
  return { title: data?.numero ?? "Cotización" };
}

export default async function CotizacionPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: c }, empresa] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select(
        "*, clientes(id, codigo, razon_social, ruc, direccion, distrito, contacto, email, telefono, whatsapp, lista_precio, linea_credito, dias_credito), profiles(nombre, email)"
      )
      .eq("id", id)
      .single(),
    getEmpresa(),
  ]);

  if (!c) notFound();

  const { data: items } = await supabase
    .from("cotizacion_items")
    .select("*, productos(id, sku)")
    .eq("cotizacion_id", id)
    .order("orden");

  const cliente = c.clientes as unknown as {
    id: string; codigo: string; razon_social: string; ruc: string | null;
    direccion: string | null; distrito: string | null; contacto: string | null;
    email: string | null; telefono: string | null; whatsapp: string | null;
    lista_precio: string; linea_credito: number; dias_credito: number;
  };
  const vendedor = c.profiles as unknown as { nombre: string; email: string } | null;
  const lineas = items ?? [];
  const costoTotal = lineas.reduce((s, i) => s + Number(i.costo_unitario) * Number(i.cantidad), 0);
  const margenSoles = Number(c.subtotal) - costoTotal;

  return (
    <>
      <PageHeader
        titulo={c.numero}
        descripcion={`${cliente.razon_social} · emitida el ${fecha(c.fecha)}`}
        badge={<EstadoBadge tipo="cotizacion" valor={c.estado} />}
        acciones={
          <>
            <Link
              href="/cotizaciones"
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
            >
              <ArrowLeft className="size-4" />
              Volver
            </Link>
            <AccionesCotizacion
              cotizacion={{
                id: c.id,
                numero: c.numero,
                fecha: c.fecha,
                fecha_vencimiento: c.fecha_vencimiento,
                moneda: c.moneda,
                estado: c.estado,
                subtotal: Number(c.subtotal),
                igv: Number(c.igv),
                total: Number(c.total),
                condiciones: c.condiciones,
                tiempo_entrega: c.tiempo_entrega,
                observaciones: c.observaciones,
              }}
              cliente={cliente}
              vendedor={vendedor?.nombre ?? "Rodatech"}
              items={lineas.map((i) => ({
                codigo: i.codigo,
                descripcion: i.descripcion,
                marca: i.marca,
                cantidad: Number(i.cantidad),
                unidad: i.unidad,
                precio_unitario: Number(i.precio_unitario),
                descuento_pct: Number(i.descuento_pct),
                subtotal: Number(i.subtotal),
              }))}
              empresa={empresa as unknown as EmpresaPdf}
            />
          </>
        }
      />

      <Contenedor className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-subtle">
              <User className="size-3.5" />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Cliente</p>
            </div>
            <Link
              href={`/clientes/${cliente.id}`}
              className="mt-2 block text-[13.5px] font-semibold leading-snug text-brand-700 hover:underline"
            >
              {cliente.razon_social}
            </Link>
            <p className="mt-1 text-[11.5px] text-muted tabular">RUC {cliente.ruc ?? "—"}</p>
            <p className="text-[11.5px] text-muted">{cliente.contacto ?? "Sin contacto"}</p>
            <p className="mt-1.5 text-[11px] text-subtle">
              Crédito {cliente.dias_credito} días · línea {money(cliente.linea_credito)}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-subtle">
              <Calendar className="size-3.5" />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Vigencia</p>
            </div>
            <p className="mt-2 text-[13.5px] font-semibold text-fg">{fecha(c.fecha_vencimiento)}</p>
            <p className="mt-1 text-[11.5px] text-muted">{c.validez_dias} días de validez</p>
            <div className="mt-2 flex items-center gap-1.5">
              <Truck className="size-3 text-subtle" />
              <p className="text-[11.5px] text-muted">{c.tiempo_entrega ?? "Según stock"}</p>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-subtle">
              <TrendingUp className="size-3.5" />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Rentabilidad</p>
            </div>
            <p
              className="mt-2 text-[22px] font-bold leading-none tabular"
              style={{ color: Number(c.margen_pct) < 15 ? "var(--danger)" : "var(--ok)" }}
            >
              {pct(c.margen_pct)}
            </p>
            <p className="mt-1.5 text-[11.5px] text-muted">
              Margen de {money(margenSoles)} sobre costo {money(costoTotal)}
            </p>
            {Number(c.margen_pct) < 15 && (
              <Badge tone="danger" size="xs" className="mt-2">
                Bajo el mínimo definido (15%)
              </Badge>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-subtle">
              <FileText className="size-3.5" />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Total cotizado</p>
            </div>
            <p className="mt-2 text-[22px] font-bold leading-none text-fg tabular">{money(c.total)}</p>
            <div className="mt-2 space-y-0.5 text-[11.5px] text-muted">
              <p className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular">{money(c.subtotal)}</span>
              </p>
              <p className="flex justify-between">
                <span>IGV (18%)</span>
                <span className="tabular">{money(c.igv)}</span>
              </p>
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Detalle de la cotización</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {lineas.length} ítem(s) · lista de precios{" "}
                {c.lista_precio === "fabrica" ? "fábrica" : c.lista_precio === "importacion" ? "importación" : "mayorista"}
              </p>
            </div>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <th className="w-10">#</th>
                <th>Código</th>
                <th>Descripción</th>
                <th className="text-right">Cant.</th>
                <th className="text-right">P. Unit.</th>
                <th className="text-right">Dscto.</th>
                <th className="text-right">Costo</th>
                <th className="text-right">Margen</th>
                <th className="text-right">Importe</th>
              </tr>
            </THead>
            <TBody>
              {lineas.map((i) => {
                const prod = i.productos as unknown as { id: string; sku: string } | null;
                const m = Number(i.precio_unitario) > 0
                  ? ((Number(i.precio_unitario) - Number(i.costo_unitario)) / Number(i.precio_unitario)) * 100
                  : 0;
                return (
                  <tr key={i.id}>
                    <td className="text-[11.5px] text-subtle tabular">{i.orden}</td>
                    <td>
                      {prod ? (
                        <Link href={`/productos/${prod.id}`} className="text-[12px] font-semibold text-brand-700 hover:underline">
                          {i.codigo}
                        </Link>
                      ) : (
                        <span className="text-[12px] font-semibold text-fg">{i.codigo}</span>
                      )}
                      {i.marca && <span className="block text-[10.5px] text-subtle">{i.marca}</span>}
                    </td>
                    <td className="max-w-[320px] text-[12px] text-fg">{i.descripcion}</td>
                    <td className="text-right text-[12px] tabular">
                      {num(i.cantidad, 0)} <span className="text-subtle">{i.unidad}</span>
                    </td>
                    <td className="text-right text-[12px] tabular">{money(i.precio_unitario)}</td>
                    <td className="text-right text-[11.5px] text-muted tabular">
                      {Number(i.descuento_pct) ? pct(i.descuento_pct) : "—"}
                    </td>
                    <td className="text-right text-[11.5px] text-muted tabular">{money(i.costo_unitario)}</td>
                    <td
                      className="text-right text-[11.5px] font-medium tabular"
                      style={{ color: m < 15 ? "var(--danger)" : "var(--ok)" }}
                    >
                      {pct(m, 0)}
                    </td>
                    <td className="text-right text-[12.5px] font-semibold text-fg tabular">
                      {money(i.subtotal)}
                    </td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
          <div className="flex justify-end border-t bg-[var(--surface-2)] px-5 py-3">
            <div className="w-full max-w-xs space-y-1">
              <div className="flex justify-between text-[12px] text-muted">
                <span>Subtotal</span>
                <span className="tabular">{money(c.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[12px] text-muted">
                <span>IGV (18%)</span>
                <span className="tabular">{money(c.igv)}</span>
              </div>
              <div className="flex justify-between border-t pt-1.5 text-[14px] font-bold text-fg">
                <span>Total</span>
                <span className="tabular">{money(c.total)}</span>
              </div>
            </div>
          </div>
        </Card>

        {(c.condiciones || c.observaciones || c.motivo_rechazo) && (
          <div className="grid gap-3 lg:grid-cols-3">
            {c.condiciones && (
              <Card>
                <CardHeader><CardTitle>Condiciones comerciales</CardTitle></CardHeader>
                <CardContent><p className="text-[12px] leading-relaxed text-muted">{c.condiciones}</p></CardContent>
              </Card>
            )}
            {c.observaciones && (
              <Card>
                <CardHeader><CardTitle>Observaciones</CardTitle></CardHeader>
                <CardContent><p className="text-[12px] leading-relaxed text-muted">{c.observaciones}</p></CardContent>
              </Card>
            )}
            {c.motivo_rechazo && (
              <Card>
                <CardHeader><CardTitle>Motivo del rechazo</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--danger)" }}>
                    {c.motivo_rechazo}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </Contenedor>
    </>
  );
}
