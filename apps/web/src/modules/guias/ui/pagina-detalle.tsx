import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { detalleGuia } from "../api/consultas";
import { ETIQUETA_ESTADO, ETIQUETA_MODALIDAD, TONO_ESTADO } from "../dominio/tipos";
import { AnularGuia } from "./anular-guia";
import { EmitirGuia } from "./emitir-guia";

/**
 * Ficha de una guía de remisión.
 *
 * Es el documento que viaja con la mercadería, así que la ficha está pensada
 * para imprimirse: los bloques que solo sirven en pantalla llevan `no-print`.
 *
 * En borrador se puede emitir; emitida, solo anular. No hay edición: una guía
 * emitida ya movió stock, y cambiarle las cantidades dejaría el kardex
 * contando una cosa y el papel diciendo otra.
 */
export default async function PaginaDetalleGuia({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, perfil] = await Promise.all([detalleGuia(id), perfilActual()]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la guía"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const g = resultado.datos;
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEmitir =
    rol !== null && ["gerencia", "admin", "ventas", "almacen"].includes(rol);
  const esGerencia = rol !== null && ["gerencia", "admin"].includes(rol);

  const unidades = g.lineas.reduce((a, l) => a + l.cantidad, 0);

  return (
    <div className="flex flex-col gap-5">
      <header className="anim-entrada flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/guias" className="text-sm text-[var(--fg-muted)] underline no-print">
            ← Guías de remisión
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">
              {g.numero}
            </h1>
            <Badge tone={TONO_ESTADO[g.estado]}>{ETIQUETA_ESTADO[g.estado]}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            {g.cliente ?? "—"}
            {g.cliente_documento ? ` · ${g.cliente_documento}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 no-print">
          <Link
            href={`/guias/${g.id}/imprimir`}
            className="inline-flex h-9 items-center rounded-sm border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
          >
            Imprimir
          </Link>
          {puedeEmitir ? <EmitirGuia guia={g} /> : null}
          {esGerencia ? (
            <AnularGuia
              id={g.id}
              numero={g.numero}
              estado={g.estado}
              comprobante={g.comprobante}
            />
          ) : null}
        </div>
      </header>

      {g.estado === "borrador" ? (
        <p className="anim-entrada rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm no-print">
          <strong>Es un borrador.</strong> La mercadería todavía NO ha salido del
          almacén. Sale cuando pulses «Emitir y despachar».
        </p>
      ) : null}

      {g.estado === "anulada" && g.motivo_anulacion ? (
        <p className="anim-entrada rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm">
          <strong>Anulada:</strong> {g.motivo_anulacion}
        </p>
      ) : null}

      {/* --------------------------------------------------------- Cifras */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta etiqueta="Peso bruto" valor={`${g.peso_bruto_kg.toFixed(3)} kg`} />
        <Tarjeta etiqueta="Bultos" valor={String(g.numero_bultos)} />
        <Tarjeta
          etiqueta="Unidades"
          valor={unidades.toLocaleString("es-PE")}
          pie={`${g.lineas.length} ${g.lineas.length === 1 ? "línea" : "líneas"}`}
        />
        <Tarjeta etiqueta="Traslado" valor={g.fecha_traslado} pie={g.motivo_descripcion ?? ""} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------ Líneas */}
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Qué se traslada</h2>
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                  <th className="py-2 pr-3 font-medium">Código</th>
                  <th className="py-2 pr-3 font-medium">Descripción</th>
                  <th className="py-2 pr-3 text-right font-medium">Cantidad</th>
                  <th className="py-2 text-right font-medium">Peso</th>
                </tr>
              </thead>
              <tbody>
                {g.lineas.map((l, i) => (
                  <tr
                    key={l.id}
                    className="anim-entrada border-b border-[var(--border-soft)] last:border-0"
                    style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
                  >
                    <td className="py-2 pr-3">
                      <Link
                        href={`/productos/${l.producto_id}`}
                        className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                      >
                        {l.codigo}
                      </Link>
                    </td>
                    <td className="max-w-xs py-2 pr-3">
                      <span className="block truncate" title={l.descripcion}>
                        {l.descripcion}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular">
                      {l.cantidad}{" "}
                      <span className="text-[0.7rem] text-[var(--fg-subtle)]">
                        {l.unidad}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular text-[var(--fg-muted)]">
                      {l.peso_kg > 0 ? `${l.peso_kg.toFixed(3)} kg` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------------------------- Datos */}
        <div className="flex flex-col gap-4">
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Traslado</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Dato etiqueta="Parte de" valor={g.direccion_partida ?? "—"} />
              <Dato etiqueta="Llega a" valor={g.direccion_llegada ?? "—"} />
              <Dato etiqueta="Ubigeo" valor={g.ubigeo_llegada ?? "—"} />
              <Dato etiqueta="Emisión" valor={g.fecha_emision} />
              <Dato etiqueta="Cotización" valor={g.cotizacion_numero ?? "—"} />
              <Dato etiqueta="Orden de compra" valor={g.orden_compra_cliente ?? "—"} />
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Transporte</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Dato
                etiqueta="Modalidad"
                valor={ETIQUETA_MODALIDAD[g.modalidad_traslado] ?? g.modalidad_traslado}
              />
              {g.modalidad_traslado === "01" ? (
                <>
                  <Dato etiqueta="Transportista" valor={g.transportista_razon_social ?? "—"} />
                  <Dato etiqueta="RUC" valor={g.transportista_documento ?? "—"} />
                </>
              ) : (
                <Dato etiqueta="Placa" valor={g.transportista_placa ?? "—"} />
              )}
              <Dato etiqueta="Conductor" valor={g.conductor_nombre ?? "—"} />
              <Dato etiqueta="Licencia" valor={g.conductor_licencia ?? "—"} />
            </dl>

            {g.observaciones ? (
              <p className="mt-3 border-t border-[var(--border-soft)] pt-3 text-sm text-[var(--fg-muted)]">
                {g.observaciones}
              </p>
            ) : null}
          </section>

          {/* La GRE todavía no se envía: el conector REST + OAuth2 está por
              escribir. Se dice aquí en vez de dejar un botón que falla. */}
          <section className="card p-4 no-print">
            <h2 className="mb-1 text-sm font-semibold">SUNAT</h2>
            {g.comprobante ? (
              <p className="mb-2 text-sm">
                Facturada con{" "}
                <Link
                  href={`/facturacion/${g.comprobante.id}`}
                  className="font-mono font-medium text-brand-600 hover:underline"
                >
                  {g.comprobante.numero}
                </Link>
              </p>
            ) : null}
            <p className="text-sm text-[var(--fg-muted)]">
              El envío de la guía electrónica (GRE) todavía no está disponible: SUNAT lo
              cambió a un servicio REST con OAuth2 que hay que escribir aparte. La guía
              es válida como documento interno y mueve el stock igual.
            </p>
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
}: {
  etiqueta: string;
  valor: string;
  pie?: string;
}) {
  return (
    <div className="card anim-entrada p-3">
      <p className="text-xs text-[var(--fg-muted)]">{etiqueta}</p>
      <p className="mt-0.5 truncate text-lg font-semibold tabular">{valor}</p>
      {pie ? <p className="mt-0.5 truncate text-xs text-[var(--fg-subtle)]">{pie}</p> : null}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 break-words">{valor}</dd>
    </div>
  );
}
