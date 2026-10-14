"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button, Input, cn } from "@rodatech/ui";

import type { CuentaParaPagar } from "@/componentes/cuentas-para-pagar";

import { tipoCambioParaElPapel } from "../../acciones/tipo-cambio";
import { enSoles, type CotizacionImpresa } from "../../dominio/impresion";
import { Documento } from "./documento";

/**
 * Ver e imprimir la cotización en soles (13/10).
 *
 * Luis: *«en cotización a veces lo quieren en soles; ¿podemos poner un botón
 * con el cambio del día traído por SUNAT para imprimir y ver en soles? Así,
 * dinámicamente»*.
 *
 * Es solo el papel: no se guarda nada y la cotización sigue en dólares. El
 * estado vive en un contexto porque el papel está en DOS sitios —la vista
 * previa y la hoja oculta que sale al imprimir— y los dos tienen que decir lo
 * mismo: elegir soles en la previa y que la impresora saque dólares sería el
 * peor de los fallos, porque no se ve hasta que el cliente lo tiene en la mano.
 */

interface Estado {
  enSoles: boolean;
  /** El que se usa; lo trae SUNAT y se puede corregir a mano. */
  tipoCambio: number | null;
  /** De qué día es (AAAA-MM-DD). Escrito a mano es el de hoy. */
  fecha: string;
  /**
   * Congelado al aprobar una venta en soles (116): es el de la factura y no
   * se toca desde aquí.
   */
  fijo: boolean;
}

const Contexto = React.createContext<{
  estado: Estado;
  setEstado: React.Dispatch<React.SetStateAction<Estado>>;
} | null>(null);

/**
 * `inicial`: una venta en soles (116) abre el papel en soles; aprobada, con
 * su cambio congelado. Quien lo monta le pone `key` con la moneda: el estado
 * no se vuelve a leer de las props.
 */
export function MonedaDelPapel({
  children,
  inicial,
}: {
  children: React.ReactNode;
  inicial?: { enSoles: boolean; tipoCambio: number | null; fecha: string; fijo: boolean };
}) {
  const [estado, setEstado] = React.useState<Estado>(
    inicial ?? { enSoles: false, tipoCambio: null, fecha: "", fijo: false },
  );
  // En soles y sin aprobar: el del día, solo, para que el papel no salga en
  // dólares de una venta en soles.
  const pedido = React.useRef(false);
  React.useEffect(() => {
    if (pedido.current || !estado.enSoles || estado.tipoCambio || estado.fijo) return;
    pedido.current = true;
    void tipoCambioParaElPapel().then((r) => {
      if (r.ok) setEstado((e) => (e.tipoCambio ? e : { ...e, tipoCambio: r.venta, fecha: r.fecha }));
    });
  }, [estado.enSoles, estado.tipoCambio, estado.fijo]);
  const valor = React.useMemo(() => ({ estado, setEstado }), [estado]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

function useMoneda() {
  const c = React.useContext(Contexto);
  if (!c) throw new Error("MonedaDelPapel no está montado.");
  return c;
}

/** El documento, en la moneda que se eligió. */
export function DocumentoEnMoneda({
  c,
  cuentas,
}: {
  c: CotizacionImpresa;
  cuentas?: readonly CuentaParaPagar[];
}) {
  return <Documento c={useEnLaMonedaElegida(c)} cuentas={cuentas} />;
}

/** La cotización en la moneda que se eligió: el papel y el PDF, iguales. */
export function useEnLaMonedaElegida(c: CotizacionImpresa): CotizacionImpresa {
  const { estado } = useMoneda();
  return estado.enSoles && estado.tipoCambio && estado.tipoCambio > 0
    ? enSoles(c, { valor: estado.tipoCambio, fecha: estado.fecha })
    : c;
}

const hoyEnLima = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);

const fechaCorta = (f: string) => (f ? f.split("-").reverse().join("/") : "");

/** Dólares | Soles, y el tipo de cambio cuando es en soles. */
export function SelectorMonedaPapel() {
  const { estado, setEstado } = useMoneda();
  const [buscando, iniciar] = React.useTransition();
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [texto, setTexto] = React.useState(estado.tipoCambio ? String(estado.tipoCambio) : "");

  const traer = () => {
    setAviso(null);
    iniciar(async () => {
      const r = await tipoCambioParaElPapel();
      if (r.ok) {
        setTexto(String(r.venta));
        setEstado((e) => ({ ...e, tipoCambio: r.venta, fecha: r.fecha }));
      } else {
        setAviso(`${r.error} Escribe el tipo de cambio a mano.`);
      }
    });
  };

  const elegir = (soles: boolean) => {
    setEstado((e) => ({ ...e, enSoles: soles }));
    // La primera vez que se pide en soles, se trae solo: es lo que se quiere
    // en el 99 % de los casos, y un clic menos.
    if (soles && !estado.tipoCambio) traer();
  };

  const escribir = (v: string) => {
    setTexto(v);
    const n = Number(v.replace(",", "."));
    setEstado((e) => ({
      ...e,
      tipoCambio: Number.isFinite(n) && n > 0 && n < 100 ? n : null,
      fecha: hoyEnLima(),
    }));
  };

  // El grupo de la barra de periodo: el mismo aspecto para la misma idea.
  const boton = (activo: boolean) =>
    cn(
      "inline-flex h-9 items-center rounded-md px-3 text-base transition-colors",
      activo
        ? "bg-[var(--surface)] font-semibold text-brand-700 elev-1 dark:text-brand-300"
        : "font-medium text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)]",
    );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-base font-medium">Moneda del papel:</span>
      <div role="group" aria-label="Moneda del papel" className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1">
        <button type="button" aria-pressed={!estado.enSoles} className={boton(!estado.enSoles)} onClick={() => elegir(false)}>
          Dólares ($)
        </button>
        <button
          type="button"
          aria-pressed={estado.enSoles}
          className={boton(estado.enSoles)}
          onClick={() => elegir(true)}
        >
          Soles (S/)
        </button>
      </div>

      {estado.enSoles && estado.fijo ? (
        <span className="text-base">
          Tipo de cambio <strong className="tabular">{estado.tipoCambio?.toFixed(3)}</strong>, del día de la cotización
          {estado.fecha ? ` (${fechaCorta(estado.fecha)})` : ""}
        </span>
      ) : estado.enSoles ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="tc-papel" className="text-base">
            Tipo de cambio
          </label>
          <Input
            id="tc-papel"
            numerico
            inputMode="decimal"
            value={texto}
            onChange={(e) => escribir(e.target.value)}
            placeholder={buscando ? "Consultando…" : "3.750"}
            className="w-28"
          />
          <Button type="button" variant="outline" onClick={traer} disabled={buscando}>
            <RefreshCw className={cn("size-[18px] shrink-0", buscando && "animate-spin")} aria-hidden="true" />
            Traer de SUNAT
          </Button>
          {estado.tipoCambio && estado.fecha ? (
            <span className="text-sm text-[var(--fg-muted)]">venta del {fechaCorta(estado.fecha)}</span>
          ) : null}
        </div>
      ) : null}

      {estado.enSoles && aviso ? (
        <p role="alert" className="w-full text-sm text-[var(--danger)]">
          {aviso}
        </p>
      ) : null}
      {estado.enSoles && !estado.tipoCambio && !buscando && !aviso ? (
        <p className="w-full text-sm text-[var(--warn)]">Sin tipo de cambio, el papel sigue en dólares.</p>
      ) : null}
    </div>
  );
}
