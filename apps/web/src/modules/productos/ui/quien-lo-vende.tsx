import Link from "next/link";
import { Badge, Moneda, formatearFecha } from "@rodatech/ui";
import { MessageCircleQuestion } from "lucide-react";

import type { ProveedorDeProducto } from "@/modules/proveedores";

/**
 * A quién se le puede pedir este producto.
 *
 * Es la pregunta con la que empieza cualquier compra, y hasta la 046 el ERP no
 * sabía contestarla: solo tenía el proveedor HABITUAL, uno y puesto a mano.
 *
 * La lista sale de lo que se le ha comprado a cada uno —se anota solo— más lo
 * que alguien haya declarado en la ficha del proveedor. **Ordenada por el
 * costo en dólares**, el más barato primero, porque eso es lo que se está
 * mirando cuando se abre esto.
 *
 * Server Component: son datos, no hay nada que tocar.
 */
export function QuienLoVende({
  productoId,
  proveedores,
}: {
  productoId: string;
  proveedores: ProveedorDeProducto[];
}) {
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">Quién lo vende</h2>

      {proveedores.length === 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">
          Todavía nadie. Se llena solo con cada compra que registres, y se
          puede adelantar desde la ficha del proveedor —«Qué vende»— cuando
          alguien te pase su lista de precios.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-[var(--fg-muted)]">
            Del más barato al más caro, con lo que cobró la última vez. En
            dólares, para que se puedan comparar entre sí.
          </p>
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {proveedores.map((v) => (
              <li key={v.proveedor_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Link
                  href={`/proveedores/${v.proveedor_id}`}
                  className={`text-sm font-medium hover:underline ${
                    v.activo ? "text-brand-600" : "text-[var(--fg-muted)]"
                  }`}
                >
                  {v.proveedor}
                </Link>

                {v.esHabitual ? (
                  <Badge tone="brand" size="xs">
                    habitual
                  </Badge>
                ) : null}
                {v.activo ? null : (
                  <Badge tone="neutral" size="xs">
                    de baja
                  </Badge>
                )}

                <span className="text-xs text-[var(--fg-subtle)]">
                  {v.veces > 0
                    ? `${v.veces} ${v.veces === 1 ? "compra" : "compras"}` +
                      (v.ultimaCompra ? ` · ${formatearFecha(v.ultimaCompra)}` : "")
                    : "anotado a mano"}
                </span>

                <span className="ml-auto tabular text-sm">
                  {v.ultimoCostoUsd === null ? (
                    <span className="text-[var(--fg-subtle)]">sin precio</span>
                  ) : (
                    <>
                      <Moneda valor={v.ultimoCostoUsd} tamano="sm" />
                      {/* Si su factura vino en soles, se dice: es la cifra que
                          aparece cuando se le llama a preguntar. */}
                      {v.moneda && v.moneda !== "USD" && v.ultimoCosto !== null ? (
                        <span className="ml-1 text-xs text-[var(--fg-subtle)]">
                          (S/ {v.ultimoCosto})
                        </span>
                      ) : null}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/*
        De mirar precios a pedirlos.

        Esta lista contesta «¿a cuánto me lo dejaron?», y lo siguiente que uno
        quiere es «¿a cuánto me lo dejan HOY?». Sin este botón había que
        acordarse de ir a la bandeja, buscar el producto entre los de todos los
        clientes y marcarlo — con la ficha delante.

        Lleva cantidad 1 porque desde aquí no hay ninguna cantidad natural: se
        ajusta en la pantalla siguiente, que es donde además se decide a quién
        se le pregunta.
      */}
      <Link
        href={`/compras/pedir-precio?items=${productoId}:1`}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-sm border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
      >
        <MessageCircleQuestion className="size-4" aria-hidden="true" />
        Pedir precio de este producto
      </Link>
    </section>
  );
}
