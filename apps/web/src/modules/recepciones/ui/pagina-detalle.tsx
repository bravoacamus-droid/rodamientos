import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoError, Moneda } from "@rodatech/ui";

import { AvisarAQuien } from "@/modules/compras/ui/avisar-a-quien";

import { perfilActual } from "@rodatech/db/servidor";

import { detalleRecepcion, papelesDeRecepcion } from "../api/consultas";
import {
  EditarPapelesDelProveedor,
  PapelesDelProveedor,
} from "./papeles-proveedor";

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
  const [resultado, perfil, papeles] = await Promise.all([
    detalleRecepcion(id),
    perfilActual(),
    papelesDeRecepcion(id),
  ]);

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
  // Los mismos roles que `permisos_rol` tiene para `recepcion_adjuntos`.
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeAdjuntar =
    rol !== null && ["gerencia", "admin", "almacen", "compras"].includes(rol);
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
              <span className="rounded-sm bg-[var(--danger-bg)] px-2 py-0.5 text-sm font-medium text-[var(--danger)]">
                Anulada
              </span>
            ) : null}
          </div>
          <p className="text-sm text-[var(--fg-muted)]">
            Recibido el {r.fecha}
            {r.recibido_por ? ` por ${r.recibido_por}` : ""}
          </p>
        </div>

        {/*
          El botón de los papeles va aquí arriba, en color, y delante de
          «Volver al listado». Luis, 09/09: *«ponlo pero que tenga color; por
          eso yo te decía poner un botón editar al costado de Volver al
          listado»*. Metido dentro de la sección de papeles y en gris no lo
          veía.

          Delante y no detrás porque es el que se usa: volver al listado se
          hace una vez y esto se hace cada vez que llega un papel.
        */}
        <div className="flex flex-wrap items-center gap-2">
          {puedeAdjuntar && !r.anulada ? (
            <EditarPapelesDelProveedor
              recepcionId={r.id}
              hayPapeles={papeles.ok && papeles.datos.length > 0}
              guiaProveedor={r.guia_proveedor}
              facturaProveedor={r.factura_proveedor}
            />
          ) : null}

          <Link
            href="/recepciones"
            className="inline-flex h-9 items-center rounded-sm border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
          >
            Volver al listado
          </Link>
        </div>
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

      <section className="card @container">
        {/*
          Revisión de diseño del 02/10: en el teléfono esta tabla se
          desplazaba de lado (390 px: 353 → 765). Por debajo de `@3xl`
          (48 rem, 816 px con la base de 17 px) cada línea es una tarjeta con
          lo mismo apilado; se mide ESTA caja (`@container`), no la pantalla.
          Los totales del pie van al final, en su propio bloque.
        */}
        <ul className="flex flex-col gap-2.5 p-3 @3xl:hidden">
          {r.lineas.map((l) => (
            <li
              key={l.id}
              className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3"
            >
              <div>
                <p className="font-mono text-sm font-semibold">{l.codigo}</p>
                <p className="text-sm">{l.descripcion}</p>
                {l.marca ? (
                  <p className="text-sm text-[var(--fg-subtle)]">{l.marca}</p>
                ) : null}
              </div>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-sm">
                <div className="min-w-0">
                  <dt className="text-[var(--fg-subtle)]">Cantidad</dt>
                  <dd className="tabular">
                    {l.cantidad.toLocaleString("es-PE")}
                    <span className="ml-1 text-[var(--fg-subtle)]">{l.unidad}</span>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[var(--fg-subtle)]">Costo por unidad</dt>
                  <dd>
                    <Moneda valor={l.costo_unitario} tamano="sm" enfasis="suave" />
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[var(--fg-subtle)]">Importe</dt>
                  <dd>
                    <Moneda valor={l.importe} tamano="sm" />
                  </dd>
                </div>
              </dl>
              {/* En la tabla se entra por el código; aquí, con un botón que
                  se vea como tal. */}
              <Link
                href={`/productos/${l.producto_id}`}
                className="inline-flex h-10 w-full items-center justify-center rounded-md border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
              >
                Ver el producto
              </Link>
            </li>
          ))}
          <li className="flex flex-wrap items-baseline justify-between gap-2 px-1 pt-1 text-sm font-medium">
            <span>
              {r.lineas.length} {r.lineas.length === 1 ? "línea" : "líneas"} ·{" "}
              <span className="tabular">{unidades.toLocaleString("es-PE")}</span>{" "}
              {unidades === 1 ? "unidad" : "unidades"}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-[var(--fg-muted)]">Valor al proveedor</span>
              <Moneda valor={total} enfasis="fuerte" />
            </span>
          </li>
        </ul>
        <div className="scroll-x hidden @3xl:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
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
                      className="font-mono text-sm font-medium text-brand-600 hover:underline"
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
                    <span className="ml-1 text-sm text-[var(--fg-subtle)]">
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

      {/* El momento de acordarse: la caja acaba de entrar y el cliente que
          lleva semanas esperando es justo el que se olvida. */}
      {/* Los papeles del proveedor (068).

          La recepción sigue siendo un documento cerrado: esto no la edita,
          le cuelga el papel con el que llegó. Willy: *«siempre nos atienden
          con guía y factura»*. */}
      {r.anulada ? null : (
        <PapelesDelProveedor
          papeles={papeles.ok ? papeles.datos : []}
          puedeEditar={puedeAdjuntar && !r.anulada}
        />
      )}

      <AvisarAQuien />
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
      <dt className="text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
        {etiqueta}
      </dt>
      <dd className="mt-0.5 text-sm">{valor}</dd>
      {pie ? <p className="text-sm text-[var(--fg-subtle)]">{pie}</p> : null}
    </div>
  );
}
