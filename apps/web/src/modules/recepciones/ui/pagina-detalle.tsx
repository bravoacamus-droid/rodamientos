import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoError, Moneda } from "@rodatech/ui";

import { detalleRecepcion } from "../api/consultas";

/**
 * Ficha de una recepción.
 *
 * Es un documento CERRADO: no hay botón de editar y no es un olvido. El
 * ingreso ya está en el kardex, y el saldo de almacén es la suma de sus
 * movimientos. Corregir una recepción mal registrada es un ajuste de
 * inventario de gerencia, con su documento, su motivo y su responsable — que
 * es exactamente lo que Willy pidió con el «botón que se usa con cuidado»
 * (26:49).
 *
 * Los costos que se ven aquí son los que se le pagaron al proveedor, sin
 * gastos prorrateados: es contra lo que se cuadra la factura. El costo que
 * entró al kardex, con los gastos ya dentro, vive en el kardex del producto.
 */
export default async function PaginaDetalleRecepcion({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resultado = await detalleRecepcion(id);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la recepción"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const r = resultado.datos;
  const total = r.lineas.reduce((a, l) => a + l.importe, 0);
  const unidades = r.lineas.reduce((a, l) => a + l.cantidad, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {r.numero}
            </h1>
            {r.anulada ? (
              <span className="rounded-sm bg-[var(--danger-bg)] px-2 py-0.5 text-xs font-medium text-[var(--danger)]">
                Anulada
              </span>
            ) : null}
          </div>
          <p className="text-sm text-[var(--fg-muted)]">
            Recibido el {r.fecha}
            {r.recibido_por ? ` por ${r.recibido_por}` : ""}
          </p>
        </div>

        <Link
          href="/recepciones"
          className="inline-flex h-9 items-center rounded-sm border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          Volver al listado
        </Link>
      </div>

      <section className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato etiqueta="Proveedor" valor={r.proveedor ?? "—"} pie={r.proveedor_documento} />
        <Dato etiqueta="Guía del proveedor" valor={r.guia_proveedor ?? "—"} />
        <Dato etiqueta="Factura del proveedor" valor={r.factura_proveedor ?? "—"} />
        <Dato
          etiqueta="Compra"
          valor={r.compra_numero ?? "Recepción suelta"}
          pie={r.compra_numero ? null : "No viene de una compra registrada"}
        />
      </section>

      <section className="card">
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                <th className="px-4 py-2.5 font-medium">Código</th>
                <th className="px-4 py-2.5 font-medium">Marca</th>
                <th className="px-4 py-2.5 font-medium">Descripción</th>
                <th className="px-4 py-2.5 text-right font-medium">Cantidad</th>
                <th className="px-4 py-2.5 text-right font-medium">Costo unit.</th>
                <th className="px-4 py-2.5 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody>
              {r.lineas.map((l) => (
                <tr key={l.id} className="border-b border-[var(--border-soft)]">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/productos/${l.producto_id}`}
                      className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                    >
                      {l.codigo}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">{l.marca ?? "—"}</td>
                  <td className="max-w-md px-4 py-2.5">
                    <span className="block truncate">{l.descripcion}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {l.cantidad.toLocaleString("es-PE")}
                    <span className="ml-1 text-[0.7rem] text-[var(--fg-subtle)]">
                      {l.unidad}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Moneda valor={l.costo_unitario} tamano="sm" enfasis="suave" />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Moneda valor={l.importe} tamano="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-sm font-medium">
                <td className="px-4 py-3" colSpan={3}>
                  {r.lineas.length} {r.lineas.length === 1 ? "línea" : "líneas"}
                </td>
                <td className="px-4 py-3 text-right tabular">
                  {unidades.toLocaleString("es-PE")}
                </td>
                <td className="px-4 py-3 text-right text-[var(--fg-muted)]">
                  Valor al proveedor
                </td>
                <td className="px-4 py-3 text-right">
                  <Moneda valor={total} enfasis="fuerte" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {r.observaciones ? (
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Observaciones</h2>
          <p className="whitespace-pre-wrap text-sm text-[var(--fg-muted)]">
            {r.observaciones}
          </p>
        </section>
      ) : null}
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  pie,
}: {
  etiqueta: string;
  valor: string;
  pie?: string | null;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
        {etiqueta}
      </dt>
      <dd className="mt-0.5 text-sm">{valor}</dd>
      {pie ? <p className="text-[0.7rem] text-[var(--fg-subtle)]">{pie}</p> : null}
    </div>
  );
}
