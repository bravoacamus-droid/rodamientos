"use client";

// Cliente: abre los diálogos de stock y de baja.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, PackageCheck } from "lucide-react";
import { Button, cn } from "@rodatech/ui";

import { DialogoArchivar } from "./acciones-fila";
import { DialogoStock } from "./dialogo-stock";

/**
 * Las acciones de la ficha que abren un diálogo, como BOTONES con palabra
 * (27/11).
 *
 * Hasta hoy vivían en el menú de tres puntos junto con «Cotizar» y «Ver
 * kardex». El brief del rediseño lo dice sin rodeos: nada escondido en «⋯» si
 * Willy lo usa a diario. Es el mismo patrón que CLAUDE.md §2 lleva contado
 * treinta veces —la pieza existe, el camino no se ve—. En la lista del
 * catálogo el menú se queda (una hilera de botones por fila no cabría); en la
 * ficha hay sitio y se ponen a la vista. Los diálogos son los mismos.
 */
export function AccionesFicha({
  id,
  codigo,
  descripcion,
  stock,
  archivado,
  puedeEditar,
  puedeAjustarStock,
  clase,
}: {
  id: string;
  codigo: string;
  descripcion: string;
  stock: number;
  archivado: boolean;
  puedeEditar: boolean;
  puedeAjustarStock: boolean;
  /** Las clases del botón secundario de la cabecera, para que calcen. */
  clase?: string;
}) {
  const router = useRouter();
  const [dialogo, setDialogo] = React.useState<"ninguno" | "stock" | "archivar">("ninguno");

  return (
    <>
      {puedeAjustarStock && !archivado ? (
        <Button type="button" variant="outline" className={clase} onClick={() => setDialogo("stock")}>
          <PackageCheck aria-hidden="true" />
          Actualizar stock
        </Button>
      ) : null}

      {puedeEditar ? (
        <Button
          type="button"
          variant="outline"
          className={cn(clase)}
          onClick={() => setDialogo("archivar")}
        >
          {archivado ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
          {archivado ? "Reactivar producto" : "Dar de baja"}
        </Button>
      ) : null}

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
