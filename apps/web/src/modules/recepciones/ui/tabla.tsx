import Link from "next/link";
import { Ban, Eye, PackageCheck } from "lucide-react";
import { EstadoError, EstadoVacio, Moneda, cn } from "@rodatech/ui";

import { VerMas } from "@/componentes/ver-mas";

import { hayFiltrosRecepciones } from "../dominio/filtros";
import { listarRecepciones } from "../api/consultas";
import type { FiltrosRecepciones } from "../dominio/tipos";

/**
 * Listado de recepciones.
 *
 * En móvil NO es una tabla: ocho columnas en un teléfono no se leen ni con
 * scroll horizontal, así que por debajo del corte cada recepción es una
 * tarjeta con lo mismo apilado. Es el mismo criterio que el catálogo.
 *
 * Desde el 19/11 (Luis: «lo mismo aplica para recepciones», tras el kardex)
 * la fila lleva color: un filo verde si entró al almacén y rojo si se anuló,
 * la moneda en su propia etiqueta —dólares y soles no se suman y no deben
 * confundirse de un vistazo— y la lista empieza en 30 con «Ver más».
 */
export async function TablaRecepciones({ filtros, query }: { filtros: FiltrosRecepciones; query: string }) {
  const resultado = await listarRecepciones(filtros);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar las recepciones"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = hayFiltrosRecepciones(filtros);
    return (
      <EstadoVacio
        titulo={filtrando ? "Ninguna recepción coincide" : "Todavía no se ha recibido nada"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por el número de guía del proveedor."
            : "Cuando llegue mercadería, regístrala aquí: es lo único que mueve el stock."
        }
      />
    );
  }

  return (
    <div className="@container">
      {/*
        Tarjetas o tabla según el ancho de ESTA caja (`@container`), no de la
        pantalla. A 820 con el menú abierto quedan 550 px, `md:` ya pintaba la
        tabla y el número de documento se partía en dos líneas (revisión por
        módulos del 02/10).
      */}
      {/* ------------------------------------------------ Escritorio */}
      <div className="hidden px-4 @3xl:block">
        <div className="scroll-x rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="cabecera-tabla">
                <th className="px-4 py-3">Recepción</th>
                <th className="px-4 py-3">Ingreso</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="hidden px-4 py-3 2xl:table-cell">Papeles</th>
                <th className="px-4 py-3 text-right">Líneas</th>
                <th className="px-4 py-3 text-right">Valorizado</th>
                <th className="hidden px-4 py-3 2xl:table-cell">Recibió</th>
                {/*
                  La fila de escritorio se quedó sin botón el 11/09, cuando la
                  tarjeta de móvil estrenó su «Ver recepción»: en escritorio la
                  única forma de entrar era pulsar el número. Luis, en compras:
                  *«falta el botón de recibir mercadería, no darle clic al
                  número»*.
                */}
                <th className="sticky right-0 z-20 px-4 py-3 text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r, i) => {
                const fondo = i % 2 === 1 ? "bg-[var(--surface-2)]" : "bg-[var(--surface)]";
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      "group/fila border-b border-l-[3px] border-b-[var(--border-soft)] transition-colors last:border-b-0 hover:bg-[var(--color-brand-50)] dark:hover:bg-[var(--surface-3)]",
                      r.anulada ? "border-l-rose-400" : "border-l-emerald-400",
                      fondo,
                    )}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/recepciones/${r.id}`}
                        className={cn(
                          "whitespace-nowrap tabular text-sm font-semibold text-brand-600 underline-offset-2 hover:underline",
                          r.anulada && "line-through",
                        )}
                      >
                        {r.numero}
                      </Link>
                      {r.compra_numero ? (
                        <span className="block tabular text-[var(--fg-muted)]">{r.compra_numero}</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium tabular">{fechaPeru(r.fecha)}</td>
                    <td className="max-w-xs px-4 py-3">
                      <span className="block truncate font-medium" title={r.proveedor ?? undefined}>
                        {r.proveedor ?? "—"}
                      </span>
                      {r.anulada ? <EtiquetaAnulada /> : null}
                    </td>
                    {/* Los papeles del proveedor son por lo que se busca una
                        recepción cuando llama reclamando, así que se leen. */}
                    <td className="hidden px-4 py-3 2xl:table-cell">
                      <Papeles guia={r.guia_proveedor} factura={r.factura_proveedor} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-block min-w-8 rounded-full bg-[var(--color-brand-50)] px-2 py-0.5 text-center font-semibold tabular text-brand-700 dark:bg-[var(--surface-3)]">
                        {r.items}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <span className={cn("inline-flex items-center gap-2", r.anulada && "line-through opacity-70")}>
                        <EtiquetaMoneda moneda={r.moneda} />
                        <Moneda valor={r.valorizado} moneda={r.moneda} tamano="sm" enfasis="fuerte" />
                      </span>
                    </td>
                    <td className="hidden max-w-[11rem] px-4 py-3 text-[var(--fg-muted)] 2xl:table-cell">
                      <span className="block truncate" title={r.recibido_por ?? undefined}>{r.recibido_por ?? "—"}</span>
                    </td>
                    {/* El fondo de la celda fija sigue al de la fila: si no,
                        la columna quedaba blanca en las filas de dos tonos. */}
                    <td
                      className={cn(
                        "sticky right-0 z-10 px-4 py-3 group-hover/fila:bg-[var(--color-brand-50)] dark:group-hover/fila:bg-[var(--surface-3)]",
                        fondo,
                      )}
                    >
                      <div className="ml-auto w-[150px]">
                        <Link href={`/recepciones/${r.id}`} className={cn(SECUNDARIO, "w-full justify-center")}>
                          <Eye className="size-4" aria-hidden="true" />
                          Ver recepción
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ----------------------------------------------------- Móvil */}
      {/*
        Las recepciones, en tarjetas sueltas y con etiquetas. Luis, 11/09:
        *«todo junto, apegado»*. Con los papeles del proveedor, que son el dato
        por el que se busca una recepción cuando el proveedor llama reclamando.
      */}
      <ul className="flex flex-col gap-2.5 px-3 pb-1 @3xl:hidden">
        {filas.map((r) => (
          <li
            key={r.id}
            className={cn(
              "flex flex-col gap-2 rounded-lg border border-l-[3px] border-[var(--border)] bg-[var(--surface)] p-3",
              r.anulada ? "border-l-rose-400" : "border-l-emerald-400",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/recepciones/${r.id}`}
                  className={cn("tabular text-sm font-semibold text-brand-600", r.anulada && "line-through")}
                >
                  {r.numero}
                </Link>
                {r.compra_numero ? (
                  <span className="block tabular text-sm text-[var(--fg-muted)]">{r.compra_numero}</span>
                ) : null}
              </div>
              {r.anulada ? <EtiquetaAnulada /> : <EtiquetaRecibida />}
            </div>

            <p className="text-base font-semibold">{r.proveedor ?? "—"}</p>

            <div className="flex flex-wrap items-center gap-2">
              <EtiquetaMoneda moneda={r.moneda} />
              <Moneda valor={r.valorizado} moneda={r.moneda} tamano="sm" enfasis="fuerte" />
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <Dato etiqueta="Ingreso al almacén">{fechaPeru(r.fecha)}</Dato>
              <Dato etiqueta="Líneas">{r.items}</Dato>
              <Dato etiqueta="Recibió">{r.recibido_por ?? "—"}</Dato>
              <div className="col-span-2 min-w-0">
                <dt className="text-sm text-[var(--fg-muted)]">Papeles del proveedor</dt>
                <dd className="text-sm">
                  <Papeles guia={r.guia_proveedor} factura={r.factura_proveedor} />
                </dd>
              </div>
            </dl>

            {/* Una recepción no se edita ni se imprime: solo se abre para ver
                qué llegó y colgarle los papeles. Un botón, entero. */}
            <Link href={`/recepciones/${r.id}`} className={cn(SECUNDARIO, "w-full justify-center")}>
              <Eye className="size-4" aria-hidden="true" />
              Ver recepción
            </Link>
          </li>
        ))}
      </ul>

      <VerMas
        query={query}
        cuantos={filtros.limite ?? filas.length}
        enPantalla={filas.length}
        hayMas={siguiente !== null}
        nombre={["recepción", "recepciones"]}
      />
    </div>
  );
}

/*
  El botón de la fila y el de la tarjeta. Mismo aspecto que el «Ver» de guías y
  facturación: en esta casa un botón tiene que parecer un botón.
*/
const SECUNDARIO = "boton-fila";

/**
 * «16/11/2026», como se escribe en Perú, y no «2026-11-16»: el ISO hay que
 * leerlo al revés (revisión por módulos del 02/10). Si no viene en ISO, tal
 * cual.
 */
function fechaPeru(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha;
}

/** La moneda en su etiqueta: azul el dólar, ámbar el sol. */
function EtiquetaMoneda({ moneda }: { moneda: "USD" | "PEN" | string }) {
  const soles = moneda === "PEN";
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-sm font-semibold",
        soles
          ? "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
          : "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
      )}
    >
      {soles ? "Soles" : "Dólares"}
    </span>
  );
}

function EtiquetaAnulada() {
  return (
    <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-sm font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
      <Ban className="size-4" aria-hidden="true" />
      Anulada, no suma
    </span>
  );
}

function EtiquetaRecibida() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
      <PackageCheck className="size-4" aria-hidden="true" />
      Entró
    </span>
  );
}

/** «Guía» y «Factura» enteras: «G:» y «F:» eran claves que había que saber (02/10). */
function Papeles({ guia, factura }: { guia: string | null; factura: string | null }) {
  if (!guia && !factura) return <span className="text-[var(--fg-subtle)]">Sin papeles</span>;
  return (
    <span className="flex flex-col whitespace-nowrap">
      {guia ? (
        <span>
          <span className="text-[var(--fg-muted)]">Guía </span>
          <span className="tabular">{guia}</span>
        </span>
      ) : null}
      {factura ? (
        <span>
          <span className="text-[var(--fg-muted)]">Factura </span>
          <span className="tabular">{factura}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Un dato de la tarjeta de móvil: su etiqueta encima y el valor debajo. Sin
 * cabecera de tabla que diga qué es cada cosa, cada dato se presenta solo.
 */
function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-[var(--fg-muted)]">{etiqueta}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}
