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
    <>
      {/*
        EN MÓVIL, TARJETAS.

        Medido a 390 px: la tabla pide 899 aun escondiendo tres columnas, y no
        es culpa de las columnas — es la descripción del producto, que no se
        deja encoger. Y esta pantalla se mira DENTRO del almacén, con el
        teléfono en la mano, que es justo donde el scroll lateral estorba.

        La tarjeta se queda con lo que hace falta ahí de pie: qué es, cuánto
        hay, y cuánto pedir. El mínimo/máximo y el inmovilizado se quedan en la
        tabla de escritorio, que es donde se analiza.
      */}
      <div className="flex flex-col gap-2.5 p-3 md:hidden">
        {filas.map((f) => (
          <div key={f.id} className="rounded-lg border border-[var(--border)] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                href={`/productos/${f.id}`}
                className="font-mono text-sm font-medium text-brand-600 hover:underline"
              >
                {f.codigo}
              </Link>
              <span
                className={`inline-block rounded-sm px-1.5 py-0.5 text-sm font-medium ${COLOR[f.estado_stock]}`}
              >
                {ETIQUETA[f.estado_stock]}
              </span>
            </div>

            <p className="mt-1 text-sm">{f.descripcion}</p>
            {f.marca ? (
              <p className="text-sm text-[var(--fg-subtle)]">{f.marca}</p>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-sm">
                <span className="text-[var(--fg-muted)]">Hay </span>
                <span className="tabular font-medium">
                  {Number(f.stock ?? 0).toLocaleString("es-PE")}
                </span>
              </span>

              {f.sugerido_comprar > 0 ? (
                <span className="text-sm">
                  <span className="text-[var(--fg-muted)]">Pedir </span>
                  <span className="tabular font-medium">
                    {Number(f.sugerido_comprar).toLocaleString("es-PE")}
                  </span>
                </span>
              ) : null}

              <span className="text-sm">
                <span className="text-[var(--fg-muted)]">Dura </span>
                {f.dias_cobertura === null ? (
                  <span className="text-[var(--fg-subtle)]">sin consumo</span>
                ) : (
                  <span
                    className={`tabular ${
                      f.dias_cobertura <= 7 ? "font-medium text-[var(--danger)]" : ""
                    }`}
                  >
                    {f.dias_cobertura} d
                  </span>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden scroll-x md:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
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
              <td className="hidden px-4 py-2.5 text-right tabular text-xs text-[var(--fg-muted)] lg:table-cell">
                {f.stock_minimo} / {f.stock_maximo || "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular">
                {/* Sin consumo en 90 días no se puede estimar cobertura. Decir
                    "0 días" sería mentir: puede que simplemente no se venda. */}
                {f.dias_cobertura === null ? (
                  <span className="text-xs text-[var(--fg-subtle)]">
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
                  className={`inline-block rounded-sm px-1.5 py-0.5 text-xs font-medium ${COLOR[f.estado_stock]}`}
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
    </>
  );
}
