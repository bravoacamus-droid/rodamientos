import { ChevronRight } from "lucide-react";
import { EstadoError, EstadoVacio, Moneda, cn } from "@rodatech/ui";

import { valorizacion } from "../api/consultas";
import type { FilaValorizacion } from "../dominio/tipos";

/**
 * Valorización del inventario por familia y subfamilia.
 *
 * Willy la pidió por su nombre (24:21): *su sistema actual no se la da*. La
 * agregación la hace Postgres en `v_valorizacion_inventario`.
 *
 * Desde el 19/11 cada familia es un bloque con su color que se abre y se
 * cierra. Luis: *«las listas están muy largas, todo de igual, dale más
 * color»*. Eran sesenta filas grises seguidas; ahora se ven las familias con
 * su total y su peso, y las subfamilias solo de la que se abra.
 *
 * `<details>` y no un componente de cliente: abrir y cerrar es del navegador,
 * se puede con el teclado, y la pantalla sigue sin mandar JavaScript.
 */

/** Un color por familia, en el orden en que salen (de la que más vale a la que menos). */
const COLORES = [
  { barra: "bg-sky-600", filo: "border-l-sky-600", punto: "bg-sky-600", suave: "bg-sky-50 dark:bg-sky-950/30" },
  { barra: "bg-amber-500", filo: "border-l-amber-500", punto: "bg-amber-500", suave: "bg-amber-50 dark:bg-amber-950/30" },
  { barra: "bg-emerald-600", filo: "border-l-emerald-600", punto: "bg-emerald-600", suave: "bg-emerald-50 dark:bg-emerald-950/30" },
  { barra: "bg-violet-600", filo: "border-l-violet-600", punto: "bg-violet-600", suave: "bg-violet-50 dark:bg-violet-950/30" },
  { barra: "bg-rose-500", filo: "border-l-rose-500", punto: "bg-rose-500", suave: "bg-rose-50 dark:bg-rose-950/30" },
  { barra: "bg-indigo-500", filo: "border-l-indigo-500", punto: "bg-indigo-500", suave: "bg-indigo-50 dark:bg-indigo-950/30" },
  { barra: "bg-slate-500", filo: "border-l-slate-500", punto: "bg-slate-500", suave: "bg-slate-50 dark:bg-slate-900/40" },
] as const;

const color = (i: number) => COLORES[i % COLORES.length]!;

const nf = (n: number) => n.toLocaleString("es-PE");
const productos = (n: number) => `${nf(n)} ${n === 1 ? "producto" : "productos"}`;
const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0);

function Cifra({ etiqueta, children, className }: { etiqueta: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("flex flex-col items-end", className)}>
      <span className="text-sm text-[var(--fg-muted)]">{etiqueta}</span>
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
}

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

  const porFamilia = new Map<string, FilaValorizacion[]>();
  for (const f of filas) {
    const grupo = porFamilia.get(f.familia) ?? [];
    grupo.push(f);
    porFamilia.set(f.familia, grupo);
  }

  /*
    SOLO SE DETALLA LO QUE TIENE STOCK (revisión por módulos del 02/10).

    El catálogo entró de un Excel y casi nada tiene saldo. Lo que no tiene
    stock no se esconde: se resume. Cada familia dice cuántas subfamilias
    suyas están a cero, y las familias enteras a cero van juntas al final.
  */
  const conSaldo = (f: FilaValorizacion) =>
    Number(f.unidades ?? 0) !== 0 || Number(f.valor_costo ?? 0) !== 0;

  const familias = [...porFamilia.entries()]
    .map(([familia, grupo]) => ({
      familia,
      visibles: grupo.filter(conSaldo).sort((a, b) => Number(b.valor_venta) - Number(a.valor_venta)),
      ocultas: grupo.filter((f) => !conSaldo(f)),
      sub: grupo.reduce(
        (a, f) => ({
          skus: a.skus + f.skus,
          conStock: a.conStock + f.skus_con_stock,
          unidades: a.unidades + Number(f.unidades ?? 0),
          costo: a.costo + Number(f.valor_costo ?? 0),
          venta: a.venta + Number(f.valor_venta ?? 0),
          margen: a.margen + Number(f.margen_potencial ?? 0),
        }),
        { skus: 0, conStock: 0, unidades: 0, costo: 0, venta: 0, margen: 0 },
      ),
    }))
    // De la que más vale a la que menos: la primera pregunta es «dónde tengo
    // metido el dinero», y la respuesta tiene que estar arriba.
    .sort((a, b) => b.sub.venta - a.sub.venta);

  const conStock = familias.filter((f) => f.visibles.length > 0);
  const vacias = familias.filter((f) => f.visibles.length === 0);

  /*
    El reparto va por el valor A VENTA y no a costo, y lo dice. Casi ningún
    producto tiene costo cargado (CLAUDE.md §2): a costo, una barra de cinco
    familias salía con una sola y el resto a 0 %, que no es cómo está
    repartido el almacén sino cómo está de incompleto el catálogo.
  */
  const totalVenta = conStock.reduce((a, f) => a + Math.max(f.sub.venta, 0), 0);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* ------------------------------------------------- Reparto */}
      {totalVenta > 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-sm font-semibold">Cómo se reparte el almacén, por valor a venta</p>
          <div
            className="mt-2 flex h-4 w-full overflow-hidden rounded-full bg-[var(--border-soft)]"
            role="img"
            aria-label={conStock
              .map((f) => `${f.familia} ${Math.round(pct(Math.max(f.sub.venta, 0), totalVenta))} %`)
              .join(", ")}
          >
            {conStock.map((f, i) => (
              <span
                key={f.familia}
                className={cn("h-full", color(i).barra)}
                style={{ width: `${pct(Math.max(f.sub.venta, 0), totalVenta)}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {conStock.map((f, i) => (
              <li key={f.familia} className="flex items-center gap-2 text-sm">
                <span className={cn("size-3 rounded-full", color(i).punto)} aria-hidden="true" />
                <span className="font-medium">{f.familia}</span>
                <span className="tabular text-[var(--fg-muted)]">
                  {Math.round(pct(Math.max(f.sub.venta, 0), totalVenta))} %
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ------------------------------------------------- Familias */}
      <div className="flex flex-col gap-2.5">
        {conStock.map(({ familia, visibles, ocultas, sub }, i) => {
          const c = color(i);
          const parte = Math.round(pct(Math.max(sub.venta, 0), totalVenta));
          return (
            <details
              key={familia}
              // La primera, la que más vale, abierta: que la pantalla enseñe
              // cómo es una por dentro sin tener que descubrirlo.
              open={i === 0}
              className={cn(
                "@container group rounded-lg border border-l-4 border-[var(--border)] bg-[var(--surface)] transition-shadow open:shadow-md",
                c.filo,
              )}
            >
              <summary
                className={cn(
                  "flex cursor-pointer list-none flex-wrap items-center gap-x-6 gap-y-3 rounded-r-lg p-4 hover:bg-[var(--surface-2)] group-open:rounded-b-none [&::-webkit-details-marker]:hidden",
                )}
              >
                <span className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)]"
                    aria-hidden="true"
                  >
                    <ChevronRight className="size-5 transition-transform group-open:rotate-90" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-lg font-bold text-[var(--titulo)]">{familia}</span>
                    <span className="block text-sm text-[var(--fg-muted)]">
                      {productos(sub.skus)} · {nf(sub.conStock)} con stock · {nf(sub.unidades)} uds.
                    </span>
                  </span>
                </span>

                <span className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <Cifra etiqueta="A costo">
                    <Moneda valor={sub.costo} tamano="sm" enfasis="fuerte" />
                  </Cifra>
                  <Cifra etiqueta="A venta">
                    <Moneda valor={sub.venta} tamano="sm" />
                  </Cifra>
                  <Cifra etiqueta="Margen potencial" className="text-emerald-700 dark:text-emerald-300">
                    <Moneda valor={sub.margen} tamano="sm" enfasis="fuerte" />
                  </Cifra>
                  <span className="flex w-32 flex-col gap-1">
                    <span className="text-right text-sm">
                      <span className="font-semibold tabular">{parte} %</span>
                      <span className="text-[var(--fg-muted)]"> del total</span>
                    </span>
                    <span className="h-2 w-full overflow-hidden rounded-full bg-[var(--border-soft)]">
                      <span className={cn("block h-full rounded-full", c.barra)} style={{ width: `${parte}%` }} />
                    </span>
                  </span>
                </span>
              </summary>

              {/* --------------------------------------------- Subfamilias */}
              <div className={cn("border-t border-[var(--border-soft)] px-4 pb-4 pt-3", c.suave)}>
                <div className="hidden grid-cols-[minmax(0,1fr)_10rem_6rem_8rem_8rem_8rem] gap-x-4 px-3 pb-2 text-sm font-semibold text-[var(--fg-muted)] @3xl:grid">
                  <span>Subfamilia</span>
                  <span className="text-right">Productos</span>
                  <span className="text-right">Unidades</span>
                  <span className="text-right">A costo</span>
                  <span className="text-right">A venta</span>
                  <span className="text-right">Margen</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {visibles.map((f) => {
                    const dentro = Math.round(pct(Math.max(Number(f.valor_venta), 0), Math.max(sub.venta, 0)));
                    return (
                      <li
                        key={f.subfamilia_id}
                        className="grid grid-cols-2 items-center gap-x-4 gap-y-2 rounded-md bg-[var(--surface)] px-3 py-2.5 text-sm shadow-[0_1px_0_var(--border-soft)] @3xl:grid-cols-[minmax(0,1fr)_10rem_6rem_8rem_8rem_8rem]"
                      >
                        <span className="col-span-2 min-w-0 @3xl:col-span-1">
                          <span className="block font-medium">{f.subfamilia}</span>
                          {/* Cuánto pesa dentro de su familia, en una raya fina. */}
                          <span className="mt-1 flex items-center gap-2">
                            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--border-soft)]">
                              <span className={cn("block h-full", c.barra)} style={{ width: `${dentro}%` }} />
                            </span>
                            <span className="tabular text-[var(--fg-subtle)]">{dentro} %</span>
                          </span>
                        </span>
                        {/* En el teléfono, dos por fila con la etiqueta
                            ENCIMA de la cifra: al lado, «A costo» y la cifra
                            no cabían juntas y se partían en dos renglones. */}
                        <span className="flex flex-col @3xl:block @3xl:text-right">
                          <span className="text-[var(--fg-muted)] @3xl:hidden">Productos</span>
                          <span className="tabular">
                            {nf(f.skus)}
                            {/* Los SKU sin stock son catálogo muerto o rotura. */}
                            {f.skus_con_stock < f.skus ? (
                              <span className="text-[var(--fg-subtle)]"> ({nf(f.skus_con_stock)} con stock)</span>
                            ) : null}
                          </span>
                        </span>
                        <span className="flex flex-col @3xl:block @3xl:text-right">
                          <span className="text-[var(--fg-muted)] @3xl:hidden">Unidades</span>
                          <span className="tabular">{nf(Number(f.unidades ?? 0))}</span>
                        </span>
                        <span className="flex flex-col @3xl:block @3xl:text-right">
                          <span className="text-[var(--fg-muted)] @3xl:hidden">A costo</span>
                          <Moneda valor={f.valor_costo} tamano="sm" />
                        </span>
                        <span className="flex flex-col @3xl:block @3xl:text-right">
                          <span className="text-[var(--fg-muted)] @3xl:hidden">A venta</span>
                          <Moneda valor={f.valor_venta} tamano="sm" enfasis="suave" />
                        </span>
                        <span className="flex flex-col @3xl:block @3xl:text-right">
                          <span className="text-[var(--fg-muted)] @3xl:hidden">Margen</span>
                          <Moneda valor={f.margen_potencial} tamano="sm" />
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {ocultas.length > 0 ? (
                  <p className="mt-2 px-3 text-sm text-[var(--fg-muted)]">
                    Y {ocultas.length} {ocultas.length === 1 ? "subfamilia" : "subfamilias"} más sin stock (
                    {productos(ocultas.reduce((a, f) => a + f.skus, 0))})
                  </p>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>

      {vacias.length > 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] p-3 text-sm">
          <span className="font-semibold">Familias sin stock: </span>
          <span className="text-[var(--fg-muted)]">
            {vacias.map((f) => `${f.familia} (${productos(f.sub.skus)})`).join(" · ")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
