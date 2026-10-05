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

  const { filas, omitidos } = resultado.datos;

  // Lo que se deja fuera se dice, con su número: si no, «nada que reponer»
  // con 789 productos a cero se leería como que el almacén está lleno.
  const avisoOmitidos =
    omitidos > 0 ? (
      <p className="px-4 pb-4 pt-1 text-sm text-[var(--fg-muted)]">
        No se listan {omitidos.toLocaleString("es-PE")} productos que están a cero pero
        no tienen stock mínimo ni se han vendido en los últimos 90 días: no hay nada
        que reponer en ellos. Aparecerán aquí cuando se les ponga un mínimo o se
        vendan.
      </p>
    ) : null;

  if (filas.length === 0) {
    return (
      <>
        <EstadoVacio
          titulo="Nada que reponer"
          descripcion="Ningún producto está bajo su mínimo ni por encima de su máximo."
        />
        {avisoOmitidos}
      </>
    );
  }

  return (
    <div className="@container">
      {/*
        EN MÓVIL, TARJETAS.

        Medido a 390 px: la tabla pide 899 aun escondiendo tres columnas, y no
        es culpa de las columnas — es la descripción del producto, que no se
        deja encoger. Y esta pantalla se mira DENTRO del almacén, con el
        teléfono en la mano, que es justo donde el scroll lateral estorba.

        La tarjeta se queda con lo que hace falta ahí de pie: qué es, cuánto
        hay, y cuánto pedir. El mínimo/máximo y el inmovilizado se quedan en la
        tabla de escritorio, que es donde se analiza.

        Por ancho del contenedor (`@3xl`) y no de la ventana: a 820 con el
        menú abierto quedan ~500 px y la tabla se cortaba (revisión del 02/10).
      */}
      <div className="flex flex-col gap-2.5 p-3 @3xl:hidden">
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

      <div className="hidden scroll-x @3xl:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
            <th className="px-4 py-2.5 font-medium">Código</th>
            <th className="px-4 py-2.5 font-medium">Descripción</th>
            <th className="px-4 py-2.5 text-right font-medium">Stock</th>
            <th className="hidden px-4 py-2.5 text-right font-medium 2xl:table-cell">
              Mín / Máx
            </th>
            <th className="px-4 py-2.5 text-right font-medium">Cobertura</th>
            <th className="px-4 py-2.5 text-right font-medium">Sugerido</th>
            <th className="px-4 py-2.5 font-medium">Estado</th>
            <th className="hidden px-4 py-2.5 text-right font-medium 2xl:table-cell">
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
                  className="font-mono text-sm font-medium text-brand-600 hover:underline"
                >
                  {f.codigo}
                </Link>
              </td>
              {/* La marca va debajo de la descripción y no en su columna: a
                  1280 con el menú abierto la tabla no cabía y lo que se
                  cortaba era el ESTADO, la columna que manda (revisión del
                  02/10). */}
              <td className="max-w-xs px-4 py-2.5">
                <span className="block truncate" title={f.descripcion}>
                  {f.descripcion}
                </span>
                {f.marca ? (
                  <span className="block text-sm text-[var(--fg-subtle)]">{f.marca}</span>
                ) : null}
              </td>
              <td className="px-4 py-2.5 text-right tabular">
                {Number(f.stock ?? 0).toLocaleString("es-PE")}
              </td>
              <td className="hidden px-4 py-2.5 text-right tabular text-sm text-[var(--fg-muted)] 2xl:table-cell">
                {f.stock_minimo} / {f.stock_maximo || "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular">
                {/* Sin consumo en 90 días no se puede estimar cobertura. Decir
                    "0 días" sería mentir: puede que simplemente no se venda. */}
                {f.dias_cobertura === null ? (
                  <span className="text-sm text-[var(--fg-subtle)]">
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
                  className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-sm font-medium ${COLOR[f.estado_stock]}`}
                >
                  {ETIQUETA[f.estado_stock]}
                </span>
              </td>
              <td className="hidden px-4 py-2.5 text-right 2xl:table-cell">
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
      {avisoOmitidos}
    </div>
  );
}
