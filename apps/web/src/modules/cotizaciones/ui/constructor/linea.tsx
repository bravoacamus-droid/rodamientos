"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Input } from "@rodatech/ui";

import { historialDe, sustitutosPara, type Sustituto, type VentaAnterior } from "../../acciones/buscar";
import type { Accion, LineaConstructor } from "../../dominio/constructor";
import { revisionDe } from "../../dominio/constructor";
import { importeLinea } from "../../dominio/totales";

/**
 * Una línea de la cotización.
 *
 * Concentra la negociación, que es donde Willy pierde o gana el margen:
 *
 *   - El precio y el descuento se pueden bajar libremente, pero el piso se
 *     pinta EN VIVO. Impedir la tecla obliga a adivinar dónde está el límite;
 *     verlo se lo enseña.
 *   - Cuando la línea rompe el piso se dice cuánto falta y cuál es el descuento
 *     máximo que sí cabe. Un "no puedes" sin número no sirve para negociar.
 *   - Si no hay stock, se ofrecen sustitutos ahí mismo (49:56).
 *   - El histórico dice a cuánto se le vendió ANTES a este cliente.
 */

const dolar = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

export function FilaLinea({
  linea,
  indice,
  total,
  clienteId,
  mostrarDescuento,
  despachar,
}: {
  linea: LineaConstructor;
  indice: number;
  total: number;
  clienteId: string | null;
  mostrarDescuento: boolean;
  despachar: (a: Accion) => void;
}) {
  const [panel, setPanel] = useState<"ninguno" | "sustitutos" | "historial">("ninguno");
  const [sustitutos, setSustitutos] = useState<Sustituto[]>([]);
  const [historial, setHistorial] = useState<VentaAnterior[]>([]);
  const [cargando, iniciar] = useTransition();

  const revision = revisionDe(linea);
  const importe = importeLinea({
    cantidad: linea.cantidad,
    valorUnitario: linea.valorUnitario,
    descuentoPct: linea.descuentoPct,
  });
  const sinStock = linea.productoId !== null && linea.stock < linea.cantidad;

  const abrirSustitutos = () => {
    if (panel === "sustitutos") return setPanel("ninguno");
    setPanel("sustitutos");
    if (sustitutos.length > 0 || !linea.productoId) return;
    iniciar(async () => {
      const r = await sustitutosPara(linea.productoId as string);
      if (r.ok) setSustitutos(r.datos);
    });
  };

  const abrirHistorial = () => {
    if (panel === "historial") return setPanel("ninguno");
    setPanel("historial");
    if (historial.length > 0 || !linea.productoId) return;
    iniciar(async () => {
      const r = await historialDe(linea.productoId as string, clienteId);
      if (r.ok) setHistorial(r.datos);
    });
  };

  return (
    <>
      <tr className={revision.ok ? "" : "bg-[var(--danger-bg)]"}>
        <td className="tabular text-[var(--fg-muted)]">{indice + 1}</td>

        <td>
          <div className="font-medium">{linea.codigo}</div>
          {sinStock ? (
            <button
              type="button"
              onClick={abrirSustitutos}
              className="mt-0.5 text-xs text-[var(--warn)] underline"
            >
              sin stock · ver alternativas
            </button>
          ) : (
            <span className="text-xs text-[var(--fg-muted)]">
              stock {linea.stock}
            </span>
          )}
        </td>

        {/* C2: la marca en columna propia. */}
        <td className="text-sm">{linea.marca ?? "—"}</td>

        {/* C3: la descripción no repite el código. */}
        <td className="text-sm">{linea.descripcion}</td>

        <td className="w-24">
          <Input
            type="number"
            min={0}
            step="any"
            value={linea.cantidad}
            onChange={(e) =>
              despachar({ tipo: "cantidad", key: linea.key, valor: Number(e.target.value) })
            }
            className="text-right tabular"
            aria-label={`Cantidad de ${linea.codigo}`}
          />
        </td>

        <td className="text-xs text-[var(--fg-muted)]">{linea.unidad}</td>

        {/* C1: SOLO valor unitario. La columna "precio unitario" (valor x 1.18)
            desaparece del modelo, no solo del PDF: es la que le hizo perder
            ventas porque el cliente comparaba con IGV contra la competencia. */}
        <td className="w-28">
          <Input
            type="number"
            min={0}
            step="0.0001"
            value={linea.valorUnitario}
            onChange={(e) =>
              despachar({ tipo: "precio", key: linea.key, valor: Number(e.target.value) })
            }
            className={`text-right tabular ${revision.ok ? "" : "border-[var(--danger)]"}`}
            aria-label={`Valor unitario de ${linea.codigo}`}
          />
          {linea.valorUnitario !== linea.precioLista ? (
            <button
              type="button"
              onClick={() => despachar({ tipo: "volverALista", key: linea.key })}
              className="mt-0.5 text-xs text-[var(--fg-muted)] underline"
              title={`Lista: ${dolar(linea.precioLista)}`}
            >
              volver a {dolar(linea.precioLista)}
            </button>
          ) : null}
        </td>

        {mostrarDescuento ? (
          <td className="w-24">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={linea.descuentoPct}
              onChange={(e) =>
                despachar({ tipo: "descuento", key: linea.key, valor: Number(e.target.value) })
              }
              className={`text-right tabular ${revision.ok ? "" : "border-[var(--danger)]"}`}
              aria-label={`Descuento de ${linea.codigo}`}
            />
            {revision.descuentoMaximoPct !== null && revision.ok ? (
              <span className="mt-0.5 block text-xs text-[var(--fg-muted)]">
                máx. {revision.descuentoMaximoPct}%
              </span>
            ) : null}
          </td>
        ) : null}

        <td className="text-right tabular font-medium">{dolar(importe)}</td>

        <td>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={abrirHistorial}
              className="rounded-sm px-1.5 py-1 text-xs text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
              title="A cuánto se vendió antes"
            >
              hist.
            </button>
            <button
              type="button"
              onClick={() => despachar({ tipo: "mover", key: linea.key, direccion: -1 })}
              disabled={indice === 0}
              className="rounded-sm px-1.5 py-1 text-xs disabled:opacity-30"
              aria-label="Subir"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => despachar({ tipo: "mover", key: linea.key, direccion: 1 })}
              disabled={indice === total - 1}
              className="rounded-sm px-1.5 py-1 text-xs disabled:opacity-30"
              aria-label="Bajar"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => despachar({ tipo: "quitar", key: linea.key })}
              className="rounded-sm px-1.5 py-1 text-xs text-[var(--danger)]"
              aria-label={`Quitar ${linea.codigo}`}
            >
              ✕
            </button>
          </div>
        </td>
      </tr>

      {/* Aviso del piso: con el número que hace falta, no un "no puedes". */}
      {!revision.ok ? (
        <tr className="bg-[var(--danger-bg)]">
          <td />
          <td colSpan={mostrarDescuento ? 8 : 7} className="pb-2 text-sm">
            <span className="font-medium text-[var(--danger)]">
              {dolar(revision.precioNeto)} queda bajo el mínimo de{" "}
              {dolar(revision.piso)}
            </span>{" "}
            — faltan {dolar(revision.faltantePorUnidad)} por unidad (
            {dolar(revision.faltanteEnLinea)} en la línea).{" "}
            {linea.descuentoPct > 0 && revision.descuentoMaximoPct !== null ? (
              <>Con este precio el descuento máximo es {revision.descuentoMaximoPct}%. </>
            ) : null}
            {revision.valorUnitarioMinimo !== null && linea.descuentoPct > 0 ? (
              <>
                Con {linea.descuentoPct}% de descuento no bajes de{" "}
                {dolar(revision.valorUnitarioMinimo)}.{" "}
              </>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => despachar({ tipo: "bajarAlPiso", key: linea.key })}
            >
              Dejar en el mínimo
            </Button>
          </td>
        </tr>
      ) : null}

      {panel === "sustitutos" ? (
        <tr>
          <td />
          <td colSpan={mostrarDescuento ? 8 : 7} className="pb-3">
            <PanelSustitutos
              cargando={cargando}
              sustitutos={sustitutos}
              onElegir={(p) => {
                despachar({ tipo: "sustituir", key: linea.key, producto: p });
                setPanel("ninguno");
              }}
            />
          </td>
        </tr>
      ) : null}

      {panel === "historial" ? (
        <tr>
          <td />
          <td colSpan={mostrarDescuento ? 8 : 7} className="pb-3">
            <PanelHistorial cargando={cargando} ventas={historial} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

const ETIQUETA_ORIGEN: Record<Sustituto["origen"], string> = {
  equivalencia: "equivalente registrado",
  misma_medida: "misma medida",
  tipo: "mismo tipo",
  subfamilia: "misma subfamilia",
};

function PanelSustitutos({
  cargando,
  sustitutos,
  onElegir,
}: {
  cargando: boolean;
  sustitutos: Sustituto[];
  onElegir: (p: Sustituto) => void;
}) {
  if (cargando) {
    return <p className="text-sm text-[var(--fg-muted)]">Buscando alternativas…</p>;
  }
  if (sustitutos.length === 0) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        No hay alternativas para este producto.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2">
      <p className="mb-1.5 text-xs font-medium text-[var(--fg-muted)]">
        Alternativas
      </p>
      <div className="flex flex-col gap-1">
        {sustitutos.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onElegir(s)}
            className="flex items-center gap-3 rounded-sm p-1.5 text-left text-sm hover:bg-[var(--surface)]"
          >
            <span className="w-36 shrink-0 font-medium">{s.codigo}</span>
            <span className="w-12 shrink-0 text-xs">{s.marca}</span>
            <Badge tone="neutral" size="xs">
              {ETIQUETA_ORIGEN[s.origen]}
            </Badge>
            {s.mejor_oferta ? (
              <Badge tone="success" size="xs">
                mejor oferta
              </Badge>
            ) : null}
            <span className="flex-1" />
            <span className="text-xs text-[var(--fg-muted)]">
              stock {s.stock ?? 0}
            </span>
            <span className="w-20 text-right tabular">
              {dolar(s.precio_venta)}
            </span>
            <span
              className={`w-16 text-right tabular text-xs ${
                s.diferencia_pct < 0 ? "text-[var(--ok)]" : "text-[var(--fg-muted)]"
              }`}
            >
              {s.diferencia_pct > 0 ? "+" : ""}
              {s.diferencia_pct}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PanelHistorial({
  cargando,
  ventas,
}: {
  cargando: boolean;
  ventas: VentaAnterior[];
}) {
  if (cargando) {
    return <p className="text-sm text-[var(--fg-muted)]">Cargando histórico…</p>;
  }
  if (ventas.length === 0) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        Este producto todavía no se ha facturado.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2">
      <p className="mb-1.5 text-xs font-medium text-[var(--fg-muted)]">
        Ventas anteriores
      </p>
      <div className="flex flex-col gap-0.5 text-sm">
        {ventas.map((v, i) => (
          <div
            key={`${v.documento}-${i}`}
            className={`flex items-center gap-3 rounded-sm px-1.5 py-1 ${
              v.mismo_cliente ? "bg-[var(--info-bg)]" : ""
            }`}
          >
            <span className="w-24 shrink-0 tabular text-xs text-[var(--fg-muted)]">
              {v.fecha}
            </span>
            <span className="w-28 shrink-0 text-xs">{v.documento}</span>
            <span className="flex-1 truncate text-xs">{v.cliente}</span>
            {v.mismo_cliente ? (
              <Badge tone="info" size="xs">
                este cliente
              </Badge>
            ) : null}
            <span className="w-16 text-right tabular text-xs">×{v.cantidad}</span>
            <span className="w-20 text-right tabular font-medium">
              {dolar(v.valor_unitario)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
