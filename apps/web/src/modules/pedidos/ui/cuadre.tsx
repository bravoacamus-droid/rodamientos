import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { CircleCheck, CircleDot, FileText, Truck, Wallet } from "lucide-react";
import { Moneda } from "@rodatech/ui";

import { cuadreDelPedido, type EstadoCifra } from "../dominio/cuadre";
import { cantidadLegible, type DespachoDelPedido } from "../dominio/etapa";

/**
 * ¿Cuadra el pedido? (161) Tres cifras arriba de la ficha: despachado X de Y,
 * facturado X de Y, cobrado $ X de $ Y.
 *
 * Luis, 27/10: *«trazabilidad de todo por pedido, si ya se facturó, si se
 * hizo la guía, todo tiene que cuadrar»*. Hasta aquí había que bajar a cada
 * sección y sumar de cabeza. El color no es la única pista: cada cifra lleva
 * su icono y la palabra «completo», «falta» o «nada todavía».
 */
const ESTILO: Record<EstadoCifra, { clase: string; Icono: LucideIcon; palabra: string }> = {
  todo: { clase: "border-[var(--ok)]", Icono: CircleCheck, palabra: "Completo" },
  parte: { clase: "border-[var(--warn)] bg-[var(--warn-bg)]", Icono: CircleDot, palabra: "Falta una parte" },
  nada: { clase: "border-[var(--border-strong)]", Icono: CircleDot, palabra: "Nada todavía" },
};

function Casilla({
  icono: Icono,
  titulo,
  estado,
  children,
}: {
  icono: LucideIcon;
  titulo: string;
  estado: EstadoCifra;
  children: React.ReactNode;
}) {
  const e = ESTILO[estado];
  return (
    <div className={`flex flex-col gap-1 rounded-lg border-2 p-3 ${e.clase}`}>
      <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
        <Icono className="size-4" aria-hidden="true" />
        {titulo}
      </p>
      <div className="text-lg font-semibold tabular">{children}</div>
      <p className={`flex items-center gap-1.5 text-sm font-medium ${estado === "todo" ? "text-[var(--ok)]" : ""}`}>
        <e.Icono className="size-4" aria-hidden="true" />
        {e.palabra}
      </p>
    </div>
  );
}

export function CuadreDelPedido({
  despacho,
  facturas,
}: {
  despacho: DespachoDelPedido | null;
  facturas: { tipo: string; total: number; saldo: number; moneda: "USD" | "PEN" }[];
}) {
  const c = cuadreDelPedido(despacho, facturas);

  return (
    <section className="card p-4" aria-labelledby="cuadre-titulo">
      <h2 id="cuadre-titulo" className="mb-3 text-lg font-semibold">
        ¿Cómo va el pedido?
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {c.despachado ? (
          <Casilla icono={Truck} titulo="Despachado" estado={c.despachado.estado}>
            {cantidadLegible(c.despachado.hecho)} de {cantidadLegible(c.despachado.de)}
          </Casilla>
        ) : (
          <Casilla icono={Truck} titulo="Despachado" estado="nada">
            —
          </Casilla>
        )}
        {c.facturado ? (
          <Casilla icono={FileText} titulo="Facturado" estado={c.facturado.estado}>
            {cantidadLegible(c.facturado.hecho)} de {cantidadLegible(c.facturado.de)}
          </Casilla>
        ) : (
          <Casilla icono={FileText} titulo="Facturado" estado="nada">
            —
          </Casilla>
        )}
        {c.cobrado.length === 0 ? (
          <Casilla icono={Wallet} titulo="Cobrado" estado="nada">
            Sin factura
          </Casilla>
        ) : (
          <Casilla
            icono={Wallet}
            titulo="Cobrado"
            estado={
              c.cobrado.every((x) => x.estado === "todo")
                ? "todo"
                : c.cobrado.every((x) => x.estado === "nada")
                  ? "nada"
                  : "parte"
            }
          >
            {c.cobrado.map((x, i) => (
              <span key={x.moneda} className="block">
                {i > 0 ? "y " : ""}
                <Moneda valor={x.cobrado} moneda={x.moneda} tamano="lg" className="text-lg text-inherit" /> de{" "}
                <Moneda valor={x.total} moneda={x.moneda} tamano="lg" className="text-lg text-inherit" />
              </span>
            ))}
          </Casilla>
        )}
      </div>
      <p className="mt-2 text-sm text-[var(--fg-muted)]">
        Despachado y facturado, en unidades: lo que salió en guías emitidas y lo que de eso ya tiene factura.
      </p>
    </section>
  );
}
