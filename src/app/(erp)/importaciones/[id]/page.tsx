import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Ship, Anchor, Calculator, FileText, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Contenedor } from "@/components/layout/shell";
import { Card, CardHeader, CardTitle, CardContent, Table, THead, TBody, Badge, Progress } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { SimuladorLandedCost } from "./simulador";
import { money, num, pct, fecha } from "@/lib/utils";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("importaciones").select("numero").eq("id", id).single();
  return { title: data?.numero ?? "Importación" };
}

const ETAPAS = [
  { id: "registrada", label: "Registrada" },
  { id: "embarcada", label: "Embarcada" },
  { id: "en_aduana", label: "En aduana" },
  { id: "nacionalizada", label: "Nacionalizada" },
  { id: "recibida", label: "En almacén" },
];

export default async function ImportacionPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: imp } = await supabase
    .from("importaciones")
    .select("*, ordenes_compra(id, numero, moneda, subtotal), proveedores(razon_social, pais, contacto, email)")
    .eq("id", id)
    .single();

  if (!imp) notFound();

  const { data: detalle } = await supabase.rpc("calcular_landed_cost", { p_importacion: id });

  const oc = imp.ordenes_compra as unknown as { id: string; numero: string; moneda: string; subtotal: number } | null;
  const prov = imp.proveedores as unknown as { razon_social: string; pais: string; contacto: string | null; email: string | null } | null;

  const filas = (detalle ?? []) as {
    producto_id: string; codigo: string; descripcion: string; cantidad: number;
    costo_fob_unit: number; costo_fob_total: number; base_prorrateo: number;
    participacion: number; gastos_asignados: number; costo_landed_unit: number;
    costo_landed_total: number; incremento_pct: number;
  }[];

  const etapaIdx = ETAPAS.findIndex((e) => e.id === imp.estado);

  const GASTOS: [string, number, string][] = [
    ["Flete internacional", Number(imp.flete), "Transporte marítimo desde el puerto de origen"],
    ["Seguro de la carga", Number(imp.seguro), "Prima sobre el valor FOB"],
    ["Derechos ad-valorem", Number(imp.ad_valorem), "Arancel sobre el valor CIF"],
    ["IPM", Number(imp.ipm), "Impuesto de Promoción Municipal (2%)"],
    ["Agente de aduana", Number(imp.agente_aduana), "Honorarios del despacho aduanero"],
    ["Almacenaje portuario", Number(imp.almacen_portuario), "Depósito temporal en el puerto"],
    ["Transporte interno", Number(imp.transporte_interno), "Traslado del puerto al almacén"],
    ["Otros gastos", Number(imp.otros_gastos), "Gastos operativos y documentarios"],
  ];

  const CREDITO: [string, number, string][] = [
    ["IGV de importación", Number(imp.igv_importacion), "Crédito fiscal · no integra el costo"],
    ["Percepción", Number(imp.percepcion), "Pago a cuenta · no integra el costo"],
  ];

  const totalGastos = GASTOS.reduce((s, g) => s + g[1], 0);
  const incremento = (Number(imp.factor_landed) - 1) * 100;

  return (
    <>
      <PageHeader
        titulo={imp.numero}
        descripcion={`${prov?.razon_social} · DUA ${imp.dua ?? "—"} · ${imp.puerto_origen} → ${imp.puerto_destino}`}
        badge={<EstadoBadge tipo="importacion" valor={imp.estado} />}
        acciones={
          <>
            <Link
              href="/importaciones"
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-[var(--surface)] px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-brand-300"
            >
              <ArrowLeft className="size-4" />
              Volver
            </Link>
            {oc && (
              <Link
                href={`/compras/${oc.id}`}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
              >
                <FileText className="size-4" />
                Orden {oc.numero}
              </Link>
            )}
          </>
        }
      />

      <Contenedor className="space-y-4">
        {/* --------------------------------------------------- Línea de tiempo */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Ship className="size-4 text-brand-600" />
              <p className="text-[13px] font-semibold text-fg">Trazabilidad del embarque</p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-muted">
              <span>Embarque: <span className="font-medium text-fg">{fecha(imp.fecha_embarque)}</span></span>
              <span>Llegada: <span className="font-medium text-fg">{fecha(imp.fecha_llegada)}</span></span>
              <span>Nacionalización: <span className="font-medium text-fg">{fecha(imp.fecha_nacionalizacion)}</span></span>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1">
            {ETAPAS.map((e, i) => (
              <div key={e.id} className="flex-1">
                <div
                  className="h-1.5 rounded-full transition-colors"
                  style={{
                    backgroundColor: i <= etapaIdx ? "var(--color-brand-600)" : "var(--surface-2)",
                  }}
                />
                <p
                  className="mt-1.5 text-[10px] font-medium"
                  style={{ color: i <= etapaIdx ? "var(--color-brand-600)" : "var(--fg-subtle)" }}
                >
                  {e.label}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* ------------------------------------------------------ Resumen */}
        <div className="grid gap-3 lg:grid-cols-4">
          {[
            ["Valor FOB", money(imp.valor_fob), `${money(oc?.subtotal ?? 0, "USD")} en origen`, "brand"],
            ["Gastos de importación", money(totalGastos), "Prorrateados al costo", "warning"],
            ["Costo puesto en almacén", money(imp.costo_total_almacen), "FOB + gastos", "success"],
            ["Factor landed", `×${Number(imp.factor_landed).toFixed(4)}`, `+${pct(incremento)} sobre el FOB`, "danger"],
          ].map(([titulo, valor, sub, tono]) => (
            <Card key={String(titulo)} className="relative overflow-hidden p-4">
              <span
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{
                  backgroundColor:
                    tono === "success" ? "var(--ok)"
                    : tono === "warning" ? "var(--warn)"
                    : tono === "danger" ? "var(--danger)"
                    : "var(--color-brand-600)",
                }}
              />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{titulo}</p>
              <p className="mt-2 text-[22px] font-bold leading-none text-fg tabular">{valor}</p>
              <p className="mt-2 text-[11.5px] text-muted">{sub}</p>
            </Card>
          ))}
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          {/* --------------------------------------- Estructura de costos */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Estructura de gastos</CardTitle>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  Prorrateo por {imp.metodo_prorrateo === "peso" ? "peso" : imp.metodo_prorrateo === "cantidad" ? "cantidad" : "valor FOB"}
                </p>
              </div>
              <Anchor className="size-4 text-subtle" />
            </CardHeader>
            <CardContent className="space-y-2">
              {GASTOS.map(([label, valor, desc]) => (
                <div key={label}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-fg">{label}</span>
                    <span className="text-[12.5px] font-semibold text-fg tabular">{money(valor)}</span>
                  </div>
                  <Progress value={valor} max={totalGastos} className="mt-1" />
                  <p className="mt-0.5 text-[10px] text-subtle">{desc}</p>
                </div>
              ))}

              <div className="mt-3 flex items-center justify-between border-t pt-2.5">
                <span className="text-[12.5px] font-semibold text-fg">Total prorrateado</span>
                <span className="text-[14px] font-bold text-fg tabular">{money(totalGastos)}</span>
              </div>

              <div className="mt-3 rounded-lg bg-[var(--surface-2)] p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                  Tributos con derecho a crédito
                </p>
                {CREDITO.map(([label, valor, desc]) => (
                  <div key={label} className="mb-1.5 last:mb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] text-muted">{label}</span>
                      <span className="text-[11.5px] font-medium text-muted tabular">{money(valor)}</span>
                    </div>
                    <p className="text-[9.5px] text-subtle">{desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* -------------------------------------------- Detalle prorrateo */}
          <Card className="xl:col-span-2 overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>Costo puesto en almacén por ítem</CardTitle>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  A partir de este costo se define el margen y el precio de venta de cada producto.
                </p>
              </div>
              <Calculator className="size-4 text-subtle" />
            </CardHeader>
            <Table>
              <THead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th className="text-right">Cant.</th>
                  <th className="text-right">FOB unit.</th>
                  <th className="text-right">Particip.</th>
                  <th className="text-right">Gastos asig.</th>
                  <th className="text-right">Costo landed</th>
                  <th className="text-right">Incremento</th>
                </tr>
              </THead>
              <TBody>
                {filas.map((f) => (
                  <tr key={f.producto_id}>
                    <td>
                      <Link href={`/productos/${f.producto_id}`} className="text-[12px] font-semibold text-brand-700 hover:underline">
                        {f.codigo}
                      </Link>
                    </td>
                    <td className="max-w-[240px] truncate text-[11.5px] text-fg">{f.descripcion}</td>
                    <td className="text-right text-[12px] tabular">{num(f.cantidad, 0)}</td>
                    <td className="text-right text-[12px] tabular">{money(f.costo_fob_unit)}</td>
                    <td className="text-right text-[11.5px] text-muted tabular">{pct(f.participacion, 2)}</td>
                    <td className="text-right text-[11.5px] text-muted tabular">{money(f.gastos_asignados)}</td>
                    <td className="text-right text-[12.5px] font-bold tabular text-accent-800">
                      {money(f.costo_landed_unit)}
                    </td>
                    <td className="text-right text-[11.5px] font-medium tabular" style={{ color: "var(--warn)" }}>
                      +{pct(f.incremento_pct, 1)}
                    </td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>

        {/* ------------------------------------------------------- Simulador */}
        <SimuladorLandedCost
          inicial={{
            valor_fob: Number(imp.valor_fob),
            flete: Number(imp.flete),
            seguro: Number(imp.seguro),
            ad_valorem_pct: 6,
            agente: Number(imp.agente_aduana),
            almacenaje: Number(imp.almacen_portuario),
            transporte: Number(imp.transporte_interno),
            otros: Number(imp.otros_gastos),
          }}
        />

        {imp.observaciones && (
          <div className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2.5">
            <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
            <p className="text-[11.5px] leading-relaxed text-brand-800">{imp.observaciones}</p>
          </div>
        )}
      </Contenedor>
    </>
  );
}
