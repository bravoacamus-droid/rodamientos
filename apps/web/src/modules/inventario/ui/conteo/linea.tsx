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
        <span className="block font-mono text-sm font-medium">{linea.codigo}</span>
        <span className="block text-sm text-[var(--fg-subtle)]">{linea.marca}</span>
      </td>

      <td className="max-w-xs px-2 py-2">
        <span className="block truncate text-sm" title={linea.descripcion}>
          {linea.descripcion}
        </span>
        <span className="block text-sm text-[var(--fg-subtle)]">
          {linea.subfamilia}
        </span>
      </td>

      <td className="px-2 py-2 text-right tabular text-sm text-[var(--fg-muted)]">
        {linea.cantidadSistema.toLocaleString("es-PE")}
        <span className="ml-1 text-sm text-[var(--fg-subtle)]">{linea.unidad}</span>
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

/**
 * La misma línea, en tarjeta, para cuando la tabla no cabe.
 *
 * Revisión por módulos del 02/10: a 390 la tabla pedía desplazarse de lado, y
 * al tocar el campo «Contado» el navegador la corría para enseñarlo y se
 * perdía el código —que es lo que se busca en la etiqueta de la caja—. Esta
 * hoja se rellena DE PIE en el almacén, teléfono en mano: ahí no se arrastra
 * una tabla. La tarjeta lleva lo mismo y el campo a lo ancho.
 */
export function TarjetaConteo({
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
    <li
      className={`rounded-lg border border-[var(--border)] p-3 ${
        diferencia !== null && diferencia !== 0 ? "bg-[var(--warn-bg)]/30" : ""
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-mono text-sm font-medium">{linea.codigo}</span>
        <span className="text-sm text-[var(--fg-subtle)]">{linea.marca}</span>
      </div>
      <p className="mt-0.5 text-sm">{linea.descripcion}</p>

      <div className="mt-2 grid grid-cols-2 items-end gap-3">
        <div className="text-sm">
          <span className="block text-[var(--fg-muted)]">En el sistema</span>
          <span className="tabular font-medium">
            {linea.cantidadSistema.toLocaleString("es-PE")}
          </span>{" "}
          <span className="text-[var(--fg-subtle)]">{linea.unidad}</span>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--fg-muted)]">Contado</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={linea.cantidadFisica ?? ""}
            onChange={(e) =>
              despachar({
                tipo: "contar",
                productoId: linea.productoId,
                valor: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            placeholder="sin contar"
            className="w-full text-right tabular"
            aria-label={`Cantidad contada de ${linea.codigo}`}
          />
        </label>
      </div>

      {diferencia !== null ? (
        <p className="mt-2 flex flex-wrap justify-between gap-x-3 text-sm">
          {diferencia === 0 ? (
            <span className="text-[var(--ok)]">Conforme</span>
          ) : (
            <span
              className={`font-medium ${
                diferencia > 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
              }`}
            >
              {diferencia > 0 ? "Sobran " : "Faltan "}
              {Math.abs(diferencia).toLocaleString("es-PE")}
            </span>
          )}
          {impacto !== null && impacto !== 0 ? (
            <span
              className={`tabular ${impacto < 0 ? "text-[var(--danger)]" : "text-[var(--ok)]"}`}
            >
              {impacto.toLocaleString("es-PE", { style: "currency", currency: "USD" })}
            </span>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}
