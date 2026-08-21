"use client";

// Cliente: abre menús y diálogos, y llama a las acciones de servidor.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Textarea,
} from "@rodatech/ui";

import { archivarProducto } from "../acciones/guardar";
import { ajustarStock, type ResultadoStock } from "../acciones/stock";

/**
 * Menú de acciones de una fila del catálogo.
 *
 * Va al final de la fila, después del estado. Los tres puntos son el patrón
 * que la gente ya conoce, y evitan una hilera de botones que en un teléfono no
 * cabría.
 *
 * Cada acción respeta el rol: quien no puede archivar no ve "Dar de baja",
 * porque un botón que aparece y luego rebota es peor que no verlo.
 */

export interface AccionesFilaProps {
  id: string;
  codigo: string;
  descripcion: string;
  stock: number;
  archivado: boolean;
  puedeEditar: boolean;
  puedeAjustarStock: boolean;
}

export function AccionesFila({
  id,
  codigo,
  descripcion,
  stock,
  archivado,
  puedeEditar,
  puedeAjustarStock,
}: AccionesFilaProps) {
  const router = useRouter();
  const [dialogo, setDialogo] = React.useState<"ninguno" | "stock" | "archivar">("ninguno");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Acciones de ${codigo}`}
          className="flex size-9 items-center justify-center rounded-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
            <circle cx="12" cy="5" r="1.8" fill="currentColor" />
            <circle cx="12" cy="12" r="1.8" fill="currentColor" />
            <circle cx="12" cy="19" r="1.8" fill="currentColor" />
          </svg>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => router.push(`/productos/${id}`)}>
            Ver producto
          </DropdownMenuItem>

          {puedeEditar ? (
            <DropdownMenuItem onSelect={() => router.push(`/productos/${id}/editar`)}>
              Editar producto
            </DropdownMenuItem>
          ) : null}

          {puedeAjustarStock && !archivado ? (
            <DropdownMenuItem onSelect={() => setDialogo("stock")}>
              Actualizar stock
              <span className="ml-auto tabular text-xs text-[var(--fg-muted)]">
                {stock}
              </span>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => router.push(`/cotizaciones/nueva?producto=${id}`)}
          >
            Cotizar este producto
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(`/inventario/kardex?producto=${id}`)}>
            Ver kardex
          </DropdownMenuItem>

          {puedeEditar ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setDialogo("archivar")}
                className={archivado ? "" : "text-[var(--danger)]"}
              >
                {archivado ? "Reactivar producto" : "Dar de baja"}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogoStock
        abierto={dialogo === "stock"}
        cerrar={() => setDialogo("ninguno")}
        id={id}
        codigo={codigo}
        descripcion={descripcion}
        stock={stock}
      />

      <DialogoArchivar
        abierto={dialogo === "archivar"}
        cerrar={() => setDialogo("ninguno")}
        id={id}
        codigo={codigo}
        archivado={archivado}
        onHecho={() => router.refresh()}
      />
    </>
  );
}

/**
 * Cuadre de stock.
 *
 * Se pide **cuánto hay de verdad**, no cuánto sumar o restar: es lo que la
 * persona tiene delante después de contar. La diferencia la saca el servidor y
 * la registra como movimiento, así que el kardex sigue cuadrando.
 */
function DialogoStock({
  abierto,
  cerrar,
  id,
  codigo,
  descripcion,
  stock,
}: {
  abierto: boolean;
  cerrar: () => void;
  id: string;
  codigo: string;
  descripcion: string;
  stock: number;
}) {
  const router = useRouter();
  const [contado, setContado] = React.useState(String(stock));
  const [motivo, setMotivo] = React.useState("");
  const [resultado, enviar, enviando] = React.useActionState<ResultadoStock | null, FormData>(
    async (previo, formData) => {
      const r = await ajustarStock(previo, formData);
      if (r.ok) {
        router.refresh();
        cerrar();
      }
      return r;
    },
    null,
  );

  // Al reabrirlo para otro producto, los campos tienen que empezar limpios.
  React.useEffect(() => {
    if (abierto) {
      setContado(String(stock));
      setMotivo("");
    }
  }, [abierto, stock]);

  const real = Number(contado.replace(",", "."));
  const diferencia = Number.isFinite(real) ? Number((real - stock).toFixed(2)) : 0;

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Actualizar stock</DialogTitle>
        <DialogDescription>
          {codigo} · {descripcion}
        </DialogDescription>

        <form
          action={enviar}
          className="mt-4 flex flex-col gap-3"
        >
          <input
            type="hidden"
            name="ajuste"
            value={JSON.stringify({
              producto_id: id,
              cantidad_real: Number.isFinite(real) ? real : 0,
              motivo: motivo.trim(),
            })}
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-[var(--fg-muted)]">Sistema dice</span>
              <span className="tabular text-2xl font-semibold">{stock}</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Contaste</span>
              <Input
                type="number"
                step="any"
                min={0}
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                className="text-right tabular"
                autoFocus
              />
            </label>
          </div>

          {diferencia !== 0 ? (
            <p className="rounded-sm bg-[var(--surface-2)] p-2.5 text-sm">
              Se registrará un ajuste de{" "}
              <strong
                className={
                  diferencia > 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
                }
              >
                {diferencia > 0 ? "+" : ""}
                {diferencia}
              </strong>{" "}
              unidades. Queda constancia en el kardex a tu nombre.
            </p>
          ) : (
            <p className="text-sm text-[var(--fg-muted)]">
              El conteo coincide con el saldo: no hay nada que ajustar.
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Motivo</span>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Conteo físico del 21/08, se encontraron 3 unidades más en el anaquel B."
            />
            <span className="text-xs text-[var(--fg-muted)]">
              Obligatorio. Un ajuste sin explicación es un descuadre que nadie va
              a poder auditar en tres meses.
            </span>
          </label>

          {resultado && !resultado.ok ? (
            <p className="text-sm text-[var(--danger)]">{resultado.error}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={cerrar}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={enviando || diferencia === 0 || motivo.trim().length < 4}
            >
              {enviando ? "Registrando…" : "Registrar ajuste"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Baja y reactivación.
 *
 * Archivar NO es borrar (24:21): el producto sale del cotizador, conserva su
 * historial y se puede reactivar. Por eso el texto dice "dar de baja" y no
 * "eliminar", y por eso se pregunta antes.
 */
function DialogoArchivar({
  abierto,
  cerrar,
  id,
  codigo,
  archivado,
  onHecho,
}: {
  abierto: boolean;
  cerrar: () => void;
  id: string;
  codigo: string;
  archivado: boolean;
  onHecho: () => void;
}) {
  const [motivo, setMotivo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, iniciar] = React.useTransition();

  React.useEffect(() => {
    if (abierto) {
      setMotivo("");
      setError(null);
    }
  }, [abierto]);

  const confirmar = () => {
    setError(null);
    iniciar(async () => {
      const r = await archivarProducto(id, !archivado, motivo);
      if (r.ok) {
        onHecho();
        cerrar();
      } else {
        setError(r.error ?? "No se pudo completar.");
      }
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogTitle>
          {archivado ? "Reactivar producto" : "Dar de baja"}
        </DialogTitle>
        <DialogDescription>
          {archivado ? (
            <>
              {codigo} vuelve al catálogo y se podrá cotizar otra vez.
            </>
          ) : (
            <>
              {codigo} sale de las cotizaciones y del buscador, pero{" "}
              <strong>no se borra</strong>: conserva su historial y lo puedes
              reactivar cuando quieras.
            </>
          )}
        </DialogDescription>

        {!archivado ? (
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-sm font-medium">Motivo (opcional)</span>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descontinuado por el fabricante"
            />
          </label>
        ) : null}

        {error ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={archivado ? "primary" : "danger"}
            disabled={pendiente}
            onClick={confirmar}
          >
            {pendiente
              ? "Un momento…"
              : archivado
                ? "Reactivar"
                : "Dar de baja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
