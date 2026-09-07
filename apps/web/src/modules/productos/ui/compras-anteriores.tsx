import Link from "next/link";
import { Badge } from "@rodatech/ui";

import type { CompraDeProducto } from "../api/compras";

/**
 * A quién se le compró antes este producto.
 *
 * Willy, 07/09 (29:47): *«yo digito el código y me debe aparecer el historial
 * de compras. Le compré a A, anteriormente lo compré a B, luego lo compré a
 * C»*. Y para qué: *«eso me sirve de historial para una próxima que quiera
 * comprar el mismo producto»*.
 *
 * ---------------------------------------------------------------------------
 * Con la factura del proveedor
 * ---------------------------------------------------------------------------
 * Es el dato que nombró y que no estaba en ninguna pantalla: *«¿con qué número
 * de factura?»*. Es por lo que se busca el papel cuando hay una discusión con
 * el proveedor, y hasta hoy había que abrir la recepción para verlo.
 *
 * ---------------------------------------------------------------------------
 * Subió o bajó, dicho al lado
 * ---------------------------------------------------------------------------
 * La vista ya trae el costo de la compra anterior, así que la variación se
 * dice sin pedir nada más. Es lo que decide si toca negociar: «me lo subieron
 * un 12 % desde marzo» es una frase que se usa delante del proveedor.
 */

const dolar = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

/** Cuánto cambió respecto de la compra anterior. `null` si no hay con qué comparar. */
function variacion(actual: number, anterior: number | null): number | null {
  if (anterior === null || anterior <= 0 || actual <= 0) return null;
  const pct = ((actual - anterior) / anterior) * 100;
  // Menos de medio punto es ruido de redondeo, no una subida.
  if (Math.abs(pct) < 0.5) return null;
  return Math.round(pct * 10) / 10;
}

export function ComprasAnteriores({ compras }: { compras: CompraDeProducto[] }) {
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-base font-semibold">A quién se le compró</h2>

      {compras.length === 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">
          Todavía no se ha recibido este producto de ningún proveedor. Aparece
          aquí en cuanto entre la primera mercadería.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-[var(--fg-muted)]">
            Lo que de verdad entró y se pagó, no lo que cotizaron.
          </p>
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Proveedor</th>
                  <th className="py-2 pr-3 text-right font-medium">Cant.</th>
                  <th className="py-2 pr-3 text-right font-medium">Costo</th>
                  <th className="py-2 pr-3 font-medium">Factura</th>
                  <th className="py-2 font-medium">Recepción</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => {
                  const v = variacion(c.costoUsd, c.costoAnteriorUsd);
                  return (
                    <tr
                      key={c.recepcionId + c.documento}
                      className="border-b border-[var(--border-soft)]"
                    >
                      <td className="whitespace-nowrap py-2 pr-3 tabular">{c.fecha}</td>
                      <td className="max-w-xs py-2 pr-3">
                        <span className="block truncate" title={c.proveedor ?? ""}>
                          {c.proveedor ?? "—"}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular">{c.cantidad}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right">
                        <span className="tabular font-medium">{dolar(c.costoUsd)}</span>
                        {v !== null ? (
                          <span
                            className={`ml-2 text-xs tabular ${
                              v > 0 ? "text-[var(--danger)]" : "text-[var(--ok)]"
                            }`}
                            title="Respecto de la compra anterior"
                          >
                            {v > 0 ? "+" : ""}
                            {v}%
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-sm">
                        {c.facturaProveedor ?? (
                          <span className="text-[var(--fg-subtle)]">sin apuntar</span>
                        )}
                      </td>
                      <td className="py-2">
                        <Link
                          href={`/recepciones/${c.recepcionId}`}
                          className="font-mono text-sm text-brand-600 hover:underline"
                        >
                          {c.documento}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/*
            La factura sin apuntar no es un detalle estético: es el papel que
            se busca cuando el proveedor dice que costaba otra cosa. Se dice
            aquí una vez, en vez de dejar la columna llena de huecos mudos.
          */}
          {compras.some((c) => c.facturaProveedor === null) ? (
            <p className="mt-3 text-sm text-[var(--fg-muted)]">
              <Badge tone="warning" size="xs">
                Ojo
              </Badge>{" "}
              Alguna compra entró sin apuntar la factura del proveedor. Es el
              número por el que se busca el papel si luego hay discusión.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
