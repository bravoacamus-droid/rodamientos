import Link from "next/link";
import { EstadoError, EstadoVacio, Moneda } from "@rodatech/ui";

import { reposicion } from "../api/consultas";
import type { EstadoStock } from "../dominio/tipos";

const ETIQUETA: Record<EstadoStock, string> = {
  negativo: "Negativo",
  sin_stock: "Sin stock",
  critico: "Por agotarse",
  sobrestock: "Sobrestock",
  normal: "Normal",
};

const COLOR: Record<EstadoStock, string> = {
  negativo: "bg-[var(--danger-bg)] text-[var(--danger)]",
  sin_stock: "bg-[var(--danger-bg)] text-[var(--danger)]",
  critico: "bg-[var(--warn-bg)] text-[var(--warn)]",
  sobrestock: "bg-[var(--info-bg)] text-[var(--info)]",
  normal: "bg-[var(--ok-bg)] text-[var(--ok)]",
};

/**
 * Lo que hay que reponer y lo que sobra, en la misma tabla.
 *
 * El sobrestock va aquí a propósito y no en otra pantalla: *"tengo 80
 * rodamientos que no sé cómo vender"* (25:21) es capital inmovilizado, y a
 * Willy le duele igual que un quiebre. Separarlos obligaría a mirar dos sitios
 * para responder a la misma pregunta —¿dónde está mal repartido mi dinero?—.
 *
 * `dias_cobertura` es la columna que manda: traduce el saldo a tiempo, que es
 * como se decide comprar. Sale del consumo real de los últimos 90 días.
 */
export async function TablaReposicion() {
  const resultado = await reposicion();

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la reposición"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const filas = resultado.datos;

  if (filas.length === 0) {
    return (
      <EstadoVacio
        titulo="Nada que reponer"
        descripcion="Ningún producto está bajo su mínimo ni por encima de su máximo. Es la única pantalla del ERP donde estar vacía es una buena noticia."
      />
    );
  }

  return (
    <div className="scroll-x">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
            <th className="px-4 py-2.5 font-medium">Código</th>
            <th className="hidden px-4 py-2.5 font-medium md:table-cell">Marca</th>
            <th className="px-4 py-2.5 font-medium">Descripción</th>
            <th className="px-4 py-2.5 text-right font-medium">Stock</th>
            <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">
              Mín / Máx
            </th>
            <th className="px-4 py-2.5 text-right font-medium">Cobertura</th>
            <th className="px-4 py-2.5 text-right font-medium">Sugerido</th>
            <th className="px-4 py-2.5 font-medium">Estado</th>
            <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">
              Inmovilizado
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr
              key={f.id}
              className="border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)]"
            >
              <td className="px-4 py-2.5">
                <Link
                  href={`/productos/${f.id}`}
                  className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                >
                  {f.codigo}
                </Link>
              </td>
              <td className="hidden whitespace-nowrap px-4 py-2.5 md:table-cell">
                {f.marca}
              </td>
              <td className="max-w-xs px-4 py-2.5">
                <span className="block truncate">{f.descripcion}</span>
              </td>
              <td className="px-4 py-2.5 text-right tabular">
                {Number(f.stock ?? 0).toLocaleString("es-PE")}
              </td>
              <td className="hidden px-4 py-2.5 text-right tabular text-[0.75rem] text-[var(--fg-muted)] lg:table-cell">
                {f.stock_minimo} / {f.stock_maximo || "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular">
                {/* Sin consumo en 90 días no se puede estimar cobertura. Decir
                    "0 días" sería mentir: puede que simplemente no se venda. */}
                {f.dias_cobertura === null ? (
                  <span className="text-[0.75rem] text-[var(--fg-subtle)]">
                    sin consumo
                  </span>
                ) : (
                  <span
                    className={
                      f.dias_cobertura <= 7 ? "font-medium text-[var(--danger)]" : ""
                    }
                  >
                    {f.dias_cobertura} d
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right tabular">
                {f.sugerido_comprar > 0
                  ? Number(f.sugerido_comprar).toLocaleString("es-PE")
                  : "—"}
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={`inline-block rounded-sm px-1.5 py-0.5 text-[0.7rem] font-medium ${COLOR[f.estado_stock]}`}
                >
                  {ETIQUETA[f.estado_stock]}
                </span>
              </td>
              <td className="hidden px-4 py-2.5 text-right lg:table-cell">
                {/* Solo tiene sentido para el sobrestock: es el dinero parado. */}
                {f.estado_stock === "sobrestock" ? (
                  <Moneda valor={f.valorizado} tamano="sm" />
                ) : (
                  <span className="text-[var(--fg-subtle)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
