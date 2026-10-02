"use client";

// Cliente: añade y quita gastos con una Server Action y refresca la ficha.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from "@rodatech/ui";
import { Plus, Scale, Trash2 } from "lucide-react";

import { agregarGasto, quitarGasto } from "@/modules/importaciones/acciones/gastos";

import { ETIQUETA_REPARTO, repartoSugerido, type Reparto } from "../dominio/gastos";
import { SelectorReparto } from "./constructor/gastos";

export interface GastoFicha {
  id: string;
  concepto: string;
  monto: number;
  reparto: Reparto;
}

/**
 * Los gastos de una compra, en su ficha, y la puerta para añadir los que
 * llegan DESPUÉS (097).
 *
 * Willy, 01/10 (§AP): *«el desaduanaje es un gasto adicional que me confirman
 * acá cuando arriba mi pedido a aduanas […] ese gasto no lo puedo saber
 * antes, solo cuando llega al país la carga»*.
 *
 * Añadir gastos a una compra ya existía —`/importaciones`, desde la 022—, pero
 * desde la ficha de la compra no se llegaba: la pieza sin camino otra vez. Y
 * el momento de añadirlo es justo este: la carga está en aduanas, la compra
 * sigue «registrada», todavía no entró nada al almacén. En cuanto se recibe,
 * la base congela los gastos (022) porque el costo ya está en el kardex.
 *
 * Por eso en una aérea sin desaduanaje se AVISA, con el botón al lado: si se
 * recibe antes de anotarlo, ese dinero no entra al costo.
 */
export function GastosFicha({
  compraId,
  gastos,
  total,
  editable,
  pedirDesaduanaje,
  puedeTocar,
  porKg,
  kilos,
  faltanPesos,
  conPesos,
  anulada = false,
}: {
  compraId: string;
  gastos: GastoFicha[];
  /** El total de la compra, que puede venir sin detalle (antes de la 095). */
  total: number;
  /** Sigue «registrada»: todavía se pueden tocar los gastos. */
  editable: boolean;
  /** Aérea registrada y sin un gasto que se llame desaduanaje. */
  pedirDesaduanaje: boolean;
  puedeTocar: boolean;
  /** $/kg con que se reparte lo «por kilo», si se puede repartir así. */
  porKg: number;
  kilos: number;
  /** Hay gastos por kilo pero algún producto no tiene peso. */
  faltanPesos: boolean;
  /**
   * Todas las líneas tienen peso (la compra salió de un análisis). Solo
   * entonces se ofrece repartir «por kilo»: la compra no pide pesos (02/10).
   */
  conPesos: boolean;
  /** Anulada: sus gastos no van a ningún costo. */
  anulada?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [concepto, setConcepto] = React.useState("Desaduanaje");
  const [monto, setMonto] = React.useState("");
  const [documento, setDocumento] = React.useState("");
  const [reparto, setReparto] = React.useState<Reparto>("valor");
  const [repartoAMano, setRepartoAMano] = React.useState(false);
  const [ocupado, empezar] = React.useTransition();
  const [quitando, setQuitando] = React.useState<string | null>(null);

  const abrir = (c: string) => {
    setConcepto(c);
    setMonto("");
    setDocumento("");
    setReparto(conPesos ? repartoSugerido(c) : "valor");
    setRepartoAMano(false);
    setAbierto(true);
  };

  const n = Number(monto.replace(",", "."));
  const valido = concepto.trim().length >= 2 && Number.isFinite(n) && n > 0;

  const anotar = () => {
    if (!valido) return;
    empezar(async () => {
      const r = await agregarGasto({
        compra_id: compraId,
        concepto: concepto.trim(),
        monto: Math.round(n * 100) / 100,
        // La fecha del gasto es hoy: es cuando lo confirman.
        fecha: new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date()),
        documento: documento.trim() || null,
        reparto,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${concepto.trim()} anotado: entra al costo al recibir.`);
      setAbierto(false);
      router.refresh();
    });
  };

  const quitar = (g: GastoFicha) => {
    setQuitando(g.id);
    empezar(async () => {
      const r = await quitarGasto(g.id);
      setQuitando(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${g.concepto} quitado.`);
      router.refresh();
    });
  };

  const hayAlgo = total > 0 || gastos.length > 0;

  return (
    <div className="mt-4 border-t border-[var(--border-soft)] pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Gastos</h3>
        {editable && puedeTocar ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-sm"
            onClick={() => abrir("Desaduanaje")}
          >
            <Plus className="size-4" aria-hidden />
            Añadir gasto
          </Button>
        ) : null}
      </div>

      {/* El aviso que hace falta: en una aérea, el desaduanaje llega cuando la
          carga está en aduanas, y hay que anotarlo ANTES de recibir. */}
      {pedirDesaduanaje && editable && puedeTocar ? (
        <div className="mb-3 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          <p className="font-semibold">¿Ya te confirmaron el desaduanaje?</p>
          <p className="mt-0.5">
            Anótalo antes de recibir la mercadería: así entra al costo de cada producto. Cuando
            se recibe, los gastos quedan fijos.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-2 text-sm"
            onClick={() => abrir("Desaduanaje")}
          >
            <Plus className="size-4" aria-hidden />
            Anotar el desaduanaje
          </Button>
        </div>
      ) : null}

      {gastos.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm">
          {gastos.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span>{g.concepto}</span>
                <Badge tone={g.reparto === "peso" ? "info" : "neutral"} size="xs">
                  {ETIQUETA_REPARTO[g.reparto].toLowerCase()}
                </Badge>
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular">$ {g.monto.toFixed(2)}</span>
                {editable && puedeTocar ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => quitar(g)}
                    disabled={ocupado}
                    aria-label={`Quitar ${g.concepto}`}
                    title={`Quitar ${g.concepto}`}
                    className="h-9"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    {quitando === g.id ? "…" : null}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : total > 0 ? (
        // Compras de antes de la 095: se guardó el total, no el detalle.
        <p className="text-sm text-[var(--fg-subtle)]">Se registró el total, sin desglose.</p>
      ) : (
        <p className="text-sm text-[var(--fg-subtle)]">Sin gastos anotados.</p>
      )}

      {hayAlgo ? (
        <div className="mt-2 flex justify-between gap-3 border-t border-[var(--border-soft)] pt-2 text-sm font-semibold">
          <span>Total de gastos</span>
          <span className="tabular">$ {total.toFixed(2)}</span>
        </div>
      ) : null}

      {/* El «$/Kg.» de su hoja. */}
      {porKg > 0 ? (
        <p className="mt-2 flex items-center gap-2 text-sm">
          <Scale className="size-4 shrink-0 text-[var(--fg-muted)]" aria-hidden />
          <span>
            Por kilo: <span className="tabular font-semibold">$ {porKg.toFixed(2)}</span> el kilo
            <span className="text-[var(--fg-muted)]"> ({kilos.toFixed(2)} kg en total)</span>
          </span>
        </p>
      ) : null}
      {faltanPesos ? (
        <p className="mt-2 text-sm text-[var(--warn)]">
          Hay gastos por kilo pero algún producto no tiene peso: se reparten por valor.
        </p>
      ) : null}

      {hayAlgo ? (
        <p className="mt-1 text-sm text-[var(--fg-subtle)]">
          {/* Lo que pasa de verdad con ellos, según cómo está la compra. */}
          {anulada
            ? "La compra está anulada: estos gastos no entran a ningún costo."
            : editable
              ? "Entran al costo de cada producto al recibir."
              : "Ya entraron al costo de lo recibido; lo que falta llegar los lleva igual."}
        </p>
      ) : null}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent ancho="max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir un gasto</DialogTitle>
            <DialogDescription>
              Entra al costo de cada producto cuando recibas la mercadería.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Qué se pagó</span>
              <Input
                value={concepto}
                onChange={(e) => {
                  setConcepto(e.target.value);
                  // Lo propuesto sigue al concepto; lo elegido se queda.
                  if (!repartoAMano && conPesos) setReparto(repartoSugerido(e.target.value));
                }}
                list="conceptos-gasto"
                autoFocus
              />
              <datalist id="conceptos-gasto">
                <option value="Desaduanaje" />
                <option value="Courier" />
                <option value="Flete" />
                <option value="Almacenaje" />
                <option value="Agente de aduanas" />
                <option value="Transporte" />
              </datalist>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Monto ($)</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  className="text-right tabular"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">N.° de recibo o factura</span>
                <Input
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  placeholder="Opcional"
                />
              </label>
            </div>

            {conPesos ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Cómo se reparte</span>
              <SelectorReparto
                valor={reparto}
                concepto={concepto}
                onCambiar={(r) => {
                  setReparto(r);
                  setRepartoAMano(true);
                }}
              />
              <span className="text-sm text-[var(--fg-muted)]">
                {reparto === "peso"
                  ? "Según lo que pesa cada producto, como el courier."
                  : "Según lo que vale cada producto, como los impuestos."}
              </span>
            </div>
            ) : (
              <p className="text-sm text-[var(--fg-muted)]">
                Se reparte según lo que vale cada producto.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={anotar} disabled={!valido || ocupado}>
              {ocupado ? "Guardando…" : "Anotar gasto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
