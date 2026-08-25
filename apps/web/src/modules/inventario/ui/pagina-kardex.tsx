import { Suspense } from "react";
import Link from "next/link";
import { Skeleton } from "@rodatech/ui";

import { productoDelKardex } from "../api/consultas";
import type { FiltrosKardex } from "../dominio/tipos";
import { FiltrosKardexBarra } from "./filtros-kardex";
import { TablaKardex } from "./tabla-kardex";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Toma el primer valor de un search param, que puede venir repetido. */
function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * Kardex.
 *
 * El libro mayor del almacén: cada entrada y salida con el saldo que dejó. Es
 * la fuente de verdad del stock —las copias en `stock` y `productos` existen
 * solo por rendimiento—, así que esta pantalla es la que permite explicar por
 * qué un producto tiene el costo que tiene.
 *
 * Filtrado por un producto, se convierte en su ficha de kardex, que es como se
 * llega desde el catálogo.
 */
export default async function PaginaKardex({ searchParams }: Props) {
  const sp = await searchParams;

  const filtros: FiltrosKardex = {
    producto: uno(sp.producto),
    tipo: uno(sp.tipo),
    referencia: uno(sp.referencia),
    desde: uno(sp.desde),
    hasta: uno(sp.hasta),
    cursor: uno(sp.cursor),
  };

  const producto = filtros.producto
    ? await productoDelKardex(filtros.producto)
    : null;
  const p = producto?.ok ? producto.datos : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kardex</h1>
          {p ? (
            <p className="text-sm text-[var(--fg-muted)]">
              <span className="font-mono font-medium">{p.codigo}</span> ·{" "}
              {p.descripcion} · saldo actual{" "}
              <span className="tabular font-medium text-[var(--fg)]">{p.stock}</span>
            </p>
          ) : (
            <p className="text-sm text-[var(--fg-muted)]">
              Cada entrada y salida del almacén, con el saldo que dejó.
            </p>
          )}
        </div>

        <Link
          href="/inventario"
          className="inline-flex h-9 items-center rounded-sm border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          Volver a inventario
        </Link>
      </div>

      <section className="card pt-4">
        <FiltrosKardexBarra productoActivo={p?.codigo ?? null} />

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
