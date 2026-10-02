"use client";

import * as React from "react";
import { Button } from "@rodatech/ui";
import { FileText, Paperclip, X } from "lucide-react";

/** Lo mismo que acepta `subirDocumentoCompra` (099). */
const TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const MAXIMO = 10 * 1024 * 1024;

/**
 * La factura del proveedor, en PDF o en foto, al lado de su número.
 *
 * Luis, 02/10, en el registro: *«al costado falta el botón de subir el PDF de
 * la factura, ya sea PDF o foto»*. Subir documentos a una compra existía
 * desde la 099, pero solo en la FICHA, después de guardar: otra vez la pieza
 * sin camino donde se necesita.
 *
 * Como la compra todavía no existe, el archivo se queda aquí hasta guardar, y
 * quien guarda lo sube a la compra recién creada. Se revisa al elegirlo —tipo
 * y tamaño— para que el aviso salga ahora y no después de grabar.
 */
export function FacturaArchivo({
  archivo,
  onCambiar,
}: {
  archivo: File | null;
  onCambiar: (f: File | null) => void;
}) {
  const entrada = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  const elegir = (f: File | undefined) => {
    if (!f) return;
    if (!TIPOS.includes(f.type)) {
      setError("Tiene que ser un PDF o una foto (JPG, PNG, WEBP o HEIC).");
      return;
    }
    if (f.size > MAXIMO) {
      setError(`Pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y el tope son 10 MB.`);
      return;
    }
    setError(null);
    onCambiar(f);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">PDF o foto de la factura</span>
      {archivo ? (
        <div className="flex min-h-10 items-center gap-2 rounded-md border border-[var(--ok)] bg-[var(--ok-bg)] px-3 py-1.5">
          <FileText className="size-4 shrink-0 text-[var(--ok)]" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm" title={archivo.name}>
            {archivo.name}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-sm"
            onClick={() => onCambiar(null)}
            aria-label={`Quitar ${archivo.name}`}
          >
            <X className="size-4" aria-hidden />
            Quitar
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => entrada.current?.click()} className="justify-start">
          <Paperclip className="size-4" aria-hidden />
          Subir factura (PDF o foto)
        </Button>
      )}
      <input
        ref={entrada}
        type="file"
        // `capture` no: en el teléfono deja elegir entre cámara y galería.
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(e) => {
          elegir(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error ? (
        <span className="text-sm text-[var(--danger)]">{error}</span>
      ) : (
        <span className="text-sm text-[var(--fg-muted)]">
          {archivo ? "Se guarda con la compra." : "Opcional. Queda en la ficha de la compra."}
        </span>
      )}
    </div>
  );
}
