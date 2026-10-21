"use client";

import * as React from "react";
import { CircleCheck, Plus, Scale, TriangleAlert, Trash2, UserPlus, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SelectNativo,
  formatearFecha,
} from "@rodatech/ui";

import { BuscadorProveedor } from "@/modules/compras/ui/pedir-precio/anadir";

import { datosParaAnalizar, type DatosParaAnalizar } from "../../acciones/analizar-compra";
import {
  MARGENES_RAPIDOS,
  cantidadParaElSiguiente,
  costoUsd,
  margenSobreCosto,
  precioConMargen,
  resumirCompra,
  type ProveedorLinea,
} from "../../dominio/compra-linea";
import type { Accion, LineaConstructor } from "../../dominio/constructor";
import { unidadLegible } from "../../dominio/unidades";

const usd = (n: number) => n.toLocaleString("es-PE", { style: "currency", currency: "USD" });
// Dos decimales en todo margen (Willy, 14/10).
const pct = (n: number) =>
  `${(n * 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const numero = (v: string): number | null => {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

/**
 * «Analizar precio de compra» de una línea (09/10).
 *
 * Willy, en la hoja que le dibujó a Luis: antes de mandar la cotización llama
 * a sus proveedores. El 6308 2RS se lo piden por 10; uno tiene 7, otro 3, y el
 * costo es (PC2 × 7 + PC3 × 3) / 10. Luis: *«entonces mientras lleno, el
 * análisis de margen […] cuánto va a ganar, cuál sería el mejor precio, que no
 * puede poner un precio de venta menor porque está perdiendo»*.
 *
 * Todo en un diálogo y no en tarjetas sueltas: Luis, *«así no tenemos mucho
 * card»*. Arriba a quién se le compra; abajo, con ese costo, a cuánto se vende.
 */
export function AnalizarCompra({
  linea,
  onCerrar,
  despachar,
  otros,
}: {
  linea: LineaConstructor;
  onCerrar: () => void;
  despachar: (a: Accion) => void;
  /** «Este producto está en otras cotizaciones · Ver» (09/10). */
  otros?: React.ReactNode;
}) {
  const [filas, setFilas] = React.useState<ProveedorLinea[]>(linea.proveedores);
  const [precioVenta, setPrecioVenta] = React.useState(String(linea.valorUnitario || ""));
  const [datos, setDatos] = React.useState<DatosParaAnalizar | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [buscando, setBuscando] = React.useState(linea.proveedores.length === 0);

  React.useEffect(() => {
    if (!linea.productoId) return;
    let vivo = true;
    void datosParaAnalizar(linea.productoId).then((r) => {
      if (!vivo) return;
      if (r.ok) setDatos(r.datos);
      else setError(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [linea.productoId]);

  const resumen = resumirCompra(linea.cantidad, filas);
  const venta = numero(precioVenta) ?? 0;
  const margen = margenSobreCosto(venta, resumen.costo);
  const ganancia = resumen.costo === null ? null : venta - resumen.costo;
  const yaEstan = new Set(filas.map((f) => f.proveedorId));

  const anadir = (p: { id: string; nombre: string; precio?: number | null }) =>
    setFilas((fs) =>
      fs.some((f) => f.proveedorId === p.id)
        ? fs
        : [
            ...fs,
            {
              proveedorId: p.id,
              nombre: p.nombre,
              // Lo que falta: con 8 de 10 puestos, el segundo nace con 2.
              cantidad: cantidadParaElSiguiente(linea.cantidad, fs),
              precio: p.precio ?? null,
              moneda: "USD",
              incluyeIgv: false,
              tipoCambio: datos?.tipoCambio ?? null,
              fecha: null,
            },
          ],
    );
  const cambiar = (id: string, cambios: Partial<ProveedorLinea>) =>
    setFilas((fs) =>
      fs.map((f) =>
        f.proveedorId === id
          ? {
              ...f,
              ...cambios,
              // Cambiar el precio es una respuesta nueva: lleva la fecha de hoy.
              fecha: "precio" in cambios || "moneda" in cambios || "incluyeIgv" in cambios ? null : f.fecha,
            }
          : f,
      ),
    );

  // Precios que ya se sabían: el último de cada proveedor que no esté puesto.
  const yaCotizados = React.useMemo(() => {
    const vistos = new Map<string, DatosParaAnalizar["historial"]["cotizado"][number]>();
    for (const c of datos?.historial.cotizado ?? []) {
      if (c.noTiene || c.costoUsd === null || vistos.has(c.proveedorId)) continue;
      vistos.set(c.proveedorId, c);
    }
    return [...vistos.values()];
  }, [datos]);
  const cotizadosLibres = yaCotizados.filter((c) => !yaEstan.has(c.proveedorId));
  // Los que ya salen en «Lo que pagaste las últimas veces» no se repiten aquí.
  const yaPagados = new Set((datos?.historial.comprado ?? []).slice(0, 6).map((c) => c.proveedorId));
  const sugeridos = (datos?.sugeridos ?? []).filter(
    (s) => !yaEstan.has(s.id) && !yaCotizados.some((c) => c.proveedorId === s.id) && !yaPagados.has(s.id),
  );

  const incompleta = filas.find((f) => costoUsd(f) === null);
  /*
    Qué falta para poder usarlo, dicho junto al botón (auditoría, 21/10): el
    botón se dejaba pulsar sin proveedor ni precio y la línea se quedaba sin
    costo sin que nadie lo notara.
  */
  const falta =
    filas.length === 0
      ? "Añade el proveedor al que llamaste."
      : incompleta
        ? incompleta.precio === null
          ? `Falta el precio de ${incompleta.nombre}, o quítalo.`
          : `Falta el tipo de cambio de ${incompleta.nombre}.`
        : !filas.some((f) => f.cantidad > 0)
          ? "Pon cuántas le compras a algún proveedor."
          : !(venta > 0)
            ? "Falta el precio de venta."
            : null;
  const aplicar = () => {
    if (incompleta) {
      setError(
        incompleta.precio === null
          ? `Falta el precio de ${incompleta.nombre}, o quítalo.`
          : `Falta el tipo de cambio de ${incompleta.nombre}.`,
      );
      return;
    }
    despachar({ tipo: "compraAnalizada", key: linea.key, proveedores: filas, valorUnitario: venta });
    onCerrar();
  };

  const ref = datos?.referencias;
  const formula = filas
    .filter((f) => f.cantidad > 0 && costoUsd(f) !== null)
    .map((f) => `${f.cantidad} × ${usd(costoUsd(f) ?? 0)}`);

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent ancho="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Analizar precio de compra</DialogTitle>
          <DialogDescription>
            <strong className="text-[var(--fg)]">{linea.codigo}</strong> · {linea.descripcion} — te piden{" "}
            <strong className="text-[var(--fg)]">
              {linea.cantidad} {unidadLegible(linea.unidad)}
            </strong>
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-5">
          {/* Lo que pasó antes: contra eso se mide todo lo de abajo. */}
          <ul className="flex flex-wrap gap-x-5 gap-y-1 rounded-md bg-[var(--surface-2)] px-3 py-2 text-sm">
            {/* «Lista: —» a secas no decía de qué lista (visto el 21/10):
                para Willy una etiqueta que hay que adivinar es jerga. */}
            <li>
              {linea.precioLista > 0 ? (
                <>
                  Precio de lista: <strong className="tabular">{usd(linea.precioLista)}</strong>
                </>
              ) : (
                <span className="text-[var(--fg-muted)]">Sin precio de lista</span>
              )}
            </li>
            {ref?.ultimaCompra ? (
              <li title={ref.ultimaCompra.proveedor}>
                Lo compraste a <strong className="tabular">{usd(ref.ultimaCompra.costoUsd)}</strong>{" "}
                <span className="text-[var(--fg-muted)]">el {formatearFecha(ref.ultimaCompra.fecha)}</span>
              </li>
            ) : null}
            {ref?.ultimaVenta ? (
              <li title={ref.ultimaVenta.cliente}>
                Lo vendiste a <strong className="tabular">{usd(ref.ultimaVenta.precio)}</strong>{" "}
                <span className="text-[var(--fg-muted)]">el {formatearFecha(ref.ultimaVenta.fecha)}</span>
              </li>
            ) : null}
            {otros ? <li>{otros}</li> : null}
            {datos && !ref?.ultimaCompra && !ref?.ultimaVenta ? (
              <li className="text-[var(--fg-muted)]">Nunca se compró ni se vendió en el sistema.</li>
            ) : null}
          </ul>

          {/* ------------------------------------------------ 1. A quién */}
          <section className="@container flex flex-col gap-3">
            <h3 className="text-base font-semibold">1. ¿A quién se lo compras y a cuánto?</h3>

            {filas.length === 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">
                Añade el proveedor al que llamaste. Si uno no tiene todo, añade otro: la cantidad que falta se pone sola.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {filas.map((f) => {
                  const enUsd = costoUsd(f);
                  return (
                    <li
                      key={f.proveedorId}
                      className="grid grid-cols-2 gap-2 rounded-md border border-[var(--border)] p-3 @2xl:grid-cols-[minmax(0,1fr)_6rem_8rem_8.5rem_auto_auto] @2xl:items-end"
                    >
                      <div className="col-span-2 min-w-0 @2xl:col-span-1">
                        <span className="text-sm text-[var(--fg-muted)]">Proveedor</span>
                        <p className="truncate font-medium" title={f.nombre}>
                          {f.nombre}
                        </p>
                        {f.fecha ? (
                          <span className="text-sm text-[var(--fg-subtle)]">precio del {formatearFecha(f.fecha)}</span>
                        ) : null}
                      </div>
                      <label className="flex flex-col gap-1 text-sm">
                        Cantidad
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          value={f.cantidad}
                          aria-label={`Cantidad a ${f.nombre}`}
                          onChange={(e) => cambiar(f.proveedorId, { cantidad: Math.max(0, Math.round(numero(e.target.value) ?? 0)) })}
                          className="tabular text-right"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        Precio
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={f.precio ?? ""}
                          aria-label={`Precio de ${f.nombre}`}
                          placeholder="0.00"
                          onChange={(e) => cambiar(f.proveedorId, { precio: numero(e.target.value) })}
                          className="tabular text-right"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        Moneda
                        <SelectNativo
                          value={`${f.moneda}${f.incluyeIgv ? "+" : ""}`}
                          aria-label={`Moneda de ${f.nombre}`}
                          onChange={(e) => {
                            const v = e.target.value;
                            cambiar(f.proveedorId, {
                              moneda: v.startsWith("PEN") ? "PEN" : "USD",
                              incluyeIgv: v.endsWith("+"),
                              tipoCambio: v.startsWith("PEN") ? (f.tipoCambio ?? datos?.tipoCambio ?? null) : f.tipoCambio,
                            });
                          }}
                        >
                          <option value="USD">$ sin IGV</option>
                          <option value="USD+">$ con IGV</option>
                          <option value="PEN">S/ sin IGV</option>
                          <option value="PEN+">S/ con IGV</option>
                        </SelectNativo>
                      </label>
                      <div className="flex flex-col gap-1 text-sm">
                        {f.moneda === "PEN" ? (
                          <label className="flex flex-col gap-1">
                            T.C.
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.001"
                              value={f.tipoCambio ?? ""}
                              aria-label={`Tipo de cambio de ${f.nombre}`}
                              onChange={(e) => cambiar(f.proveedorId, { tipoCambio: numero(e.target.value) })}
                              className="w-24 tabular text-right"
                            />
                          </label>
                        ) : (
                          <>
                            <span className="text-[var(--fg-muted)]">En $ sin IGV</span>
                            <span className="h-10 content-center font-semibold tabular">{enUsd === null ? "—" : usd(enUsd)}</span>
                          </>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setFilas((fs) => fs.filter((x) => x.proveedorId !== f.proveedorId))}
                        className="gap-1.5 self-end"
                        aria-label={`Quitar a ${f.nombre}`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Quitar
                      </Button>
                      {f.moneda === "PEN" && enUsd !== null ? (
                        <p className="col-span-2 text-sm text-[var(--fg-muted)] @2xl:col-span-6">
                          Son <strong className="tabular">{usd(enUsd)}</strong> sin IGV.
                        </p>
                      ) : null}
                      {f.cantidad === 0 ? (
                        <p className="col-span-2 text-sm text-[var(--fg-muted)] @2xl:col-span-6">
                          Con cantidad 0 solo se apunta su precio, para la próxima vez.
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* ¿Cuadra? Lo que pidió Luis: que cuadre, o que se vea que se compra de más. */}
            {filas.length > 0 ? (
              resumen.falta > 0 ? (
                <p className="flex items-center gap-2 rounded-md bg-[var(--warn-bg)] px-3 py-2 text-sm font-medium text-[var(--warn)]">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                  Cubres {resumen.compradas} de {linea.cantidad}: faltan {resumen.falta}. Añade otro proveedor o sube la cantidad.
                </p>
              ) : resumen.sobra > 0 ? (
                <p className="flex items-center gap-2 rounded-md bg-[var(--surface-2)] px-3 py-2 text-sm font-medium">
                  <CircleCheck className="size-4 shrink-0 text-[var(--ok)]" aria-hidden="true" />
                  Compras {resumen.compradas}: las {linea.cantidad} del cliente y {resumen.sobra} de más para stock.
                </p>
              ) : (
                <p className="flex items-center gap-2 rounded-md bg-[var(--surface-2)] px-3 py-2 text-sm font-medium">
                  <CircleCheck className="size-4 shrink-0 text-[var(--ok)]" aria-hidden="true" />
                  Cubres las {linea.cantidad}.
                </p>
              )
            ) : null}

            {buscando ? (
              <div className="rounded-md border border-dashed border-[var(--border-strong)] p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">Añadir proveedor</span>
                  {filas.length > 0 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setBuscando(false)} className="gap-1">
                      <X className="size-4" aria-hidden="true" />
                      Cerrar
                    </Button>
                  ) : null}
                </div>
                <BuscadorProveedor
                  yaEstan={yaEstan}
                  enfocar={filas.length > 0}
                  onElegir={(p) => {
                    anadir({ id: p.id, nombre: p.razon_social });
                    setBuscando(false);
                  }}
                />
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => setBuscando(true)} className="gap-1.5 self-start">
                <UserPlus className="size-4" aria-hidden="true" />
                Añadir otro proveedor
              </Button>
            )}

            {/*
              Lo que PAGÓ las últimas veces (14/10). Willy, 13/10: *«quiero
              saber cuánto me costó, por ejemplo, el KR52… los últimos nada
              más, para no hacerlo tan engorroso… los últimos seis»*. Es lo
              comprado de verdad (compras no anuladas), no lo cotizado; con un
              clic entra como proveedor con ese precio.
            */}
            {(datos?.historial.comprado.length ?? 0) > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[var(--fg-muted)]">
                  Lo que pagaste las últimas veces
                </span>
                <ul className="flex flex-col divide-y divide-[var(--border-soft)] rounded-md border border-[var(--border)]">
                  {(datos?.historial.comprado ?? []).slice(0, 6).map((c, i) => (
                    <li key={`${c.numero}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <span className="tabular text-[var(--fg-muted)]">{formatearFecha(c.fecha)}</span>
                      <span className="min-w-0 flex-1 font-medium">{c.proveedor}</span>
                      <span className="tabular text-[var(--fg-muted)]">{c.cantidad} und</span>
                      <strong className="tabular">{usd(c.costoUsd)}</strong>
                      {c.proveedorId && !yaEstan.has(c.proveedorId) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => anadir({ id: c.proveedorId!, nombre: c.proveedor, precio: c.costoUsd })}
                        >
                          <Plus className="size-4" aria-hidden="true" />
                          Usar
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Lo que ya se sabía: con un clic, con su precio. */}
            {cotizadosLibres.length > 0 || sugeridos.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[var(--fg-muted)]">Precios que ya te dieron</span>
                <div className="flex flex-wrap gap-2">
                  {cotizadosLibres
                    .slice(0, 6)
                    .map((c) => (
                      <Button
                        key={c.proveedorId}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-auto gap-1.5 py-1.5 text-left"
                        onClick={() => anadir({ id: c.proveedorId, nombre: c.proveedor, precio: c.costoUsd })}
                      >
                        <Plus className="size-4 shrink-0" aria-hidden="true" />
                        <span>
                          {c.proveedor} · <strong className="tabular">{usd(c.costoUsd ?? 0)}</strong>{" "}
                          <span className="text-[var(--fg-muted)]">
                            {formatearFecha(c.fecha)} · {c.consulta}
                          </span>
                        </span>
                      </Button>
                    ))}
                  {sugeridos.slice(0, 6).map((s) => (
                    <Button
                      key={s.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto gap-1.5 py-1.5 text-left"
                      onClick={() => anadir({ id: s.id, nombre: s.nombre, precio: s.ultimoCostoUsd })}
                    >
                      <Plus className="size-4 shrink-0" aria-hidden="true" />
                      <span>
                        {s.nombre}
                        {s.ultimoCostoUsd ? (
                          <>
                            {" "}
                            · <strong className="tabular">{usd(s.ultimoCostoUsd)}</strong>{" "}
                            <span className="text-[var(--fg-muted)]">
                              comprado{s.ultimaCompra ? ` el ${formatearFecha(s.ultimaCompra)}` : ""}
                            </span>
                          </>
                        ) : null}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {/* ------------------------------------------------ 2. El costo */}
          <section className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md border-2 border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-800 dark:bg-brand-950">
            <Scale className="size-6 text-brand-600" aria-hidden="true" />
            <div>
              <span className="text-sm text-[var(--fg-muted)]">Tu costo por unidad</span>
              <p className="text-2xl font-bold tabular">{resumen.costo === null ? "—" : usd(resumen.costo)}</p>
            </div>
            {formula.length > 1 ? (
              <p className="text-sm text-[var(--fg-muted)]">
                ({formula.join(" + ")}) / {resumen.compradas}
              </p>
            ) : null}
            {resumen.costo === null ? (
              <p className="text-sm text-[var(--fg-muted)]">Pon al menos un proveedor con cantidad y precio.</p>
            ) : null}
          </section>

          {/* ------------------------------------------------ 3. La venta */}
          <section className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">2. ¿A cuánto lo vendes?</h3>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Precio de venta (c/u, sin IGV)
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={precioVenta}
                  onChange={(e) => setPrecioVenta(e.target.value)}
                  className="w-40 text-lg font-semibold tabular text-right"
                />
              </label>
              {/*
                El precio de LISTA, siempre a la vista (14/10). Willy, 13/10:
                *«tiene que aparecer un precio fijo… siempre como precio de
                lista; uno ve si le puede subir o bajar»*. Lo que se ponga aquí
                vale solo para esta cotización: el de lista no se toca.
              */}
              {linea.precioLista > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPrecioVenta(String(linea.precioLista))}
                  aria-label={`Usar el precio de lista, ${usd(linea.precioLista)}`}
                >
                  Precio de lista: {usd(linea.precioLista)}
                </Button>
              ) : null}
              {resumen.costo !== null ? (
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {MARGENES_RAPIDOS.map((m) => (
                    <Button
                      key={m}
                      type="button"
                      variant="outline"
                      onClick={() => setPrecioVenta(String(precioConMargen(resumen.costo ?? 0, m)))}
                    >
                      +{m * 100} % → {usd(precioConMargen(resumen.costo ?? 0, m))}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>

            {resumen.costo !== null && ganancia !== null && margen !== null ? (
              ganancia < 0 ? (
                <p className="flex items-center gap-2 rounded-md bg-[var(--danger-bg)] px-3 py-2 font-semibold text-[var(--danger)]">
                  <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
                  Pierdes {usd(-ganancia)} por unidad. No lo vendas por debajo de {usd(resumen.costo)}.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Cifra etiqueta="Ganas por unidad" valor={usd(ganancia)} />
                  <Cifra etiqueta={`Ganas en las ${linea.cantidad}`} valor={usd(ganancia * linea.cantidad)} />
                  <Cifra etiqueta="Margen sobre el costo" valor={pct(margen)} />
                </div>
              )
            ) : null}

            <ul className="flex flex-col gap-0.5 text-sm text-[var(--fg-muted)]">
              {resumen.costo !== null ? <li>Por debajo de {usd(resumen.costo)} pierdes dinero.</li> : null}
              {linea.precioMinimo > 0 ? (
                <li className={venta < linea.precioMinimo ? "font-semibold text-[var(--danger)]" : undefined}>
                  Tu precio mínimo de venta es {usd(linea.precioMinimo)}.
                </li>
              ) : null}
              {ref?.ultimaVenta && resumen.costo !== null ? (
                <li>
                  La última vez lo vendiste a {usd(ref.ultimaVenta.precio)}: con este costo ganarías{" "}
                  {pct(margenSobreCosto(ref.ultimaVenta.precio, resumen.costo) ?? 0)}.
                </li>
              ) : null}
            </ul>
          </section>

          {error ? <p className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          {falta ? (
            <p className="mr-auto self-center text-sm font-medium text-[var(--fg-muted)]">{falta}</p>
          ) : null}
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={aplicar} disabled={falta !== null}>
            Usar este costo y precio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] px-3 py-2">
      <span className="text-sm text-[var(--fg-muted)]">{etiqueta}</span>
      <p className="text-xl font-bold tabular text-[var(--ok)]">{valor}</p>
    </div>
  );
}
