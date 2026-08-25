import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EstadoError, Moneda } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { estadoConfiguracion } from "../api/configuracion";
import { detalleComprobante } from "../api/consultas";
import { ETIQUETA_SUNAT, ETIQUETA_TIPO, TONO_SUNAT } from "../dominio/tipos";
import { EnviarASunat } from "./enviar-sunat";

/**
 * Ficha de un comprobante.
 *
 * Es un documento fiscal: no hay botón de editar, y no lo habrá. Corregir una
 * factura emitida se hace con una nota de crédito, que es otro documento con su
 * propio correlativo. Ese es el diseño que impone SUNAT y el que evita que un
 * número ya declarado cambie de contenido.
 */
export default async function PaginaDetalleComprobante({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, perfil, config] = await Promise.all([
    detalleComprobante(id),
    perfilActual(),
    estadoConfiguracion(),
  ]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el comprobante"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }
  if (!resultado.datos) notFound();

  const c = resultado.datos;
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEnviar = rol !== null && ["gerencia", "admin", "ventas"].includes(rol);

  return (
    <div className="flex flex-col gap-5">
      <header className="anim-entrada flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/facturacion" className="text-sm text-[var(--fg-muted)] underline">
            ← Facturación
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">
              {c.numero}
            </h1>
            <Badge tone="neutral">{ETIQUETA_TIPO[c.tipo]}</Badge>
            <Badge tone={TONO_SUNAT[c.estado_sunat]}>
              {ETIQUETA_SUNAT[c.estado_sunat]}
            </Badge>
            {c.estado === "anulado" ? <Badge tone="danger">Anulado</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            {c.cliente ?? "—"}
            {c.cliente_documento ? ` · ${c.cliente_documento}` : ""}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 no-print">
          <div className="flex items-center gap-2">
            <Link
              href={`/facturacion/${c.id}/imprimir`}
              className="inline-flex h-9 items-center rounded-sm border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              Imprimir
            </Link>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------- Cifras */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta etiqueta="Gravada" valor={<Moneda valor={c.op_gravada} />} />
        <Tarjeta etiqueta="IGV" valor={<Moneda valor={c.igv} enfasis="suave" />} />
        <Tarjeta etiqueta="Total" valor={<Moneda valor={c.total} />} />
        <Tarjeta
          etiqueta="Saldo"
          valor={<Moneda valor={c.saldo} />}
          pie={c.saldo <= 0 ? "cobrado" : `pagado ${c.pagado.toFixed(2)}`}
          tono={c.saldo <= 0 ? "ok" : "aviso"}
        />
      </div>

      {c.total_letras ? (
        <p className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2 text-sm">
          <span className="text-[var(--fg-muted)]">Son: </span>
          {c.total_letras}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------ Líneas */}
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Detalle</h2>
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                  <th className="py-2 pr-3 font-medium">Código</th>
                  <th className="py-2 pr-3 font-medium">Descripción</th>
                  <th className="py-2 pr-3 text-right font-medium">Cant.</th>
                  <th className="py-2 pr-3 text-right font-medium">V. unit.</th>
                  <th className="py-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {c.lineas.map((l, i) => (
                  <tr
                    key={l.id}
                    className="anim-entrada border-b border-[var(--border-soft)] last:border-0"
                    style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
                  >
                    <td className="py-2 pr-3">
                      {l.producto_id ? (
                        <Link
                          href={`/productos/${l.producto_id}`}
                          className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                        >
                          {l.codigo}
                        </Link>
                      ) : (
                        <span className="font-mono text-[0.8rem]">{l.codigo}</span>
                      )}
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
                    <td className="py-2 pr-3 text-right tabular">
                      {l.valor_unitario.toFixed(4)}
                      {l.descuento_pct > 0 ? (
                        <span className="block text-[0.7rem] text-[var(--fg-subtle)]">
                          −{l.descuento_pct}%
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 text-right tabular font-medium">
                      {l.importe.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------------------------------- Datos */}
        <div className="flex flex-col gap-4">
          {/* Lo primero de la columna es lo accionable: el estado del envío. */}
          <section className="card p-4 no-print">
            <h2 className="mb-3 text-sm font-semibold">SUNAT</h2>

            {c.estado_sunat === "aceptado" ? (
              <div className="rounded-sm border border-[var(--ok)] bg-[var(--surface-2)] p-2.5 text-sm">
                <p className="font-medium">Aceptado.</p>
                {c.sunat_enviado_en ? (
                  <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                    {new Date(c.sunat_enviado_en).toLocaleString("es-PE")}
                  </p>
                ) : null}
                {c.sunat_hash_cdr ? (
                  <p className="mt-1 break-all font-mono text-[0.7rem] text-[var(--fg-subtle)]">
                    {c.sunat_hash_cdr}
                  </p>
                ) : null}
              </div>
            ) : puedeEnviar ? (
              <EnviarASunat
                id={c.id}
                numero={c.numero}
                configurado={config.listo}
                yaAceptado={false}
              />
            ) : (
              <p className="text-sm text-[var(--fg-muted)]">
                {ETIQUETA_SUNAT[c.estado_sunat]}. Tu rol no puede enviarlo.
              </p>
            )}

            {c.sunat_mensaje && c.estado_sunat !== "aceptado" ? (
              <p className="mt-2 text-xs text-[var(--fg-muted)]">
                Último mensaje: {c.sunat_mensaje}
              </p>
            ) : null}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Datos</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Dato etiqueta="Emisión" valor={c.fecha_emision} />
              <Dato
                etiqueta="Pago"
                valor={
                  c.condicion_pago === "credito"
                    ? `A ${c.dias_credito} días · vence ${c.fecha_vencimiento ?? "—"}`
                    : "Al contado"
                }
              />
              <Dato etiqueta="Cotización" valor={c.cotizacion_numero ?? "—"} />
              <Dato etiqueta="Orden de compra" valor={c.orden_compra_cliente ?? "—"} />
              {c.referencia_numero ? (
                <Dato etiqueta="Corrige a" valor={c.referencia_numero} />
              ) : null}
              <Dato etiqueta="Vendedor" valor={c.vendedor ?? "—"} />
            </dl>

            {c.detraccion_aplica ? (
              <div className="mt-3 rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs">
                <p className="font-medium">
                  Detracción {c.detraccion_porcentaje}% · $
                  {c.detraccion_monto.toFixed(2)}
                </p>
                <p className="mt-0.5 text-[var(--fg-muted)]">
                  El cliente paga {(c.total - c.detraccion_monto).toFixed(2)} y deposita
                  el resto en la cuenta de detracciones.
                </p>
              </div>
            ) : null}

            {c.observaciones ? (
              <p className="mt-3 border-t border-[var(--border-soft)] pt-3 text-sm text-[var(--fg-muted)]">
                {c.observaciones}
              </p>
            ) : null}
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
    <div className="card anim-entrada p-3">
      <p className="text-xs text-[var(--fg-muted)]">{etiqueta}</p>
      <p className={`mt-0.5 truncate text-lg font-semibold tabular ${color}`}>{valor}</p>
      {pie ? <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">{pie}</p> : null}
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
