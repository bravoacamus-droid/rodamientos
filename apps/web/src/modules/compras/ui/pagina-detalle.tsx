import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EstadoError, Moneda } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { detalleCompra } from "../api/consultas";
import { ETIQUETA_ESTADO, TONO_ESTADO } from "../dominio/tipos";
import { AnularCompra } from "./anular";

/**
 * Ficha de una compra.
 *
 * Es un documento, no un formulario: no hay botón de editar. Corregir una
 * compra mal registrada es anularla —con su motivo— y volver a registrarla,
 * igual que en recepciones. Un documento que se puede reescribir en silencio
 * no sirve para cuadrar nada.
 */
export default async function PaginaDetalleCompra({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, perfil] = await Promise.all([detalleCompra(id), perfilActual()]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la compra"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const c = resultado.datos;
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeAnular = rol !== null && ["gerencia", "admin", "compras"].includes(rol);

  const recibido = c.lineas.reduce((a, l) => a + l.cantidad_recibida, 0);
  const pedido = c.lineas.reduce((a, l) => a + l.cantidad, 0);
  const falta = c.lineas.filter((l) => l.cantidad_recibida < l.cantidad);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/compras" className="text-sm text-[var(--fg-muted)] underline">
            ← Compras
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">
              {c.numero}
            </h1>
            <Badge tone={TONO_ESTADO[c.estado]}>{ETIQUETA_ESTADO[c.estado]}</Badge>
            {c.tipo === "importacion" ? <Badge tone="neutral">Importación</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            {c.proveedor ?? "—"}
            {c.proveedor_documento ? ` · ${c.proveedor_documento}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {c.estado !== "anulada" && falta.length > 0 ? (
            <Link
              href={`/recepciones/nueva?compra=${c.id}`}
              className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              Recibir mercadería
            </Link>
          ) : null}
          {puedeAnular && c.estado !== "anulada" ? (
            <AnularCompra id={c.id} numero={c.numero} recibida={recibido > 0} />
          ) : null}
        </div>
      </header>

      {c.estado === "anulada" && c.motivo_anulacion ? (
        <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm">
          <strong>Anulada:</strong> {c.motivo_anulacion}
        </p>
      ) : null}

      {/* --------------------------------------------------------- Cifras */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta etiqueta="Subtotal" valor={<Moneda valor={c.subtotal} />} />
        <Tarjeta
          etiqueta="IGV"
          valor={<Moneda valor={c.igv} enfasis="suave" />}
          pie={c.igv === 0 ? "no afecto" : undefined}
        />
        <Tarjeta etiqueta="Total" valor={<Moneda valor={c.total} />} />
        <Tarjeta
          etiqueta="Recibido"
          valor={`${pedido > 0 ? Math.round((recibido / pedido) * 100) : 0}%`}
          pie={`${recibido} de ${pedido}`}
          tono={
            c.estado === "anulada"
              ? undefined
              : recibido >= pedido
                ? "ok"
                : recibido > 0
                  ? "aviso"
                  : undefined
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------ Líneas */}
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Qué se pidió</h2>
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                  <th className="py-2 pr-3 font-medium">Código</th>
                  <th className="py-2 pr-3 font-medium">Descripción</th>
                  <th className="py-2 pr-3 text-right font-medium">Pedido</th>
                  <th className="py-2 pr-3 text-right font-medium">Recibido</th>
                  <th className="py-2 pr-3 text-right font-medium">Costo</th>
                  <th className="py-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {c.lineas.map((l) => {
                  const completa = l.cantidad_recibida >= l.cantidad;
                  return (
                    <tr key={l.id} className="border-b border-[var(--border-soft)] last:border-0">
                      <td className="py-2 pr-3">
                        <Link
                          href={`/productos/${l.producto_id}`}
                          className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                        >
                          {l.codigo}
                        </Link>
                        <span className="block text-[0.7rem] text-[var(--fg-subtle)]">
                          {l.marca}
                        </span>
                      </td>
                      <td className="max-w-xs py-2 pr-3">
                        <span className="block truncate" title={l.descripcion}>
                          {l.descripcion}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular">
                        {l.cantidad} <span className="text-[0.7rem] text-[var(--fg-subtle)]">{l.unidad}</span>
                      </td>
                      <td
                        className={`py-2 pr-3 text-right tabular ${
                          completa ? "text-[var(--ok)]" : "text-[var(--warn)]"
                        }`}
                      >
                        {l.cantidad_recibida}
                      </td>
                      <td className="py-2 pr-3 text-right tabular">
                        {l.costo_unitario.toFixed(4)}
                      </td>
                      <td className="py-2 text-right tabular font-medium">
                        {l.importe.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------------------------------- Datos */}
        <div className="flex flex-col gap-4">
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Datos</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Dato etiqueta="Fecha" valor={c.fecha} />
              <Dato etiqueta="Llega el" valor={c.fecha_estimada ?? "—"} />
              <Dato etiqueta="Factura" valor={c.documento_proveedor ?? "—"} />
              <Dato etiqueta="Guía" valor={c.guia_proveedor ?? "—"} />
              {c.tipo === "importacion" ? (
                <>
                  <Dato etiqueta="Courier" valor={c.courier ?? "—"} />
                  <Dato etiqueta="Tracking" valor={c.tracking ?? "—"} />
                  <Dato
                    etiqueta="Gastos"
                    valor={
                      c.gastos_importacion > 0
                        ? `$ ${c.gastos_importacion.toFixed(2)}`
                        : "—"
                    }
                  />
                </>
              ) : null}
              <Dato etiqueta="Registró" valor={c.comprador ?? "—"} />
            </dl>

            {c.observaciones ? (
              <p className="mt-3 border-t border-[var(--border-soft)] pt-3 text-sm text-[var(--fg-muted)]">
                {c.observaciones}
              </p>
            ) : null}
          </section>

          <section className="card p-4">
            <h2 className="mb-1 text-sm font-semibold">Recepciones</h2>
            {c.recepciones.length === 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">
                Todavía no ha llegado nada de esta compra. El stock se mueve al
                recibir, no al comprar.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
                {c.recepciones.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                    <Link
                      href={`/recepciones/${r.id}`}
                      className="font-mono text-sm font-medium text-brand-600 hover:underline"
                    >
                      {r.numero}
                    </Link>
                    <span className="tabular text-xs text-[var(--fg-muted)]">{r.fecha}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  pie,
  tono,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  pie?: string;
  tono?: "ok" | "aviso" | "malo";
}) {
  const color =
    tono === "malo"
      ? "text-[var(--danger)]"
      : tono === "aviso"
        ? "text-[var(--warn)]"
        : tono === "ok"
          ? "text-[var(--ok)]"
          : "";
  return (
    <div className="card p-3">
      <p className="text-xs text-[var(--fg-muted)]">{etiqueta}</p>
      <p className={`mt-0.5 truncate text-lg font-semibold tabular ${color}`}>{valor}</p>
      {pie ? <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">{pie}</p> : null}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 break-words">{valor}</dd>
    </div>
  );
}
