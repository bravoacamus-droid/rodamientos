"use client";

import { useActionState, useEffect, useMemo, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  SelectNativo,
  Table,
  TableContenedor,
  TBody,
  Textarea,
  THead,
} from "@rodatech/ui";

import { costosDelProveedor } from "../../acciones/costos";
import { registrarCompra, type ResultadoCompra } from "../../acciones/registrar";
import {
  aPayload,
  avisos as calcularAvisos,
  bloqueos as calcularBloqueos,
  estadoInicial,
  reducir,
  totalesDe,
} from "../../dominio/constructor";
import type { ProveedorOpcion } from "../../dominio/tipos";
import { BuscadorCompra } from "./buscador";
import { FilaCompra } from "./linea";

/**
 * Registro de una compra.
 *
 * Todo el estado vive en `dominio/constructor.ts` como reducer puro, así que
 * este componente solo conecta cables: despacha acciones y pinta lo que sale.
 *
 * Comprar NO mueve stock. Willy, 25:21: *"el stock se mueve al recibir la
 * mercadería"*. Por eso aquí no hay ni una palabra de kardex: lo que se está
 * registrando es el compromiso con el proveedor.
 */
export function ConstructorCompra({
  proveedores,
  hoy,
}: {
  proveedores: ProveedorOpcion[];
  /** La fecha la fija el servidor: el dominio no lee reloj, para poder probarlo. */
  hoy: string;
}) {
  const router = useRouter();
  const [estado, despachar] = useReducer(reducir, estadoInicial(hoy));

  // Lo que este proveedor cobró la última vez, por producto. Se recarga al
  // cambiar de proveedor: es la referencia contra la que se negocia.
  const [ultimosCostos, setUltimosCostos] = useState<
    Record<string, { costo: number; numero: string; fecha: string }>
  >({});
  const [, cargarCostos] = useTransition();

  const [resultado, guardar, guardando] = useActionState<ResultadoCompra | null, FormData>(
    async (previo, formData) => {
      const r = await registrarCompra(previo, formData);
      if (r.ok) router.push(`/compras/${r.id}`);
      return r;
    },
    null,
  );

  const totales = useMemo(() => totalesDe(estado), [estado]);
  const bloqueos = useMemo(() => calcularBloqueos(estado), [estado]);
  const avisos = useMemo(() => calcularAvisos(estado), [estado]);
  const proveedor = proveedores.find((p) => p.id === estado.proveedorId);

  useEffect(() => {
    if (!estado.proveedorId) {
      setUltimosCostos({});
      return;
    }
    const id = estado.proveedorId;
    cargarCostos(async () => {
      const r = await costosDelProveedor(id);
      setUltimosCostos(r.ok ? r.datos : {});
    });
  }, [estado.proveedorId]);

  const esImportacion = estado.tipo === "importacion";

  return (
    <form action={guardar} className="flex flex-col gap-5">
      <input type="hidden" name="compra" value={JSON.stringify(aPayload(estado))} />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Registrar compra</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            El stock no se mueve aquí. Se moverá cuando la mercadería llegue y se
            recepcione.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/compras")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={bloqueos.length > 0 || guardando}>
            {guardando ? "Guardando…" : "Guardar compra"}
          </Button>
        </div>
      </header>

      {resultado && !resultado.ok ? (
        <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {resultado.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* ------------------------------------------------- Cabecera */}
          <section className="card p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  Proveedor <span className="text-[var(--danger)]">*</span>
                </span>
                <SelectNativo
                  value={estado.proveedorId ?? ""}
                  onChange={(e) =>
                    despachar({
                      tipo: "cabecera",
                      campo: "proveedorId",
                      valor: e.target.value || null,
                    })
                  }
                >
                  <option value="">Elige un proveedor…</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.razon_social}
                      {p.numero_documento ? ` · ${p.numero_documento}` : ""}
                    </option>
                  ))}
                </SelectNativo>
                {proveedor ? (
                  <span className="text-xs text-[var(--fg-muted)]">
                    {proveedor.dias_pago > 0
                      ? `Paga a ${proveedor.dias_pago} días`
                      : "Al contado"}
                    {proveedor.lead_time_dias > 0
                      ? ` · suele tardar ${proveedor.lead_time_dias} días`
                      : ""}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--fg-subtle)]">
                    Es lo primero: los precios que se enseñan son los suyos.
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Tipo</span>
                <SelectNativo
                  value={estado.tipo}
                  onChange={(e) =>
                    despachar({
                      tipo: "tipoCompra",
                      valor: e.target.value as "local" | "importacion",
                    })
                  }
                >
                  <option value="local">Local</option>
                  <option value="importacion">Importación</option>
                </SelectNativo>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Fecha</span>
                <Input
                  type="date"
                  value={estado.fecha}
                  onChange={(e) =>
                    despachar({ tipo: "cabecera", campo: "fecha", valor: e.target.value })
                  }
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Factura del proveedor</span>
                <Input
                  value={estado.documentoProveedor}
                  onChange={(e) =>
                    despachar({
                      tipo: "cabecera",
                      campo: "documentoProveedor",
                      valor: e.target.value,
                    })
                  }
                  placeholder="F001-1234"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Llega el</span>
                <Input
                  type="date"
                  value={estado.fechaEstimada}
                  onChange={(e) =>
                    despachar({
                      tipo: "cabecera",
                      campo: "fechaEstimada",
                      valor: e.target.value,
                    })
                  }
                />
              </label>

              <label className="flex items-end gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={estado.afectoIgv}
                  onChange={(e) =>
                    despachar({ tipo: "afectoIgv", valor: e.target.checked })
                  }
                  className="size-4 accent-[var(--brand-600)]"
                />
                <span className="text-sm">La factura lleva IGV</span>
              </label>
            </div>

            {/* Los campos de importación solo aparecen cuando lo son. Un
                tracking de DHL en una compra a un proveedor de Lima ensucia el
                histórico para siempre. */}
            {esImportacion ? (
              <div className="mt-3 grid gap-3 border-t border-[var(--border-soft)] pt-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Gastos de importación</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={estado.gastosImportacion}
                    onChange={(e) =>
                      despachar({ tipo: "gastos", valor: Number(e.target.value) })
                    }
                    className="tabular"
                  />
                  <span className="text-xs text-[var(--fg-subtle)]">
                    Courier y despacho. Se reparten sobre el costo al recibir.
                  </span>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Courier</span>
                  <Input
                    value={estado.courier}
                    onChange={(e) =>
                      despachar({ tipo: "cabecera", campo: "courier", valor: e.target.value })
                    }
                    placeholder="DHL"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Tracking</span>
                  <Input
                    value={estado.tracking}
                    onChange={(e) =>
                      despachar({ tipo: "cabecera", campo: "tracking", valor: e.target.value })
                    }
                    placeholder="Número de seguimiento"
                  />
                </label>
              </div>
            ) : null}
          </section>

          {/* --------------------------------------------------- Líneas */}
          <section className="card p-4">
            <div className="mb-3">
              <BuscadorCompra
                onElegir={(p) => despachar({ tipo: "agregar", producto: p })}
                ultimosCostos={ultimosCostos}
              />
            </div>

            {estado.lineas.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--fg-muted)]">
                Busca un producto arriba para empezar. Puedes teclear el código, la
                marca o parte de la descripción.
              </p>
            ) : (
              <TableContenedor>
                <Table>
                  <THead>
                    <tr>
                      <th className="text-left">Código</th>
                      <th className="text-left">Descripción</th>
                      <th className="text-right">Cant.</th>
                      <th className="text-left">U.M.</th>
                      <th className="text-right">Costo unit.</th>
                      <th className="text-right">Importe</th>
                      <th className="text-right">Stock</th>
                      <th />
                    </tr>
                  </THead>
                  <TBody>
                    {estado.lineas.map((l) => (
                      <FilaCompra
                        key={l.key}
                        linea={l}
                        ultimoCosto={ultimosCostos[l.productoId]}
                        despachar={despachar}
                      />
                    ))}
                  </TBody>
                </Table>
              </TableContenedor>
            )}
          </section>

          <section className="card p-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Observaciones</span>
              <Textarea
                value={estado.observaciones}
                onChange={(e) =>
                  despachar({
                    tipo: "cabecera",
                    campo: "observaciones",
                    valor: e.target.value,
                  })
                }
                rows={3}
                placeholder="Lo que convenga recordar de esta compra."
              />
            </label>
          </section>
        </div>

        {/* -------------------------------------------------- Resumen */}
        <aside className="w-full shrink-0 lg:w-80">
          <div className="card sticky top-4 flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Resumen</h2>

            <dl className="flex flex-col gap-1.5 text-sm">
              <Fila etiqueta="Líneas" valor={String(totales.lineas)} />
              <Fila etiqueta="Unidades" valor={totales.unidades.toLocaleString("es-PE")} />
              <div className="my-1 border-t border-[var(--border-soft)]" />
              <Fila etiqueta="Subtotal" valor={`$ ${totales.subtotal.toFixed(2)}`} />
              <Fila
                etiqueta={estado.afectoIgv ? "IGV (18 %)" : "IGV (no afecto)"}
                valor={`$ ${totales.igv.toFixed(2)}`}
              />
              <Fila etiqueta="Total" valor={`$ ${totales.total.toFixed(2)}`} fuerte />

              {esImportacion && totales.gastos > 0 ? (
                <>
                  <div className="my-1 border-t border-[var(--border-soft)]" />
                  <Fila etiqueta="Gastos" valor={`$ ${totales.gastos.toFixed(2)}`} />
                  {/* Lo que de verdad va a costar la mercadería en almacén. El
                      IGV no entra: es crédito fiscal recuperable, no costo. */}
                  <Fila
                    etiqueta="Costo en almacén"
                    valor={`$ ${totales.costoEnAlmacen.toFixed(2)}`}
                    fuerte
                  />
                </>
              ) : null}
            </dl>

            {bloqueos.length > 0 ? (
              <div className="rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                <p className="mb-1 text-xs font-medium">Falta para poder guardar:</p>
                <ul className="flex flex-col gap-0.5 text-xs text-[var(--fg-muted)]">
                  {bloqueos.map((b) => (
                    <li key={b.campo}>· {b.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Avisos: no impiden guardar. Son situaciones legítimas que suelen
                ser errores, y bloquearlas obligaría a inventarse un rodeo el
                día que de verdad pasan. */}
            {avisos.length > 0 ? (
              <div className="rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5">
                <p className="mb-1 text-xs font-medium">Conviene mirar:</p>
                <ul className="flex flex-col gap-1 text-xs">
                  {avisos.map((a, i) => (
                    <li key={`${a.key}-${i}`}>
                      <strong className="font-mono">{a.codigo}</strong> · {a.mensaje}
                    </li>
                  ))}
                </ul>
              </div>
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
