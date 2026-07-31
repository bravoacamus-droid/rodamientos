"use client";

import * as React from "react";
import Link from "next/link";
import { Info, Loader2, TrendingUp, Package, Truck, Users, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Badge, Tooltip, Progress } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";
import { GraficoBarrasH } from "@/components/charts/graficos";
import { money, num, fecha, haceTiempo } from "@/lib/utils";

export type FilaReposicion = {
  producto_id: string;
  sku: string;
  descripcion: string;
  marca: string | null;
  categoria: string | null;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  costo_promedio: number;
  precio_mayorista: number;
  salidas_30: number;
  salidas_90: number;
  salidas_180: number;
  consumo_diario: number;
  cobertura_dias: number;
  lead_time_dias: number;
  en_transito: number;
  punto_reorden: number;
  cantidad_sugerida: number;
  inversion: number;
  clientes_90: number;
  ultima_salida: string | null;
  criticidad: string;
};

export const CRITICIDAD: Record<string, { label: string; tone: "danger" | "warning" | "info" | "success"; desc: string }> = {
  quiebre: { label: "Quiebre", tone: "danger", desc: "Sin stock: cada pedido que llegue se pierde o se atiende como emergencia" },
  urgente: { label: "Urgente", tone: "danger", desc: "El stock se agota antes de que llegue una reposición pedida hoy" },
  proximo: { label: "Próximo", tone: "warning", desc: "Menos de 30 días de cobertura" },
  holgado: { label: "Holgado", tone: "success", desc: "Cobertura suficiente" },
};

/**
 * Explica por qué el sistema recomienda comprar un ítem, con los mismos números
 * que producen la sugerencia y la tendencia de consumo de los últimos 12 meses.
 */
export function ExplicacionReposicion({
  fila,
  horizonte = 45,
  compacto,
}: {
  fila: FilaReposicion;
  horizonte?: number;
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [consumo, setConsumo] = React.useState<{ etiqueta: string; unidades: number }[]>([]);
  const [cargando, setCargando] = React.useState(false);

  React.useEffect(() => {
    if (!abierto || consumo.length) return;
    setCargando(true);
    const supabase = createClient();
    supabase
      .rpc("consumo_mensual", { p_producto: fila.producto_id, p_meses: 12 })
      .then(({ data }) => {
        setConsumo(
          ((data ?? []) as { etiqueta: string; unidades: number }[]).map((m) => ({
            etiqueta: String(m.etiqueta).replace(".", ""),
            unidades: Number(m.unidades),
          }))
        );
        setCargando(false);
      });
  }, [abierto, consumo.length, fila.producto_id]);

  const crit = CRITICIDAD[fila.criticidad] ?? CRITICIDAD.holgado;
  const demandaHorizonte = fila.consumo_diario * (horizonte + fila.lead_time_dias);
  const tendencia =
    fila.salidas_90 > 0 ? (fila.salidas_30 / (fila.salidas_90 / 3) - 1) * 100 : 0;

  const PASOS: [string, string, string][] = [
    [
      "Consumo diario promedio",
      `${num(fila.consumo_diario, 3)} ${fila.unidad}/día`,
      `${num(fila.salidas_90, 0)} unidades salieron en los últimos 90 días`,
    ],
    [
      "Demanda hasta la próxima compra",
      `${num(demandaHorizonte, 0)} ${fila.unidad}`,
      `${horizonte} días de cobertura objetivo + ${fila.lead_time_dias} días que tarda el proveedor`,
    ],
    [
      "Menos el stock disponible",
      `− ${num(fila.stock_actual, 0)} ${fila.unidad}`,
      fila.stock_actual < 0
        ? "El saldo es negativo por una venta de emergencia pendiente de regularizar"
        : "Existencias en todos los almacenes",
    ],
    [
      "Menos lo ya pedido",
      `− ${num(fila.en_transito, 0)} ${fila.unidad}`,
      fila.en_transito > 0
        ? "Hay órdenes de compra emitidas y no recibidas para este ítem"
        : "No hay órdenes pendientes de recibir",
    ],
  ];

  return (
    <>
      {compacto ? (
        <Tooltip label="Por qué se sugiere">
          <Button variant="ghost" size="icon-sm" onClick={() => setAbierto(true)}>
            <Info />
          </Button>
        </Tooltip>
      ) : (
        <Button variant="ghost" size="xs" onClick={() => setAbierto(true)}>
          <Info />
          Por qué
        </Button>
      )}

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        ancho="max-w-3xl"
        titulo={`Por qué se sugiere comprar ${fila.sku}`}
        descripcion={fila.descripcion}
        footer={
          <>
            <Link href={`/productos/${fila.producto_id}`}>
              <Button variant="outline">
                <ExternalLink />
                Ver ficha del producto
              </Button>
            </Link>
            <Button variant="primary" onClick={() => setAbierto(false)}>Entendido</Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* ------------------------------------------------ Conclusión */}
          <div
            className="rounded-lg px-4 py-3"
            style={{
              backgroundColor:
                crit.tone === "danger" ? "var(--danger-bg)"
                : crit.tone === "warning" ? "var(--warn-bg)"
                : "var(--ok-bg)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={crit.tone} size="md">{crit.label}</Badge>
              <span className="text-[12px] text-muted">
                Cobertura actual:{" "}
                <strong className="text-fg tabular">
                  {fila.cobertura_dias > 900 ? "sin consumo" : `${num(fila.cobertura_dias, 0)} días`}
                </strong>
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-fg">
              {crit.desc}. Al ritmo actual de{" "}
              <strong>{num(fila.consumo_diario, 2)} {fila.unidad} por día</strong>, el stock de{" "}
              <strong>{num(fila.stock_actual, 0)}</strong> alcanza para{" "}
              <strong>{num(Math.max(fila.cobertura_dias, 0), 0)} días</strong>, y el proveedor tarda{" "}
              <strong>{fila.lead_time_dias} días</strong> en entregar.
            </p>
            <p className="mt-2 text-[14px] font-semibold text-fg">
              Compra sugerida: {num(fila.cantidad_sugerida, 0)} {fila.unidad} ·{" "}
              {money(fila.inversion)}
            </p>
          </div>

          {/* --------------------------------------------- Cómo se calcula */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Cómo se llega a esa cantidad
            </p>
            <div className="space-y-1.5">
              {PASOS.map(([titulo, valor, detalle], i) => (
                <div key={titulo} className="flex items-start gap-3 rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-fg">{titulo}</span>
                    <span className="block text-[10.5px] text-muted">{detalle}</span>
                  </span>
                  <span className="shrink-0 text-[12.5px] font-semibold text-fg tabular">{valor}</span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg border border-brand-300 bg-brand-50 px-3 py-2.5">
                <span className="text-[12.5px] font-semibold text-brand-800">
                  Cantidad a comprar
                </span>
                <span className="text-[15px] font-bold text-brand-800 tabular">
                  {num(fila.cantidad_sugerida, 0)} {fila.unidad}
                </span>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------ Indicadores */}
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              { icon: <TrendingUp />, k: "Últimos 30 días", v: `${num(fila.salidas_30, 0)} ${fila.unidad}`,
                sub: tendencia > 8 ? `+${num(tendencia, 0)}% vs. promedio` : tendencia < -8 ? `${num(tendencia, 0)}% vs. promedio` : "En línea con el promedio" },
              { icon: <Package />, k: "Punto de reorden", v: `${num(fila.punto_reorden, 0)} ${fila.unidad}`,
                sub: "Nivel al que conviene pedir" },
              { icon: <Truck />, k: "En tránsito", v: `${num(fila.en_transito, 0)} ${fila.unidad}`,
                sub: fila.en_transito > 0 ? "Ya pedido al proveedor" : "Nada pedido" },
              { icon: <Users />, k: "Clientes (90 días)", v: num(fila.clientes_90, 0),
                sub: fila.clientes_90 > 1 ? "Demanda distribuida" : fila.clientes_90 === 1 ? "Un solo cliente" : "Sin ventas facturadas" },
            ].map((x) => (
              <div key={x.k} className="rounded-lg border px-3 py-2">
                <span className="flex items-center gap-1.5 text-subtle [&_svg]:size-3">
                  {x.icon}
                  <span className="text-[10px] uppercase tracking-wide">{x.k}</span>
                </span>
                <p className="mt-1 text-[14px] font-bold text-fg tabular">{x.v}</p>
                <p className="mt-0.5 text-[10px] text-muted">{x.sub}</p>
              </div>
            ))}
          </div>

          {/* ------------------------------------------- Consumo mensual */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Consumo mes a mes · últimos 12 meses
            </p>
            {cargando ? (
              <div className="flex h-40 items-center justify-center rounded-lg bg-[var(--surface-2)]">
                <Loader2 className="size-5 animate-spin text-brand-600" />
              </div>
            ) : consumo.some((c) => c.unidades > 0) ? (
              <GraficoBarrasH
                data={consumo.map((c) => ({ nombre: c.etiqueta, valor: c.unidades }))}
                formato="num"
                anchoEje={62}
                alto={230}
              />
            ) : (
              <p className="rounded-lg bg-[var(--surface-2)] px-3 py-6 text-center text-[12px] text-muted">
                Sin salidas registradas en el periodo.
              </p>
            )}
          </div>

          {/* ------------------------------------------------- Rentabilidad */}
          <div className="rounded-lg bg-[var(--surface-2)] px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Qué está en juego
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {[
                ["Venta mensual del ítem", money(fila.consumo_diario * 30 * fila.precio_mayorista)],
                ["Inversión de la compra", money(fila.inversion)],
                ["Última salida", fila.ultima_salida ? haceTiempo(fila.ultima_salida) : "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-[10px] text-subtle">{k}</p>
                  <p className="text-[12.5px] font-semibold text-fg tabular">{v}</p>
                </div>
              ))}
            </div>
            <Progress
              className="mt-3"
              value={Math.min(Math.max(fila.stock_actual, 0), fila.punto_reorden * 3)}
              max={Math.max(fila.punto_reorden * 3, 1)}
              tone={crit.tone === "danger" ? "danger" : crit.tone === "warning" ? "warning" : "success"}
            />
            <p className="mt-1.5 text-[10.5px] text-muted">
              Stock actual frente al punto de reorden ({num(fila.punto_reorden, 0)} {fila.unidad}).
              {fila.ultima_salida && ` Última salida el ${fecha(fila.ultima_salida)}.`}
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
