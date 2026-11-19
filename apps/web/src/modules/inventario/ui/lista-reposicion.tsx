"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  CircleCheck,
  Layers,
  OctagonAlert,
  PackagePlus,
  PackageX,
  Search,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button, Input, Moneda, SelectNativo, cn } from "@rodatech/ui";

import {
  ESTADOS_EN_ORDEN,
  FILTRO_INICIAL,
  contarPorEstado,
  familiasDe,
  filtrarReposicion,
  type FiltroReposicion,
} from "../dominio/reposicion";
import type { EstadoStock, FilaReposicion } from "../dominio/tipos";

/**
 * Cada estado con su color, su icono y una frase que dice qué hacer.
 *
 * Luis, 19/11: *«todo de igual, dale más color, que sea intuitiva»*. Antes el
 * estado era una pastilla al final de la fila, la última columna que se lee.
 * Ahora el color va también en el filo izquierdo de cada fila, así que la
 * lista se lee de un vistazo bajando por el borde: rojo, ámbar, azul.
 */
const ESTADO: Record<
  EstadoStock,
  { etiqueta: string; que: string; icono: LucideIcon; filo: string; chip: string; boton: string; activo: string }
> = {
  negativo: {
    etiqueta: "Negativo",
    que: "Salió más de lo que entró",
    icono: OctagonAlert,
    filo: "border-l-red-400",
    chip: "bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-200",
    boton: "border-red-300 hover:border-red-500 dark:border-red-900",
    activo: "border-red-600 bg-red-600 text-white",
  },
  sin_stock: {
    etiqueta: "Sin stock",
    que: "Hay que comprar",
    icono: PackageX,
    filo: "border-l-orange-400",
    chip: "bg-orange-50 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200",
    boton: "border-orange-300 hover:border-orange-500 dark:border-orange-900",
    activo: "border-orange-600 bg-orange-600 text-white",
  },
  critico: {
    etiqueta: "Por agotarse",
    que: "Bajo el mínimo",
    icono: TriangleAlert,
    filo: "border-l-amber-300",
    chip: "bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
    boton: "border-amber-300 hover:border-amber-500 dark:border-amber-900",
    activo: "border-amber-500 bg-amber-400 text-amber-950",
  },
  sobrestock: {
    etiqueta: "Sobrestock",
    que: "Dinero parado",
    icono: Layers,
    filo: "border-l-sky-400",
    chip: "bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
    boton: "border-sky-300 hover:border-sky-500 dark:border-sky-900",
    activo: "border-sky-600 bg-sky-600 text-white",
  },
  normal: {
    etiqueta: "Normal",
    que: "Todo en orden",
    icono: CircleCheck,
    filo: "border-l-emerald-400",
    chip: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
    boton: "border-emerald-300 hover:border-emerald-500 dark:border-emerald-900",
    activo: "border-emerald-600 bg-emerald-600 text-white",
  },
};

/** De a cuántas se enseñan. Cien filas seguidas era justo lo que cansaba. */
const TANDA = 20;

function ChipEstado({ estado }: { estado: EstadoStock }) {
  const e = ESTADO[estado];
  const Icono = e.icono;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-semibold",
        e.chip,
      )}
    >
      <Icono className="size-4" aria-hidden="true" />
      {e.etiqueta}
    </span>
  );
}

function Cobertura({ dias }: { dias: number | null }) {
  // Sin consumo en 90 días no se puede estimar cobertura. Decir «0 días»
  // sería mentir: puede que simplemente no se venda.
  if (dias === null) return <span className="text-sm text-[var(--fg-subtle)]">sin consumo</span>;
  return (
    <span className={cn("tabular", dias <= 7 && "font-semibold text-[var(--danger)]")}>
      {dias} d
    </span>
  );
}

export function ListaReposicion({ filas }: { filas: FilaReposicion[] }) {
  const [filtro, setFiltro] = useState<FiltroReposicion>(FILTRO_INICIAL);
  const [cuantas, setCuantas] = useState(TANDA);

  const familias = useMemo(() => familiasDe(filas), [filas]);
  const cuenta = useMemo(() => contarPorEstado(filas, filtro), [filas, filtro]);
  const visibles = useMemo(() => filtrarReposicion(filas, filtro), [filas, filtro]);
  const enPantalla = visibles.slice(0, cuantas);

  // Cambiar un filtro vuelve a la primera tanda: si no, al pasar de «Todos»
  // (con 60 a la vista) a «Negativo» se seguiría pidiendo «ver más».
  const cambiar = (parche: Partial<FiltroReposicion>) => {
    setFiltro((f) => ({ ...f, ...parche }));
    setCuantas(TANDA);
  };

  const hayFiltros = filtro.estado !== "todos" || filtro.texto !== "" || filtro.familia !== "";

  return (
    <div className="@container">
      {/* ------------------------------------------------ Botones por estado */}
      {/*
        Botones de verdad, con borde y su número: «una persona que no sabe que
        tiene que darle click ahí» (Luis). Con cero se apagan pero no se
        quitan, para que la fila no cambie de forma al filtrar.
      */}
      <div className="grid grid-cols-2 gap-2 px-4 pt-4 @2xl:grid-cols-3 @5xl:grid-cols-6">
        <button
          type="button"
          onClick={() => cambiar({ estado: "todos" })}
          aria-pressed={filtro.estado === "todos"}
          className={cn(
            "flex flex-col items-start gap-0.5 rounded-lg border-2 px-3 py-2.5 text-left transition-colors",
            filtro.estado === "todos"
              ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white"
              : "border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--color-brand-500)]",
          )}
        >
          <span className="text-sm font-semibold">Todos</span>
          <span className="text-2xl font-bold tabular">{cuenta.todos}</span>
          <span className={cn("text-sm", filtro.estado === "todos" ? "text-white/85" : "text-[var(--fg-muted)]")}>
            Lo que hay que mirar
          </span>
        </button>
        {ESTADOS_EN_ORDEN.map((estado) => {
          const e = ESTADO[estado];
          const Icono = e.icono;
          const activo = filtro.estado === estado;
          return (
            <button
              key={estado}
              type="button"
              onClick={() => cambiar({ estado: activo ? "todos" : estado })}
              aria-pressed={activo}
              disabled={cuenta[estado] === 0 && !activo}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-lg border-2 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                activo ? e.activo : cn("bg-[var(--surface)]", e.boton),
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icono className="size-4" aria-hidden="true" />
                {e.etiqueta}
              </span>
              <span className="text-2xl font-bold tabular">{cuenta[estado]}</span>
              <span className={cn("text-sm", activo ? "opacity-90" : "text-[var(--fg-muted)]")}>{e.que}</span>
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------- Buscador y familia */}
      <div className="flex flex-wrap items-end gap-3 px-4 pb-3 pt-4">
        <label className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
          <span className="text-sm font-medium">Buscar</span>
          <span className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-brand-600)]"
              aria-hidden="true"
            />
            <Input
              value={filtro.texto}
              onChange={(e) => cambiar({ texto: e.target.value })}
              placeholder="Código, descripción o marca…"
              className="pl-9"
              autoComplete="off"
            />
          </span>
        </label>
        <label className="flex w-full flex-col gap-1 @xl:w-64">
          <span className="text-sm font-medium">Familia</span>
          <SelectNativo value={filtro.familia} onChange={(e) => cambiar({ familia: e.target.value })}>
            <option value="">Todas las familias</option>
            {familias.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </SelectNativo>
        </label>
        {hayFiltros ? (
          <Button type="button" variant="outline" onClick={() => cambiar(FILTRO_INICIAL)} className="gap-1.5">
            <X className="size-4" aria-hidden="true" />
            Limpiar
          </Button>
        ) : null}
      </div>

      <p className="px-4 pb-2 text-sm text-[var(--fg-muted)]" role="status" aria-live="polite">
        {visibles.length === 0
          ? "Ningún producto con estos filtros."
          : `Mostrando ${enPantalla.length} de ${visibles.length} ${visibles.length === 1 ? "producto" : "productos"}`}
      </p>

      {/* ------------------------------------------- Teléfono: tarjetas */}
      {/*
        La tarjeta se queda con lo que hace falta de pie en el almacén: qué
        es, cuánto hay, y cuánto pedir (revisión del 02/10). Por ancho del
        contenedor: a 820 con el menú abierto quedan ~500 px.
      */}
      <ul className="flex flex-col gap-2.5 px-3 pb-3 @3xl:hidden">
        {enPantalla.map((f) => (
          <li
            key={f.id}
            className={cn("rounded-lg border border-l-[3px] border-[var(--border)] p-3", ESTADO[f.estado_stock].filo)}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/productos/${f.id}`}
                className="font-mono text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
              >
                {f.codigo}
              </Link>
              <ChipEstado estado={f.estado_stock} />
            </div>
            <p className="mt-1 text-sm">{f.descripcion}</p>
            {f.marca ? <p className="text-sm text-[var(--fg-subtle)]">{f.marca}</p> : null}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>
                <span className="text-[var(--fg-muted)]">Hay </span>
                <span className="font-semibold tabular">{Number(f.stock ?? 0).toLocaleString("es-PE")}</span>
              </span>
              {f.sugerido_comprar > 0 ? (
                <span>
                  <span className="text-[var(--fg-muted)]">Pedir </span>
                  <span className="font-semibold tabular">
                    {Number(f.sugerido_comprar).toLocaleString("es-PE")}
                  </span>
                </span>
              ) : null}
              <span>
                <span className="text-[var(--fg-muted)]">Dura </span>
                <Cobertura dias={f.dias_cobertura} />
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* ------------------------------------------- Escritorio: tabla */}
      <div className="hidden px-4 pb-3 @3xl:block">
        <div className="scroll-x rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-brand-600)] text-left text-sm font-semibold text-white">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="hidden px-4 py-3 text-right 2xl:table-cell">Mín / Máx</th>
                <th className="px-4 py-3 text-right">Cobertura</th>
                <th className="px-4 py-3 text-right">Pedir</th>
                <th className="hidden px-4 py-3 text-right 2xl:table-cell">Inmovilizado</th>
              </tr>
            </thead>
            <tbody>
              {enPantalla.map((f, i) => (
                <tr
                  key={f.id}
                  className={cn(
                    "border-b border-l-[3px] border-b-[var(--border-soft)] transition-colors hover:bg-[var(--color-brand-50)] dark:hover:bg-[var(--surface-2)]",
                    ESTADO[f.estado_stock].filo,
                    i % 2 === 1 && "bg-[var(--surface-2)]",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/productos/${f.id}`}
                      className="font-mono text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
                    >
                      {f.codigo}
                    </Link>
                  </td>
                  {/* La marca debajo de la descripción y no en su columna: a
                      1280 con el menú abierto la tabla no cabía (02/10). */}
                  <td className="max-w-sm px-4 py-2.5">
                    <span className="block truncate" title={f.descripcion}>
                      {f.descripcion}
                    </span>
                    {f.marca ? <span className="block text-sm text-[var(--fg-subtle)]">{f.marca}</span> : null}
                  </td>
                  {/* El estado AL LADO de la descripción y no al final: es la
                      columna que manda y era la última que se leía. */}
                  <td className="px-4 py-2.5">
                    <ChipEstado estado={f.estado_stock} />
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right text-base font-semibold tabular",
                      Number(f.stock) < 0 && "text-[var(--danger)]",
                    )}
                  >
                    {Number(f.stock ?? 0).toLocaleString("es-PE")}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right tabular text-[var(--fg-muted)] 2xl:table-cell">
                    {f.stock_minimo} / {f.stock_maximo || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Cobertura dias={f.dias_cobertura} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {f.sugerido_comprar > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-brand-50)] px-2 py-0.5 font-semibold tabular text-brand-700 dark:bg-[var(--surface-2)]">
                        <PackagePlus className="size-4" aria-hidden="true" />
                        {Number(f.sugerido_comprar).toLocaleString("es-PE")}
                      </span>
                    ) : (
                      <span className="text-[var(--fg-subtle)]">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right 2xl:table-cell">
                    {/* Solo tiene sentido para el sobrestock: es el dinero parado. */}
                    {f.estado_stock === "sobrestock" ? (
                      <Moneda valor={f.valorizado} tamano="sm" />
                    ) : (
                      <span className="text-[var(--fg-subtle)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {visibles.length > cuantas ? (
        <div className="flex justify-center px-4 pb-4">
          <Button type="button" variant="outline" onClick={() => setCuantas((n) => n + TANDA)} className="gap-1.5">
            <ArrowDownToLine className="size-4" aria-hidden="true" />
            Ver {Math.min(TANDA, visibles.length - cuantas)} más (quedan {visibles.length - cuantas})
          </Button>
        </div>
      ) : null}
    </div>
  );
}
