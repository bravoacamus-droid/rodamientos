"use client";

/*
 * "use client" OBLIGATORIO: se despliega, pide el detalle al vuelo y escribe.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, SelectNativo, formatearMoneda, toast } from "@rodatech/ui";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";

import { agregarGasto, gastosDeCompra, quitarGasto } from "../acciones/gastos";
import { sumarGastos } from "../dominio/transito";
import { CONCEPTOS_HABITUALES, type GastoImportacion } from "../dominio/tipos";

// Con miles y el signo pegado a la cifra (revisión por módulos del 02/10).
const NBSP = String.fromCharCode(0xa0);
const dinero = (n: number) => formatearMoneda(n).replace(" ", NBSP);

/**
 * El detalle de gastos de una importación.
 *
 * Se despliega y pide los datos AL DESPLEGAR, no al cargar la pantalla: son
 * decenas de compras y traer los gastos de todas para enseñar los de una sería
 * tirar el trabajo.
 *
 * Detallar no es decorativo. Desde la migración 022, la suma del detalle
 * SUSTITUYE al total tecleado, y ese total es el que la recepción usa para
 * repartir el costo puesto en almacén. Por eso la pantalla lo dice en voz alta
 * y por eso solo se puede tocar antes de que llegue mercadería.
 */
export function PanelGastos({
  compraId,
  total,
  subtotal,
  editable,
  motivoBloqueo,
}: {
  compraId: string;
  /** El total que tiene hoy la compra, venga del detalle o tecleado. */
  total: number;
  subtotal: number;
  editable: boolean;
  /** Por qué no se puede tocar, si no se puede. */
  motivoBloqueo?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [gastos, setGastos] = React.useState<GastoImportacion[] | null>(null);
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState(false);

  const [concepto, setConcepto] = React.useState<string>(CONCEPTOS_HABITUALES[0]);
  const [monto, setMonto] = React.useState("");
  const [documento, setDocumento] = React.useState("");

  const cargar = React.useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await gastosDeCompra(compraId);
      if (r.ok) setGastos(r.datos);
      else setError(r.error);
    } finally {
      setCargando(false);
    }
  }, [compraId]);

  const alternar = () => {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (siguiente && gastos === null) void cargar();
  };

  const detallado = gastos ? sumarGastos(gastos) : 0;

  const anotar = async () => {
    const n = Number(monto.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;

    setOcupado(true);
    try {
      const r = await agregarGasto({
        compra_id: compraId,
        concepto,
        monto: n,
        // La fecha del gasto es hoy salvo que alguien la cambie. Se manda
        // desde el navegador y no desde el servidor a propósito: el que anota
        // el flete lo hace el día que le llega la factura del courier.
        fecha: new Date().toISOString().slice(0, 10),
        documento: documento.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensaje);
      setMonto("");
      setDocumento("");
      await cargar();
      router.refresh();
    } finally {
      setOcupado(false);
    }
  };

  const quitar = async (id: string) => {
    setOcupado(true);
    try {
      const r = await quitarGasto(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensaje);
      await cargar();
      router.refresh();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div>
      {/* Un botón con su borde, no un texto azul con una flecha de 12 px:
          «un botón tiene que parecer un botón» (revisión por módulos del
          02/10). */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={alternar}
        aria-expanded={abierto}
        className="gap-1.5 whitespace-nowrap"
      >
        {abierto ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        {total > 0 ? `Gastos ${dinero(total)}` : "Sin gastos"}
      </Button>

      {abierto ? (
        <div className="mt-2 rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)] p-3">
          {cargando ? (
            <p className="anim-latido text-sm text-[var(--fg-muted)]">Trayendo el detalle…</p>
          ) : error ? (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          ) : (
            <>
              {gastos && gastos.length > 0 ? (
                <ul className="mb-2 flex flex-col divide-y divide-[var(--border-soft)]">
                  {gastos.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{g.concepto}</span>
                        <span className="ml-2 text-[var(--fg-subtle)]">
                          {g.fecha}
                          {g.documento ? ` · ${g.documento}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular font-medium">{dinero(g.monto)}</span>
                        {editable ? (
                          // Con su palabra: un icono suelto no dice qué hace
                          // (revisión por módulos del 02/10).
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={ocupado}
                            aria-label={`Quitar ${g.concepto}`}
                            onClick={() => void quitar(g.id)}
                            className="gap-1"
                          >
                            <Trash2 className="size-4" aria-hidden />
                            Quitar
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-2 text-sm text-[var(--fg-muted)]">
                  {total > 0
                    ? // «Detállalos» solo si se puede: debajo de una compra
                      // ya recibida invitaba a algo que la línea siguiente
                      // prohíbe (revisión por módulos del 02/10).
                      editable
                      ? `Los ${dinero(total)} de esta compra se teclearon como un solo número. Detállalos y el total pasa a ser la suma.`
                      : `Los ${dinero(total)} de esta compra se anotaron como un solo número, sin detalle.`
                    : "Todavía no hay gastos anotados."}
                </p>
              )}

              {/* La consecuencia, dicha donde se decide: el número que sale de
                  aquí es el que reparte el costo al recibir (022). */}
              {gastos && gastos.length > 0 ? (
                <p className="mb-2 text-sm text-[var(--fg-muted)]">
                  Suman <strong>{dinero(detallado)}</strong>
                  {subtotal > 0
                    ? ` · encarecen la mercadería un ${((detallado / subtotal) * 100).toFixed(1)} %`
                    : ""}
                  . Es lo que se reparte sobre el costo al recibir.
                </p>
              ) : null}

              {editable ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-[var(--fg-muted)]">
                      Concepto
                    </span>
                    <SelectNativo
                      value={concepto}
                      onChange={(e) => setConcepto(e.target.value)}
                      className="h-control-sm w-auto"
                    >
                      {CONCEPTOS_HABITUALES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </SelectNativo>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-[var(--fg-muted)]">Monto</span>
                    <Input
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="h-control-sm w-28 text-right tabular"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-[var(--fg-muted)]">
                      Documento
                    </span>
                    <Input
                      value={documento}
                      onChange={(e) => setDocumento(e.target.value)}
                      placeholder="F001-123"
                      className="h-control-sm w-32"
                    />
                  </label>

                  <Button
                    size="sm"
                    disabled={ocupado || Number(monto.replace(",", ".")) <= 0}
                    onClick={() => void anotar()}
                  >
                    Anotar
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-[var(--fg-subtle)]">
                  {motivoBloqueo ??
                    "Los gastos se congelan en cuanto entra mercadería: el costo ya está en el kardex."}
                </p>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
