"use client";

// Cliente: es un diálogo con estado propio y llama a una Server Action.

import * as React from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  Input,
  SelectNativo,
} from "@rodatech/ui";

import { guardarProveedor } from "@/modules/proveedores/acciones/guardar";

import type { ProveedorOpcion } from "../../dominio/tipos";

/**
 * Alta rápida de proveedor sin salir de la recepción.
 *
 * Mismo gesto que `ClienteRapido` en la cotización, y por el mismo motivo: la
 * mercadería está en el mostrador y mandar al operador a otra pantalla
 * significa perder la recepción a medio escribir.
 *
 * Guarda con la MISMA Server Action que el maestro de proveedores. Un alta
 * paralela sería un segundo sitio donde validar el RUC, generar el código y
 * desambiguar duplicados, y los dos se separarían al primer cambio. Aquí solo
 * se recortan los campos: lo demás se completa después desde el maestro.
 *
 * No consulta el RUC contra Decolecta a propósito, a diferencia del alta de
 * cliente. Son 100 consultas al mes, un proveedor se da de alta una vez cada
 * muchos meses, y su razón social está impresa en la factura que el operador
 * tiene delante. El maestro sí la ofrece, para quien la quiera.
 */
export function ProveedorRapido({
  onCreado,
}: {
  onCreado: (proveedor: ProveedorOpcion) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [numero, setNumero] = React.useState("");
  const [razonSocial, setRazonSocial] = React.useState("");
  const [tipo, setTipo] = React.useState<"local" | "importacion">("local");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, guardar] = React.useTransition();

  const limpiar = () => {
    setNumero("");
    setRazonSocial("");
    setTipo("local");
    setError(null);
  };

  const enviar = () => {
    setError(null);
    guardar(async () => {
      const fd = new FormData();
      fd.set(
        "proveedor",
        JSON.stringify({
          tipo_documento: "RUC",
          numero_documento: numero.trim(),
          razon_social: razonSocial.trim(),
          tipo,
          pais: "Perú",
          dias_pago: 0,
          lead_time_dias: 3,
          marca_ids: [],
        }),
      );

      const r = await guardarProveedor(null, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCreado({
        id: r.id,
        codigo: r.codigo,
        razon_social: r.razonSocial,
        numero_documento: numero.trim(),
        tipo,
      });
      setAbierto(false);
      limpiar();
    });
  };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) limpiar();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          + Nuevo proveedor
        </button>
      </DialogTrigger>

      <DialogContent>
        <DialogTitle>Nuevo proveedor</DialogTitle>
        <DialogDescription>
          Lo mínimo para que la mercadería no entre sin saber de quién viene. El
          resto de la ficha —contacto, lead time, marcas que representa— se
          completa después desde el maestro de proveedores.
        </DialogDescription>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">RUC</span>
            <Input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="20123456789"
              inputMode="numeric"
              autoComplete="off"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Razón social</span>
            <Input
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Tal como figura en la factura"
              autoComplete="off"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Tipo de compra</span>
            <SelectNativo
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "local" | "importacion")}
            >
              <option value="local">Local</option>
              <option value="importacion">Importación</option>
            </SelectNativo>
          </label>

          {error ? (
            <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2 text-xs text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={enviar}
            disabled={guardando || numero.trim() === "" || razonSocial.trim() === ""}
          >
            {guardando ? "Guardando…" : "Crear proveedor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
