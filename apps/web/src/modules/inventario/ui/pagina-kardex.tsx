import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileDown, FileSpreadsheet } from "lucide-react";
import { Skeleton, buttonVariants, cn } from "@rodatech/ui";

import { PanelModulo } from "@/componentes/panel-modulo";
import { leerCuantos } from "@/lib/ver-mas";

import { opcionesDelKardex, productoDelKardex } from "../api/consultas";
import { filtrosAQuery, leerFiltrosKardex } from "../dominio/filtros-kardex";
import type { FiltrosKardex } from "../dominio/tipos";
import { FiltrosKardexBarra } from "./filtros-kardex";
import { ResumenDelKardex } from "./resumen-kardex";
import { TANDA_KARDEX, TablaKardex } from "./tabla-kardex";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Los de la cabecera de Productos: 44 px en el teléfono, y el vidrio del
// panel se aclara al pasar el ratón (la letra del panel es blanca).
const BOTON_SECUNDARIO = cn(
  buttonVariants({ variant: "outline" }),
  "h-11 md:h-control-md hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]",
);

/**
 * Kardex.
 *
 * El libro mayor del almacén: cada entrada y salida con el saldo que dejó. Es
 * la fuente de verdad del stock —las copias en `stock` y `productos` existen
 * solo por rendimiento—, así que esta pantalla es la que permite explicar por
 * qué un producto tiene el costo que tiene.
 *
 * Filtrado por un producto, se convierte en su ficha de kardex, que es como se
 * llega desde el catálogo. Desde el 19/11 se busca por producto aquí mismo,
 * se filtra por familia, marca y quién lo hizo, y lo filtrado se baja en
 * Excel o PDF.
 */
export default async function PaginaKardex({ searchParams }: Props) {
  const sp = await searchParams;

  const filtros: FiltrosKardex = {
    ...leerFiltrosKardex(sp),
    // Sin páginas (19/11): la lista empieza en 20 y crece con «Ver más».
    limite: leerCuantos(sp.n, TANDA_KARDEX),
  };

  const [producto, opciones] = await Promise.all([
    filtros.producto ? productoDelKardex(filtros.producto) : Promise.resolve(null),
    opcionesDelKardex(),
  ]);
  const p = producto?.ok ? producto.datos : null;
  const o = opciones.ok ? opciones.datos : { familias: [], subfamilias: [], marcas: [], usuarios: [] };
  const query = filtrosAQuery(filtros);
  const sufijo = query ? `?${query}` : "";
  // Sin la paginación: el resumen es del filtro entero, no de la página.
  const claveResumen = JSON.stringify({ ...filtros, cursor: undefined, direccion: undefined, limite: undefined });

  return (
    <div className="flex flex-col gap-5">
      {/*
        EL TÍTULO ARRIBA, Y LO QUE SE MOVIÓ DEBAJO (19/11).

        Luis: «que arriba salga la información o el título de kardex». Entre
        la etiqueta del módulo y el título iba el botón «Volver a inventario»,
        así que lo primero que se leía era un botón y no dónde se estaba.
        Ahora «Volver» va con los demás botones, a la derecha, y debajo del
        título salen las cifras de lo filtrado, como en Inventario.
      */}
      <PanelModulo ruta="/inventario/kardex">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Kardex</h1>
              {p ? (
                // El kardex de UN producto (27/11): su código en grande y en
                // letra de máquina, y el saldo como cifra, no perdidos en una
                // línea gris de 14 px. Más un camino de vuelta a su ficha,
                // que es de donde se suele venir.
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div className="min-w-0">
                    <p className="font-mono text-2xl font-extrabold text-[var(--titulo)] [overflow-wrap:anywhere]">
                      {p.codigo}
                    </p>
                    <p className="text-base text-[var(--fg-muted)]">{p.descripcion}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2">
                    <span className="block text-sm font-semibold text-[var(--fg-muted)]">Saldo actual</span>
                    <span
                      className={`tabular text-3xl font-extrabold leading-tight ${
                        p.stock <= 0 ? "text-[var(--danger)]" : "text-[var(--titulo)]"
                      }`}
                    >
                      {p.stock}
                    </span>
                    {p.stock <= 0 ? (
                      <span className="ml-2 text-base font-bold text-[var(--danger)]">Sin stock</span>
                    ) : null}
                  </div>
                  <Link href={`/productos/${filtros.producto}`} className={BOTON_SECUNDARIO}>
                    Ver ficha del producto
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-[var(--fg-muted)]">
                  Cada entrada y salida del almacén, con el saldo que dejó.
                </p>
              )}
            </div>
            {/*
              Bajar lo filtrado (Luis, 19/11: «dinámico con los filtros, pueda
              exportarlo por Excel y PDF»). Llevan los filtros de la pantalla,
              sin la página: se baja todo lo que coincide, no solo lo visible.
            */}
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/inventario" className={BOTON_SECUNDARIO}>
                <ArrowLeft aria-hidden="true" />
                Volver a inventario
              </Link>
              <a href={`/inventario/kardex/excel${sufijo}`} className={BOTON_SECUNDARIO}>
                <FileSpreadsheet aria-hidden="true" />
                Descargar en Excel
              </a>
              <a href={`/inventario/kardex/pdf${sufijo}`} target="_blank" rel="noopener" className={BOTON_SECUNDARIO}>
                <FileDown aria-hidden="true" />
                Descargar PDF
              </a>
            </div>
          </div>
        </div>

        <Suspense key={claveResumen} fallback={<Skeleton className="h-28 w-full bg-white/10" />}>
          <ResumenDelKardex filtros={filtros} />
        </Suspense>
      </PanelModulo>

      <section className="card pt-4">
        <FiltrosKardexBarra
          productoActivo={p?.codigo ?? null}
          familias={o.familias}
          subfamilias={o.subfamilias}
          marcas={o.marcas}
          usuarios={o.usuarios}
        />

        <Suspense
          // La clave fuerza un skeleton nuevo en cada cambio de filtro; sin
          // ella React reutiliza el árbol y la tabla se queda con los datos
          // viejos hasta que llega la consulta.
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaKardex filtros={filtros} query={query} />
        </Suspense>
      </section>
    </div>
  );
}
