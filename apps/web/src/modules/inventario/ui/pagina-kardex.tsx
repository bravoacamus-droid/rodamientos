import { Suspense } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { Skeleton, buttonVariants, cn, leerTamano } from "@rodatech/ui";

import { Volver } from "@/componentes/volver";
import { PanelModulo } from "@/componentes/panel-modulo";

import { opcionesDelKardex, productoDelKardex } from "../api/consultas";
import { filtrosAQuery, leerFiltrosKardex } from "../dominio/filtros-kardex";
import type { FiltrosKardex } from "../dominio/tipos";
import { FiltrosKardexBarra } from "./filtros-kardex";
import { ResumenDelKardex } from "./resumen-kardex";
import { TablaKardex } from "./tabla-kardex";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Toma el primer valor de un search param, que puede venir repetido. */
function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
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
    cursor: uno(sp.cursor),
    direccion: uno(sp.dir) === "ant" ? "ant" : "sig",
    limite: leerTamano(uno(sp.n)),
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
      {/* «Volver» arriba y con el de todas las fichas (revisión por módulos del
          02/10): era un enlace con borde hecho a mano, a la derecha del título
          en escritorio y debajo en el teléfono. */}
      <PanelModulo ruta="/inventario/kardex">
        <div className="flex flex-col gap-1">
          <Volver href="/inventario">Volver a inventario</Volver>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Kardex</h1>
              {p ? (
                <p className="text-sm text-[var(--fg-muted)]">
                  <span className="font-mono font-medium">{p.codigo}</span> · {p.descripcion} · saldo actual{" "}
                  <span className="tabular font-medium text-[var(--fg)]">{p.stock}</span>
                </p>
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
      </PanelModulo>

      <section className="card pt-4">
        <FiltrosKardexBarra
          productoActivo={p?.codigo ?? null}
          familias={o.familias}
          subfamilias={o.subfamilias}
          marcas={o.marcas}
          usuarios={o.usuarios}
        />

        <Suspense key={claveResumen} fallback={<Skeleton className="mx-4 mb-4 h-20" />}>
          <ResumenDelKardex filtros={filtros} />
        </Suspense>

        <Suspense
          // La clave fuerza un skeleton nuevo en cada cambio de filtro; sin
          // ella React reutiliza el árbol y la tabla se queda con los datos
          // viejos hasta que llega la consulta.
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaKardex filtros={filtros} />
        </Suspense>
      </section>
    </div>
  );
}
