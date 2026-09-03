import Link from "next/link";
import { PackageX, ShoppingCart } from "lucide-react";

import { bandejaPorComprar, loQueFaltaDe } from "@/modules/compras";

/**
 * Lo que este pedido necesita y el almacén no cubre.
 *
 * ---------------------------------------------------------------------------
 * El paso que faltaba
 * ---------------------------------------------------------------------------
 * Luis, 03/09: *«después de aceptar la cotización se pasa a pedido, y después
 * debería haber un botón para cotizar en compra los productos seleccionados,
 * ¿no?»*.
 *
 * Sí, y no estaba. Al confirmar el pedido, lo único que ofrecía la pantalla
 * era **«Generar guía»** — o sea, despachar. Y despachar supone que la
 * mercadería está: si el cliente confirmó 25 y hay 20, primero hay que
 * conseguir 5. Ese camino existía —la bandeja «Por comprar»— pero era GENERAL:
 * había que acordarse de ir, buscar los productos de este pedido entre los de
 * todos los clientes y marcarlos a mano.
 *
 * Aquí sale solo, con el pedido delante y en el momento en que se acaba de
 * cerrar, que es cuando se decide qué hacer con él.
 *
 * ---------------------------------------------------------------------------
 * Y sale de la bandeja, no de una cuenta propia
 * ---------------------------------------------------------------------------
 * Restar el stock línea a línea aquí sería más corto y daría OTRO número: el
 * stock se reparte entre todos los que esperan el mismo producto, por orden de
 * confirmación. Dos pantallas que contestan lo mismo con cifras distintas es
 * peor que una pantalla de menos.
 */
export async function LoQueFalta({ cotizacionId }: { cotizacionId: string }) {
  const r = await bandejaPorComprar();
  // Si la bandeja no carga, esto no sale y la pantalla funciona igual: es un
  // atajo, no el único camino. La bandeja sigue estando en su sitio.
  if (!r.ok) return null;

  const falta = loQueFaltaDe(cotizacionId, r.datos.filas);
  if (falta.length === 0) return null;

  // Lo que ya viene en camino no se vuelve a pedir, pero sí se dice: quien
  // mira esto necesita saber que se hizo algo, o lo pide otra vez.
  const porPedir = falta.filter((f) => !f.enCamino);
  const enCamino = falta.filter((f) => f.enCamino);

  const items = porPedir.map((f) => `${f.producto_id}:${f.falta}`).join(",");

  return (
    <section className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-4 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <PackageX className="size-4 shrink-0" aria-hidden="true" />
            {porPedir.length > 0
              ? `Falta comprar ${porPedir.length === 1 ? "un producto" : `${porPedir.length} productos`} de este pedido`
              : "Lo que faltaba ya viene en camino"}
          </h2>

          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {falta.map((f) => (
              <li key={f.producto_id} className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium tabular">{f.codigo}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--fg-muted)]">
                  {f.descripcion}
                </span>
                <span className="tabular font-semibold">
                  {f.falta}
                  {f.enCamino ? (
                    <span className="ml-2 font-normal text-[var(--fg-muted)]">
                      ya pedido
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>

          {enCamino.length > 0 && porPedir.length > 0 ? (
            <p className="mt-2 text-xs text-[var(--fg-muted)]">
              Lo que ya está pedido no entra en el botón: volver a pedirlo sería
              comprarlo dos veces.
            </p>
          ) : null}
        </div>

        {porPedir.length > 0 ? (
          <div className="flex shrink-0 flex-col gap-2">
            {/* El primario es pedir precio y no comprar directo: el precio lo
                pone el proveedor, y Willy pregunta antes de comprar. Registrar
                la compra a ciegas se deja como la segunda opción, para cuando
                ya se sabe a cuánto. */}
            <Link
              href={`/compras/pedir-precio?items=${items}`}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              <ShoppingCart className="size-4" aria-hidden="true" />
              Pedir precio de lo que falta
            </Link>
            <Link
              href={`/compras/nueva?items=${items}`}
              className="inline-flex h-10 items-center justify-center rounded-sm border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--surface)]"
            >
              Registrar la compra
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
