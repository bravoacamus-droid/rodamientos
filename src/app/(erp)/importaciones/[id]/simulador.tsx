"use client";

import * as React from "react";
import { Calculator, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Input, Field, Button, Progress } from "@/components/ui/primitives";
import { money, pct } from "@/lib/utils";

type Entrada = {
  valor_fob: number;
  flete: number;
  seguro: number;
  ad_valorem_pct: number;
  agente: number;
  almacenaje: number;
  transporte: number;
  otros: number;
};

export function SimuladorLandedCost({ inicial }: { inicial: Entrada }) {
  const [v, setV] = React.useState<Entrada>(inicial);
  const [margen, setMargen] = React.useState(35);

  const set = (k: keyof Entrada, valor: number) => setV((s) => ({ ...s, [k]: valor }));

  const cif = v.valor_fob + v.flete + v.seguro;
  const adValorem = cif * (v.ad_valorem_pct / 100);
  const ipm = (cif + adValorem) * 0.02;
  const igvImportacion = (cif + adValorem) * 0.16;
  const gastosCosto = v.flete + v.seguro + adValorem + ipm + v.agente + v.almacenaje + v.transporte + v.otros;
  const costoAlmacen = v.valor_fob + gastosCosto;
  const factor = v.valor_fob > 0 ? costoAlmacen / v.valor_fob : 1;
  const precioVenta = costoAlmacen / (1 - margen / 100);

  const CAMPOS: [keyof Entrada, string, string][] = [
    ["valor_fob", "Valor FOB en soles", "Costo en origen convertido al tipo de cambio"],
    ["flete", "Flete internacional", "Transporte marítimo o aéreo"],
    ["seguro", "Seguro de la carga", "Prima sobre el valor de la mercadería"],
    ["ad_valorem_pct", "Ad-valorem (%)", "Arancel aplicado sobre el valor CIF"],
    ["agente", "Agente de aduana", "Honorarios del despacho"],
    ["almacenaje", "Almacén portuario", "Depósito temporal"],
    ["transporte", "Transporte interno", "Puerto → almacén propio"],
    ["otros", "Otros gastos", "Documentarios y operativos"],
  ];

  const DESGLOSE: [string, number][] = [
    ["Flete", v.flete],
    ["Seguro", v.seguro],
    ["Ad-valorem", adValorem],
    ["IPM", ipm],
    ["Agente de aduana", v.agente],
    ["Almacenaje", v.almacenaje],
    ["Transporte interno", v.transporte],
    ["Otros", v.otros],
  ];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Simulador de costo puesto en almacén</CardTitle>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Ajuste los importes para proyectar el costo final y el precio de venta antes de confirmar una
            nueva importación. El IGV de importación se muestra aparte porque constituye crédito fiscal y
            no forma parte del costo.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setV(inicial)}>
          <RotateCcw />
          Restablecer
        </Button>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[1fr_1fr_280px]">
        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPOS.map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint}>
              <Input
                type="number"
                min={0}
                step={k === "ad_valorem_pct" ? "0.1" : "1"}
                value={v[k]}
                onChange={(e) => set(k, Number(e.target.value))}
                className="text-right tabular"
              />
            </Field>
          ))}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
            Composición del costo
          </p>
          <div className="space-y-2">
            {DESGLOSE.map(([label, valor]) => (
              <div key={label}>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-muted">{label}</span>
                  <span className="text-[11.5px] font-medium text-fg tabular">{money(valor)}</span>
                </div>
                <Progress value={valor} max={gastosCosto || 1} />
              </div>
            ))}
          </div>

          <div className="mt-3 space-y-1.5 border-t pt-3 text-[12px]">
            <div className="flex justify-between">
              <span className="text-muted">Valor CIF</span>
              <span className="font-medium text-fg tabular">{money(cif)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Gastos que integran el costo</span>
              <span className="font-medium text-fg tabular">{money(gastosCosto)}</span>
            </div>
            <div className="flex justify-between text-[11.5px]">
              <span className="text-subtle">IGV de importación (crédito fiscal)</span>
              <span className="text-subtle tabular">{money(igvImportacion)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">
              Costo puesto en almacén
            </p>
            <p className="mt-1.5 text-[24px] font-bold leading-none text-brand-800 tabular">
              {money(costoAlmacen)}
            </p>
            <p className="mt-2 text-[11.5px] text-brand-700">
              Factor ×{factor.toFixed(4)} · {pct((factor - 1) * 100)} sobre el FOB
            </p>
          </div>

          <Field label="Margen objetivo (%)">
            <Input
              type="number"
              min={0}
              max={95}
              step="0.5"
              value={margen}
              onChange={(e) => setMargen(Number(e.target.value))}
              className="text-right tabular"
            />
          </Field>

          <div className="rounded-lg p-3.5" style={{ backgroundColor: "var(--ok-bg)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ok)" }}>
              Precio de venta sugerido
            </p>
            <p className="mt-1.5 text-[24px] font-bold leading-none tabular" style={{ color: "var(--ok)" }}>
              {money(precioVenta)}
            </p>
            <p className="mt-2 text-[11.5px] text-muted">
              Utilidad de {money(precioVenta - costoAlmacen)} sobre el costo puesto en almacén.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-[var(--surface-2)] p-3">
            <Calculator className="mt-0.5 size-3.5 shrink-0 text-subtle" />
            <p className="text-[10.5px] leading-relaxed text-muted">
              Para las compras locales se mantiene el cálculo simple por margen mínimo sobre el costo de
              adquisición; el prorrateo solo aplica a las operaciones del exterior.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
