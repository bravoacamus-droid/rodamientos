"use client";

// Cliente: buscar en el catálogo mientras se teclea y añadir o quitar sin
// recargar la ficha. Todo lo demás lo decide la base.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Badge,
  BuscadorProductos,
  Button,
  Moneda,
  formatearFecha,
  type ProductoBuscado,
} from "@rodatech/ui";
import { Plus, X } from "lucide-react";

import {
  anotarQueVende,
  buscarParaAnotar,
  olvidarQueVende,
} from "../acciones/catalogo";
import type { ProductoDeProveedor } from "../api/catalogo";

/**
 * Qué vende este proveedor.
 *
 * La lista se llena SOLA: cada compra deja anotado el producto, su marca y lo
 * que costó (migración 046). Este cuadro es para lo que todavía no se le ha
 * comprado —«me pasó su lista de precios»— y para corregir lo que se anotó de
 * más.
 *
 * Lo comprado no se puede quitar. La regla vive en el RPC, no aquí: si el
 * botón se enseñara igual y fallara al pulsarlo, la explicación llegaría tarde
 * y en forma de error.
 */
export function QueVende({
  proveedorId,
  productos,
  puedeEditar,
}: {
  proveedorId: string;
  productos: ProductoDeProveedor[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [guardando, guardar] = React.useTransition();
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [abierto, setAbierto] = React.useState(false);

  const yaEstan = React.useMemo(
    () => productos.map((p) => p.producto_id),
    [productos],
  );

  // Estable entre renders, como pide el buscador: si cambiara en cada render
  // relanzaría la consulta sola.
  const buscar = React.useCallback(
    async (termino: string): Promise<ProductoBuscado[]> => {
      const r = await buscarParaAnotar(termino);
      if (!r.ok) return [];
      return r.datos.map((p) => ({
        id: p.id,
        sku: p.codigo,
        descripcion: p.descripcion,
        marca: p.marca,
        unidad: p.unidad,
      }));
    },
    [],
  );

  const anadir = (p: ProductoBuscado) => {
    setError(null);
    setAviso(null);
    guardar(async () => {
      const r = await anotarQueVende({ proveedorId, productoIds: [p.id] });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAviso(`${p.sku} anotado.`);
      router.refresh();
    });
  };

  const quitar = (p: ProductoDeProveedor) => {
    setError(null);
    setAviso(null);
    guardar(async () => {
      const r = await olvidarQueVende(proveedorId, p.producto_id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAviso(`${p.codigo} quitado.`);
      router.refresh();
    });
  };

  const comprados = productos.filter((p) => p.veces > 0).length;

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Qué vende</h2>
          <p className="text-sm text-[var(--fg-muted)]">
            {productos.length === 0
              ? "Se va llenando solo: cada compra que le registres queda anotada aquí."
              : `${productos.length} ${productos.length === 1 ? "producto" : "productos"}` +
                (comprados > 0 ? ` · ${comprados} con compras detrás` : "")}
          </p>
        </div>

        {puedeEditar ? (
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => setAbierto((v) => !v)}
          >
            <Plus aria-hidden="true" />
            {abierto ? "Cerrar" : "Añadir un producto"}
          </Button>
        ) : null}
      </div>

      {abierto && puedeEditar ? (
        <div className="mt-3">
          {/* `overflow-visible` porque el panel de resultados se posiciona en
              el flujo, no en un portal. Sin esto queda cortado. */}
          <div className="overflow-visible">
            <BuscadorProductos
              id="anotar-que-vende"
              buscar={buscar}
              onSeleccionar={anadir}
              excluirIds={yaEstan}
              deshabilitado={guardando}
              autoFocus
              placeholder="Busca el producto que te vende…"
            />
          </div>
          <p className="mt-1 text-xs text-[var(--fg-subtle)]">
            Para lo que todavía no le has comprado. Lo comprado se anota solo.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm">
          {error}
        </p>
      ) : null}
      {aviso && !error ? (
        <p role="status" className="mt-3 text-sm text-[var(--fg-muted)]">
          {aviso}
        </p>
      ) : null}

      {productos.length === 0 ? null : (
        <div className="scroll-x mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 pr-3 font-medium">Cómo se sabe</th>
                <th className="py-2 pr-3 font-medium">Última compra</th>
                <th className="py-2 pr-3 text-right font-medium">Último costo</th>
                {puedeEditar ? <th className="w-10 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.producto_id} className="border-b border-[var(--border-soft)]">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/productos/${p.producto_id}`}
                      className="font-mono text-base font-medium text-brand-600 hover:underline"
                    >
                      {p.codigo}
                    </Link>
                    <span className="block text-sm text-[var(--fg-muted)]">
                      {p.marca ? `${p.marca} · ` : ""}
                      {p.descripcion}
                    </span>
                    {p.notas ? (
                      <span className="block text-xs text-[var(--fg-subtle)]">
                        {p.notas}
                      </span>
                    ) : null}
                  </td>

                  <td className="py-2 pr-3">
                    {p.veces > 0 ? (
                      <Badge tone="success" size="md">
                        {p.veces === 1 ? "Comprado 1 vez" : `Comprado ${p.veces} veces`}
                      </Badge>
                    ) : (
                      <Badge tone="neutral" size="md">
                        Anotado a mano
                      </Badge>
                    )}
                    {p.esHabitual ? (
                      <span className="ml-1.5 text-xs text-[var(--fg-subtle)]">
                        es su proveedor habitual
                      </span>
                    ) : null}
                  </td>

                  <td className="whitespace-nowrap py-2 pr-3">
                    {p.ultimaCompra ? (
                      formatearFecha(p.ultimaCompra)
                    ) : (
                      <span className="text-[var(--fg-subtle)]">—</span>
                    )}
                  </td>

                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular">
                    {p.ultimoCosto === null ? (
                      <span className="text-[var(--fg-subtle)]">—</span>
                    ) : (
                      <>
                        <Moneda
                          valor={p.ultimoCosto}
                          moneda={p.moneda === "PEN" ? "PEN" : "USD"}
                        />
                        {/* Si su factura vino en soles se enseña también en
                            dólares: es la única cifra con la que se puede
                            comparar contra otro proveedor. */}
                        {p.moneda && p.moneda !== "USD" && p.ultimoCostoUsd !== null ? (
                          <span className="block text-xs text-[var(--fg-subtle)]">
                            <Moneda valor={p.ultimoCostoUsd} /> al cambio
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>

                  {puedeEditar ? (
                    <td className="py-2 text-right">
                      {/* Solo lo que nadie compró. Lo demás es historia. */}
                      {p.veces === 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => quitar(p)}
                          disabled={guardando}
                          aria-label={`Quitar ${p.codigo}`}
                          title="Quitar de la ficha"
                        >
                          <X aria-hidden="true" />
                        </Button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
