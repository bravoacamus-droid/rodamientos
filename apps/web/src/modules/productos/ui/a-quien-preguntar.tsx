import { Badge } from "@rodatech/ui";

import type { PrecioDeProveedor } from "../api/compras";

/**
 * A cuánto te lo deja cada proveedor — para decidir a quién preguntar.
 *
 * Luis, 21/09: *«él quiere historial, debería ser por producto: a cuánto le
 * están dejando, o a cuánto le dejaron las últimas veces, así ya sabe los
 * nuevos precios y sabe a quién preguntarle para la próxima, o a quiénes»*.
 *
 * ---------------------------------------------------------------------------
 * Por qué esta tabla Y la de abajo
 * ---------------------------------------------------------------------------
 * «A quién se le compró» es el diario: cada entrada al almacén con su factura.
 * Contesta *«¿qué pasó?»* y se mira cuando hay una discusión.
 *
 * Esta contesta lo que se pregunta ANTES de coger el teléfono: *«¿a quién le
 * pregunto?»*. Por eso va primero, el orden es el del precio y no el del
 * tiempo, y junta lo pagado con lo cotizado — que hasta hoy solo se veía
 * dentro de una ronda de precios, o sea justo cuando ya estabas preguntando.
 *
 * ---------------------------------------------------------------------------
 * Comprado y cotizado NO se confunden
 * ---------------------------------------------------------------------------
 * Cada fila dice de dónde sale su número. Un precio pagado es una factura y el
 * proveedor no lo puede negar; uno cotizado es una promesa que se pudo quedar
 * vieja. Enseñarlos como si fueran lo mismo sería negociar sobre arena.
 */
export function AQuienPreguntar({ precios }: { precios: PrecioDeProveedor[] }) {
  const dolar = (n: number) =>
    n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

  /** Sin hora: en una tabla de precios el día es todo lo que hace falta. */
  const fecha = (f: string | null) =>
    f ? new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString("es-PE") : "—";

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-base font-semibold">A quién preguntarle</h2>

      {precios.length === 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">
          Todavía no consta que nadie te haya dado precio de este producto. En
          cuanto le compres o le preguntes a alguien, aparece aquí.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-[var(--fg-muted)]">
            Lo último que te dejó cada uno, del más barato al más caro. Por ahí
            se empieza.
          </p>
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
                  <th className="py-2 pr-3 font-medium">Proveedor</th>
                  <th className="py-2 pr-3 text-right font-medium">Te lo deja a</th>
                  <th className="py-2 pr-3 font-medium">Cuándo</th>
                  <th className="py-2 font-medium">De dónde</th>
                </tr>
              </thead>
              <tbody>
                {precios.map((p, i) => (
                  <tr
                    key={`${p.proveedor}-${p.origen}`}
                    className={`border-b border-[var(--border-soft)] last:border-0 ${
                      p.activo ? "" : "opacity-60"
                    }`}
                  >
                    <td className="py-2 pr-3">
                      {p.proveedor}
                      {/* Un proveedor de baja se enseña igual —su precio
                          sigue siendo un dato histórico— pero se dice, para
                          que nadie lo llame. */}
                      {p.activo ? null : (
                        <Badge tone="neutral" size="xs" className="ml-2">
                          de baja
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {/* El más barato, marcado. Solo si hay con qué
                          comparar: con uno solo, pintarlo diría que es bueno
                          cuando es simplemente el único. */}
                      <span
                        className={`tabular ${
                          i === 0 && precios.length > 1
                            ? "font-semibold text-[var(--ok)]"
                            : ""
                        }`}
                      >
                        {dolar(p.costoUsd)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 tabular text-[var(--fg-muted)]">
                      {fecha(p.fecha)}
                    </td>
                    <td className="py-2">
                      {p.origen === "comprado" ? (
                        <Badge tone="success" size="xs">
                          se le compró
                        </Badge>
                      ) : (
                        <Badge tone="neutral" size="xs">
                          lo cotizó
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
