import { EstadoError, EstadoVacio, Moneda } from "@rodatech/ui";

import { valorizacion } from "../api/consultas";
import type { FilaValorizacion } from "../dominio/tipos";

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

  /*
    SOLO SE DETALLA LO QUE TIENE STOCK (revisión por módulos del 02/10).

    El catálogo entró de un Excel y casi nada tiene saldo: de 47 subfamilias,
    cinco tienen unidades. La tabla las pintaba todas, y eran cuarenta y dos
    filas de «0 · $ 0.00» —más de 9.000 px en escritorio y 18.000 en el
    teléfono— para encontrar las cinco que dicen algo. Una cifra enterrada
    entre ceros vale lo mismo que una que no existe.

    Lo que no tiene stock no se esconde: se resume. Cada familia con saldo
    dice cuántas subfamilias suyas están a cero, y las familias enteras a cero
    van juntas en una línea al final, con sus productos.
  */
  const productos = (n: number) =>
    `${n.toLocaleString("es-PE")} ${n === 1 ? "producto" : "productos"}`;

  const conSaldo = (f: FilaValorizacion) =>
    Number(f.unidades ?? 0) !== 0 || Number(f.valor_costo ?? 0) !== 0;

  const familias = [...porFamilia.entries()].map(([familia, grupo]) => ({
    familia,
    visibles: grupo.filter(conSaldo),
    ocultas: grupo.filter((f) => !conSaldo(f)),
    sub: grupo.reduce(
      (a, f) => ({
        skus: a.skus + f.skus,
        unidades: a.unidades + Number(f.unidades ?? 0),
        costo: a.costo + Number(f.valor_costo ?? 0),
        venta: a.venta + Number(f.valor_venta ?? 0),
        margen: a.margen + Number(f.margen_potencial ?? 0),
      }),
      { skus: 0, unidades: 0, costo: 0, venta: 0, margen: 0 },
    ),
  }));

  const conStock = familias.filter((f) => f.visibles.length > 0);
  const vacias = familias.filter((f) => f.visibles.length === 0);

  const resumenVacias =
    vacias.length > 0 ? (
      <p className="text-sm text-[var(--fg-muted)]">
        <span className="font-medium text-[var(--fg)]">Sin stock: </span>
        {vacias
          .map((f) => `${f.familia} (${productos(f.sub.skus)})`)
          .join(" · ")}
      </p>
    ) : null;

  const textoOcultas = (n: number, skus: number) =>
    `y ${n} ${n === 1 ? "subfamilia" : "subfamilias"} más sin stock (${productos(skus)})`;

  return (
    <div className="@container">
      {/*
        EN MÓVIL, TARJETAS. Medido a 390 px: la tabla pide 595.

        Aquí la tabla es de DOS niveles —familia y debajo sus subfamilias—, y
        eso en una tabla con scroll lateral se pierde enseguida: se arrastra a
        la derecha y ya no se sabe de qué familia era la fila. Así que cada
        familia es una tarjeta con su total arriba y sus subfamilias dentro.

        Por ancho del contenedor y no de la ventana: a 820 con el menú abierto
        quedan ~500 px, y la tabla no cabía (revisión del 02/10).

        «A venta» se queda solo en escritorio: es la columna que se compara con
        el costo, y comparar dos cifras pide tenerlas en la misma línea.
      */}
      <div className="flex flex-col gap-2.5 p-3 @3xl:hidden">
        {conStock.map(({ familia, visibles, ocultas, sub }) => (
          <div key={familia} className="rounded-lg border border-[var(--border)] p-3">
            <p className="font-medium">{familia}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="text-[var(--fg-muted)]">
                {sub.skus} productos · {sub.unidades.toLocaleString("es-PE")} uds.
              </span>
              <span className="whitespace-nowrap">
                <span className="text-[var(--fg-muted)]">A costo </span>
                <Moneda valor={sub.costo} tamano="sm" enfasis="fuerte" />
              </span>
              <span className="whitespace-nowrap">
                <span className="text-[var(--fg-muted)]">Margen </span>
                <Moneda valor={sub.margen} tamano="sm" />
              </span>
            </div>

            <ul className="mt-2 divide-y divide-[var(--border-soft)] border-t border-[var(--border-soft)]">
              {visibles.map((f) => (
                <li
                  key={f.subfamilia_id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-sm"
                >
                  <span className="min-w-0 text-[var(--fg-muted)]">{f.subfamilia}</span>
                  <span className="flex items-baseline gap-3 whitespace-nowrap">
                    <span className="tabular">
                      {Number(f.unidades ?? 0).toLocaleString("es-PE")} uds.
                    </span>
                    <Moneda valor={f.valor_costo} tamano="sm" />
                  </span>
                </li>
              ))}
            </ul>
            {ocultas.length > 0 ? (
              <p className="mt-1 text-sm text-[var(--fg-subtle)]">
                {textoOcultas(
                  ocultas.length,
                  ocultas.reduce((a, f) => a + f.skus, 0),
                )}
              </p>
            ) : null}
          </div>
        ))}
        {resumenVacias ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-3">
            {resumenVacias}
          </div>
        ) : null}
      </div>

      <div className="hidden scroll-x @3xl:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
            <th className="px-4 py-2.5 font-medium">Familia / subfamilia</th>
            <th className="px-4 py-2.5 text-right font-medium">Productos</th>
            <th className="px-4 py-2.5 text-right font-medium">Unidades</th>
            <th className="px-4 py-2.5 text-right font-medium">A costo</th>
            <th className="hidden px-4 py-2.5 text-right font-medium 2xl:table-cell">
              A venta
            </th>
            <th className="px-4 py-2.5 text-right font-medium">Margen potencial</th>
          </tr>
        </thead>

        {conStock.map(({ familia, visibles, ocultas, sub }) => (
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
                <td className="hidden px-4 py-2 text-right 2xl:table-cell">
                  <Moneda valor={sub.venta} tamano="sm" />
                </td>
                <td className="px-4 py-2 text-right">
                  <Moneda valor={sub.margen} tamano="sm" />
                </td>
              </tr>

              {visibles.map((f) => (
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
                      <span className="ml-1 text-sm text-[var(--fg-subtle)]">
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
                  <td className="hidden px-4 py-2 text-right 2xl:table-cell">
                    <Moneda valor={f.valor_venta} tamano="sm" enfasis="suave" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Moneda valor={f.margen_potencial} tamano="sm" enfasis="suave" />
                  </td>
                </tr>
              ))}
              {ocultas.length > 0 ? (
                <tr className="border-b border-[var(--border-soft)]">
                  <td colSpan={6} className="px-4 py-2 pl-8 text-[var(--fg-subtle)]">
                    {textoOcultas(
                      ocultas.length,
                      ocultas.reduce((a, f) => a + f.skus, 0),
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
        ))}
      </table>
      {resumenVacias ? <div className="px-4 py-3">{resumenVacias}</div> : null}
      </div>
    </div>
  );
}
