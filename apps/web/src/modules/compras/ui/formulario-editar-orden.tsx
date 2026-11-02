"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Input, Textarea, toast } from "@rodatech/ui";
import { Trash2, Undo2 } from "lucide-react";

import { unidadLegible } from "@/modules/cotizaciones/dominio/unidades";
import { editarOrdenCompra } from "../acciones/editar-orden";
import type { CompraDetalle } from "../dominio/tipos";

/**
 * Editar la orden de compra antes de mandársela al proveedor (180).
 *
 * Willy, 02/11: *«cada orden de compra es como una cotización»*. Se corrigen
 * costos y cantidades, se quita lo que ya no se compra, y se dice cómo se paga
 * y cómo se entrega: lo que el proveedor necesita leer en el papel.
 */

type Fila = { id: string; cantidad: string; costo: string; quitada: boolean };

const DIAS_FRECUENTES = [30, 60];

function Opcion({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" variant={activa ? "primary" : "outline"} aria-pressed={activa} onClick={onClick}>
      {children}
    </Button>
  );
}

export function FormularioEditarOrden({
  c,
  direccionEmpresa,
}: {
  c: CompraDetalle;
  direccionEmpresa: string | null;
}) {
  const router = useRouter();
  const [filas, setFilas] = React.useState<Fila[]>(
    c.lineas.map((l) => ({ id: l.id, cantidad: String(l.cantidad), costo: String(l.costo_unitario), quitada: false })),
  );
  const [condicion, setCondicion] = React.useState<"contado" | "credito" | null>(c.condicion_pago);
  const [dias, setDias] = React.useState<string>(c.dias_credito ? String(c.dias_credito) : "30");
  // Por defecto lo trae el proveedor a nuestro almacén (Moisés, 02/11).
  const [entrega, setEntrega] = React.useState<"almacen" | "recojo">(c.entrega ?? "almacen");
  const [direccion, setDireccion] = React.useState(c.direccion_entrega ?? direccionEmpresa ?? "");
  const [fechaEstimada, setFechaEstimada] = React.useState(c.fecha_estimada?.slice(0, 10) ?? "");
  const [observaciones, setObservaciones] = React.useState(c.observaciones ?? "");
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const simbolo = c.moneda === "PEN" ? "S/" : "$";
  const dinero = (n: number) =>
    `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const num = (t: string) => Number(t.replace(",", "."));

  const vivas = filas.filter((f) => !f.quitada);
  const subtotal = vivas.reduce((a, f) => {
    const q = num(f.cantidad);
    const p = num(f.costo);
    return a + (Number.isFinite(q) && Number.isFinite(p) ? Math.round(q * p * 100) / 100 : 0);
  }, 0);
  // El IGV, como la base: solo si la orden lo llevaba.
  const llevaIgv = c.igv > 0 || c.subtotal === 0;
  const igv = llevaIgv ? Math.round(subtotal * 18) / 100 : 0;

  const cambiar = (id: string, parche: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...parche } : f)));

  async function guardar() {
    setError(null);
    if (vivas.length === 0) return setError("La orden tiene que quedar con al menos un producto.");
    for (const f of vivas) {
      const l = c.lineas.find((x) => x.id === f.id);
      if (!(num(f.cantidad) > 0)) return setError(`${l?.codigo ?? "Un producto"}: la cantidad tiene que ser mayor que cero.`);
      if (!(num(f.costo) >= 0)) return setError(`${l?.codigo ?? "Un producto"}: escribe el costo.`);
    }
    const d = condicion === "credito" ? Math.trunc(num(dias)) : null;
    if (condicion === "credito" && !(d && d >= 1 && d <= 365)) {
      return setError("A crédito, di a cuántos días es la factura (entre 1 y 365).");
    }

    setGuardando(true);
    const r = await editarOrdenCompra({
      id: c.id,
      condicion_pago: condicion,
      dias_credito: d,
      entrega,
      direccion_entrega: entrega === "almacen" ? direccion.trim() || null : null,
      fecha_estimada: fechaEstimada || null,
      observaciones: observaciones.trim() || null,
      items: vivas.map((f) => ({ id: f.id, cantidad: num(f.cantidad), costo_unitario: num(f.costo) })),
    });
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    toast.success(`Orden ${c.numero} guardada`);
    router.push(`/compras/${c.id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------------------------------ Productos */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Productos</h2>
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--surface-2)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Descripción</th>
                <th className="w-32 px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="w-40 px-3 py-2 text-right font-medium">Costo unit. ({simbolo})</th>
                <th className="w-32 px-3 py-2 text-right font-medium">Importe</th>
                <th className="w-32 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const l = c.lineas.find((x) => x.id === f.id)!;
                const importe = Math.round(num(f.cantidad) * num(f.costo) * 100) / 100;
                return (
                  <tr
                    key={f.id}
                    className={`border-t border-[var(--border)] ${f.quitada ? "bg-[var(--surface-2)] text-[var(--fg-muted)] line-through" : ""}`}
                  >
                    <td className="px-3 py-2 font-mono">{l.codigo}</td>
                    <td className="px-3 py-2">
                      {l.descripcion}
                      {l.marca ? <span className="text-[var(--fg-muted)]"> · {l.marca}</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <Input
                          aria-label={`Cantidad de ${l.codigo}`}
                          inputMode="decimal"
                          className="w-20 text-right tabular"
                          value={f.cantidad}
                          disabled={f.quitada}
                          onChange={(e) => cambiar(f.id, { cantidad: e.target.value })}
                        />
                        <span className="text-[var(--fg-muted)]">{unidadLegible(l.unidad)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`Costo de ${l.codigo}`}
                        inputMode="decimal"
                        className="ml-auto w-28 text-right tabular"
                        value={f.costo}
                        disabled={f.quitada}
                        onChange={(e) => cambiar(f.id, { costo: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      {f.quitada || !Number.isFinite(importe) ? "—" : dinero(importe)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {f.quitada ? (
                        <Button type="button" variant="outline" onClick={() => cambiar(f.id, { quitada: false })}>
                          <Undo2 className="size-4" aria-hidden />
                          Devolver
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" onClick={() => cambiar(f.id, { quitada: true })}>
                          <Trash2 className="size-4" aria-hidden />
                          Quitar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-x-4 gap-y-1 text-base">
          <dt className="text-[var(--fg-muted)]">Subtotal</dt>
          <dd className="text-right tabular">{dinero(subtotal)}</dd>
          <dt className="text-[var(--fg-muted)]">IGV</dt>
          <dd className="text-right tabular">{dinero(igv)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="text-right font-semibold tabular">{dinero(subtotal + igv)}</dd>
        </dl>
      </section>

      {/* ------------------------------------------------ Pago */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Condición de pago</h2>
        <div className="flex flex-wrap gap-2">
          <Opcion activa={condicion === "contado"} onClick={() => setCondicion("contado")}>
            Contado / previo pago
          </Opcion>
          <Opcion activa={condicion === "credito"} onClick={() => setCondicion("credito")}>
            Crédito
          </Opcion>
          {condicion ? (
            <Button type="button" variant="ghost" onClick={() => setCondicion(null)}>
              No decirlo
            </Button>
          ) : null}
        </div>
        {condicion === "credito" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Factura a</span>
            {DIAS_FRECUENTES.map((n) => (
              <Opcion key={n} activa={num(dias) === n} onClick={() => setDias(String(n))}>
                {n} días
              </Opcion>
            ))}
            <span className="text-sm">u otro:</span>
            <Input
              aria-label="Días de crédito"
              inputMode="numeric"
              className="w-20 text-right tabular"
              value={dias}
              onChange={(e) => setDias(e.target.value.replace(/\D/g, ""))}
            />
            <span className="text-sm">días</span>
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------ Entrega */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Entrega</h2>
        <div className="flex flex-wrap gap-2">
          <Opcion activa={entrega === "almacen"} onClick={() => setEntrega("almacen")}>
            Lo traen a nuestro almacén
          </Opcion>
          <Opcion activa={entrega === "recojo"} onClick={() => setEntrega("recojo")}>
            Recojo en el local del proveedor
          </Opcion>
        </div>
        {entrega === "almacen" ? (
          <Campo id="direccion-entrega" label="Dirección de entrega">
            <Input
              id="direccion-entrega"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Dirección del almacén"
            />
          </Campo>
        ) : null}
        <Campo id="fecha-estimada" label="Fecha de entrega (si ya se sabe)">
          <Input
            id="fecha-estimada"
            type="date"
            className="w-48"
            value={fechaEstimada}
            onChange={(e) => setFechaEstimada(e.target.value)}
          />
        </Campo>
      </section>

      {/* ------------------------------------------------ Notas */}
      <section className="flex flex-col gap-3">
        <Campo id="observaciones" label="Observaciones para el proveedor" ayuda="Salen al pie de la orden.">
          <Textarea
            id="observaciones"
            rows={3}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </Campo>
      </section>

      {error ? (
        <p role="alert" className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar orden"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(`/compras/${c.id}`)} disabled={guardando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
