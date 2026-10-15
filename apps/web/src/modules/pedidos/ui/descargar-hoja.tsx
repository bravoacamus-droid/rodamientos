"use client";

import * as React from "react";
import { FileDown } from "lucide-react";
import { Button } from "@rodatech/ui";

import type { EmisorHoja } from "@/componentes/hoja-documento";
import { descargarHojaPdf, nombreArchivo } from "@/lib/pdf-hoja";

import type { PapelPedido } from "../dominio/hoja";

/**
 * «Descargar PDF» de la hoja de pedido: un clic y un archivo, como la
 * cotización (14/10). Lo mismo que dibuja `DocumentoPedido`.
 */
export function DescargarHojaPedido({
  numero,
  cliente,
  papel,
  emisor,
}: {
  numero: string;
  cliente: string;
  papel: PapelPedido;
  emisor: EmisorHoja;
}) {
  const [bajando, setBajando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const bajar = async () => {
    setBajando(true);
    setError(null);
    try {
      await descargarHojaPdf(
        {
          emisor,
          titulo: "Hoja de pedido",
          numero,
          datos: papel.datos,
          columnas: papel.columnas,
          filas: papel.filas,
          totales: papel.totales,
          pie: [{ tipo: "parrafo", trozos: [{ texto: papel.nota }] }],
        },
        nombreArchivo("Pedido", numero, cliente),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar el PDF.");
    } finally {
      setBajando(false);
    }
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant="outline" onClick={bajar} disabled={bajando}>
        <FileDown className="size-[18px] shrink-0" aria-hidden="true" />
        {bajando ? "Armando el PDF…" : "Descargar PDF"}
      </Button>
      {error ? <span className="text-sm text-[var(--danger)]">{error}</span> : null}
    </span>
  );
}
