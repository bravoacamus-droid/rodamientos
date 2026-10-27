import { FileSpreadsheet } from "lucide-react";
import { Button, SelectNativo } from "@rodatech/ui";

import { nombreMes } from "../dominio/contador";

/**
 * «Excel para el contador»: elegir el mes y bajarlo (23/10).
 *
 * Un formulario GET normal, sin JavaScript: la ruta devuelve el archivo y el
 * navegador lo descarga sin salir de la pantalla. Viene marcado el mes
 * ANTERIOR, que es el que se le manda al contador — el en curso todavía no
 * está cerrado.
 */
export function ExcelContador({ hoy }: { hoy: string }) {
  const [a, m] = hoy.split("-").map(Number) as [number, number];
  const meses: string[] = [];
  for (let i = 0; i < 13; i++) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    meses.push(d.toISOString().slice(0, 7));
  }

  return (
    <form
      action="/reportes/contador"
      method="get"
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 className="text-base font-semibold">Excel para el contador</h2>
        <p className="text-base text-[var(--fg-muted)]">
          Las ventas y las compras del mes en soles, con el tipo de cambio de SUNAT de cada día.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="mes-contador">
          Mes
        </label>
        <SelectNativo id="mes-contador" name="mes" defaultValue={meses[1]} className="h-11 w-auto text-base">
          {meses.map((x) => (
            <option key={x} value={x}>
              {nombreMes(x)}
            </option>
          ))}
        </SelectNativo>
        {/*
        El botón de siempre, no el verde de Excel en hexadecimal que tenía:
        ese color no estaba en los tokens, no se ajustaba al tema oscuro y hacía
        que la misma acción —bajar un Excel— tuviera dos aspectos. El icono de
        hoja de cálculo es lo que dice que sale un Excel.
        */}
        <Button type="submit" size="lg" className="text-base [&_svg]:size-5">
          <FileSpreadsheet aria-hidden="true" />
          Descargar
        </Button>
      </div>
    </form>
  );
}
