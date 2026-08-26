"use client";

import { Input } from "@rodatech/ui";

import { diferenciaDe, type Accion, type LineaConteo } from "../../dominio/ajuste";

/**
 * Una línea de la hoja de conteo.
 *
 * El campo admite quedarse VACÍO, y eso no es un cero: es «nadie ha contado
 * esto todavía». La distinción manda, porque un cero declarado vacía el
 * producto y una línea en blanco no se manda siquiera.
 */
export function FilaConteo({
  linea,
  despachar,
}: {
  linea: LineaConteo;
  despachar: (a: Accion) => void;
}) {
  const diferencia = diferenciaDe(linea);
  const impacto =
    diferencia === null
      ? null
      : Math.round(diferencia * linea.costoUnitario * 100) / 100;

  return (
    <tr
      className={`border-b border-[var(--border-soft)] last:border-0 ${
        diferencia !== null && diferencia !== 0 ? "bg-[var(--warn-bg)]/30" : ""
      }`}
    >
      <td className="px-2 py-2">
        <span className="block font-mono text-[0.8rem] font-medium">{linea.codigo}</span>
        <span className="block text-xs text-[var(--fg-subtle)]">{linea.marca}</span>
      </td>

      <td className="max-w-xs px-2 py-2">
        <span className="block truncate text-sm" title={linea.descripcion}>
          {linea.descripcion}
        </span>
        <span className="block text-xs text-[var(--fg-subtle)]">
          {linea.subfamilia}
        </span>
      </td>

      <td className="px-2 py-2 text-right tabular text-sm text-[var(--fg-muted)]">
        {linea.cantidadSistema.toLocaleString("es-PE")}
        <span className="ml-1 text-xs text-[var(--fg-subtle)]">{linea.unidad}</span>
      </td>

      <td className="px-2 py-2">
        <Input
          type="number"
          min={0}
          step="0.01"
          // Cadena vacía y no `0`: un input numérico con 0 puesto invita a
          // dejarlo, y dejarlo significaría declarar el producto agotado.
          value={linea.cantidadFisica ?? ""}
          onChange={(e) =>
            despachar({
              tipo: "contar",
              productoId: linea.productoId,
              valor: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          placeholder="sin contar"
          className="w-28 text-right tabular"
          aria-label={`Cantidad contada de ${linea.codigo}`}
        />
      </td>

      <td className="px-2 py-2 text-right tabular text-sm">
        {diferencia === null ? (
          <span className="text-[var(--fg-subtle)]">—</span>
        ) : diferencia === 0 ? (
          <span className="text-[var(--ok)]">conforme</span>
        ) : (
          <span
            className={`font-medium ${
              diferencia > 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
            }`}
          >
            {diferencia > 0 ? "+" : ""}
            {diferencia.toLocaleString("es-PE")}
          </span>
        )}
      </td>

      <td className="px-2 py-2 text-right tabular text-sm">
        {impacto === null || impacto === 0 ? (
          <span className="text-[var(--fg-subtle)]">—</span>
        ) : (
          <span className={impacto < 0 ? "text-[var(--danger)]" : "text-[var(--ok)]"}>
            {impacto.toLocaleString("es-PE", { style: "currency", currency: "USD" })}
          </span>
        )}
      </td>
    </tr>
  );
}
