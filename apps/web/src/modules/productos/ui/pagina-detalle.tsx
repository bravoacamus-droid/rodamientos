import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EstadoError, Moneda } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { proveedoresDeProducto } from "@/modules/proveedores";

import { productoConDetalle } from "../api/consultas";
import { AccionesFila } from "./acciones-fila";
import { QuienLoVende } from "./quien-lo-vende";

/**
 * Ficha de un producto.
 *
 * Es el «ver producto» del menú: todo lo que hace falta saber antes de
 * cotizarlo o de reponerlo, sin entrar a editar. Lo que se puede tocar está en
 * el mismo menú de tres puntos que en el listado, para que la acción esté
 * siempre en el mismo sitio.
 */
export default async function PaginaDetalleProducto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, perfil, quienVende] = await Promise.all([
    productoConDetalle(id),
    perfilActual(),
    proveedoresDeProducto(id),
  ]);

  if (!resultado.ok) {
    if (resultado.error.includes("no existe")) notFound();
    return (
      <div className="p-1">
        <EstadoError titulo="No se pudo cargar el producto" descripcion={resultado.error} />
      </div>
    );
  }

  const p = resultado.datos;
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeEditar = rol !== null && ["gerencia", "admin", "compras"].includes(rol);
  const puedeAjustarStock = rol !== null && ["gerencia", "admin", "almacen"].includes(rol);

  // Sobre el COSTO (023). Era el último sitio que seguía dividiendo entre la
  // venta, así que la ficha decía un número y el listado del catálogo otro
  // distinto del mismo producto.
  const margen =
    p.precio_venta > 0 && p.costo_promedio > 0
      ? ((p.precio_venta - p.costo_promedio) / p.costo_promedio) * 100
      : null;
  const bajoMinimo = p.stock_minimo > 0 && p.stock <= p.stock_minimo;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/productos" className="text-sm text-[var(--fg-muted)] underline">
            ← Productos
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">
              {p.codigo}
            </h1>
            <Badge tone="neutral">{p.marca}</Badge>
            {p.archivado ? <Badge tone="warning">De baja</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{p.descripcion}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Va antes que «Editar» y con el estilo destacado a propósito:
              responde la pregunta que Willy hace a diario —«a quién se lo
              compré y a cuánto lo cocticé»— y hasta ahora se contestaba
              rebuscando en WhatsApp (26/08, 34:06). */}
          <Link
            href={`/productos/${p.id}/trazabilidad`}
            className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            Ver trazabilidad
          </Link>
          {puedeEditar ? (
            <Link
              href={`/productos/${p.id}/editar`}
              className="inline-flex h-9 items-center rounded-sm border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              Editar
            </Link>
          ) : null}
          <AccionesFila
            id={p.id}
            codigo={p.codigo}
            descripcion={p.descripcion}
            stock={p.stock}
            archivado={p.archivado}
            puedeEditar={puedeEditar}
            puedeAjustarStock={puedeAjustarStock}
          />
        </div>
      </header>

      {p.archivado && p.motivo_archivado ? (
        <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          <strong>Dado de baja:</strong> {p.motivo_archivado}
        </p>
      ) : null}

      {/* ------------------------------------------------------- Cifras */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta
          etiqueta="Stock"
          valor={`${p.stock.toLocaleString("es-PE")} ${p.unidad}`}
          tono={p.stock <= 0 ? "malo" : bajoMinimo ? "aviso" : "ok"}
          pie={p.stock_minimo > 0 ? `mínimo ${p.stock_minimo}` : "sin mínimo definido"}
        />
        <Tarjeta
          etiqueta="Precio de venta"
          valor={<Moneda valor={p.precio_venta} />}
          pie={
            [
              p.precio_minimo > 0 ? `piso ${p.precio_minimo.toFixed(2)}` : "sin piso",
              p.precio_mercado > 0 ? `mercado ${p.precio_mercado.toFixed(2)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          }
        />
        <Tarjeta
          etiqueta="Costo promedio"
          valor={<Moneda valor={p.costo_promedio} enfasis="suave" />}
          pie={`último ${p.ultimo_costo.toFixed(2)}`}
        />
        <Tarjeta
          etiqueta="Margen"
          valor={margen !== null ? `${margen.toFixed(1)}%` : "—"}
          // Los cortes suben con el denominador (023): sobre el costo, 12 y 20
          // son el equivalente de los 10 y 15 de cuando se medía sobre la venta.
          tono={
            margen === null ? undefined : margen < 12 ? "malo" : margen < 20 ? "aviso" : "ok"
          }
          pie={margen === null ? "falta el costo" : "sobre el costo"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------------ Clasificación */}
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Clasificación</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <Dato etiqueta="Familia" valor={p.familia} />
            <Dato etiqueta="Sub-familia" valor={p.subfamilia} />
            <Dato etiqueta="Descripción (tipo)" valor={p.tipo ?? "—"} />
            <Dato etiqueta="Unidad" valor={p.unidad} />
            <Dato etiqueta="Código alterno" valor={p.codigo_fabricante ?? "—"} />
            <Dato etiqueta="Ubicación" valor={p.ubicacion ?? "—"} />
            <Dato
              etiqueta="Peso"
              valor={p.peso_kg > 0 ? `${p.peso_kg} kg` : "sin registrar"}
            />
            <Dato etiqueta="Proveedor habitual" valor={p.proveedor ?? "sin fijar"} />
          </dl>
        </section>

        {/* -------------------------------------------------- Equivalentes */}
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Equivalentes de otras marcas</h2>
          {p.designacion_base ? (
            <p className="mb-3 text-xs text-[var(--fg-muted)]">
              Medida detectada en el código: <strong>{p.designacion_base}</strong>. Es
              lo único que comparten las marcas, así que sale solo.
            </p>
          ) : (
            <p className="mb-3 text-xs text-[var(--fg-muted)]">
              De este código no se pudo deducir una medida ISO.
            </p>
          )}

          {p.equivalentes.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">
              Todavía no hay otro producto con esta medida en el catálogo.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
              {p.equivalentes.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Link
                    href={`/productos/${e.id}`}
                    className="font-mono text-sm font-medium text-brand-600 hover:underline"
                  >
                    {e.codigo}
                  </Link>
                  <Badge tone="neutral" size="xs">
                    {e.marca}
                  </Badge>
                  <span className="ml-auto text-xs text-[var(--fg-muted)]">
                    stock {e.stock}
                  </span>
                  <Moneda valor={e.precio_venta} tamano="sm" />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Quién lo vende. Al lado de los equivalentes a propósito: las dos
            son salidas del mismo callejón —«no tengo esto»—, una por otra
            marca y la otra por otro proveedor. */}
        <QuienLoVende
          productoId={p.id}
          proveedores={quienVende.ok ? quienVende.datos : []}
        />
      </div>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  pie,
  tono,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  pie?: string;
  tono?: "ok" | "aviso" | "malo";
}) {
  const color =
    tono === "malo"
      ? "text-[var(--danger)]"
      : tono === "aviso"
        ? "text-[var(--warn)]"
        : tono === "ok"
          ? "text-[var(--ok)]"
          : "";
  return (
    <div className="card p-3">
      <p className="text-xs text-[var(--fg-muted)]">{etiqueta}</p>
      <p className={`mt-0.5 truncate text-lg font-semibold tabular ${color}`}>{valor}</p>
      {pie ? <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">{pie}</p> : null}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-40 shrink-0 text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 break-words">{valor}</dd>
    </div>
  );
}
