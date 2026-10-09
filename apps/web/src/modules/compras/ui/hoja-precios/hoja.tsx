"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@rodatech/ui";
import { CircleCheck, Plus, Save, Trash2, TriangleAlert, X } from "lucide-react";

import { datosDeProveedor, guardarHojaPrecios, referenciasParaHoja } from "../../acciones/hoja-precios";
import type { AnalisisParaHoja } from "../../api/hoja-precios";
import {
  aPayload,
  analizar,
  bloqueosAlGuardar,
  CASILLA_VACIA,
  clave,
  comprasDeLaHoja,
  reducir,
  type Hoja,
  type ProductoHoja,
} from "../../dominio/hoja-precios";
import { unidadLegible } from "@/modules/cotizaciones/dominio/unidades";

import { BuscadorCompra } from "../constructor/buscador";
import { CasillaPrecio } from "./casilla";
import { DialogoAnalisis, DialogoComprar, DialogoProveedor } from "./dialogos";

const usd = (n: number) =>
  `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);
const tonoMargen = (m: number | null) =>
  m === null ? "" : m < 0 ? "text-[var(--danger)]" : m < 0.15 ? "text-[var(--warn)]" : "text-[var(--ok)]";

/**
 * La hoja de precios (07/10).
 *
 * Luis: *«tiene que ser sencillo, fácil de usar; recuerda que voy a pedir
 * precio, no voy a comprar nada todavía»*. Así que es UNA pantalla, como su
 * Excel: los productos en filas, los proveedores en columnas, y en cada
 * casilla el precio que le dijeron o «No tiene». Mientras se llena, a la
 * derecha de cada fila y abajo, el análisis: quién da mejor precio, cuánto se
 * gana, y cuánto sale repartido contra comprarle todo a uno.
 *
 * Nada se compra aquí. Se GUARDA (110) y, el día que se decide, «Pasar a
 * compras» saca una compra por proveedor.
 */
export interface Sugerido {
  proveedorId: string;
  nombre: string;
  /** Cuántos de los productos de la hoja le constan como que vende. */
  coincidencias: number;
}

export function HojaPrecios({
  inicial,
  sugeridos = [],
  soloLectura = false,
}: {
  inicial: Hoja;
  /** Los que ya vendieron estos productos: se añaden con un clic. */
  sugeridos?: Sugerido[];
  soloLectura?: boolean;
}) {
  const router = useRouter();
  const [hoja, despachar] = React.useReducer(reducir, inicial);
  const [guardada, setGuardada] = React.useState(() => JSON.stringify(aPayload(inicial)));
  const [error, setError] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  const analisis = React.useMemo(() => analizar(hoja), [hoja]);
  const compras = React.useMemo(() => comprasDeLaHoja(hoja, analisis), [hoja, analisis]);
  const bloqueos = bloqueosAlGuardar(hoja);
  const sucia = JSON.stringify(aPayload(hoja)) !== guardada;

  // Al salir con cambios sin guardar, el navegador pregunta.
  React.useEffect(() => {
    if (!sucia) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucia]);

  /** Guarda y devuelve el id de la consulta, o null si no se pudo. */
  async function guardar(): Promise<string | null> {
    setError(null);
    if (bloqueos.length > 0) {
      setError(bloqueos[0]!);
      return null;
    }
    const payload = aPayload(hoja);
    const r = await guardarHojaPrecios(payload);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    setGuardada(JSON.stringify({ ...payload, consulta_id: r.id }));
    if (!hoja.consultaId) {
      despachar({ tipo: "reemplazar", hoja: { ...hoja, consultaId: r.id, numero: r.numero } });
      router.replace(`/compras/precios/${r.id}`);
    } else {
      router.refresh();
    }
    return r.id;
  }

  /** Productos nuevos: entran ya, y su precio de venta llega después. */
  function anadirProductos(productos: ProductoHoja[]) {
    despachar({ tipo: "productos", productos });
    const sinReferencia = productos.filter((p) => p.precioVenta === null && p.ultimoCosto === null).map((p) => p.productoId);
    if (sinReferencia.length === 0) return;
    void referenciasParaHoja(sinReferencia).then((r) => {
      if (r.ok) despachar({ tipo: "referencias", datos: r.datos });
    });
  }

  function traer(a: AnalisisParaHoja, conProveedor: boolean) {
    despachar({
      tipo: "importar",
      productos: a.productos,
      proveedor: conProveedor ? a.proveedor : null,
      precios: conProveedor ? a.precios : {},
    });
    setAviso(
      `Entraron ${a.productos.length} ${a.productos.length === 1 ? "producto" : "productos"} de ${a.numero}${
        conProveedor && a.proveedor ? `, con los precios de ${a.proveedor.nombre}` : ""
      }.`,
    );
  }

  const yaEstan = React.useMemo(() => new Set(hoja.proveedores.map((p) => p.proveedorId)), [hoja.proveedores]);
  const sugeridosVisibles = sugeridos.filter((s) => !yaEstan.has(s.proveedorId));

  function anadirSugerido(s: Sugerido) {
    void datosDeProveedor(s.proveedorId).then((r) => {
      if (r.ok) despachar({ tipo: "proveedor", proveedor: { ...r.datos, moneda: "USD", tipoCambio: null, incluyeIgv: false } });
      else setError(r.error);
    });
  }
  const nombreDe = (id: string) => hoja.proveedores.find((p) => p.proveedorId === id)?.nombre ?? "—";

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------------------------------ Barra de acciones */}
      <div className="sticky top-16 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-sm">
        <p className="flex items-center gap-2 text-base">
          {sucia ? (
            <>
              <span className="size-2.5 rounded-full bg-[var(--warn)]" aria-hidden="true" />
              <span className="font-medium">Hay cambios sin guardar</span>
            </>
          ) : hoja.consultaId ? (
            <>
              <CircleCheck className="size-5 text-[var(--ok)]" aria-hidden="true" />
              <span className="font-medium">Guardado</span>
            </>
          ) : (
            <span className="text-[var(--fg-muted)]">Añade productos y proveedores, y apunta lo que te digan.</span>
          )}
        </p>
        {soloLectura ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={sucia ? "primary" : "outline"}
              disabled={guardando || (!sucia && Boolean(hoja.consultaId)) || hoja.productos.length === 0}
              onClick={() => empezar(async () => void (await guardar()))}
              className="gap-1.5"
            >
              <Save className="size-4" aria-hidden="true" />
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
            <DialogoComprar
              consultaId={hoja.consultaId}
              compras={compras}
              deshabilitado={compras.length === 0 || guardando}
              antes={async () => (sucia || !hoja.consultaId ? guardar() : hoja.consultaId)}
              onHecho={() => router.refresh()}
            />
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="flex gap-2 rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-base">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {aviso ? (
        <p className="flex items-center justify-between gap-2 rounded-md border border-[var(--ok)] bg-[var(--ok-bg)] p-3 text-base">
          {aviso}
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="rounded p-1 hover:bg-[var(--surface-2)]">
            <X className="size-4" aria-hidden="true" />
          </button>
        </p>
      ) : null}

      {/* ---------------------------------------------- Qué y a quién */}
      {soloLectura ? null : (
        <section className="card flex flex-col gap-3 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium">Añadir producto</span>
              <BuscadorCompra
                ultimosCostos={{}}
                onElegir={(p) =>
                  anadirProductos([
                    {
                      productoId: p.id,
                      codigo: p.codigo,
                      descripcion: p.descripcion,
                      marca: p.marca,
                      unidad: unidadLegible(p.unidad ?? "NIU"),
                      cantidad: 1,
                      precioVenta: (p as { precio_venta?: number }).precio_venta || null,
                      ultimoCosto: p.ultimo_costo || p.costo_promedio || null,
                    },
                  ])
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <DialogoAnalisis onTraer={traer} />
              <DialogoProveedor yaEstan={yaEstan} onAnadir={(p) => despachar({ tipo: "proveedor", proveedor: p })} />
            </div>
          </div>
          {/* A quién preguntar, sin buscarlo: los que ya vendieron esto. */}
          {sugeridosVisibles.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-soft)] pt-3">
              <span className="text-sm text-[var(--fg-muted)]">Ya te vendieron esto:</span>
              {sugeridosVisibles.slice(0, 8).map((s) => (
                <button
                  key={s.proveedorId}
                  type="button"
                  onClick={() => anadirSugerido(s)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {s.nombre}
                  {s.coincidencias > 1 ? <span className="text-[var(--fg-subtle)]">· {s.coincidencias}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      )}

      {/* ---------------------------------------------------- La hoja */}
      {hoja.productos.length === 0 ? (
        <section className="card flex flex-col items-center gap-2 p-8 text-center">
          <p className="text-lg font-semibold">Todavía no hay productos</p>
          <p className="max-w-lg text-base text-[var(--fg-muted)]">
            Búscalos arriba por código o marca, o tráelos de un análisis de importación. Después añade los proveedores a
            los que vas a llamar.
          </p>
        </section>
      ) : (
        <section className="card overflow-hidden">
          <div className="scroll-x">
            <table className="w-full border-separate border-spacing-0 text-base">
              <thead>
                <tr className="bg-[var(--surface-2)] text-left text-sm text-[var(--fg-muted)]">
                  <th className="lg:sticky lg:left-0 lg:z-10 min-w-[12.5rem] border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-semibold">
                    Producto
                  </th>
                  <th className="w-24 border-b border-[var(--border)] px-2 py-2 font-semibold">Cantidad</th>
                  {hoja.proveedores.map((pv) => (
                    <th key={pv.proveedorId} className="min-w-[10.5rem] border-b border-l border-[var(--border)] px-2 py-2 align-top">
                      <CabeceraProveedor
                        proveedor={pv}
                        soloLectura={soloLectura}
                        onMoneda={(moneda, tipoCambio) => despachar({ tipo: "moneda", proveedorId: pv.proveedorId, moneda, tipoCambio })}
                        onIgv={(v) => despachar({ tipo: "igv", proveedorId: pv.proveedorId, incluyeIgv: v })}
                        onQuitar={() => despachar({ tipo: "quitarProveedor", proveedorId: pv.proveedorId })}
                      />
                    </th>
                  ))}
                  <th className="lg:sticky lg:right-0 lg:z-10 min-w-[10rem] border-b border-l-2 border-[var(--border-strong)] bg-[var(--surface-3)] px-3 py-2 font-semibold text-[var(--fg)]">
                    A quién comprar
                  </th>
                </tr>
              </thead>
              <tbody>
                {hoja.productos.map((p) => {
                  const fila = analisis.filas[p.productoId]!;
                  return (
                    <tr key={p.productoId} className="align-top">
                      <td className="lg:sticky lg:left-0 lg:z-10 border-b border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-base font-semibold">{p.codigo}</p>
                            <p className="line-clamp-2 text-sm text-[var(--fg-muted)]" title={p.descripcion}>
                              {p.marca ? `${p.marca} · ` : ""}
                              {p.descripcion}
                            </p>
                            <p className="text-sm">
                              {p.precioVenta ? (
                                <>
                                  vendes a <strong className="tabular">{usd(p.precioVenta)}</strong>
                                </>
                              ) : (
                                <span className="text-[var(--fg-subtle)]">sin precio de venta</span>
                              )}
                              {p.ultimoCosto ? (
                                <span className="text-[var(--fg-subtle)]"> · antes costó {usd(p.ultimoCosto)}</span>
                              ) : null}
                            </p>
                          </div>
                          {soloLectura ? null : (
                            <button
                              type="button"
                              onClick={() => despachar({ tipo: "quitarProducto", productoId: p.productoId })}
                              aria-label={`Quitar ${p.codigo} de la hoja`}
                              title="Quitar de la hoja"
                              className="shrink-0 rounded-md border border-[var(--border)] p-1.5 text-[var(--fg-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="border-b border-[var(--border-soft)] px-2 py-2.5">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={p.cantidad}
                          disabled={soloLectura}
                          aria-label={`Cantidad de ${p.codigo}`}
                          onChange={(e) => despachar({ tipo: "cantidad", productoId: p.productoId, cantidad: Number(e.target.value) })}
                          className="w-20 text-right tabular"
                        />
                        <span className="mt-1 block text-sm text-[var(--fg-subtle)]">{p.unidad}</span>
                      </td>
                      {hoja.proveedores.map((pv) => {
                        const c = hoja.casillas[clave(pv.proveedorId, p.productoId)] ?? CASILLA_VACIA;
                        const oferta = fila.ofertas.find((o) => o.proveedorId === pv.proveedorId);
                        return (
                          <td key={pv.proveedorId} className="border-b border-l border-[var(--border-soft)] p-1.5">
                            <CasillaPrecio
                              casilla={c}
                              simbolo={pv.moneda === "PEN" ? "S/" : "$"}
                              codigo={p.codigo}
                              proveedor={pv.nombre}
                              mejor={fila.masBarato?.proveedorId === pv.proveedorId}
                              elegido={fila.elegido?.proveedorId === pv.proveedorId}
                              hayVarios={fila.ofertas.length > 1}
                              margen={oferta ? (p.precioVenta ? (p.precioVenta - oferta.usd) / oferta.usd : null) : null}
                              soloLectura={soloLectura}
                              onPrecio={(precio) => despachar({ tipo: "precio", proveedorId: pv.proveedorId, productoId: p.productoId, precio })}
                              onNoTiene={(noTiene) => despachar({ tipo: "noTiene", proveedorId: pv.proveedorId, productoId: p.productoId, noTiene })}
                              onElegir={() => despachar({ tipo: "elegir", productoId: p.productoId, proveedorId: pv.proveedorId })}
                            />
                          </td>
                        );
                      })}
                      <td className="lg:sticky lg:right-0 lg:z-10 max-w-[12rem] border-b border-l-2 border-[var(--border-soft)] border-l-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2.5">
                        {fila.elegido ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="truncate font-semibold" title={nombreDe(fila.elegido.proveedorId)}>
                              {nombreDe(fila.elegido.proveedorId)}
                            </span>
                            <span className="text-sm tabular">
                              {Math.min(fila.elegido.puede, p.cantidad)} × {usd(fila.elegido.usd)} = <strong>{usd(fila.total)}</strong>
                            </span>
                            <span className={`text-sm font-semibold ${tonoMargen(fila.margen)}`}>
                              {fila.margen === null ? "sin precio de venta" : `ganas ${pct(fila.margen)}`}
                            </span>
                            {fila.faltan > 0 ? (
                              <span className="text-sm text-[var(--warn)]">le faltan {fila.faltan}: completa con otro</span>
                            ) : null}
                            {fila.masCaroQueAntes ? (
                              <span className="text-sm text-[var(--warn)]">más caro que la última vez</span>
                            ) : null}
                            {fila.elegidoAMano && !soloLectura ? (
                              <button
                                type="button"
                                onClick={() => despachar({ tipo: "elegir", productoId: p.productoId, proveedorId: null })}
                                className="mt-1 self-start rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-sm font-medium hover:bg-[var(--surface-3)]"
                              >
                                Volver al más barato
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-sm text-[var(--fg-muted)]">
                            {hoja.proveedores.length === 0
                              ? "Añade proveedores"
                              : fila.noTienen === hoja.proveedores.length
                                ? "Nadie lo tiene"
                                : "Falta el precio"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {hoja.proveedores.length > 0 ? (
                <tfoot>
                  <tr className="bg-[var(--surface-2)] text-sm">
                    <td className="lg:sticky lg:left-0 lg:z-10 bg-[var(--surface-2)] px-3 py-2.5 font-semibold" colSpan={2}>
                      Por proveedor
                    </td>
                    {hoja.proveedores.map((pv) => {
                      const col = analisis.columnas[pv.proveedorId]!;
                      return (
                        <td key={pv.proveedorId} className="border-l border-[var(--border)] px-2 py-2.5 align-top">
                          <p>
                            Tiene <strong>{col.conPrecio}</strong> de {hoja.productos.length}
                            {col.noTiene > 0 ? ` · no tiene ${col.noTiene}` : ""}
                          </p>
                          {col.conPrecio > 0 ? <p className="tabular">Todo con él: {usd(col.totalLoQueTiene)}</p> : null}
                          {col.productosElegidos > 0 ? (
                            <p className="font-semibold text-[var(--ok)]">
                              Le compras {col.productosElegidos}: {usd(col.totalElegido)}
                            </p>
                          ) : null}
                          {col.faltaTipoCambio ? <p className="text-[var(--danger)]">Falta el tipo de cambio</p> : null}
                        </td>
                      );
                    })}
                    <td className="lg:sticky lg:right-0 lg:z-10 border-l-2 border-[var(--border-strong)] bg-[var(--surface-3)] px-3 py-2.5 align-top">
                      <p className="font-semibold tabular">Total {usd(analisis.total)}</p>
                      <p className={`font-semibold ${tonoMargen(analisis.margen)}`}>ganas {pct(analisis.margen)}</p>
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>
      )}

      {/* ----------------------------------------------- Lo que conviene */}
      {hoja.productos.length > 0 && hoja.proveedores.length > 0 ? (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">Lo que conviene</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Cifra
              etiqueta="Con precio"
              valor={`${analisis.conPrecio} de ${hoja.productos.length}`}
              detalle={analisis.sinPrecio > 0 ? `faltan ${analisis.sinPrecio} por preguntar` : "todos tienen precio"}
              tono={analisis.sinPrecio > 0 ? "aviso" : "ok"}
            />
            <Cifra
              etiqueta="Comprando lo mejor"
              valor={usd(analisis.total)}
              detalle={`a ${analisis.proveedoresElegidos} ${analisis.proveedoresElegidos === 1 ? "proveedor" : "proveedores"}, sin IGV`}
            />
            <Cifra
              etiqueta="Ganas"
              valor={pct(analisis.margen)}
              detalle={analisis.venta > 0 ? `vendiendo a ${usd(analisis.venta)}` : "falta el precio de venta"}
              tono={analisis.margen === null ? undefined : analisis.margen < 0.15 ? "aviso" : "ok"}
            />
            <Cifra
              etiqueta="Repartir ahorra"
              valor={analisis.todoAUno ? usd(analisis.ahorro) : "—"}
              detalle={
                analisis.todoAUno
                  ? `contra todo a ${nombreDe(analisis.todoAUno.proveedorId)} (${usd(analisis.todoAUno.total)})`
                  : "ningún proveedor tiene todo"
              }
              tono={analisis.ahorro > 0 ? "ok" : undefined}
            />
          </div>
          {compras.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-[var(--fg-muted)]">Si compras hoy, salen:</p>
              <ul className="flex flex-wrap gap-2">
                {compras.map((c) => (
                  <li key={c.proveedorId} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
                    <span className="font-semibold">{c.proveedor}</span> · {c.lineas.length}{" "}
                    {c.lineas.length === 1 ? "producto" : "productos"} ·{" "}
                    <span className="tabular">
                      {c.moneda === "PEN" ? "S/" : "$"}
                      {" "}
                      {c.subtotal.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {soloLectura ? null : (
        <label className="card flex flex-col gap-1 p-4">
          <span className="text-sm font-medium">Nota (para qué es, a quién se le prometió…)</span>
          <Input value={hoja.nota} onChange={(e) => despachar({ tipo: "nota", nota: e.target.value })} maxLength={500} />
        </label>
      )}
    </div>
  );
}

function Cifra({
  etiqueta,
  valor,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: string;
  detalle: string;
  tono?: "ok" | "aviso";
}) {
  const color = tono === "ok" ? "text-[var(--ok)]" : tono === "aviso" ? "text-[var(--warn)]" : "";
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
      <span className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">{etiqueta}</span>
      <span className={`text-2xl font-semibold tabular ${color}`}>{valor}</span>
      <span className="text-sm text-[var(--fg-muted)]">{detalle}</span>
    </div>
  );
}

function CabeceraProveedor({
  proveedor,
  soloLectura,
  onMoneda,
  onIgv,
  onQuitar,
}: {
  proveedor: import("../../dominio/hoja-precios").ProveedorHoja;
  soloLectura: boolean;
  onMoneda: (moneda: "USD" | "PEN", tipoCambio: number | null) => void;
  onIgv: (v: boolean) => void;
  onQuitar: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-[var(--fg)]">
      <div className="flex items-start justify-between gap-1">
        <span className="line-clamp-2 text-sm font-semibold leading-snug" title={proveedor.nombre}>
          {proveedor.nombre}
        </span>
        {soloLectura ? null : (
          <button
            type="button"
            onClick={onQuitar}
            aria-label={`Quitar a ${proveedor.nombre} de la hoja`}
            title="Quitar de la hoja"
            className="shrink-0 rounded-md border border-[var(--border)] p-1 text-[var(--fg-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {soloLectura ? (
        <span className="text-sm font-normal text-[var(--fg-muted)]">
          {proveedor.moneda === "PEN" ? `Soles · TC ${proveedor.tipoCambio ?? "—"}` : "Dólares"}
          {proveedor.incluyeIgv ? " · con IGV" : ""}
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 font-normal">
          <select
            value={proveedor.moneda}
            aria-label={`Moneda de ${proveedor.nombre}`}
            onChange={(e) => onMoneda(e.target.value === "PEN" ? "PEN" : "USD", proveedor.tipoCambio)}
            className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 text-sm"
          >
            <option value="USD">Dólares</option>
            <option value="PEN">Soles</option>
          </select>
          {proveedor.moneda === "PEN" ? (
            <input
              type="number"
              step="0.001"
              min={0}
              placeholder="T.C."
              aria-label={`Tipo de cambio de ${proveedor.nombre}`}
              value={proveedor.tipoCambio ?? ""}
              onChange={(e) => onMoneda("PEN", Number(e.target.value) || null)}
              className="h-8 w-20 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 text-right text-sm tabular"
            />
          ) : null}
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" className="size-4" checked={proveedor.incluyeIgv} onChange={(e) => onIgv(e.target.checked)} />
            con IGV
          </label>
        </div>
      )}
    </div>
  );
}
