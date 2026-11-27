import Link from "next/link";
import { Badge, Moneda, buttonVariants, cn, formatearFecha } from "@rodatech/ui";
import { ArrowRight, MessageCircleQuestion, Truck } from "lucide-react";

import { BloqueFicha } from "./ficha";

import { BotonBloqueado } from "@/componentes/sin-permiso";
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
  puedeComprar,
  sinPermiso,
}: {
  productoId: string;
  proveedores: ProveedorDeProducto[];
  /** «Compras: crear» (143). Sin él, el botón llevaba a una pantalla cerrada (auditoría, 21/10). */
  puedeComprar: boolean;
  /** Qué decir con el candado. */
  sinPermiso: string;
}) {
  return (
    // Con el lenguaje de las fichas (27/11): chip, título grande, cada
    // proveedor en su tarjeta y el precio en grande, que es lo que se mira.
    <BloqueFicha icono={Truck} titulo="Quién lo vende" tono="info">
      {proveedores.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-base text-[var(--fg-muted)]">
          Todavía nadie. Se llena solo con cada compra que registres, y se
          puede adelantar desde la ficha del proveedor —«Qué vende»— cuando
          alguien te pase su lista de precios.
        </p>
      ) : (
        <>
          <p className="text-base text-[var(--fg-muted)]">
            Del más barato al más caro, con lo que cobró la última vez. En
            dólares, para que se puedan comparar entre sí.
          </p>
          <ul className="flex flex-col gap-2">
            {proveedores.map((v) => (
              <li
                key={v.proveedor_id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <Link
                  href={`/proveedores/${v.proveedor_id}`}
                  className={`min-w-0 text-base font-semibold underline-offset-4 hover:underline ${
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

                <span className="text-sm text-[var(--fg-subtle)]">
                  {v.veces > 0
                    ? `${v.veces} ${v.veces === 1 ? "compra" : "compras"}` +
                      (v.ultimaCompra ? ` · ${formatearFecha(v.ultimaCompra)}` : "")
                    : "anotado a mano"}
                </span>

                <span className="ml-auto tabular text-base">
                  {v.ultimoCostoUsd === null ? (
                    <span className="text-[var(--fg-subtle)]">sin precio</span>
                  ) : (
                    <>
                      <Moneda valor={v.ultimoCostoUsd} tamano="lg" className="font-bold" />
                      {/* Si su factura vino en soles, se dice: es la cifra que
                          aparece cuando se le llama a preguntar. */}
                      {v.moneda && v.moneda !== "USD" && v.ultimoCosto !== null ? (
                        <span className="ml-1 text-sm text-[var(--fg-subtle)]">
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
      {puedeComprar ? (
        <Link
          href={`/compras/pedir-precio?items=${productoId}:1`}
          className={cn(buttonVariants({ variant: "outline" }), "h-11 w-fit md:h-control-md")}
        >
          <MessageCircleQuestion aria-hidden="true" />
          Pedir precio de este producto
          <ArrowRight aria-hidden="true" />
        </Link>
      ) : (
        <BotonBloqueado mensaje={sinPermiso} className="w-fit">
          Pedir precio de este producto
        </BotonBloqueado>
      )}
    </BloqueFicha>
  );
}
