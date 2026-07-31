import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Factory, Calendar, Ship, PackageCheck, Warehouse } from "lucide-react";
import { createClient, getSesion, getEmpresa } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { AccionesOrdenCompra } from "./acciones";
import type { EmpresaPdf } from "@/lib/pdf/documentos";
import { money, num, fecha } from "@/lib/utils";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("ordenes_compra").select("numero").eq("id", id).single();
  return { title: data?.numero ?? "Orden de compra" };
}

export default async function OrdenCompraPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const sesion = await getSesion();
  const empresa = (await getEmpresa()) as unknown as EmpresaPdf;

  const { data: o } = await supabase
    .from("ordenes_compra")
    .select(
      "*, proveedores(id, codigo, razon_social, ruc, pais, tipo, contacto, email, telefono, lead_time_dias), almacenes(nombre), profiles(nombre)"
    )
    .eq("id", id)
    .single();

  if (!o) notFound();

  const [{ data: items }, { data: importacion }, { data: recepciones }] = await Promise.all([
    supabase.from("oc_items").select("*, productos(id, sku)").eq("orden_compra_id", id).order("orden"),
    supabase.from("importaciones").select("id, numero, estado, factor_landed, costo_total_almacen").eq("orden_compra_id", id).maybeSingle(),
    supabase.from("recepciones").select("id, numero, fecha, guia_proveedor, factura_proveedor").eq("orden_compra_id", id),
  ]);

  const prov = o.proveedores as unknown as {
    id: string; codigo: string; razon_social: string; ruc: string | null; pais: string;
    tipo: string; contacto: string | null; email: string | null; telefono: string | null;
    lead_time_dias: number;
  };
  const alm = o.almacenes as unknown as { nombre: string } | null;
  const comprador = o.profiles as unknown as { nombre: string } | null;
  const lineas = items ?? [];
  const esImportacion = o.tipo === "importacion";

  return (
    <>
      <PageHeader
        titulo={o.numero}
        descripcion={`${prov.razon_social} · ${fecha(o.fecha)}`}
        badge={
          <>
            <EstadoBadge tipo="oc" valor={o.estado} />
            <Badge tone={esImportacion ? "accent" : "neutral"} size="sm">
              {esImportacion ? `Importación · ${o.incoterm ?? "FOB"}` : "Compra local"}
            </Badge>
          </>
        }
        acciones={
          <>
            <Link
              href="/compras"
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
            >
              <ArrowLeft className="size-4" />
              Volver
            </Link>
            {importacion && (
              <Link
                href={`/importaciones/${importacion.id}`}
                className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
              >
                <Ship className="size-4" />
                Expediente {importacion.numero}
              </Link>
            )}
            <AccionesOrdenCompra
              orden={{
                id: o.id,
                numero: o.numero,
                tipo: o.tipo,
                estado: o.estado,
                moneda: o.moneda,
                tipo_cambio: Number(o.tipo_cambio),
                almacen_id: o.almacen_id,
                proveedor: prov.razon_social,
                fecha: o.fecha,
                fecha_estimada: o.fecha_estimada,
                incoterm: o.incoterm,
                subtotal: Number(o.subtotal),
                igv: Number(o.igv),
                total: Number(o.total),
                observaciones: o.observaciones,
                almacen: alm?.nombre ?? null,
                comprador: comprador?.nombre ?? "Rodatech",
                proveedorDatos: {
                  razon_social: prov.razon_social,
                  ruc: prov.ruc,
                  pais: prov.pais,
                  direccion: null,
                  contacto: prov.contacto,
                  email: prov.email,
                  telefono: prov.telefono,
                },
              }}
              items={lineas.map((i) => ({
                id: i.id,
                producto_id: i.producto_id,
                codigo: i.codigo,
                descripcion: i.descripcion,
                cantidad: Number(i.cantidad),
                cantidad_recibida: Number(i.cantidad_recibida),
                unidad: i.unidad,
                costo_unitario: Number(i.costo_unitario),
                costo_landed: Number(i.costo_landed),
              }))}
              tieneImportacion={!!importacion}
              importacionId={importacion?.id ?? null}
              usuarioId={sesion?.perfil?.id ?? null}
              puedeRecibir={["admin", "gerencia", "compras", "almacen"].includes(
                sesion?.perfil?.rol ?? ""
              )}
              empresa={empresa}
            />
          </>
        }
      />

      <Contenedor className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-subtle">
              <Factory className="size-3.5" />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Proveedor</p>
            </div>
            <Link href="/proveedores" className="mt-2 block text-[13px] font-semibold leading-snug text-brand-700 hover:underline">
              {prov.razon_social}
            </Link>
            <p className="mt-1 text-[11.5px] text-muted">{prov.pais} · lead time {prov.lead_time_dias} días</p>
            <p className="text-[11.5px] text-muted">{prov.contacto ?? "—"}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-subtle">
              <Calendar className="size-3.5" />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Fechas</p>
            </div>
            <p className="mt-2 text-[12.5px] text-fg">Emisión: {fecha(o.fecha)}</p>
            <p className="text-[12.5px] text-fg">Estimada: {fecha(o.fecha_estimada)}</p>
            <p className="mt-1 text-[11.5px] text-muted">Comprador: {comprador?.nombre ?? "—"}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-subtle">
              <Warehouse className="size-3.5" />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Recepción</p>
            </div>
            <p className="mt-2 text-[12.5px] text-fg">{alm?.nombre ?? "Sin asignar"}</p>
            {(recepciones ?? []).length > 0 ? (
              (recepciones ?? []).map((r) => (
                <p key={r.id} className="mt-1 text-[11px] text-muted">
                  {r.numero} · {fecha(r.fecha)} · guía {r.guia_proveedor}
                </p>
              ))
            ) : (
              <p className="mt-1 text-[11.5px] text-muted">Pendiente de recibir</p>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-subtle">
              <PackageCheck className="size-3.5" />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Importe</p>
            </div>
            <p className="mt-2 text-[22px] font-bold leading-none text-fg tabular">
              {money(o.total, o.moneda)}
            </p>
            <p className="mt-1.5 text-[11.5px] text-muted">
              {lineas.length} ítem(s) · {num(lineas.reduce((s, i) => s + Number(i.cantidad), 0), 0)} unidades
            </p>
            {esImportacion && importacion && (
              <p className="mt-1 text-[11.5px] font-medium text-accent-800">
                Factor landed ×{Number(importacion.factor_landed).toFixed(4)}
              </p>
            )}
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Detalle de la orden</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {esImportacion
                  ? "Costos en moneda de origen. La columna landed muestra el costo puesto en almacén ya prorrateado."
                  : "Costos en soles con IGV crédito fiscal."}
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
                <th className="text-right">Recibido</th>
                <th className="text-right">Costo unit.</th>
                <th className="text-right">Importe</th>
                {esImportacion && <th className="text-right">Costo landed</th>}
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
                    <td className="max-w-[320px] text-[12px] text-fg">{i.descripcion}</td>
                    <td className="text-right text-[12px] tabular">
                      {num(i.cantidad, 0)} <span className="text-subtle">{i.unidad}</span>
                    </td>
                    <td className="text-right text-[12px] tabular">
                      <span style={{ color: Number(i.cantidad_recibida) >= Number(i.cantidad) ? "var(--ok)" : "var(--warn)" }}>
                        {num(i.cantidad_recibida, 0)}
                      </span>
                    </td>
                    <td className="text-right text-[12px] tabular">{money(i.costo_unitario, o.moneda)}</td>
                    <td className="text-right text-[12.5px] font-semibold text-fg tabular">
                      {money(i.subtotal, o.moneda)}
                    </td>
                    {esImportacion && (
                      <td className="text-right text-[12.5px] font-semibold tabular text-accent-800">
                        {money(i.costo_landed)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </TBody>
          </Table>
          <div className="flex justify-end border-t bg-[var(--surface-2)] px-5 py-3">
            <div className="w-full max-w-xs space-y-1">
              <div className="flex justify-between text-[12px] text-muted">
                <span>Subtotal</span>
                <span className="tabular">{money(o.subtotal, o.moneda)}</span>
              </div>
              {!esImportacion && (
                <div className="flex justify-between text-[12px] text-muted">
                  <span>IGV (18%)</span>
                  <span className="tabular">{money(o.igv, o.moneda)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1.5 text-[14px] font-bold text-fg">
                <span>Total</span>
                <span className="tabular">{money(o.total, o.moneda)}</span>
              </div>
              {esImportacion && importacion && (
                <p className="pt-1 text-right text-[10.5px] text-subtle">
                  Costo puesto en almacén: {money(importacion.costo_total_almacen)}
                </p>
              )}
            </div>
          </div>
        </Card>

        {o.observaciones && (
          <Card>
            <CardHeader><CardTitle>Observaciones</CardTitle></CardHeader>
            <CardContent><p className="text-[12px] leading-relaxed text-muted">{o.observaciones}</p></CardContent>
          </Card>
        )}
      </Contenedor>
    </>
  );
}
