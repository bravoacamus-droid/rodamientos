"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Anchor, Pencil, Calculator, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Select, Field, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";
import { money, pct } from "@/lib/utils";

export type GastosImportacion = {
  id: string;
  numero: string;
  dua: string | null;
  puerto_origen: string | null;
  puerto_destino: string | null;
  fecha_embarque: string | null;
  fecha_llegada: string | null;
  fecha_nacionalizacion: string | null;
  tipo_cambio: number;
  valor_fob: number;
  metodo_prorrateo: string;
  flete: number;
  seguro: number;
  ad_valorem: number;
  igv_importacion: number;
  ipm: number;
  percepcion: number;
  agente_aduana: number;
  almacen_portuario: number;
  transporte_interno: number;
  otros_gastos: number;
  estado: string;
  observaciones: string | null;
};

const CAMPOS_GASTO: [keyof GastosImportacion, string, string][] = [
  ["flete", "Flete internacional", "Transporte marítimo o aéreo desde el puerto de origen"],
  ["seguro", "Seguro de la carga", "Prima sobre el valor de la mercadería"],
  ["ad_valorem", "Derechos ad-valorem", "Arancel aplicado sobre el valor CIF"],
  ["ipm", "IPM", "Impuesto de Promoción Municipal (2%)"],
  ["agente_aduana", "Agente de aduana", "Honorarios del despacho aduanero"],
  ["almacen_portuario", "Almacenaje portuario", "Depósito temporal en el puerto"],
  ["transporte_interno", "Transporte interno", "Traslado del puerto al almacén propio"],
  ["otros_gastos", "Otros gastos", "Documentarios, handling y operativos"],
];

const CAMPOS_CREDITO: [keyof GastosImportacion, string, string][] = [
  ["igv_importacion", "IGV de importación", "Crédito fiscal · no integra el costo"],
  ["percepcion", "Percepción", "Pago a cuenta · no integra el costo"],
];

export function EditorGastosImportacion({ importacion }: { importacion: GastosImportacion }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [f, setF] = React.useState<GastosImportacion>(importacion);

  const set = <K extends keyof GastosImportacion>(k: K, v: GastosImportacion[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  React.useEffect(() => {
    if (abierto) setF(importacion);
  }, [abierto, importacion]);

  /* Los mismos criterios que aplica el prorrateo en la base de datos */
  const cif = Number(f.valor_fob) + Number(f.flete) + Number(f.seguro);
  const gastosCosto =
    Number(f.flete) + Number(f.seguro) + Number(f.ad_valorem) + Number(f.ipm) +
    Number(f.agente_aduana) + Number(f.almacen_portuario) +
    Number(f.transporte_interno) + Number(f.otros_gastos);
  const costoAlmacen = Number(f.valor_fob) + gastosCosto;
  const factor = Number(f.valor_fob) > 0 ? costoAlmacen / Number(f.valor_fob) : 1;

  /** Calcula aranceles e impuestos a partir del CIF, como referencia editable. */
  function calcularTributos() {
    const adValorem = cif * 0.06;
    setF((s) => ({
      ...s,
      ad_valorem: Number(adValorem.toFixed(2)),
      ipm: Number(((cif + adValorem) * 0.02).toFixed(2)),
      igv_importacion: Number(((cif + adValorem) * 0.16).toFixed(2)),
      percepcion: Number(((cif + adValorem) * 1.18 * 0.035).toFixed(2)),
    }));
    toast.success("Tributos calculados sobre el valor CIF", {
      description: "Ajuste los importes según la liquidación real de la DUA.",
    });
  }

  async function guardar() {
    setGuardando(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("importaciones")
      .update({
        dua: f.dua || null,
        puerto_origen: f.puerto_origen || null,
        puerto_destino: f.puerto_destino || null,
        fecha_embarque: f.fecha_embarque || null,
        fecha_llegada: f.fecha_llegada || null,
        fecha_nacionalizacion: f.fecha_nacionalizacion || null,
        tipo_cambio: Number(f.tipo_cambio),
        metodo_prorrateo: f.metodo_prorrateo,
        flete: Number(f.flete),
        seguro: Number(f.seguro),
        ad_valorem: Number(f.ad_valorem),
        ipm: Number(f.ipm),
        igv_importacion: Number(f.igv_importacion),
        percepcion: Number(f.percepcion),
        agente_aduana: Number(f.agente_aduana),
        almacen_portuario: Number(f.almacen_portuario),
        transporte_interno: Number(f.transporte_interno),
        otros_gastos: Number(f.otros_gastos),
        total_gastos: Number(gastosCosto.toFixed(2)),
        costo_total_almacen: Number(costoAlmacen.toFixed(2)),
        factor_landed: Number(factor.toFixed(4)),
        estado: f.estado,
        observaciones: f.observaciones || null,
      })
      .eq("id", f.id);

    if (error) {
      toast.error("No se pudo guardar el expediente", { description: error.message });
      setGuardando(false);
      return;
    }

    // Propaga el costo puesto en almacén a cada ítem de la orden
    const { data: detalle } = await supabase.rpc("calcular_landed_cost", { p_importacion: f.id });
    const filas = (detalle ?? []) as { producto_id: string; costo_landed_unit: number }[];

    const { data: imp } = await supabase
      .from("importaciones")
      .select("orden_compra_id")
      .eq("id", f.id)
      .single();

    if (imp?.orden_compra_id) {
      for (const fila of filas) {
        await supabase
          .from("oc_items")
          .update({ costo_landed: Number(fila.costo_landed_unit) })
          .eq("orden_compra_id", imp.orden_compra_id)
          .eq("producto_id", fila.producto_id);
      }
    }

    const { data: user } = await supabase.auth.getUser();
    await supabase.from("actividad").insert({
      usuario_id: user.user?.id ?? null,
      accion: "actualizar_importacion",
      entidad: "importaciones",
      entidad_id: f.id,
      descripcion: `Expediente ${f.numero} actualizado · factor landed ×${factor.toFixed(4)}`,
    });

    toast.success("Expediente actualizado", {
      description: `Factor landed ×${factor.toFixed(4)} aplicado a ${filas.length} ítem(s).`,
    });
    setAbierto(false);
    setGuardando(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" size="md" onClick={() => setAbierto(true)}>
        <Pencil />
        Registrar gastos
      </Button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        ancho="max-w-4xl"
        titulo={`Gastos de la importación ${f.numero}`}
        descripcion="Los importes se prorratean entre los ítems para obtener el costo real puesto en almacén."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button variant="subtle" onClick={calcularTributos}>
              <Calculator />
              Calcular tributos
            </Button>
            <Button variant="primary" loading={guardando} onClick={guardar}>
              <Save />
              Guardar y aplicar a los ítems
            </Button>
          </>
        }
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                Datos del embarque
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="DUA">
                  <Input value={f.dua ?? ""} onChange={(e) => set("dua", e.target.value)} placeholder="235-2026-10-100137" className="tabular" />
                </Field>
                <Field label="Puerto de origen">
                  <Input value={f.puerto_origen ?? ""} onChange={(e) => set("puerto_origen", e.target.value)} />
                </Field>
                <Field label="Puerto de destino">
                  <Input value={f.puerto_destino ?? ""} onChange={(e) => set("puerto_destino", e.target.value)} />
                </Field>
                <Field label="Embarque">
                  <Input type="date" value={f.fecha_embarque ?? ""} onChange={(e) => set("fecha_embarque", e.target.value)} />
                </Field>
                <Field label="Llegada">
                  <Input type="date" value={f.fecha_llegada ?? ""} onChange={(e) => set("fecha_llegada", e.target.value)} />
                </Field>
                <Field label="Nacionalización">
                  <Input type="date" value={f.fecha_nacionalizacion ?? ""} onChange={(e) => set("fecha_nacionalizacion", e.target.value)} />
                </Field>
                <Field label="Estado">
                  <Select value={f.estado} onChange={(e) => set("estado", e.target.value)}>
                    <option value="registrada">Registrada</option>
                    <option value="embarcada">Embarcada</option>
                    <option value="en_aduana">En aduana</option>
                    <option value="nacionalizada">Nacionalizada</option>
                    <option value="recibida">Recibida</option>
                  </Select>
                </Field>
                <Field label="Tipo de cambio">
                  <Input
                    type="number"
                    step="0.0001"
                    value={f.tipo_cambio}
                    onChange={(e) => set("tipo_cambio", Number(e.target.value))}
                    className="text-right tabular"
                  />
                </Field>
                <Field label="Método de prorrateo" hint="Cómo se reparte el gasto">
                  <Select value={f.metodo_prorrateo} onChange={(e) => set("metodo_prorrateo", e.target.value)}>
                    <option value="valor">Por valor FOB</option>
                    <option value="peso">Por peso</option>
                    <option value="cantidad">Por cantidad</option>
                  </Select>
                </Field>
              </div>
            </section>

            <section>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                <Anchor className="size-3.5" />
                Gastos que integran el costo
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {CAMPOS_GASTO.map(([k, label, hint]) => (
                  <Field key={k} label={label} hint={hint}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={Number(f[k])}
                      onChange={(e) => set(k, Number(e.target.value) as never)}
                      className="text-right tabular"
                    />
                  </Field>
                ))}
              </div>
            </section>

            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                Tributos con derecho a crédito fiscal
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {CAMPOS_CREDITO.map(([k, label, hint]) => (
                  <Field key={k} label={label} hint={hint}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={Number(f[k])}
                      onChange={(e) => set(k, Number(e.target.value) as never)}
                      className="text-right tabular"
                    />
                  </Field>
                ))}
              </div>
            </section>

            <Field label="Observaciones">
              <Textarea
                rows={2}
                value={f.observaciones ?? ""}
                onChange={(e) => set("observaciones", e.target.value)}
              />
            </Field>
          </div>

          {/* --------------------------------------------- Efecto en vivo */}
          <div className="space-y-3">
            <div className="sticky top-0 space-y-3">
              <div className="rounded-lg bg-[var(--surface-2)] p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
                  Valor FOB en soles
                </p>
                <p className="mt-1 text-[17px] font-bold text-fg tabular">{money(f.valor_fob)}</p>
                <p className="mt-2 text-[11px] text-muted">
                  CIF: <span className="font-medium text-fg tabular">{money(cif)}</span>
                </p>
              </div>

              <div className="rounded-lg p-3.5" style={{ backgroundColor: "var(--warn-bg)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--warn)" }}>
                  Gastos prorrateables
                </p>
                <p className="mt-1 text-[17px] font-bold tabular" style={{ color: "var(--warn)" }}>
                  {money(gastosCosto)}
                </p>
              </div>

              <div className="rounded-lg border border-brand-200 bg-brand-50 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                  Costo puesto en almacén
                </p>
                <p className="mt-1 text-[20px] font-bold leading-none text-brand-800 tabular">
                  {money(costoAlmacen)}
                </p>
                <p className="mt-2 text-[11.5px] font-medium text-brand-700">
                  Factor ×{factor.toFixed(4)} · {pct((factor - 1) * 100)} sobre el FOB
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-[var(--surface-2)] p-3">
                <Info className="mt-0.5 size-3.5 shrink-0 text-subtle" />
                <p className="text-[10.5px] leading-relaxed text-muted">
                  Al guardar, el costo unitario landed se escribe en cada ítem de la orden. La recepción
                  usará ese costo, de modo que el inventario queda valorizado al costo real y no al valor
                  en origen.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
