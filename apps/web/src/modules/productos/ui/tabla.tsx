import Link from "next/link";
import { EstadoError, EstadoVacio, Moneda, PaginacionKeyset } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { listarProductos } from "../api/consultas";
import {
  COLOR_STOCK,
  ETIQUETA_STOCK,
  type FiltrosProductos,
  type ProductoLista,
} from "../dominio/tipos";
import { AccionesFila } from "./acciones-fila";
import { abreviaturaUnidad } from "@rodatech/config";

/**
 * Tabla del catálogo.
 *
 * Conserva la composición de la demo. Cambian tres cosas:
 *
 *   · La marca es columna propia y no va dentro de la descripción (C2).
 *   · Donde había tres listas de precio ahora hay una sola.
 *   · Al final de cada fila hay un menú de acciones.
 *
 * Y en móvil NO es una tabla. Ocho columnas en un teléfono no se leen ni con
 * scroll horizontal, así que con la caja por debajo de `@3xl` cada producto es una tarjeta
 * con lo mismo pero apilado. Es el mismo dato y el mismo menú, no una versión
 * recortada.
 */
export async function TablaProductos({ filtros }: { filtros: FiltrosProductos }) {
  const [resultado, perfil] = await Promise.all([
    listarProductos(filtros),
    perfilActual(),
  ]);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el catálogo"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente, anterior } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = Boolean(
      filtros.q || filtros.marca || filtros.familia || filtros.subfamilia,
    );
    return (
      <EstadoVacio
        titulo={filtrando ? "Ningún producto coincide" : "El catálogo está vacío"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por código de fabricante."
            : "Crea el primero con «Nuevo producto», o carga el maestro desde Excel."
        }
      />
    );
  }

  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEditar = rol !== null && ["gerencia", "admin", "compras"].includes(rol);
  const puedeAjustarStock = rol !== null && ["gerencia", "admin", "almacen"].includes(rol);

  const permisos = { puedeEditar, puedeAjustarStock };

  return (
    <div className="@container">
      {/*
        Escritorio.

        Revisión por módulos del 02/10: con el menú abierto, a 1280 la tabla
        no cabía en su caja y «Precio venta» y «Estado» quedaban fuera, a la
        derecha, detrás de un desplazamiento lateral que nadie ve; y a 820 se
        enseñaba la tabla en 500 px, con la descripción cortada a la mitad.

        Ahora decide la CAJA (`@container`) y no la pantalla: por debajo de
        `@3xl` van las tarjetas. Y la tabla es `table-fixed`: cada columna
        tiene su ancho y la descripción se queda con lo que sobra, cortada con
        «…» y entera al pasar el ratón. El estado va debajo del stock, que es
        de lo que habla, en vez de ocupar una columna propia.
      */}
      <div className="scroll-x hidden @3xl:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-44" />
            <col className="w-28" />
            <col />
            <col className="w-32" />
            <col className="hidden w-32 2xl:table-column" />
            <col className="w-32" />
            <col className="w-14" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="px-3 py-2.5 font-medium">Código</th>
              <th className="px-3 py-2.5 font-medium">Marca</th>
              <th className="px-3 py-2.5 font-medium">Descripción</th>
              <th className="px-3 py-2.5 text-right font-medium">Stock</th>
              <th className="hidden px-3 py-2.5 text-right font-medium 2xl:table-cell">
                Costo prom.
              </th>
              <th className="px-3 py-2.5 text-right font-medium">Precio venta</th>
              <th className="sticky right-0 z-20 border-l border-[var(--border-soft)] bg-[var(--surface)] px-2 py-2.5">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr
                key={p.id}
                className={`border-b border-[var(--border-soft)] group/fila transition-colors hover:bg-[var(--surface-2)] ${
                  p.archivado ? "opacity-60" : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={`/productos/${p.id}`}
                    className="break-all font-mono text-sm font-medium text-brand-600 hover:underline"
                  >
                    {p.codigo}
                  </Link>
                  {/* Debajo y no al lado: al lado ensanchaba la columna. */}
                  {p.codigo_fabricante ? (
                    <span className="block break-all font-mono text-sm text-[var(--fg-subtle)]">
                      {p.codigo_fabricante}
                    </span>
                  ) : null}
                </td>
                <td className="break-words px-3 py-2.5">{p.marca}</td>
                <td className="px-3 py-2.5" title={p.descripcion}>
                  <span className="block truncate">{p.descripcion}</span>
                  <span className="block truncate text-sm text-[var(--fg-subtle)]">
                    {p.subfamilia}
                    {p.tipo ? ` · ${p.tipo}` : ""}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className="whitespace-nowrap tabular">
                    {p.stock.toLocaleString("es-PE")}
                    <span className="ml-1 text-sm text-[var(--fg-subtle)]">
                      {abreviaturaUnidad(p.unidad)}
                    </span>
                  </span>
                  <span className="mt-0.5 block">
                    <Estado p={p} />
                  </span>
                </td>
                <td className="hidden px-3 py-2.5 text-right 2xl:table-cell">
                  <Moneda valor={p.costo_promedio} tamano="sm" enfasis="suave" />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <Moneda valor={p.precio_venta} tamano="sm" />
                </td>
                <td className="sticky right-0 z-10 border-l border-[var(--border-soft)] bg-[var(--surface)] group-hover/fila:bg-[var(--surface-2)] px-2 py-1.5">
                  <AccionesFila
                    id={p.id}
                    codigo={p.codigo}
                    descripcion={p.descripcion}
                    stock={p.stock}
                    archivado={p.archivado}
                    {...permisos}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        Los productos, en tarjetas sueltas y con botones.

        Luis, 11/09: *«todo junto, apegado»*. Estaban pegados por una raya y en
        dos columnas —los datos a la izquierda, los tres puntos a la derecha—,
        así que la única manera de abrir un producto era pulsar el código o
        buscar el menú. Ahora «Ver» y «Cotizar» son botones, que es lo que se
        hace veinte veces al día, y el menú se queda con lo demás.

        El costo promedio NO baja al teléfono: es el único dato de esta lista
        que no se enseña fuera de la oficina.
      */}
      <ul className="flex flex-col gap-2.5 p-3 @3xl:hidden">
        {filas.map((p) => (
          <li
            key={p.id}
            className={`flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 ${
              p.archivado ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/productos/${p.id}`}
                  className="font-mono text-sm font-semibold text-brand-600"
                >
                  {p.codigo}
                </Link>
                {p.codigo_fabricante ? (
                  <span className="block font-mono text-sm text-[var(--fg-subtle)]">
                    {p.codigo_fabricante}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Estado p={p} />
                <AccionesFila
                  id={p.id}
                  codigo={p.codigo}
                  descripcion={p.descripcion}
                  stock={p.stock}
                  archivado={p.archivado}
                  {...permisos}
                />
              </div>
            </div>

            {/* Sin recortar a dos líneas: en la tabla la descripción compite
                con siete columnas; aquí tiene la tarjeta entera, y en este
                catálogo la diferencia entre dos rodamientos está al final de
                la descripción. */}
            <div>
              <p className="text-sm">{p.descripcion}</p>
              <p className="text-sm text-[var(--fg-subtle)]">
                {p.marca}
                {p.subfamilia ? ` · ${p.subfamilia}` : ""}
                {p.tipo ? ` · ${p.tipo}` : ""}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <Dato etiqueta="Stock">
                <span className="tabular">{p.stock.toLocaleString("es-PE")}</span>{" "}
                <span className="text-sm text-[var(--fg-subtle)]">{abreviaturaUnidad(p.unidad)}</span>
              </Dato>
              <Dato etiqueta="Precio venta">
                <Moneda valor={p.precio_venta} tamano="sm" />
              </Dato>
            </dl>

            <div className="flex items-center gap-1.5">
              <Link
                href={`/productos/${p.id}`}
                className={`${SECUNDARIO} flex-1 justify-center`}
              >
                Ver
              </Link>
              {/* Cotizar es el camino que se recorre veinte veces al día: no
                  puede vivir dentro del menú de los tres puntos. */}
              {!p.archivado ? (
                <Link
                  href={`/cotizaciones/nueva?producto=${p.id}`}
                  className={`${PRINCIPAL} flex-1 justify-center`}
                >
                  Cotizar
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="px-3 py-3 sm:px-4">
        <PaginacionKeyset
          porPagina={filtros.limite}
          cantidadEnPagina={filas.length}
          cursorSiguiente={siguiente}
          cursorAnterior={anterior}
        />
      </div>
    </div>
  );
}

function Estado({ p }: { p: ProductoLista }) {
  if (p.archivado) {
    return (
      <span className="inline-block rounded-sm bg-[var(--surface-2)] px-1.5 py-0.5 text-sm font-medium text-[var(--fg-muted)]">
        De baja
      </span>
    );
  }
  return (
    <span
      className={`inline-block rounded-sm px-1.5 py-0.5 text-sm font-medium ${COLOR_STOCK[p.estado_stock]}`}
    >
      {ETIQUETA_STOCK[p.estado_stock]}
    </span>
  );
}

/*
  Los dos botones de la tarjeta de móvil. Mismo aspecto que en guías y
  facturación: en esta casa un botón tiene que parecer un botón.
*/
const SECUNDARIO =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

const PRINCIPAL =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-brand-600 px-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

/**
 * Un dato de la tarjeta de móvil: su etiqueta encima, pequeña, y el valor
 * debajo.
 *
 * Sin cabecera de tabla que diga qué es cada cosa, cada dato tiene que
 * presentarse solo. La etiqueta va en 12 px porque no se lee, se reconoce; el
 * valor, en 14, que es el mínimo de esta casa.
 */
function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-[var(--fg-subtle)]">{etiqueta}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}
