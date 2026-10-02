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
          <p className="mt-1 text-sm text-[var(--fg-subtle)]">
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
        /*
          Tarjetas en una caja estrecha y tabla cuando cabe. Revisión de diseño
          del 02/10: en el teléfono esta tabla se desplazaba de lado (390 px:
          329 → 469). Lo que pinta cada celda se comparte entre las dos vistas.
        */
        <div className="@container mt-3">
          <ul className="flex flex-col gap-2 @2xl:hidden">
            {productos.map((p) => (
              <li key={p.producto_id} className="rounded-md border border-[var(--border)] p-3">
                <Producto p={p} />
                <div className="mt-2">
                  <ComoSeSabe p={p} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-[var(--fg-muted)]">Última compra</dt>
                    <dd>
                      <UltimaCompra p={p} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--fg-muted)]">Último costo</dt>
                    <dd className="tabular">
                      <Costo p={p} />
                    </dd>
                  </div>
                </dl>
                {puedeEditar && p.veces === 0 ? (
                  <div className="mt-2">
                    <Quitar p={p} onQuitar={quitar} disabled={guardando} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="scroll-x hidden @2xl:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 font-medium">Cómo se sabe</th>
                  <th className="py-2 pr-3 font-medium">Última compra</th>
                  <th className="py-2 pr-3 text-right font-medium">Último costo</th>
                  {puedeEditar ? <th className="py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.producto_id} className="border-b border-[var(--border-soft)]">
                    <td className="py-2 pr-3">
                      <Producto p={p} />
                    </td>
                    <td className="py-2 pr-3">
                      <ComoSeSabe p={p} />
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      <UltimaCompra p={p} />
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular">
                      <Costo p={p} />
                    </td>
                    {puedeEditar ? (
                      <td className="py-2 text-right">
                        {/* Solo lo que nadie compró. Lo demás es historia. */}
                        {p.veces === 0 ? <Quitar p={p} onQuitar={quitar} disabled={guardando} /> : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

type Fila = ProductoDeProveedor;

function Producto({ p }: { p: Fila }) {
  return (
    <>
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
      {p.notas ? <span className="block text-sm text-[var(--fg-subtle)]">{p.notas}</span> : null}
    </>
  );
}

function ComoSeSabe({ p }: { p: Fila }) {
  return (
    <>
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
        <span className="ml-1.5 text-sm text-[var(--fg-subtle)]">es su proveedor habitual</span>
      ) : null}
    </>
  );
}

function UltimaCompra({ p }: { p: Fila }) {
  return p.ultimaCompra ? (
    <>{formatearFecha(p.ultimaCompra)}</>
  ) : (
    <span className="text-[var(--fg-subtle)]">—</span>
  );
}

function Costo({ p }: { p: Fila }) {
  if (p.ultimoCosto === null) return <span className="text-[var(--fg-subtle)]">—</span>;
  return (
    <>
      <Moneda valor={p.ultimoCosto} moneda={p.moneda === "PEN" ? "PEN" : "USD"} />
      {/* Si su factura vino en soles se enseña también en dólares: es la única
          cifra con la que se puede comparar contra otro proveedor. */}
      {p.moneda && p.moneda !== "USD" && p.ultimoCostoUsd !== null ? (
        <span className="block text-sm text-[var(--fg-subtle)]">
          <Moneda valor={p.ultimoCostoUsd} /> al cambio
        </span>
      ) : null}
    </>
  );
}

/** Con su palabra: una X gris suelta no parecía un botón (revisión del 02/10). */
function Quitar({ p, onQuitar, disabled }: { p: Fila; onQuitar: (p: Fila) => void; disabled: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => onQuitar(p)}
      disabled={disabled}
      aria-label={`Quitar ${p.codigo} de la ficha`}
    >
      <X aria-hidden="true" />
      Quitar
    </Button>
  );
}
