import { EstadoError, EstadoVacio, Moneda } from "@rodatech/ui";

import { valorizacion } from "../api/consultas";

/**
 * Valorización del inventario por familia y subfamilia.
 *
 * Willy la pidió por su nombre (24:21): *su sistema actual no se la da*. La
 * agregación la hace Postgres en `v_valorizacion_inventario`.
 *
 * Se agrupa visualmente por familia con una fila de subtotal, porque «cuánto
 * tengo metido en rodamientos» es la pregunta que se hace primero, y
 * «en cuáles» la segunda.
 */
export async function TablaValorizacion() {
  const resultado = await valorizacion();

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo calcular la valorización"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const filas = resultado.datos;

  if (filas.length === 0) {
    return (
      <EstadoVacio
        titulo="No hay nada que valorizar"
        descripcion="Cuando el catálogo tenga productos con stock, aquí aparecerá cuánto vale."
      />
    );
  }

  // Se agrupa en el servidor: son decenas de filas y evita mandar la lógica de
  // agrupación al navegador.
  const porFamilia = new Map<string, typeof filas>();
  for (const f of filas) {
    const grupo = porFamilia.get(f.familia) ?? [];
    grupo.push(f);
    porFamilia.set(f.familia, grupo);
  }

  /* Los mismos subtotales que pinta la tabla, calculados una vez para poder
     usarlos también en las tarjetas sin repetir la reducción. */
  const porFamiliaConSub = [...porFamilia.entries()].map(([familia, grupo]) => ({
    familia,
    grupo,
    sub: grupo.reduce(
      (a, f) => ({
        skus: a.skus + f.skus,
        unidades: a.unidades + Number(f.unidades ?? 0),
        costo: a.costo + Number(f.valor_costo ?? 0),
        margen: a.margen + Number(f.margen_potencial ?? 0),
      }),
      { skus: 0, unidades: 0, costo: 0, margen: 0 },
    ),
  }));

  return (
    <>
      {/*
        EN MÓVIL, TARJETAS. Medido a 390 px: la tabla pide 595.

        Aquí la tabla es de DOS niveles —familia y debajo sus subfamilias—, y
        eso en una tabla con scroll lateral se pierde enseguida: se arrastra a
        la derecha y ya no se sabe de qué familia era la fila. Así que cada
        familia es una tarjeta con su total arriba y sus subfamilias dentro.

        «A venta» se queda solo en escritorio: es la columna que se compara con
        el costo, y comparar dos cifras pide tenerlas en la misma línea.
      */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {porFamiliaConSub.map(({ familia, grupo, sub }) => (
          <div key={familia} className="rounded-lg border border-[var(--border)] p-3">
            <p className="font-medium">{familia}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="text-[var(--fg-muted)]">
                {sub.skus} SKU · {sub.unidades.toLocaleString("es-PE")} uds.
              </span>
              <span>
                <span className="text-[var(--fg-muted)]">A costo </span>
                <Moneda valor={sub.costo} tamano="sm" enfasis="fuerte" />
              </span>
              <span>
                <span className="text-[var(--fg-muted)]">Margen </span>
                <Moneda valor={sub.margen} tamano="sm" />
              </span>
            </div>

            <ul className="mt-2 divide-y divide-[var(--border-soft)] border-t border-[var(--border-soft)]">
              {grupo.map((f) => (
                <li
                  key={f.subfamilia_id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-sm"
                >
                  <span className="min-w-0 text-[var(--fg-muted)]">{f.subfamilia}</span>
                  <span className="flex items-baseline gap-3">
                    <span className="tabular">
                      {Number(f.unidades ?? 0).toLocaleString("es-PE")} uds.
                    </span>
                    <Moneda valor={f.valor_costo} tamano="sm" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="hidden scroll-x md:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
            <th className="px-4 py-2.5 font-medium">Familia / subfamilia</th>
            <th className="px-4 py-2.5 text-right font-medium">SKU</th>
            <th className="px-4 py-2.5 text-right font-medium">Unidades</th>
            <th className="px-4 py-2.5 text-right font-medium">A costo</th>
            <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">
              A venta
            </th>
            <th className="px-4 py-2.5 text-right font-medium">Margen potencial</th>
          </tr>
        </thead>

        {[...porFamilia.entries()].map(([familia, grupo]) => {
          const sub = grupo.reduce(
            (a, f) => ({
              skus: a.skus + f.skus,
              conStock: a.conStock + f.skus_con_stock,
              unidades: a.unidades + Number(f.unidades ?? 0),
              costo: a.costo + Number(f.valor_costo ?? 0),
              venta: a.venta + Number(f.valor_venta ?? 0),
              margen: a.margen + Number(f.margen_potencial ?? 0),
            }),
            { skus: 0, conStock: 0, unidades: 0, costo: 0, venta: 0, margen: 0 },
          );

          return (
            <tbody key={familia}>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-sm font-medium">
                <td className="px-4 py-2">{familia}</td>
                <td className="px-4 py-2 text-right tabular">{sub.skus}</td>
                <td className="px-4 py-2 text-right tabular">
                  {sub.unidades.toLocaleString("es-PE")}
                </td>
                <td className="px-4 py-2 text-right">
                  <Moneda valor={sub.costo} tamano="sm" enfasis="fuerte" />
                </td>
                <td className="hidden px-4 py-2 text-right lg:table-cell">
                  <Moneda valor={sub.venta} tamano="sm" />
                </td>
                <td className="px-4 py-2 text-right">
                  <Moneda valor={sub.margen} tamano="sm" />
                </td>
              </tr>

              {grupo.map((f) => (
                <tr
                  key={f.subfamilia_id}
                  className="border-b border-[var(--border-soft)]"
                >
                  <td className="px-4 py-2 pl-8 text-[var(--fg-muted)]">
                    {f.subfamilia}
                  </td>
                  <td className="px-4 py-2 text-right tabular">
                    {f.skus}
                    {/* Los SKU sin stock son catálogo muerto o rotura: el
                        contraste con el total lo hace visible sin otra columna. */}
                    {f.skus_con_stock < f.skus ? (
                      <span className="ml-1 text-xs text-[var(--fg-subtle)]">
                        ({f.skus_con_stock} con stock)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right tabular">
                    {Number(f.unidades ?? 0).toLocaleString("es-PE")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Moneda valor={f.valor_costo} tamano="sm" />
                  </td>
                  <td className="hidden px-4 py-2 text-right lg:table-cell">
                    <Moneda valor={f.valor_venta} tamano="sm" enfasis="suave" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Moneda valor={f.margen_potencial} tamano="sm" enfasis="suave" />
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
      </div>
    </>
  );
}
