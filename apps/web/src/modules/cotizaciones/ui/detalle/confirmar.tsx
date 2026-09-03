"use client";

// Cliente: es un diálogo con cantidades editables y una Server Action al
// confirmar. Nada de esto se puede resolver en el servidor.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
} from "@rodatech/ui";
import { Check, RotateCcw, X } from "lucide-react";

import { aprobar } from "../../acciones/gestionar";
import { importeLinea } from "../../dominio/totales";

/**
 * «¿Qué te confirmó el cliente?»
 *
 * Willy, 01/09 (29:05): *«al día siguiente ya me estarían confirmando, tal vez
 * después de dos, tres días, me están confirmando el total o parte de lo
 * cotizado»*.
 *
 * ---------------------------------------------------------------------------
 * Por qué un diálogo y no aprobar directo
 * ---------------------------------------------------------------------------
 * Porque hasta hoy el botón «Aprobar» daba por vendidas las seis líneas
 * siempre, y eso no es un detalle de registro: la bandeja «Por comprar» sale de
 * restar lo confirmado menos el stock. Con las seis dadas por buenas, Willy
 * saldría a comprar dos rodamientos que nadie le pidió.
 *
 * El caso normal —confirmó todo— sigue siendo un clic: el diálogo abre con
 * todas las cantidades puestas y el botón listo. Solo hay que tocar algo cuando
 * de verdad hay algo distinto que decir.
 */

export interface LineaParaConfirmar {
  id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  valorUnitario: number;
  descuentoPct: number;
}

const dolar = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "USD" }).format(n);

export function DialogoConfirmar({
  cotizacionId,
  lineas,
  abierto,
  onCerrar,
}: {
  cotizacionId: string;
  lineas: LineaParaConfirmar[];
  abierto: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  /** Lo confirmado por línea. Arranca en lo cotizado, que es el caso normal. */
  const [cantidades, setCantidades] = React.useState<Record<string, number>>({});

  // Se reinicia cada vez que se abre: si alguien cerró tras tocar cantidades y
  // vuelve a abrir, tiene que encontrar la cotización como está, no su borrador
  // de hace un minuto.
  React.useEffect(() => {
    if (!abierto) return;
    setCantidades(Object.fromEntries(lineas.map((l) => [l.id, l.cantidad])));
    setError(null);
  }, [abierto, lineas]);

  const poner = (id: string, valor: number, tope: number) => {
    const n = Number.isFinite(valor) ? Math.max(0, Math.min(tope, valor)) : 0;
    setCantidades((x) => ({ ...x, [id]: n }));
  };

  const confirmadas = lineas.filter((l) => (cantidades[l.id] ?? 0) > 0);
  // Cuántas van RECORTADAS: están, pero por menos de lo cotizado.
  //
  // Sin esto el resumen decía «confirma la cotización entera» con una línea
  // bajada de 30 a 25 —contaba líneas, no cantidades— y esa frase es lo último
  // que se lee antes de pulsar. El número ya salía bien; la frase no.
  const recortadas = confirmadas.filter(
    (l) => (cantidades[l.id] ?? 0) < l.cantidad,
  ).length;
  const entera = confirmadas.length === lineas.length && recortadas === 0;
  const total = confirmadas.reduce(
    (a, l) =>
      a +
      importeLinea({
        cantidad: cantidades[l.id] ?? 0,
        valorUnitario: l.valorUnitario,
        descuentoPct: l.descuentoPct,
      }),
    0,
  );

  /** ¿Se tocó algo, o el cliente confirmó tal cual se cotizó? */
  const completa = lineas.every((l) => (cantidades[l.id] ?? 0) === l.cantidad);

  const enviar = () => {
    setError(null);
    if (confirmadas.length === 0) {
      // La base lo rechaza igual, pero decirlo aquí evita el viaje y da un
      // mensaje que explica qué hacer en vez de un error de restricción.
      setError(
        "No confirmaste ninguna línea. Si el cliente dijo que no, ciérrala como rechazada desde el menú.",
      );
      return;
    }
    iniciar(async () => {
      const r = await aprobar(
        cotizacionId,
        // Sin detalle cuando confirmó todo: es el camino corto de la RPC y deja
        // registrado que fue una confirmación completa, no una parcial que
        // casualmente coincidió.
        completa
          ? undefined
          : lineas.map((l) => ({ item_id: l.id, cantidad: cantidades[l.id] ?? 0 })),
      );
      if (!r.ok) {
        setError(r.error ?? "No se pudo confirmar.");
        return;
      }
      onCerrar();
      router.refresh();
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>¿Qué te confirmó el cliente?</DialogTitle>
        <DialogDescription>
          Viene todo marcado. Baja o pon en cero lo que no te pidió — de eso
          sale después lo que hay que comprar.
        </DialogDescription>

        <div className="max-h-[50vh] overflow-y-auto">
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {lineas.map((l) => {
              const conf = cantidades[l.id] ?? 0;
              const fuera = conf === 0;
              return (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <div className={`min-w-0 flex-1 ${fuera ? "opacity-45" : ""}`}>
                    <p className="text-sm font-medium">
                      <span className={fuera ? "line-through" : ""}>{l.codigo}</span>
                    </p>
                    <p className="mt-0.5 truncate text-sm text-[var(--fg-muted)]">
                      {l.descripcion}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={l.cantidad}
                      step="any"
                      numerico
                      value={conf}
                      onChange={(e) => poner(l.id, Number(e.target.value), l.cantidad)}
                      className="h-11 w-24 md:h-control-md"
                      aria-label={`Cantidad confirmada de ${l.codigo}`}
                    />
                    <span className="w-24 text-sm text-[var(--fg-muted)]">
                      de {l.cantidad} {l.unidad}
                    </span>
                    {/* Un atajo para el caso frecuente: «esta no la quiso».
                        Teclear el cero a mano en seis líneas es el trabajo
                        que este botón ahorra. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10 w-28"
                      onClick={() => poner(l.id, fuera ? l.cantidad : 0, l.cantidad)}
                    >
                      {fuera ? (
                        <>
                          <RotateCcw aria-hidden="true" />
                          Devolver
                        </>
                      ) : (
                        <>
                          <X aria-hidden="true" />
                          No la quiso
                        </>
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]"
          >
            {error}
          </p>
        ) : null}

        <p className="rounded-md bg-[var(--surface-2)] px-3 py-2 text-sm">
          {entera ? (
            <>Confirma la cotización entera: <strong>{dolar(total)}</strong> sin IGV.</>
          ) : (
            <>
              Confirma <strong>{confirmadas.length}</strong> de {lineas.length}{" "}
              {lineas.length === 1 ? "línea" : "líneas"}
              {recortadas > 0 ? (
                <>
                  {" "}
                  ({recortadas} por menos de lo cotizado)
                </>
              ) : null}{" "}
              · <strong>{dolar(total)}</strong> sin IGV.
            </>
          )}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="h-11 md:h-control-md"
            onClick={onCerrar}
            disabled={pendiente}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 md:h-control-md"
            onClick={enviar}
            disabled={pendiente}
            loading={pendiente}
          >
            {pendiente ? (
              "Confirmando…"
            ) : (
              <>
                <Check aria-hidden="true" />
                {completa ? "Confirmó todo" : `Confirmar ${confirmadas.length}`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
