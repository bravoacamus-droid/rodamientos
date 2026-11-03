"use client";

import * as React from "react";
import { ArrowRight, Search, User, Users, UsersRound } from "lucide-react";
import { Combobox, campoBase, cn, formatearMoneda } from "@rodatech/ui";

import { PERIODOS_CUENTA, type PeriodoCuenta } from "../dominio/estado-cuenta";

/**
 * A quién se le saca el estado de cuenta (03/11).
 *
 * Luis: *«cuando entre, que decida si quiere de todos los clientes o clientes
 * específicos»*. Tres formas, con un botón grande cada una:
 *
 *   · **Un cliente**: el buscador de siempre.
 *   · **Varios clientes**: una lista con casillas y buscador, y «Marcar los
 *     que deben» para el reporte de morosos de los lunes (Willy, 06/10:
 *     «todos los lunes envío reporte de los morosos»).
 *   · **Todos**: los que deben, o todos los que tienen facturas si se pide
 *     también lo pagado.
 *
 * Sigue siendo un `<form method="get">`: lo elegido viaja en la dirección
 * (`modo`, `cliente`, `c=…&c=…`, `periodo`), así que el resultado se puede
 * recargar, guardar o mandar como enlace.
 */

export type ModoCuenta = "uno" | "varios" | "todos";

export interface ClienteElegible {
  cliente_id: string;
  cliente: string;
  facturas: number;
  saldo: number;
  vencido: number;
}

const MODOS: { valor: ModoCuenta; titulo: string; ayuda: string; icono: typeof User }[] = [
  { valor: "uno", titulo: "Un cliente", ayuda: "Busca a uno por su nombre", icono: User },
  { valor: "varios", titulo: "Varios clientes", ayuda: "Marca los que quieras", icono: Users },
  { valor: "todos", titulo: "Todos los clientes", ayuda: "Uno detrás de otro", icono: UsersRound },
];

function detalle(c: ClienteElegible): string {
  return c.saldo > 0
    ? `debe ${formatearMoneda(c.saldo)}${c.vencido > 0 ? ` · vencido ${formatearMoneda(c.vencido)}` : ""}`
    : `al día · ${c.facturas} ${c.facturas === 1 ? "factura" : "facturas"}`;
}

export function SelectorEstadoCuenta({
  clientes,
  modoInicial,
  clienteInicial,
  marcadosIniciales,
  periodoInicial,
}: {
  clientes: readonly ClienteElegible[];
  modoInicial: ModoCuenta;
  clienteInicial: string | null;
  marcadosIniciales: readonly string[];
  periodoInicial: PeriodoCuenta;
}) {
  const [modo, setModo] = React.useState<ModoCuenta>(modoInicial);
  const [cliente, setCliente] = React.useState<string | null>(clienteInicial);
  const [marcados, setMarcados] = React.useState<Set<string>>(() => new Set(marcadosIniciales));
  const [periodo, setPeriodo] = React.useState<PeriodoCuenta>(periodoInicial);
  const [buscar, setBuscar] = React.useState("");

  const deudores = clientes.filter((c) => c.saldo > 0);
  const visibles = clientes.filter((c) => c.cliente.toLowerCase().includes(buscar.trim().toLowerCase()));

  // Varios o todos: lo normal es mandar lo que se debe. Un cliente: también
  // lo pagado, que es lo que pidió Willy para su estado de cuenta.
  const cambiarModo = (m: ModoCuenta) => {
    setModo(m);
    if (m !== modo) setPeriodo(m === "uno" ? "12m" : "pendiente");
  };

  const alternar = (id: string) =>
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const cuantosTodos = periodo === "pendiente" ? deudores.length : clientes.length;
  const listo = modo === "uno" ? cliente !== null : modo === "varios" ? marcados.size > 0 : cuantosTodos > 0;

  return (
    <form method="get" action="/cobranzas/estado-de-cuenta" className="card flex flex-col gap-4 p-4 no-print">
      <input type="hidden" name="modo" value={modo} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-semibold">¿De quién quieres el estado de cuenta?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODOS.map((m) => {
            const activo = modo === m.valor;
            const Icono = m.icono;
            return (
              <button
                key={m.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => cambiarModo(m.valor)}
                className={cn(
                  "flex items-center gap-3 rounded-md border-2 px-4 py-3 text-left transition-colors",
                  // El elegido, en azul lleno: con un borde más fino no se distinguía.
                  activo
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
                )}
              >
                <Icono className="size-6 shrink-0" aria-hidden="true" />
                <span>
                  <span className="block text-base font-semibold">{m.titulo}</span>
                  <span className={cn("block text-sm", activo ? "text-white/85" : "text-[var(--fg-muted)]")}>{m.ayuda}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {modo === "uno" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="ec-cliente" className="text-sm font-medium text-[var(--fg-muted)]">
            Cliente
          </label>
          <Combobox
            id="ec-cliente"
            name="cliente"
            valor={cliente}
            onCambio={setCliente}
            opciones={clientes.map((c) => ({ valor: c.cliente_id, etiqueta: c.cliente, detalle: detalle(c) }))}
            placeholder="Elige un cliente"
            placeholderBusqueda="Escribe parte del nombre…"
            textoVacio="Ningún cliente con facturas coincide."
          />
        </div>
      ) : null}

      {modo === "varios" ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-[1_1_16rem]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar cliente…"
                aria-label="Buscar cliente"
                className={cn(campoBase, "h-11 w-full pl-9 text-base")}
              />
            </div>
            <button
              type="button"
              onClick={() => setMarcados(new Set(deudores.map((c) => c.cliente_id)))}
              className="inline-flex h-11 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base font-semibold hover:bg-[var(--surface-2)]"
            >
              Marcar los que deben ({deudores.length})
            </button>
            <button
              type="button"
              onClick={() => setMarcados(new Set())}
              disabled={marcados.size === 0}
              className="inline-flex h-11 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              Quitar todos
            </button>
          </div>
          <p className="text-sm text-[var(--fg-muted)]">
            {marcados.size === 0
              ? "Marca los clientes que quieras."
              : `${marcados.size} ${marcados.size === 1 ? "cliente marcado" : "clientes marcados"}.`}
          </p>
          <ul className="grid max-h-80 gap-1 overflow-y-auto rounded-md border border-[var(--border)] p-2 sm:grid-cols-2">
            {visibles.map((c) => (
              <li key={c.cliente_id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-sm px-2 py-2 hover:bg-[var(--surface-2)]">
                  <input
                    type="checkbox"
                    name="c"
                    value={c.cliente_id}
                    checked={marcados.has(c.cliente_id)}
                    onChange={() => alternar(c.cliente_id)}
                    className="mt-0.5 size-5 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-base">{c.cliente}</span>
                    <span className={cn("block text-sm", c.vencido > 0 ? "font-semibold text-[var(--danger)]" : "text-[var(--fg-muted)]")}>
                      {detalle(c)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            {visibles.length === 0 ? (
              <li className="px-2 py-3 text-base text-[var(--fg-muted)]">Ningún cliente coincide.</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {modo === "todos" ? (
        <p className="rounded-md bg-[var(--surface-2)] px-4 py-3 text-base">
          {periodo === "pendiente"
            ? `Saldrán los ${deudores.length} clientes que deben algo, uno detrás de otro, y un resumen al principio.`
            : `Saldrán los ${clientes.length} clientes con facturas, uno detrás de otro, y un resumen al principio.`}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="ec-periodo" className="text-sm font-medium text-[var(--fg-muted)]">
            Qué facturas salen
          </label>
          <select
            id="ec-periodo"
            name="periodo"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as PeriodoCuenta)}
            className={cn(campoBase, "h-11 text-base")}
          >
            {(Object.entries(PERIODOS_CUENTA) as [PeriodoCuenta, string][]).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={!listo}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-brand-600 px-5 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Ver estado de cuenta
          <ArrowRight className="size-5" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
