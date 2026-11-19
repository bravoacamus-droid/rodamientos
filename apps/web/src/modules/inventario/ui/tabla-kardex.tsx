import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleMinus,
  CirclePlus,
  type LucideIcon,
} from "lucide-react";
import { EstadoError, EstadoVacio, Moneda, cn } from "@rodatech/ui";

import { VerMas } from "@/componentes/ver-mas";

import { kardex } from "../api/consultas";
import { enlaceDeReferencia } from "../dominio/enlaces";
import { hayFiltros } from "../dominio/filtros-kardex";
import { ETIQUETA_MOVIMIENTO, type FiltrosKardex, type TipoMovimiento } from "../dominio/tipos";

/**
 * De a cuántos movimientos crece la lista. 20 y no los 30 de las demás
 * (Luis, 19/11: «cambia 30 a 20 nomás, sigue viéndose mucho»): cada
 * movimiento ocupa dos renglones —código y descripción, fecha y hora— y con
 * 30 la lista seguía midiendo tres pantallas.
 */
export const TANDA_KARDEX = 20;

/**
 * Cada tipo de movimiento con su color, su icono y su filo (19/11).
 *
 * Luis, señalando la lista: *«dale más diseño, color»*. Las cuatro etiquetas
 * eran pastillas pálidas casi iguales y la cantidad un número gris; para
 * saber si algo entró o salió había que leer el signo. Ahora el color va en
 * el filo de la fila, en la etiqueta y en la cantidad: verde entra, rojo
 * sale, ámbar y naranja son ajustes. La flecha dice lo mismo sin color.
 */
const TIPO: Record<
  TipoMovimiento,
  { icono: LucideIcon; filo: string; chip: string; cantidad: string }
> = {
  ingreso: {
    icono: ArrowDownToLine,
    filo: "border-l-emerald-400",
    chip: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
    cantidad: "text-emerald-700 dark:text-emerald-300",
  },
  salida: {
    icono: ArrowUpFromLine,
    filo: "border-l-rose-400",
    chip: "bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200",
    cantidad: "text-rose-700 dark:text-rose-300",
  },
  ajuste_positivo: {
    icono: CirclePlus,
    filo: "border-l-amber-300",
    chip: "bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
    cantidad: "text-amber-800 dark:text-amber-300",
  },
  ajuste_negativo: {
    icono: CircleMinus,
    filo: "border-l-orange-400",
    chip: "bg-orange-50 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200",
    cantidad: "text-orange-700 dark:text-orange-300",
  },
};

function ChipTipo({ tipo }: { tipo: TipoMovimiento }) {
  const t = TIPO[tipo];
  const Icono = t.icono;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-semibold",
        t.chip,
      )}
    >
      <Icono className="size-4" aria-hidden="true" />
      {ETIQUETA_MOVIMIENTO[tipo]}
    </span>
  );
}

/** «+12» o «−3», con su color: lo primero que se busca es si entró o salió. */
function Cantidad({ entrada, salida, tipo }: { entrada: number; salida: number; tipo: TipoMovimiento }) {
  return (
    <span
      className={cn(
        "inline-block text-right text-base font-bold tabular",
        TIPO[tipo].cantidad,
      )}
    >
      {entrada > 0
        ? `+${Number(entrada).toLocaleString("es-PE")}`
        : `−${Number(salida).toLocaleString("es-PE")}`}
    </span>
  );
}

/**
 * La fecha como se escribe en Perú, «25/09/2026», y no en ISO: «2026-09-25»
 * hay que leerlo al revés (revisión por módulos del 02/10). En hora de Lima
 * (13/10): cortar el ISO daba el día de UTC, y lo recibido a las 8 de la
 * noche salía con la fecha de mañana.
 */
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function horaLima(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * El kardex: todos los movimientos, del más reciente al más antiguo.
 *
 * Es el libro mayor del almacén. `saldo_cantidad` y `costo_promedio` se
 * muestran TAL COMO QUEDARON en cada movimiento, no recalculados: el kardex
 * los grabó en su momento y esa es justamente la garantía que permite
 * reconstruir el stock si las copias denormalizadas se corrompen — que es como
 * se reparó el costo del 6205.
 *
 * Empieza en 20 filas y crece con «Ver más» (19/11, ver `lib/ver-mas.ts`).
 */
export async function TablaKardex({ filtros, query }: { filtros: FiltrosKardex; query: string }) {
  const resultado = await kardex(filtros);

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar el kardex"
        descripcion="La consulta no llegó a completarse."
        detalle={resultado.error}
      />
    );
  }

  const { filas, siguiente } = resultado.datos;

  if (filas.length === 0) {
    const filtrando = hayFiltros(filtros);
    return (
      <EstadoVacio
        titulo={filtrando ? "Ningún movimiento coincide" : "El kardex está vacío"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros o amplía el rango de fechas."
            : "Todavía no ha entrado ni salido nada del almacén. Se llena solo al recibir mercadería, facturar o cuadrar."
        }
      />
    );
  }

  return (
    <div className="@container">
      {/*
        EN MÓVIL, TARJETAS. Medido a 390 px: la tabla pide 595 y no encoge,
        porque la descripción del producto no se deja.

        El kardex se consulta para responder «¿y esto de dónde salió?», así que
        la tarjeta lleva el movimiento, la cantidad con su signo y el documento
        que lo causó. Los costos se quedan en la tabla de escritorio: ahí no se
        miran de pie en el almacén, se analizan sentado.
      */}
      <ul className="flex flex-col gap-2.5 px-3 pb-1 @3xl:hidden">
        {filas.map((m) => {
          const enlace = enlaceDeReferencia(m.referencia_tipo, m.referencia_id);
          return (
            <li
              key={m.id}
              className={cn("rounded-lg border border-l-[3px] border-[var(--border)] p-3", TIPO[m.tipo].filo)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ChipTipo tipo={m.tipo} />
                <Cantidad entrada={m.entrada} salida={m.salida} tipo={m.tipo} />
              </div>
              <Link
                href={`/inventario/kardex?producto=${m.producto_id}`}
                className="mt-2 block font-mono text-sm font-semibold text-brand-600 hover:underline"
              >
                {m.codigo}
              </Link>
              <p className="text-sm">{m.descripcion}</p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                <span className="text-[var(--fg-muted)]">
                  Quedan{" "}
                  <span
                    className={cn(
                      "font-semibold tabular text-[var(--fg)]",
                      Number(m.saldo_cantidad) < 0 && "text-[var(--danger)]",
                    )}
                  >
                    {Number(m.saldo_cantidad).toLocaleString("es-PE")}
                  </span>
                </span>
                <span className="tabular text-[var(--fg-muted)]">
                  {fechaCorta(m.fecha)} {horaLima(m.fecha)}
                </span>
                {m.referencia_numero ? (
                  enlace ? (
                    <Link href={enlace} className="font-mono text-brand-600 hover:underline">
                      {m.referencia_numero}
                    </Link>
                  ) : (
                    <span className="font-mono">{m.referencia_numero}</span>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden px-4 @3xl:block">
        <div className="scroll-x rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="cabecera-tabla">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Movimiento</th>
                {/* Entrada y salida en UNA columna con su signo: con dos, a
                    1280 con el menú abierto la tabla no cabía (02/10). */}
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="hidden whitespace-nowrap px-4 py-3 text-right 2xl:table-cell">Costo unit.</th>
                <th className="hidden whitespace-nowrap px-4 py-3 text-right 2xl:table-cell">Costo prom.</th>
                <th className="px-4 py-3">Documento</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((m, i) => {
                const enlace = enlaceDeReferencia(m.referencia_tipo, m.referencia_id);
                return (
                  <tr
                    key={m.id}
                    className={cn(
                      "border-b border-l-[3px] border-b-[var(--border-soft)] transition-colors last:border-b-0 hover:bg-[var(--color-brand-50)] dark:hover:bg-[var(--surface-3)]",
                      TIPO[m.tipo].filo,
                      i % 2 === 1 && "bg-[var(--surface-2)]",
                    )}
                  >
                    {/* Fecha arriba y hora debajo, más clara: se busca el
                        día, la hora solo desempata. */}
                    <td className="whitespace-nowrap px-4 py-3 tabular">
                      <span className="block font-medium">{fechaCorta(m.fecha)}</span>
                      <span className="block text-[var(--fg-muted)]">{horaLima(m.fecha)}</span>
                    </td>
                    <td className="max-w-[18rem] px-4 py-3">
                      <Link
                        href={`/inventario/kardex?producto=${m.producto_id}`}
                        className="block font-mono text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
                        title="Ver solo este producto"
                      >
                        {m.codigo}
                      </Link>
                      <span className="block truncate text-[var(--fg-muted)]" title={m.descripcion}>
                        {m.descripcion}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ChipTipo tipo={m.tipo} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Cantidad entrada={m.entrada} salida={m.salida} tipo={m.tipo} />
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right text-base font-semibold tabular",
                        Number(m.saldo_cantidad) < 0 && "text-[var(--danger)]",
                      )}
                    >
                      {Number(m.saldo_cantidad).toLocaleString("es-PE")}
                    </td>
                    <td className="hidden px-4 py-3 text-right 2xl:table-cell">
                      <Moneda valor={m.costo_unitario} tamano="sm" enfasis="suave" />
                    </td>
                    <td className="hidden px-4 py-3 text-right 2xl:table-cell">
                      <Moneda valor={m.costo_promedio} tamano="sm" enfasis="suave" />
                    </td>
                    <td className="max-w-[14rem] px-4 py-3">
                      {m.referencia_numero ? (
                        enlace ? (
                          <Link
                            href={enlace}
                            className="font-mono font-semibold text-brand-600 underline-offset-2 hover:underline"
                          >
                            {m.referencia_numero}
                          </Link>
                        ) : (
                          <span className="font-mono">{m.referencia_numero}</span>
                        )
                      ) : (
                        <span className="text-[var(--fg-subtle)]">{m.referencia_tipo ?? "—"}</span>
                      )}
                      {m.motivo ? (
                        <span className="block truncate text-[var(--fg-muted)]" title={m.motivo}>
                          {m.motivo}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <VerMas
        query={query}
        cuantos={filtros.limite ?? filas.length}
        enPantalla={filas.length}
        hayMas={siguiente !== null}
        tanda={TANDA_KARDEX}
      />
    </div>
  );
}
