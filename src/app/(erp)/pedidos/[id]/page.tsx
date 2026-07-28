import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Siren, User, Calendar, Warehouse, FileText, AlertTriangle } from "lucide-react";
import { createClient, getSesion } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { AccionesPedido } from "./acciones";
import { money, num, pct, fecha, fechaHora } from "@/lib/utils";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("pedidos").select("numero").eq("id", id).single();
  return { title: data?.numero ?? "Pedido" };
}

export default async function PedidoPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const sesion = await getSesion();

  const { data: p } = await supabase
    .from("pedidos")
    .select(
      "*, clientes(id, razon_social, ruc, direccion, distrito, contacto, dias_credito, linea_credito), almacenes(nombre), cotizaciones(id, numero), profiles!pedidos_vendedor_id_fkey(nombre), aprobador:profiles!pedidos_aprobado_por_fkey(nombre)"
    )
    .eq("id", id)
    .single();

  if (!p) notFound();

  const [{ data: items }, { data: comprobante }] = await Promise.all([
    supabase.from("pedido_items").select("*, productos(id, sku)").eq("pedido_id", id).order("orden"),
    supabase.from("comprobantes").select("id, numero, tipo, total, estado").eq("pedido_id", id).maybeSingle(),
  ]);

  const cliente = p.clientes as unknown as {
    id: string; razon_social: string; ruc: string | null; direccion: string | null;
    distrito: string | null; contacto: string | null; dias_credito: number; linea_credito: number;
  };
  const alm = p.almacenes as unknown as { nombre: string } | null;
  const cot = p.cotizaciones as unknown as { id: string; numero: string } | null;
  const vend = p.profiles as unknown as { nombre: string } | null;
  const aprob = p.aprobador as unknown as { nombre: string } | null;

  const lineas = items ?? [];
  const porReponer = lineas.filter((i) => i.por_reponer);
  const puedeAprobar = ["admin", "gerencia"].includes(sesion?.perfil?.rol ?? "");
  const esperandoAprobacion = p.es_emergencia && p.requiere_aprobacion && !p.aprobado_en;

  return (
    <>
      <PageHeader
        titulo={p.numero}
        descripcion={`${cliente.razon_social} · pedido del ${fecha(p.fecha)}`}
        badge={
          <>
            <EstadoBadge tipo="pedido" valor={p.estado} />
            {p.es_emergencia && (
              <Badge tone="danger" size="sm">
                <Siren className="size-3" />
                Pedido de emergencia
              </Badge>
            )}
          </>
        }
        acciones={
          <>
            <Link
              href="/pedidos"
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
            >
              <ArrowLeft className="size-4" />
              Volver
            </Link>
            <AccionesPedido
              pedido={{
                id: p.id,
                numero: p.numero,
                estado: p.estado,
                es_emergencia: p.es_emergencia,
                requiere_aprobacion: p.requiere_aprobacion,
                aprobado_en: p.aprobado_en,
                cliente_id: p.cliente_id,
                almacen_id: p.almacen_id,
                total: Number(p.total),
              }}
              yaFacturado={!!comprobante}
              comprobanteId={comprobante?.id ?? null}
              puedeAprobar={puedeAprobar}
              usuarioId={sesion?.perfil?.id ?? null}
            />
          </>
        }
      />

      <Contenedor className="space-y-4">
        {esperandoAprobacion && (
          <div className="flex items-start gap-3 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3">
            <Siren className="mt-0.5 size-5 shrink-0 animate-pulse-ring rounded-full" style={{ color: "var(--danger)" }} />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>
                Pedido de emergencia pendiente de aprobación administrativa
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                Este pedido atiende una parada de planta y contiene {porReponer.length} ítem(s) sin stock
                suficiente. Al aprobarlo, el sistema descuenta el inventario permitiendo saldo negativo
                controlado; cuando ingrese la mercadería, el negativo se regulariza automáticamente y todo
                el movimiento queda registrado y trazable en el kardex.
                {!puedeAprobar && " Solo Administración o Gerencia pueden autorizarlo."}
              </p>
            </div>
          </div>
        )}

        {p.aprobado_en && (
          <div className="flex items-center gap-2.5 rounded-lg border border-[var(--ok)]/25 bg-[var(--ok-bg)] px-4 py-2.5">
            <AlertTriangle className="size-4 shrink-0" style={{ color: "var(--ok)" }} />
            <p className="text-[12px]" style={{ color: "var(--ok)" }}>
              Emergencia autorizada por <strong>{aprob?.nombre ?? "Administración"}</strong> el{" "}
              {fechaHora(p.aprobado_en)}.
            </p>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-subtle">
              <User className="size-3.5" />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Cliente</p>
            </div>
            <Link href={`/clientes/${cliente.id}`} className="mt-2 block text-[13.5px] font-semibold leading-snug text-brand-700 hover:underline">
              {cliente.razon_social}
            </Link>
            <p className="mt-1 text-[11.5px] text-muted tabular">RUC {cliente.ruc ?? "—"}</p>
            <p className="text-[11.5px] text-muted">{cliente.direccion ?? ""}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-subtle">
              <Calendar className="size-3.5" />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Fechas</p>
            </div>
            <p className="mt-2 text-[12.5px] text-fg">Pedido: {fecha(p.fecha)}</p>
            <p className="text-[12.5px] text-fg">Entrega: {fecha(p.fecha_entrega)}</p>
            {cot && (
              <Link href={`/cotizaciones/${cot.id}`} className="mt-1.5 block text-[11.5px] font-medium text-brand-600 hover:underline">
                Origen: {cot.numero}
              </Link>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-subtle">
              <Warehouse className="size-3.5" />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Despacho</p>
            </div>
            <p className="mt-2 text-[12.5px] text-fg">{alm?.nombre ?? "Sin asignar"}</p>
            <p className="mt-1 text-[11.5px] text-muted">
              O/C cliente: {p.orden_compra_cliente ?? "—"}
            </p>
            <p className="text-[11.5px] text-muted">Asesor: {vend?.nombre ?? "—"}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-subtle">
              <FileText className="size-3.5" />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Importe</p>
            </div>
            <p className="mt-2 text-[22px] font-bold leading-none text-fg tabular">{money(p.total)}</p>
            {comprobante ? (
              <Link href={`/facturacion/${comprobante.id}`} className="mt-2 block text-[11.5px] font-medium text-brand-600 hover:underline">
                Facturado con {comprobante.numero}
              </Link>
            ) : (
              <p className="mt-2 text-[11.5px] text-muted">Pendiente de facturar</p>
            )}
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Detalle del pedido</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {lineas.length} ítem(s)
                {porReponer.length > 0 && ` · ${porReponer.length} marcado(s) como venta por reponer`}
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
                <th className="text-right">Atendido</th>
                <th className="text-right">P. Unit.</th>
                <th className="text-right">Importe</th>
                <th>Situación</th>
              </tr>
            </THead>
            <TBody>
              {lineas.map((i) => {
                const prod = i.productos as unknown as { id: string; sku: string } | null;
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
                    </td>
                    <td className="max-w-[340px] text-[12px] text-fg">{i.descripcion}</td>
                    <td className="text-right text-[12px] tabular">
                      {num(i.cantidad, 0)} <span className="text-subtle">{i.unidad}</span>
                    </td>
                    <td className="text-right text-[12px] tabular">{num(i.cantidad_atendida, 0)}</td>
                    <td className="text-right text-[12px] tabular">{money(i.precio_unitario)}</td>
                    <td className="text-right text-[12.5px] font-semibold text-fg tabular">{money(i.subtotal)}</td>
                    <td>
                      {i.por_reponer ? (
                        <Badge tone="danger" size="xs">Por reponer</Badge>
                      ) : Number(i.cantidad_atendida) >= Number(i.cantidad) ? (
                        <Badge tone="success" size="xs">Atendido</Badge>
                      ) : (
                        <Badge tone="warning" size="xs">Pendiente</Badge>
                      )}
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
                <span className="tabular">{money(p.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[12px] text-muted">
                <span>IGV (18%)</span>
                <span className="tabular">{money(p.igv)}</span>
              </div>
              <div className="flex justify-between border-t pt-1.5 text-[14px] font-bold text-fg">
                <span>Total</span>
                <span className="tabular">{money(p.total)}</span>
              </div>
              <p className="pt-1 text-right text-[10.5px] text-subtle">
                Margen estimado {pct(Number(p.subtotal) > 0 ? ((Number(p.subtotal) - Number(p.costo_total)) / Number(p.subtotal)) * 100 : 0)}
              </p>
            </div>
          </div>
        </Card>

        {p.observaciones && (
          <Card>
            <CardHeader><CardTitle>Observaciones</CardTitle></CardHeader>
            <CardContent><p className="text-[12px] leading-relaxed text-muted">{p.observaciones}</p></CardContent>
          </Card>
        )}
      </Contenedor>
    </>
  );
}
