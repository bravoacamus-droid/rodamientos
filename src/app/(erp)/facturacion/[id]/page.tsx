import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Link2, Wallet, CheckCircle2 } from "lucide-react";
import { createClient, getEmpresa, getSesion } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { Card, CardHeader, CardTitle, CardContent, Badge, Table, THead, TBody } from "@/components/ui/primitives";
import { EstadoBadge, TIPO_COMPROBANTE } from "@/components/ui/estados";
import { Logo, FranjaMarca } from "@/components/marca/logo";
import { AccionesComprobante } from "./acciones";
import { money, num, fecha, fechaHora, pct } from "@/lib/utils";
import type { EmpresaPdf } from "@/lib/pdf/documentos";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("comprobantes").select("numero").eq("id", id).single();
  return { title: data?.numero ?? "Comprobante" };
}

export default async function ComprobantePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const sesion = await getSesion();

  const [{ data: c, error }, empresa] = await Promise.all([
    supabase
      .from("comprobantes")
      .select(
        "*, clientes(id, razon_social, ruc, direccion, distrito, contacto, email, telefono, whatsapp, dias_credito, linea_credito), profiles(nombre), pedidos(id, numero)"
      )
      .eq("id", id)
      .maybeSingle(),
    getEmpresa(),
  ]);

  // Un fallo de consulta no es un documento inexistente: se distingue para que
  // un error de esquema no vuelva a disfrazarse de 404.
  if (error) {
    throw new Error(`No se pudo leer el comprobante ${id}: ${error.message}`);
  }
  if (!c) notFound();

  /**
   * El documento afectado por una nota de crédito se lee aparte: PostgREST
   * resuelve los self-join por columna en sentido hijo→padre invertido, de modo
   * que embeberlo devolvía la relación contraria a la buscada.
   */
  const { data: referencia } = c.referencia_id
    ? await supabase
        .from("comprobantes")
        .select("id, numero")
        .eq("id", c.referencia_id)
        .maybeSingle()
    : { data: null };

  const [{ data: items }, { data: pagos }, { data: notas }] = await Promise.all([
    supabase.from("comprobante_items").select("*, productos(id, sku)").eq("comprobante_id", id).order("orden"),
    supabase.from("pagos").select("*, profiles(nombre)").eq("comprobante_id", id).order("fecha", { ascending: false }),
    supabase.from("comprobantes").select("id, numero, total, fecha_emision").eq("referencia_id", id),
  ]);

  const cliente = c.clientes as unknown as {
    id: string; razon_social: string; ruc: string | null; direccion: string | null;
    distrito: string | null; contacto: string | null; email: string | null;
    telefono: string | null; whatsapp: string | null; dias_credito: number; linea_credito: number;
  };
  const vendedor = c.profiles as unknown as { nombre: string } | null;
  const pedido = c.pedidos as unknown as { id: string; numero: string } | null;
  const lineas = items ?? [];
  const emp = empresa as unknown as EmpresaPdf & { logo_url: string };

  const margen = Number(c.op_gravada) > 0
    ? ((Number(c.op_gravada) - Number(c.costo_total)) / Number(c.op_gravada)) * 100
    : 0;

  return (
    <>
      <PageHeader
        titulo={c.numero}
        descripcion={`${TIPO_COMPROBANTE[c.tipo]} · ${cliente.razon_social}`}
        badge={<EstadoBadge tipo="comprobante" valor={c.estado} />}
        acciones={
          <>
            <Link
              href="/facturacion"
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
            >
              <ArrowLeft className="size-4" />
              Volver
            </Link>
            <AccionesComprobante
              comprobante={{
                id: c.id,
                tipo: c.tipo,
                numero: c.numero,
                fecha_emision: c.fecha_emision,
                fecha_vencimiento: c.fecha_vencimiento,
                condicion_pago: c.condicion_pago,
                moneda: c.moneda,
                op_gravada: Number(c.op_gravada),
                igv: Number(c.igv),
                total: Number(c.total),
                total_letras: c.total_letras,
                pagado: Number(c.pagado),
                saldo: Number(c.saldo),
                estado: c.estado,
                guia_remision: c.guia_remision,
                orden_compra_cliente: c.orden_compra_cliente,
                motivo_nota: c.motivo_nota,
                referencia_numero: referencia?.numero ?? null,
              }}
              cliente={cliente}
              vendedor={vendedor?.nombre ?? "Rodatech"}
              items={lineas.map((i) => ({
                codigo: i.codigo,
                descripcion: i.descripcion,
                cantidad: Number(i.cantidad),
                unidad: i.unidad,
                precio_unitario: Number(i.precio_unitario),
                descuento_pct: Number(i.descuento_pct),
                subtotal: Number(i.subtotal),
              }))}
              empresa={emp}
              usuarioId={sesion?.perfil?.id ?? null}
              rol={sesion?.perfil?.rol ?? "ventas"}
            />
          </>
        }
      />

      <Contenedor className="grid gap-4 xl:grid-cols-[1fr_330px]">
        {/* ------------------------------------------- Representación impresa */}
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <FranjaMarca />
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div>
                <Logo height={40} />
                <p className="mt-3 text-[12.5px] font-bold text-fg">{emp.razon_social}</p>
                <div className="mt-1 space-y-0.5 text-[11px] text-muted">
                  <p>{emp.direccion} · {emp.distrito}</p>
                  <p>Tel. {emp.telefono} · Cel. {emp.celular}</p>
                  <p>{emp.email_ventas} · {emp.web}</p>
                </div>
              </div>
              <div className="w-full max-w-[230px] overflow-hidden rounded-lg border-2 border-brand-600">
                <div className="bg-brand-600 px-3 py-1.5 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white">
                    {TIPO_COMPROBANTE[c.tipo]}
                  </p>
                </div>
                <div className="px-3 py-2.5 text-center">
                  <p className="text-[11.5px] text-muted tabular">R.U.C. {emp.ruc}</p>
                  <p className="mt-1 text-[19px] font-bold text-brand-700 tabular">{c.numero}</p>
                  <p className="mt-0.5 text-[10px] text-subtle">
                    {c.condicion_pago === "credito" ? "Venta al crédito" : "Venta al contado"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 border-y bg-[var(--surface-2)] p-5 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">Adquiriente</p>
                <dl className="mt-2 space-y-1">
                  {[
                    ["Señor(es)", cliente.razon_social],
                    ["RUC / DNI", cliente.ruc ?? "—"],
                    ["Dirección", `${cliente.direccion ?? "—"}${cliente.distrito ? ` · ${cliente.distrito}` : ""}`],
                    ["Guía remisión", c.guia_remision ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-[11.5px]">
                      <dt className="w-24 shrink-0 text-subtle">{k}</dt>
                      <dd className="font-medium text-fg">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">Datos del comprobante</p>
                <dl className="mt-2 space-y-1">
                  {[
                    ["Emisión", fecha(c.fecha_emision)],
                    ["Vencimiento", fecha(c.fecha_vencimiento)],
                    ["Condición", c.condicion_pago === "credito" ? `Crédito ${c.dias_credito} días` : "Contado"],
                    [referencia ? "Doc. afectado" : "O/C cliente", referencia?.numero ?? c.orden_compra_cliente ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-[11.5px]">
                      <dt className="w-24 shrink-0 text-subtle">{k}</dt>
                      <dd className="font-medium text-fg">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {c.motivo_nota && (
              <div className="border-b bg-accent-50 px-5 py-2.5">
                <p className="text-[11.5px]">
                  <span className="font-bold text-brand-700">Motivo de la nota: </span>
                  <span className="text-fg">{c.motivo_nota}</span>
                </p>
              </div>
            )}

            <Table>
              <THead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th className="text-right">Cant.</th>
                  <th>U.M.</th>
                  <th className="text-right">P. Unit.</th>
                  <th className="text-right">Dscto.</th>
                  <th className="text-right">Importe</th>
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
                      <td className="text-right text-[12px] tabular">{num(i.cantidad, 0)}</td>
                      <td className="text-[11px] text-muted">{i.unidad}</td>
                      <td className="text-right text-[12px] tabular">{money(i.precio_unitario, c.moneda)}</td>
                      <td className="text-right text-[11.5px] text-muted tabular">
                        {Number(i.descuento_pct) ? pct(i.descuento_pct) : "—"}
                      </td>
                      <td className="text-right text-[12.5px] font-semibold text-fg tabular">
                        {money(i.subtotal, c.moneda)}
                      </td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>

            <div className="flex flex-wrap items-end justify-between gap-4 border-t p-5">
              <div className="min-w-[240px] flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">Son</p>
                <p className="mt-1 text-[11.5px] font-medium leading-snug text-fg">
                  {c.total_letras ?? "—"}
                </p>
                <p className="mt-3 text-[10px] leading-relaxed text-subtle">
                  Representación impresa del comprobante electrónico. Depositar a la cuenta corriente en
                  soles de {emp.razon_social}.
                </p>
              </div>
              <div className="w-full max-w-[240px] space-y-1 rounded-lg bg-[var(--surface-2)] p-3">
                <div className="flex justify-between text-[12px] text-muted">
                  <span>Op. gravada</span>
                  <span className="tabular">{money(c.op_gravada, c.moneda)}</span>
                </div>
                <div className="flex justify-between text-[12px] text-muted">
                  <span>IGV (18%)</span>
                  <span className="tabular">{money(c.igv, c.moneda)}</span>
                </div>
                <div className="-mx-3 -mb-3 mt-2 flex justify-between rounded-b-lg bg-brand-600 px-3 py-2 text-white">
                  <span className="text-[12.5px] font-bold">IMPORTE TOTAL</span>
                  <span className="text-[13.5px] font-bold tabular">{money(c.total, c.moneda)}</span>
                </div>
              </div>
            </div>
            <FranjaMarca />
          </Card>

          {(notas ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Notas de crédito asociadas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(notas ?? []).map((n) => (
                  <Link
                    key={n.id}
                    href={`/facturacion/${n.id}`}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:border-brand-300"
                  >
                    <span className="flex items-center gap-2">
                      <Link2 className="size-3.5 text-subtle" />
                      <span className="text-[12.5px] font-semibold text-brand-700">{n.numero}</span>
                      <span className="text-[11px] text-muted">{fecha(n.fecha_emision)}</span>
                    </span>
                    <span className="text-[12.5px] font-semibold text-fg tabular">−{money(n.total)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ------------------------------------------------------ Panel lateral */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Situación de cobranza</CardTitle>
              <Wallet className="size-4 text-subtle" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                {[
                  ["Total del documento", money(c.total, c.moneda)],
                  ["Cobrado", money(c.pagado, c.moneda)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[12.5px]">
                    <span className="text-muted">{k}</span>
                    <span className="font-medium text-fg tabular">{v}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-[13px] font-semibold text-fg">Saldo</span>
                  <span
                    className="text-[18px] font-bold tabular"
                    style={{ color: Number(c.saldo) > 0 ? "var(--warn)" : "var(--ok)" }}
                  >
                    {money(c.saldo, c.moneda)}
                  </span>
                </div>
              </div>

              {Number(c.saldo) <= 0.01 && (
                <div className="flex items-center gap-2 rounded-lg bg-[var(--ok-bg)] px-3 py-2">
                  <CheckCircle2 className="size-4" style={{ color: "var(--ok)" }} />
                  <p className="text-[11.5px] font-medium" style={{ color: "var(--ok)" }}>
                    Documento totalmente cancelado
                  </p>
                </div>
              )}

              <div className="border-t pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                  Pagos registrados
                </p>
                {(pagos ?? []).length === 0 ? (
                  <p className="text-[11.5px] text-muted">Sin pagos registrados a la fecha.</p>
                ) : (
                  <ul className="space-y-2">
                    {(pagos ?? []).map((p) => {
                      const usr = p.profiles as unknown as { nombre: string } | null;
                      return (
                        <li key={p.id} className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-semibold text-fg tabular">
                              {money(p.monto, c.moneda)}
                            </span>
                            <span className="text-[11px] text-muted tabular">{fecha(p.fecha)}</span>
                          </div>
                          <p className="mt-0.5 text-[10.5px] text-subtle">
                            {p.medio}{p.banco ? ` · ${p.banco}` : ""}{p.referencia ? ` · ${p.referencia}` : ""}
                          </p>
                          {usr && <p className="text-[10px] text-subtle">Registrado por {usr.nombre}</p>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trazabilidad</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[11.5px]">
              {[
                ["Cliente", cliente.razon_social, `/clientes/${cliente.id}`],
                pedido ? ["Pedido de origen", pedido.numero, `/pedidos/${pedido.id}`] : null,
                referencia ? ["Documento afectado", referencia.numero, `/facturacion/${referencia.id}`] : null,
                ["Asesor comercial", vendedor?.nombre ?? "—", null],
                ["Registrado", fechaHora(c.creado_en), null],
                ["Margen del documento", pct(margen), null],
              ]
                .filter(Boolean)
                .map((fila) => {
                  const [k, v, href] = fila as [string, string, string | null];
                  return (
                    <div key={k} className="flex items-center justify-between gap-2 border-b border-[var(--border-soft)] pb-1.5 last:border-0">
                      <span className="text-muted">{k}</span>
                      {href ? (
                        <Link href={href} className="max-w-[170px] truncate text-right font-medium text-brand-600 hover:underline">
                          {v}
                        </Link>
                      ) : (
                        <span className="max-w-[170px] truncate text-right font-medium text-fg">{v}</span>
                      )}
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </div>
      </Contenedor>
    </>
  );
}
