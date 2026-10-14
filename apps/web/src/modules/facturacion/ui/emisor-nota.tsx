"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Moneda,
  SelectNativo,
  Textarea,
  buttonVariants,
  cn,
} from "@rodatech/ui";

import { emitirNota, type ResultadoNota } from "../acciones/nota";
import {
  avisosNota,
  bloqueosNota,
  esCorreccionSinImporte,
  esMotivoPorItem,
  esMotivoTotal,
  lineasPorItem,
  totalDeLineas,
  totalDeNota,
  MOTIVOS_CREDITO,
  type EleccionItem,
  type TipoNota,
} from "../dominio/nota";
import type { ComprobanteDetalle } from "../dominio/tipos";
import type { SeriesDeNota } from "../api/consultas";
import { sinEnvioConEnter } from "@/lib/formularios";
import { useBorrador } from "@/componentes/borrador";

/**
 * Emitir una nota de crédito o de débito sobre un comprobante.
 *
 * Es la única forma de corregir una factura emitida: no se edita, se corrige
 * con otro documento que tiene su propio correlativo.
 *
 * Tres cosas que la pantalla decide sola porque no son del operador:
 *
 *  · **La serie.** La predeterminada de su tipo en «SUNAT y numeración»
 *    (14/10); antes era «FC01» fijo, la de prueba.
 *  · **El importe con los motivos totales.** «Anulación» va por el total
 *    pendiente, no por una parte.
 *  · **Qué líneas lleva.** Con motivo total espeja el documento; con uno
 *    parcial va una sola línea con el concepto, porque repartir una rebaja
 *    entre las líneas originales lo decide quien negocia, no el sistema.
 */
export function EmisorNota({
  documento,
  motivos,
  hoy,
  yaAcreditado,
  series,
}: {
  documento: ComprobanteDetalle;
  /** La serie predeterminada de cada tipo de nota, y si es de prueba. */
  series: SeriesDeNota;
  /** El catálogo, ya filtrado por tipo. */
  motivos: { codigo: string; descripcion: string; tipo: string }[];
  hoy: string;
  /** Lo que otras notas de crédito ya acreditaron sobre este documento. */
  yaAcreditado: number;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);

  const [tipo, setTipo] = React.useState<TipoNota>("nota_credito");
  const [motivo, setMotivo] = React.useState("");
  const [fecha, setFecha] = React.useState(hoy);
  const [monto, setMonto] = React.useState(0);
  const [concepto, setConcepto] = React.useState("");
  const [observaciones, setObservaciones] = React.useState("");
  /*
    Por producto (05 y 07): lo que se teclea en cada línea, tal cual —unidades
    en la devolución, importe con IGV en la moneda de la factura en el
    descuento—. Luis, 15/10: como la nota de su sistema, que lista los
    productos de la factura.
  */
  const [porLinea, setPorLinea] = React.useState<Record<number, string>>({});

  const [resultado, emitir, emitiendo] = useActionState<
    ResultadoNota | null,
    FormData
  >(async (previo, formData) => {
    const r = await emitirNota(previo, formData);
    if (r.ok) {
      // Ya está emitida: el borrador sobra.
      olvidarBorrador();
      setAbierto(false);
      router.push(`/facturacion/${r.id}`);
    }
    return r;
  }, null);

  const disponible = Math.round((documento.total - yaAcreditado) * 100) / 100;
  /*
    Una factura en soles (116): la nota va por dentro en dólares, como todo,
    y la base la pasa a soles con el cambio de su factura. Aquí se ENSEÑA y se
    teclea en soles.
  */
  const tcDoc = documento.moneda === "PEN" && documento.tipo_cambio ? documento.tipo_cambio : null;
  const ver = (usd: number) => (tcDoc ? Math.round(usd * tcDoc * 100) / 100 : usd);
  const monedaDoc = tcDoc ? "PEN" : "USD";
  const [enSoles, setEnSoles] = React.useState("");
  const delTipo = motivos.filter((m) => m.tipo === tipo);
  const total = esMotivoTotal(motivo);
  const importeFijo = total || esCorreccionSinImporte(motivo);
  const porItem = esMotivoPorItem(motivo);
  const esDevolucion = motivo === MOTIVOS_CREDITO.DEVOLUCION_ITEM;
  const elegidos: EleccionItem[] = Object.entries(porLinea).map(([i, v]) => {
    const n = Number(v) || 0;
    return esDevolucion
      ? { indice: Number(i), cantidad: n, monto: 0 }
      : // El descuento se teclea en la moneda de la factura; por dentro, dólares.
        { indice: Number(i), cantidad: 0, monto: tcDoc ? Math.round((n / tcDoc) * 10000) / 10000 : n };
  });
  const lineasElegidas = porItem ? lineasPorItem(documento, motivo, elegidos) : [];
  // Lo que vale la nota: por producto sale de las líneas, si no, del importe.
  const importe = porItem ? totalDeLineas(lineasElegidas) : monto;
  // En soles, como lo cuenta la base (116): cada unitario a soles y redondeado,
  // y el IGV sobre esa suma. Pasar el total en dólares desviaba céntimos.
  const importeVisto =
    porItem && tcDoc
      ? totalDeLineas(lineasElegidas.map((l) => ({ ...l, valor_unitario: Math.round(l.valor_unitario * tcDoc * 100) / 100 })))
      : ver(importe);

  // Con un motivo total el importe no se elige: es el pendiente de acreditar.
  React.useEffect(() => {
    if (total || esCorreccionSinImporte(motivo)) setMonto(disponible);
  }, [motivo, total, disponible]);

  /*
    Lo que se está llenando, guardado solo en el navegador (13/10). Luis:
    *«cuando esté creando un usuario o rellenando algo, que me salga seguir o
    comenzar desde cero»*. Uno por comprobante.

    La FECHA no entra: es fiscal, y el diálogo la pone en hoy cada vez que se
    abre. Traerla de un borrador viejo sería colarla sin que nadie la mire.
  */
  const { aviso: avisoBorrador, olvidar: olvidarBorrador } = useBorrador({
    formulario: "nota",
    id: documento.id,
    datos: { tipo, motivo, monto, concepto, observaciones },
    valeLaPena: (d) => Boolean(d.motivo || d.concepto.trim() || d.observaciones.trim()),
    recuperar: (d) => {
      setTipo(d.tipo);
      setMotivo(d.motivo);
      setMonto(d.monto);
      setConcepto(d.concepto);
      setObservaciones(d.observaciones);
    },
  });

  const bloqueos = bloqueosNota(
    documento,
    tipo,
    motivo,
    importe,
    fecha,
    yaAcreditado,
  );
  const avisos = avisosNota(documento, tipo, motivo, importe);
  const serieNota = series[tipo];
  const serie = serieNota?.serie ?? "—";
  const totalReal = totalDeNota(monto);

  const payload = JSON.stringify({
    referencia_id: documento.id,
    tipo,
    motivo_codigo: motivo,
    fecha_emision: fecha,
    monto: importe,
    items: porItem ? elegidos : [],
    concepto: concepto.trim(),
    observaciones: observaciones.trim() || null,
  });

  if (documento.tipo !== "factura" && documento.tipo !== "boleta") return null;
  if (documento.estado === "anulado") return null;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (v) setFecha(hoy);
      }}
    >
      {/* El mismo botón que «Imprimir» a su lado (revisión por módulos del
          02/10): eran dos bordes y dos radios distintos en la misma fila. */}
      <DialogTrigger className={cn(buttonVariants({ variant: "outline" }), "px-3")}>
        Emitir nota
      </DialogTrigger>

      <DialogContent className={porItem ? "max-w-2xl" : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle>Nota sobre {documento.numero}</DialogTitle>
          <DialogDescription>
            {documento.cliente} · total <Dolares moneda={monedaDoc} valor={documento.pen?.total ?? ver(documento.total)} />
            {yaAcreditado > 0 ? (
              <>
                {" "}· ya acreditados <Dolares moneda={monedaDoc} valor={ver(yaAcreditado)} />, quedan{" "}
                <Dolares moneda={monedaDoc} valor={ver(disponible)} />
              </>
            ) : null}
            {/* El cambio, a la vista (su nota lo muestra, 15/10). Es el de la
                factura: con otro, la nota no cuadraría con ella. */}
            {tcDoc ? <> · en soles al cambio de la factura, S/ {tcDoc.toFixed(3)}</> : null}
          </DialogDescription>
        </DialogHeader>

        {/* El pie va dentro del formulario: su botón es el que emite. */}
        <form action={emitir} onKeyDown={sinEnvioConEnter}>
          <DialogBody className="flex flex-col gap-3">
            <input type="hidden" name="nota" value={payload} />

            {avisoBorrador}

            {/* Uno debajo de otro en el teléfono: a 390 px el desplegable se
                cortaba en «Nota de crédito» y no se leía qué hace cada una
                (revisión por módulos del 02/10). */}
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Tipo</span>
                <SelectNativo
                  value={tipo}
                  onChange={(e) => {
                    setTipo(e.target.value as TipoNota);
                    // El motivo pertenece a un catálogo distinto por tipo: al
                    // cambiar, el anterior deja de existir.
                    setMotivo("");
                  }}
                >
                  <option value="nota_credito">Nota de crédito — reduce</option>
                  <option value="nota_debito">Nota de débito — aumenta</option>
                </SelectNativo>
                <span className="text-sm text-[var(--fg-muted)]">
                  Se emitirá con la serie{" "}
                  <strong className="font-mono font-semibold text-[var(--fg)]">{serie}</strong>
                  {serieNota?.prueba ? " (de prueba)" : ""}
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Fecha</span>
                <Input
                  type="date"
                  min={documento.fecha_emision}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Motivo <span className="text-[var(--danger)]">*</span>
              </span>
              <SelectNativo
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  // Al elegir un motivo PARCIAL, el importe se vacía (auditoría
                  // 14/10): se quedaba el total entero precargado, y en soles la
                  // casilla salía vacía con el total detrás. Aquí y no en el
                  // efecto: recuperar un borrador no debe borrar su importe.
                  if (!esMotivoTotal(e.target.value) && !esCorreccionSinImporte(e.target.value)) {
                    setMonto(0);
                    setEnSoles("");
                  }
                  setPorLinea({});
                }}
              >
                <option value="">Elige el motivo…</option>
                {delTipo.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.codigo} · {m.descripcion}
                  </option>
                ))}
              </SelectNativo>
            </label>

            {porItem ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {esDevolucion ? "¿Qué productos vuelven y cuántos?" : "¿A qué productos se les descuenta y cuánto (con IGV)?"}
                </p>
                <ul className="flex max-h-[40vh] flex-col divide-y divide-[var(--border-soft)] overflow-y-auto rounded-sm border border-[var(--border)]">
                  {documento.lineas.map((l, i) => (
                    <li key={l.id} className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{l.codigo}</p>
                        <p className="line-clamp-2 text-sm text-[var(--fg-muted)]">{l.descripcion}</p>
                        <p className="text-sm text-[var(--fg-muted)]">
                          Facturado: {l.cantidad} {l.unidad} · <Dolares moneda={monedaDoc} valor={ver(l.valor_unitario)} /> c/u sin IGV
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="shrink-0">{esDevolucion ? "Vuelven" : "Descuento"}</span>
                        <Input
                          type="number"
                          min={0}
                          max={esDevolucion ? l.cantidad : undefined}
                          step={esDevolucion ? "any" : "0.01"}
                          numerico
                          className="w-28"
                          value={porLinea[i] ?? ""}
                          placeholder="0"
                          onChange={(e) => setPorLinea((p) => ({ ...p, [i]: e.target.value }))}
                          aria-label={`${esDevolucion ? "Unidades que vuelven" : "Descuento"} de ${l.codigo}`}
                        />
                        {esDevolucion ? <span className="shrink-0 text-[var(--fg-muted)]">de {l.cantidad}</span> : null}
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-sm">
                  La nota sale por{" "}
                  <strong>
                    <Dolares moneda={monedaDoc} valor={importeVisto} />
                  </strong>{" "}
                  con IGV
                  {lineasElegidas.length > 0
                    ? `, ${lineasElegidas.length} ${lineasElegidas.length === 1 ? "producto" : "productos"}.`
                    : ": todavía no marcaste ninguno."}
                </p>
              </div>
            ) : null}

            {!porItem ? (
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-2">
              {/*
                Con un motivo total el importe no se elige, y en vez de una
                casilla gris deshabilitada —que parece rota— se escribe la
                cifra con su porqué (revisión por módulos del 02/10).
              */}
              {importeFijo ? (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Importe con IGV</span>
                  <Dolares moneda={monedaDoc} valor={ver(monto)} className="text-lg font-semibold" />
                  <span className="text-sm text-[var(--fg-muted)]">
                    {total
                      ? "Con este motivo va por el total pendiente."
                      : "Con este motivo se copia el documento entero."}
                  </span>
                </div>
              ) : (
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    Importe con IGV{" "}
                    <span className="text-[var(--danger)]">*</span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={tcDoc ? enSoles : monto}
                    onChange={(e) => {
                      if (tcDoc) {
                        setEnSoles(e.target.value);
                        setMonto(Math.round((Number(e.target.value) / tcDoc) * 100) / 100);
                      } else setMonto(Number(e.target.value));
                    }}
                    className="tabular"
                  />
                </label>
              )}

              {/* El total real puede desviarse un céntimo del importe tecleado:
                la base tiene cuatro decimales y el IGV se calcula sobre ella
                ya redondeada. Se enseña para que nadie teclee un número y vea
                otro en el documento. */}
              {monto > 0 && Math.abs(totalReal - monto) >= 0.01 ? (
                <div className="anim-entrada self-end rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2 text-sm">
                  Saldrá por{" "}
                  <strong>
                    <Dolares moneda={monedaDoc} valor={ver(totalReal)} />
                  </strong>
                  , no <Dolares moneda={monedaDoc} valor={ver(monto)} />: el IGV se calcula sobre la
                  base redondeada.
                </div>
              ) : null}
            </div>
            ) : null}

            {porItem ? null : !importeFijo ? (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Concepto</span>
                <Input
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  placeholder="Descuento comercial acordado"
                />
                <span className="text-sm text-[var(--fg-subtle)]">
                  Es lo que sale impreso en la única línea de la nota.
                </span>
              </label>
            ) : (
              <p className="rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-sm">
                La nota copiará{" "}
                {documento.lineas.length === 1 ? (
                  "la única línea"
                ) : (
                  <>
                    las <strong>{documento.lineas.length}</strong> líneas
                  </>
                )}{" "}
                del
                documento original: con este motivo se está corrigiendo la
                operación entera.
              </p>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Observaciones</span>
              <Textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={3}
              />
            </label>

            {avisos.length > 0 ? (
              <div className="anim-entrada rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5">
                <ul className="flex flex-col gap-1 text-sm">
                  {avisos.map((a) => (
                    <li key={a.clave}>· {a.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {motivo && bloqueos.length > 0 ? (
              <div className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5">
                <p className="mb-1 text-sm font-medium text-[var(--danger)]">
                  SUNAT lo rechazaría:
                </p>
                <ul className="flex flex-col gap-1 text-sm text-[var(--danger)]">
                  {bloqueos.map((b, i) => (
                    <li key={`${b.campo}-${i}`}>· {b.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {resultado && !resultado.ok ? (
              <div className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
                <p className="font-medium">{resultado.error}</p>
                {resultado.bloqueos ? (
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                    {resultado.bloqueos.map((b) => (
                      <li key={b}>· {b}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                // Cancelar es decidir no seguir: no se ofrece otra vez. Cerrar
                // con la X o con Esc no lo borra: eso puede ser un despiste.
                olvidarBorrador();
                setAbierto(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!motivo || bloqueos.length > 0 || emitiendo}
            >
              {emitiendo ? "Emitiendo…" : `Emitir ${serie}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Una cifra en dólares dentro de una frase, con su «$».
 *
 * Revisión por módulos del 02/10: el diálogo decía «total 2098.48» y «ya
 * acreditados 300.00», sin moneda. `Moneda` además no parte el signo de la
 * cifra. Hereda el color de la frase en la que va.
 */
function Dolares({
  valor,
  moneda = "USD",
  className = "",
}: {
  valor: number;
  /** La del documento (116): una factura en soles se lee en soles. */
  moneda?: "USD" | "PEN";
  className?: string;
}) {
  return <Moneda valor={valor} moneda={moneda} tamano="sm" className={`text-inherit ${className}`} />;
}
