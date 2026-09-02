"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importeConDescuento } from "@rodatech/config";
import { Badge, Button, Input, SelectNativo, Textarea } from "@rodatech/ui";

import { cargarCotizacion } from "../acciones/cargar";
import { emitirComprobante, type ResultadoEmision } from "../acciones/emitir";
import {
  bloqueosEmision,
  cuotasDe,
  tipoSugerido,
  totalesDe,
  vencimientoDe,
} from "../dominio/emision";
import type { CotizacionFacturable, TipoComprobante } from "../dominio/tipos";

/**
 * Emisión de un comprobante a partir de una cotización aprobada.
 *
 * La pantalla NO deja tocar PRECIOS. Se elige la cotización, el tipo y la
 * forma de pago; los importes vienen de lo que ya se aprobó. Poder editarlos
 * aquí sería tener dos verdades sobre la misma venta, y la que acabaría en el
 * comprobante no sería la que el cliente aceptó.
 *
 * Las CANTIDADES sí se pueden bajar (047), nunca subir: el cliente confirmó 6,
 * hay 4 en almacén, se le entregan 4 ahora y 2 cuando llegue la compra. Lo que
 * no se factura sigue vivo en la cotización y en la bandeja «Por comprar». El
 * techo lo vuelve a aplicar el servidor: desde aquí solo se puede pedir menos.
 *
 * Los totales que se ven son la misma cuenta que hace Postgres al emitir. Si
 * en pantalla saliera otro número, el operador vería uno y se grabaría otro.
 */
export function EmisorComprobante({
  cotizaciones,
  hoy,
  serieFactura,
  serieBoleta,
  cotizacionInicial,
}: {
  cotizaciones: { id: string; numero: string; fecha: string; cliente: string; total: number }[];
  /** La fecha la fija el servidor: el dominio no lee reloj. */
  hoy: string;
  serieFactura: string;
  serieBoleta: string;
  cotizacionInicial?: string | null;
}) {
  const router = useRouter();

  const [cotizacionId, setCotizacionId] = useState(cotizacionInicial ?? "");
  const [cot, setCot] = useState<CotizacionFacturable | null>(null);
  const [cargando, cargar] = useTransition();
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoComprobante>("factura");
  const [fecha, setFecha] = useState(hoy);
  const [condicion, setCondicion] = useState<"contado" | "credito">("contado");
  const [dias, setDias] = useState(0);
  const [observaciones, setObservaciones] = useState("");
  // Por defecto NO: el stock sale con la guía de remisión, que es el
  // documento que acompaña el movimiento físico. Se marca solo en la venta
  // de mostrador, cuando el cliente se lleva la pieza y se le factura ahí.
  const [descargarStock, setDescargarStock] = useState(false);
  /**
   * Cuánto se factura de cada línea, en el orden en que vienen.
   *
   * Arranca en lo pendiente —lo normal es facturarlo todo— y se puede
   * bajar. Es el caso de Willy: el cliente confirmó 6, hay 4, se le
   * entregan 4 ahora y 2 cuando llegue la compra.
   */
  const [cantidades, setCantidades] = useState<number[]>([]);

  const [resultado, emitir, emitiendo] = useActionState<ResultadoEmision | null, FormData>(
    async (previo, formData) => {
      const r = await emitirComprobante(previo, formData);
      if (r.ok) router.push(`/facturacion/${r.id}`);
      return r;
    },
    null,
  );

  // Al elegir cotización se trae entera del servidor. No se fía de lo que
  // tenga el listado: los importes que van a un documento fiscal se releen.
  useEffect(() => {
    if (!cotizacionId) {
      setCot(null);
      setCantidades([]);
      return;
    }
    setErrorCarga(null);
    cargar(async () => {
      const r = await cargarCotizacion(cotizacionId);
      if (!r.ok) {
        setCot(null);
        setErrorCarga(r.error);
        return;
      }
      if (!r.datos) {
        setCot(null);
        setErrorCarga("La cotización ya no está disponible.");
        return;
      }
      setCot(r.datos);
      setCantidades(r.datos.lineas.map((l) => l.cantidad));
      // El tipo y la condición se proponen desde el cliente, que es quien los
      // determina. Se pueden cambiar, pero por defecto aciertan.
      setTipo(tipoSugerido(r.datos.cliente_tipo_documento));
      setCondicion(r.datos.condicion_pago === "credito" ? "credito" : "contado");
      setDias(r.datos.dias_credito ?? 0);
    });
  }, [cotizacionId]);

  // Lo que se va a emitir de verdad. El servidor lo vuelve a recortar
  // contra lo pendiente: esto es para que los totales de la pantalla
  // coincidan con los del comprobante antes de pulsar.
  const aEmitir = useMemo(
    () =>
      (cot?.lineas ?? [])
        .map((l, i) => ({ ...l, cantidad: cantidades[i] ?? l.cantidad }))
        .filter((l) => l.cantidad > 0),
    [cot, cantidades],
  );

  const totales = useMemo(
    () => totalesDe(aEmitir),
    [aEmitir],
  );

  const bloqueos = useMemo(
    () =>
      cot
        ? bloqueosEmision(
            // Con las líneas y el total de lo que se emite, no los de la
            // cotización: si se bajan todas a cero hay que bloquear, y el
            // umbral de la boleta se mira contra lo que se cobra.
            { ...cot, lineas: aEmitir, total: totales.total },
            tipo,
          )
        : [],
    [cot, aEmitir, totales.total, tipo],
  );

  const serie = tipo === "factura" ? serieFactura : serieBoleta;
  const alCredito = condicion === "credito" && dias > 0;
  const vencimiento = alCredito ? vencimientoDe(fecha, dias) : null;
  const cuotas = alCredito ? cuotasDe(totales.total, dias, fecha) : [];

  const payload = JSON.stringify({
    cotizacion_id: cotizacionId,
    tipo,
    serie,
    fecha_emision: fecha,
    condicion_pago: condicion,
    dias_credito: alCredito ? dias : 0,
    observaciones: observaciones.trim() || null,
    descargar_stock: descargarStock,
    cantidades,
  });

  const listo = Boolean(cot) && bloqueos.length === 0 && !emitiendo;

  return (
    <form action={emitir} className="flex flex-col gap-5">
      <input type="hidden" name="comprobante" value={payload} />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Emitir comprobante</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Nace de una cotización aprobada. El stock sale con la guía, no aquí.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/facturacion")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!listo}>
            {emitiendo ? "Emitiendo…" : `Emitir ${serie}`}
          </Button>
        </div>
      </header>

      {resultado && !resultado.ok ? (
        <div className="anim-entrada rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          <p className="font-medium">{resultado.error}</p>
          {resultado.bloqueos ? (
            <ul className="mt-1 flex flex-col gap-0.5">
              {resultado.bloqueos.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* ------------------------------------------------- Cabecera */}
          <section className="card p-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Cotización aprobada <span className="text-[var(--danger)]">*</span>
              </span>
              <SelectNativo
                value={cotizacionId}
                onChange={(e) => setCotizacionId(e.target.value)}
              >
                <option value="">Elige una cotización…</option>
                {cotizaciones.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} · {c.cliente} · ${c.total.toFixed(2)}
                  </option>
                ))}
              </SelectNativo>
              {cotizaciones.length === 0 ? (
                <span className="text-xs text-[var(--fg-muted)]">
                  No hay cotizaciones aprobadas sin facturar. Aprueba una primero.
                </span>
              ) : null}
            </label>

            {cargando ? (
              <p className="anim-latido mt-3 text-sm text-[var(--fg-muted)]">
                Trayendo la cotización…
              </p>
            ) : null}

            {errorCarga ? (
              <p className="mt-3 rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
                {errorCarga}
              </p>
            ) : null}

            {cot ? (
              <div className="anim-entrada mt-4 grid gap-3 border-t border-[var(--border-soft)] pt-4 sm:grid-cols-4">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Tipo</span>
                  <SelectNativo
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as TipoComprobante)}
                  >
                    <option value="factura">Factura</option>
                    <option value="boleta">Boleta</option>
                  </SelectNativo>
                  <span className="font-mono text-xs text-[var(--fg-subtle)]">{serie}</span>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Fecha</span>
                  <Input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Pago</span>
                  <SelectNativo
                    value={condicion}
                    onChange={(e) => {
                      const v = e.target.value as "contado" | "credito";
                      setCondicion(v);
                      if (v === "contado") setDias(0);
                      else if (dias === 0) setDias(cot.dias_credito || 30);
                    }}
                  >
                    <option value="contado">Al contado</option>
                    <option value="credito">A crédito</option>
                  </SelectNativo>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Días</span>
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={dias}
                    disabled={condicion === "contado"}
                    onChange={(e) => setDias(Number(e.target.value))}
                    className="tabular"
                  />
                  {vencimiento ? (
                    <span className="text-xs text-[var(--fg-subtle)]">
                      vence {vencimiento}
                    </span>
                  ) : null}
                </label>
              </div>
            ) : null}
          </section>

          {/* --------------------------------------------------- Líneas */}
          {cot ? (
            <section className="anim-entrada card p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  Qué se factura
                  <span className="ml-2 font-normal text-[var(--fg-muted)]">
                    de {cot.numero}
                  </span>
                </h2>
                <span className="text-xs text-[var(--fg-muted)]">
                  {cot.cliente} · {cot.cliente_documento ?? "sin documento"}
                </span>
              </div>

              {/* Los importes NO se pueden tocar: son los que el cliente aprobó.
                  Cambiarlos aquí sería tener dos verdades sobre la misma venta. */}
              <div className="scroll-x">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                      <th className="py-2 pr-3 font-medium">Código</th>
                      <th className="py-2 pr-3 font-medium">Descripción</th>
                      <th className="py-2 pr-3 text-right font-medium">Cant.</th>
                      <th className="py-2 pr-3 text-right font-medium">V. unit.</th>
                      <th className="py-2 pr-3 text-right font-medium">Dscto.</th>
                      <th className="py-2 text-right font-medium">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cot.lineas.map((l, i) => (
                      <tr
                        key={`${l.producto_id}-${i}`}
                        className="anim-entrada border-b border-[var(--border-soft)] last:border-0"
                        style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
                      >
                        <td className="py-2 pr-3 font-mono text-[0.8rem]">{l.codigo}</td>
                        <td className="max-w-xs py-2 pr-3">
                          <span className="block truncate" title={l.descripcion}>
                            {l.descripcion}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular">
                          {/* Editable, con techo en lo pendiente (047). Es el
                              caso de Willy: el cliente confirmó 6, hay 4, se
                              le entregan 4 ahora y 2 cuando llegue la compra.
                              El servidor lo vuelve a recortar; esto es para
                              poder hacerlo, no para que sea seguro. */}
                          <Input
                            type="number"
                            min={0}
                            max={l.cantidad}
                            step="0.01"
                            numerico
                            className="h-9 w-24 text-right"
                            value={cantidades[i] ?? l.cantidad}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              setCantidades((previas) =>
                                previas.map((c, j) =>
                                  j === i
                                    ? Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), l.cantidad)
                                    : c,
                                ),
                              );
                            }}
                            aria-label={`Cantidad a facturar de ${l.codigo}`}
                          />
                          <span className="ml-1 text-xs text-[var(--fg-subtle)]">
                            {l.unidad}
                          </span>
                          <span className="block text-xs text-[var(--fg-subtle)]">
                            {(cantidades[i] ?? l.cantidad) < l.cantidad
                              ? `quedarían ${l.cantidad - (cantidades[i] ?? l.cantidad)} sin facturar`
                              : l.cantidad !== l.cantidad_cotizada
                                ? `de ${l.cantidad_cotizada} cotizadas` +
                                  (l.cantidad_atendida > 0
                                    ? ` · ${l.cantidad_atendida} ya facturadas`
                                    : "")
                                : `${l.cantidad} pendientes`}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular">
                          {l.valor_unitario.toFixed(4)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular">
                          {l.descuento_pct > 0 ? `${l.descuento_pct}%` : "—"}
                        </td>
                        <td className="py-2 text-right tabular font-medium">
                          {/* Sobre la cantidad que se está emitiendo, no sobre
                              `l.importe`: si no, la suma de la columna no
                              cuadraría con el total de abajo. */}
                          {importeConDescuento(
                            cantidades[i] ?? l.cantidad,
                            l.valor_unitario,
                            l.descuento_pct,
                          ).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {cot ? (
            <section className="anim-entrada card flex flex-col gap-4 p-4">
              {/* La salida de almacén es una DECISIÓN, y por eso está aquí y
                  no implícita. Lo normal es que la mercadería ya haya salido
                  con la guía de remisión; marcar esto entonces restaría el
                  stock dos veces. */}
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={descargarStock}
                  onChange={(e) => setDescargarStock(e.target.checked)}
                  className="mt-0.5 size-4 accent-brand-600"
                />
                <span>
                  <span className="block text-sm font-medium">
                    La mercadería sale del almacén con esta factura
                  </span>
                  <span className="block text-xs text-[var(--fg-muted)]">
                    Solo para venta de mostrador, sin guía previa. Si ya emitiste
                    guía de remisión, déjalo sin marcar: el stock salió con ella y
                    marcarlo lo restaría dos veces.
                  </span>
                </span>
              </label>

              <label className="flex flex-col gap-1 border-t border-[var(--border-soft)] pt-4">
                <span className="text-sm font-medium">Observaciones</span>
                <Textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  placeholder="Lo que salga impreso al pie del comprobante."
                />
              </label>
            </section>
          ) : null}
        </div>

        {/* -------------------------------------------------- Resumen */}
        <aside className="w-full shrink-0 lg:w-80">
          <div className="card sticky top-4 flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Resumen</h2>

            <dl className="flex flex-col gap-1.5 text-sm">
              <Fila etiqueta="Gravada" valor={`$ ${totales.gravada.toFixed(2)}`} />
              {totales.descuento > 0 ? (
                <Fila etiqueta="Descuento" valor={`− $ ${totales.descuento.toFixed(2)}`} />
              ) : null}
              <Fila etiqueta="IGV (18 %)" valor={`$ ${totales.igv.toFixed(2)}`} />
              <Fila etiqueta="Total" valor={`$ ${totales.total.toFixed(2)}`} fuerte />
            </dl>

            {cuotas.length > 0 ? (
              <div className="rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                {/* SUNAT exige el cronograma desde 2022: sin él, un comprobante
                    al crédito se rechaza con el error 3251. */}
                <p className="mb-1 text-xs font-medium">Cronograma para SUNAT</p>
                <ul className="flex flex-col gap-0.5 text-xs text-[var(--fg-muted)]">
                  {cuotas.map((q) => (
                    <li key={q.numero} className="flex justify-between gap-2">
                      <span>Cuota {q.numero}</span>
                      <span className="tabular">
                        {q.monto.toFixed(2)} · {q.vencimiento}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {bloqueos.length > 0 ? (
              <div className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5">
                <p className="mb-1 text-xs font-medium text-[var(--danger)]">
                  SUNAT lo rechazaría:
                </p>
                <ul className="flex flex-col gap-1 text-xs">
                  {bloqueos.map((b) => (
                    <li key={b.campo}>· {b.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {cot && bloqueos.length === 0 ? (
              <p className="text-xs text-[var(--fg-muted)]">
                Se emite como <Badge tone="neutral" size="xs">{serie}</Badge> y queda
                pendiente de enviar a SUNAT. El envío es un botón aparte en la ficha.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </form>
  );
}

function Fila({
  etiqueta,
  valor,
  fuerte,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className={`tabular ${fuerte ? "text-base font-semibold" : ""}`}>{valor}</dd>
    </div>
  );
}
