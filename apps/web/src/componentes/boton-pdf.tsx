"use client";

import * as React from "react";
import { FileDown } from "lucide-react";
import { Button } from "@rodatech/ui";

import { descargarHojaPdf, type HojaPdf } from "@/lib/pdf-hoja";

/**
 * «Descargar PDF» con la hoja ya armada (14/10).
 *
 * Luis: *«tanto en facturas y guías de remisión falta vista previa antes de
 * emitir, así como en cotización, y el botón directo también de descargar
 * PDF»*. Hasta ese día «Descargar» llevaba a la ventana de imprimir del
 * navegador, que es la que Willy no quería (§BR).
 *
 * La hoja la arma el SERVIDOR con las mismas funciones que pintan el papel
 * (es un objeto de datos, viaja como prop); aquí solo se dibuja y se baja.
 */
export function BotonDescargarPdf({
  hoja,
  nombre,
  variante = "outline",
}: {
  hoja: HojaPdf;
  nombre: string;
  variante?: "outline" | "primary";
}) {
  const [armando, setArmando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant={variante}
        disabled={armando}
        onClick={async () => {
          setError(null);
          setArmando(true);
          try {
            await descargarHojaPdf(hoja, nombre);
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo armar el PDF.");
          } finally {
            setArmando(false);
          }
        }}
      >
        <FileDown className="size-[18px] shrink-0" aria-hidden="true" />
        {armando ? "Armando…" : "Descargar PDF"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </>
  );
}
