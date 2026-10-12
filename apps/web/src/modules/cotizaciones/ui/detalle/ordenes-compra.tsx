"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, ShoppingCart } from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EstadoBadge,
  Input,
  formatearFecha,
  type EstadoDocumento,
} from "@rodatech/ui";

import { generarOrdenesDeCompra } from "../../acciones/ordenes";
import type { OrdenDelPedido } from "../../api/consultas";
import { proponerOrdenes, type LineaConfirmada, type OrdenPropuesta } from "../../dominio/compra-linea";
import { faltanParaOtros, otrosPedidos, type DemandaProducto } from "../../dominio/demanda";
import { OtrosPedidos } from "../otros-pedidos";

const dinero = (n: number, moneda: string) =>
  n.toLocaleString("es-PE", { style: "currency", currency: moneda === "PEN" ? "PEN" : "USD" });

/**
 * Las órdenes de compra del pedido (09/10).
 *
 * La hoja de Willy acaba así: *«CONFIRMACIÓN → ÓRDENES DE COMPRA: OC1, OC2,
 * OC3»*. Al cotizar se apuntó a quién se le compra cada línea; confirmado el
 * pedido, sale una orden por proveedor con lo que el cliente aceptó, enlazada
 * a esta cotización. Luego sigue lo de siempre: la recepción, la factura del
 * proveedor, avisar al cliente.
 */
export function OrdenesDeCompra({
  cotizacionId,
  lineas,
  existentes,
  puedeGenerar,
  demanda,
}: {
  cotizacionId: string;
  lineas: LineaConfirmada[];
  existentes: OrdenDelPedido[];
  puedeGenerar: boolean;
  /** Quién más pide estos productos (09/10). */
  demanda: DemandaProducto[];
}) {
  const vivas = existentes.filter((o) => o.estado !== "anulada");
  const pedidos = new Set(vivas.flatMap((o) => o.productos.map((p) => `${o.proveedorId}:${p}`)));
  const propuestas = proponerOrdenes(lineas)
    .map((o) => ({ ...o, items: o.items.filter((i) => !pedidos.has(`${o.proveedorId}:${i.productoId}`)) }))
    .filter((o) => o.items.length > 0);
  const sinProveedor = lineas.filter(
    (l) => l.confirmada > 0 && !l.proveedores.some((p) => p.cantidad > 0 && p.precio !== null),
  );

  if (existentes.length === 0 && propuestas.length === 0 && sinProveedor.length === 0) return null;

  return (
    <section className="card flex flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-5 text-brand-600" aria-hidden="true" />
          <h2 className="text-base font-semibold">Órdenes de compra</h2>
        </div>
        {puedeGenerar && propuestas.length > 0 ? (
          <DialogoGenerar
            cotizacionId={cotizacionId}
            propuestas={propuestas}
            primera={vivas.length === 0}
            demanda={new Map(demanda.map((d) => [d.productoId, d]))}
          />
        ) : null}
      </header>

      {existentes.length > 0 ? (
        <ul className="flex flex-col divide-y divide-[var(--border-soft)] rounded-md border border-[var(--border)]">
          {existentes.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
              <Link href={`/compras/${o.id}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
                {o.numero}
              </Link>
              <span className="min-w-0 flex-1 truncate">{o.proveedor}</span>
              <span className="text-sm text-[var(--fg-muted)]">{formatearFecha(o.fecha)}</span>
              <span className="tabular font-medium">{dinero(o.total, o.moneda)}</span>
              <EstadoBadge estado={o.estado as EstadoDocumento} />
            </li>
          ))}
        </ul>
      ) : propuestas.length > 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">
          Al cotizar apuntaste a quién comprarle. Revisa las cantidades y genera una orden por proveedor.
        </p>
      ) : null}

      {sinProveedor.length > 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">
          Sin proveedor apuntado: <strong className="text-[var(--fg)]">{sinProveedor.map((l) => l.codigo).join(", ")}</strong>.
          Si hay que comprarlos, analiza su precio de compra editando la cotización o regístralos en{" "}
          <Link href="/compras/nueva" className="font-medium text-brand-700 underline underline-offset-4">
            Nueva compra
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}

function DialogoGenerar({
  cotizacionId,
  propuestas,
  primera,
  demanda,
}: {
  cotizacionId: string;
  propuestas: OrdenPropuesta[];
  primera: boolean;
  demanda: Map<string, DemandaProducto>;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [ordenes, setOrdenes] = React.useState(propuestas);
  const [fuera, setFuera] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [enviando, empezar] = React.useTransition();

  const abrir = React.useCallback(() => {
    setOrdenes(propuestas);
    setFuera(new Set());
    setError(null);
    setAbierto(true);
  }, [propuestas]);

  // «Registrar la compra» del aviso de arriba llega con #generar-ordenes y
  // abre esto directamente, sin bajar a buscar el botón.
  React.useEffect(() => {
    const mirar = () => {
      if (window.location.hash !== "#generar-ordenes") return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      abrir();
    };
    mirar();
    window.addEventListener("hashchange", mirar);
    return () => window.removeEventListener("hashchange", mirar);
  }, [abrir]);
  const cantidad = (prov: string, prod: string, n: number) =>
    setOrdenes((os) =>
      os.map((o) =>
        o.proveedorId !== prov
          ? o
          : { ...o, items: o.items.map((i) => (i.productoId === prod ? { ...i, cantidad: Math.max(0, Math.round(n)) } : i)) },
      ),
    );

  /*
    A la hora de comprar, cuántas en total (Luis, 09/10): si otros pedidos
    APROBADOS esperan el mismo producto, se dice cuántos más hacen falta y se
    suman con un clic. Los que no están aprobados no cuentan.
  */
  const pidiendo = (prod: string) =>
    ordenes
      .filter((o) => !fuera.has(o.proveedorId))
      .reduce((s, o) => s + o.items.filter((i) => i.productoId === prod).reduce((t, i) => t + i.cantidad, 0), 0);

  const elegidas = ordenes
    .filter((o) => !fuera.has(o.proveedorId))
    .map((o) => ({ ...o, items: o.items.filter((i) => i.cantidad > 0) }))
    .filter((o) => o.items.length > 0);

  const generar = () =>
    empezar(async () => {
      setError(null);
      const r = await generarOrdenesDeCompra({
        cotizacion_id: cotizacionId,
        ordenes: elegidas.map((o) => ({
          proveedor_id: o.proveedorId,
          moneda: o.moneda,
          tipo_cambio: o.tipoCambio,
          items: o.items.map((i) => ({
            producto_id: i.productoId,
            cantidad: i.cantidad,
            costo_unitario: i.costo,
            unidad_codigo: i.unidad,
          })),
        })),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAbierto(false);
      router.refresh();
    });

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <Button type="button" onClick={abrir} className="gap-1.5">
        <ShoppingCart className="size-4" aria-hidden="true" />
        {primera ? "Generar órdenes de compra" : "Generar las que faltan"}
      </Button>
      <DialogContent ancho="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Órdenes de compra</DialogTitle>
          <DialogDescription>
            Una por proveedor, con lo que confirmó el cliente. Puedes cambiar las cantidades o dejar fuera un proveedor.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {ordenes.map((o) => {
            const excluida = fuera.has(o.proveedorId);
            const subtotal = o.items.reduce((s, i) => s + i.cantidad * i.costo, 0);
            return (
              <div
                key={o.proveedorId}
                className={`rounded-md border p-3 ${excluida ? "border-dashed border-[var(--border)] opacity-60" : "border-[var(--border-strong)]"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{o.nombre}</strong>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={!excluida}
                      onChange={(e) =>
                        setFuera((f) => {
                          const n = new Set(f);
                          if (e.target.checked) n.delete(o.proveedorId);
                          else n.add(o.proveedorId);
                          return n;
                        })
                      }
                    />
                    Generar esta orden
                  </label>
                </div>
                <ul className="mt-2 flex flex-col gap-2">
                  {o.items.map((i) => (
                    <li key={i.productoId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-[8rem] flex-1 font-medium">{i.codigo}</span>
                      <label className="flex items-center gap-2 text-sm">
                        Cantidad
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          value={i.cantidad}
                          disabled={excluida}
                          onChange={(e) => cantidad(o.proveedorId, i.productoId, Number(e.target.value) || 0)}
                          className="w-24 tabular text-right"
                          aria-label={`Cantidad de ${i.codigo} a ${o.nombre}`}
                        />
                      </label>
                      <span className="tabular text-sm text-[var(--fg-muted)]">
                        a {dinero(i.costo, o.moneda)} + IGV
                      </span>
                      {(() => {
                        const d = demanda.get(i.productoId);
                        const mas = Math.ceil(faltanParaOtros(d, pidiendo(i.productoId)));
                        if (excluida || otrosPedidos(d, cotizacionId).aprobadas.length === 0) return null;
                        return (
                          <div className="flex w-full flex-wrap items-center gap-2 rounded-md bg-[var(--warn-bg)] px-2 py-1.5 text-sm">
                            {mas > 0 ? (
                              <span className="font-medium text-[var(--warn)]">
                                Otros pedidos aprobados necesitan {mas} más.
                              </span>
                            ) : (
                              <span className="text-[var(--fg-muted)]">Con esto alcanza también para los otros pedidos aprobados.</span>
                            )}
                            <OtrosPedidos demanda={d} actual={cotizacionId} codigo={i.codigo} />
                            {mas > 0 ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => cantidad(o.proveedorId, i.productoId, i.cantidad + mas)}
                              >
                                Sumar {mas}
                              </Button>
                            ) : null}
                          </div>
                        );
                      })()}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-right text-sm">
                  Subtotal <strong className="tabular">{dinero(subtotal, o.moneda)}</strong>{" "}
                  <span className="text-[var(--fg-muted)]">sin IGV</span>
                </p>
              </div>
            );
          })}
          {error ? <p className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={generar} disabled={enviando || elegidas.length === 0}>
            {enviando
              ? "Generando…"
              : elegidas.length === 1
                ? "Generar 1 orden de compra"
                : `Generar ${elegidas.length} órdenes de compra`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
