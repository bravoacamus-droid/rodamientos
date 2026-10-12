"use client";

import * as React from "react";
import { Check, ChevronDown, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button, Input, Popover, PopoverContent, PopoverTrigger, campoBase, cn } from "@rodatech/ui";

import {
  crearCondicion,
  editarCondicion,
  eliminarCondicion,
  listarCondiciones,
  type Condicion,
} from "../../acciones/condiciones";

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Las condiciones de la cotización, de una lista que se mantiene aquí mismo
 * (Luis, 12/10: *«un select inteligente que va a guardar cosas ahí, añadir o
 * eliminar […] factura por 30 días, 60, 90 días […] editar todo eso»*).
 *
 * Se busca escribiendo; si lo escrito no está, se ofrece guardarlo. Cada
 * opción tiene su lápiz y su papelera, con borde: son botones. Borrar pide
 * confirmación en la misma fila, sin un diálogo encima de otro.
 *
 * La cotización guarda el TEXTO elegido: editar o borrar una opción de la
 * lista no cambia las cotizaciones que ya la usan.
 */
export function SelectorCondiciones({
  valor,
  onCambiar,
}: {
  valor: string;
  onCambiar: (texto: string) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [lista, setLista] = React.useState<Condicion[] | null>(null);
  const [busca, setBusca] = React.useState("");
  const [editando, setEditando] = React.useState<{ id: string; texto: string } | null>(null);
  const [borrando, setBorrando] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ocupado, empezar] = React.useTransition();

  const cargar = React.useCallback(() => {
    void listarCondiciones().then((r) => {
      if (r.ok) setLista(r.datos);
      else setError(r.error);
    });
  }, []);

  React.useEffect(() => {
    if (abierto && lista === null) cargar();
  }, [abierto, lista, cargar]);

  const visibles = (lista ?? []).filter((c) => normal(c.texto).includes(normal(busca)));
  const existe = (lista ?? []).some((c) => normal(c.texto) === normal(busca));

  const elegir = (texto: string) => {
    onCambiar(texto);
    setAbierto(false);
    setBusca("");
  };

  const crear = () =>
    empezar(async () => {
      setError(null);
      const r = await crearCondicion(busca);
      if (!r.ok) return setError(r.error);
      setLista((l) => [...(l ?? []), r.datos]);
      elegir(r.datos.texto);
    });

  const guardarEdicion = () =>
    editando &&
    empezar(async () => {
      setError(null);
      const anterior = lista?.find((c) => c.id === editando.id)?.texto;
      const r = await editarCondicion(editando.id, editando.texto);
      if (!r.ok) return setError(r.error);
      setLista((l) => (l ?? []).map((c) => (c.id === r.datos.id ? r.datos : c)));
      // Si la editada era la puesta en esta cotización, se pone la nueva.
      if (anterior && anterior === valor) onCambiar(r.datos.texto);
      setEditando(null);
    });

  const borrar = (id: string) =>
    empezar(async () => {
      setError(null);
      const r = await eliminarCondicion(id);
      if (!r.ok) return setError(r.error);
      setLista((l) => (l ?? []).filter((c) => c.id !== id));
      setBorrando(null);
    });

  return (
    <Popover
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) {
          setEditando(null);
          setBorrando(null);
          setError(null);
        }
      }}
    >
      <div className="flex gap-2">
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              campoBase,
              "flex h-control-md min-w-0 flex-1 items-center justify-between gap-2 px-3 text-left text-sm",
            )}
          >
            <span className={cn("truncate", !valor && "text-[var(--fg-subtle)]")}>
              {valor || "Elige o escribe una condición…"}
            </span>
            <ChevronDown className="size-4 shrink-0 text-[var(--fg-subtle)]" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        {valor ? (
          <Button type="button" variant="outline" onClick={() => onCambiar("")} aria-label="Quitar la condición">
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <PopoverContent className="w-[min(32rem,calc(100vw-2rem))]">
        <div className="border-b border-[var(--border-soft)] p-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
              aria-hidden="true"
            />
            <Input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (visibles.length === 1 && visibles[0]) elegir(visibles[0].texto);
                else if (busca.trim().length >= 2 && !existe) crear();
              }}
              placeholder="Busca o escribe una nueva…"
              className="pl-8"
            />
          </div>
        </div>

        <ul className="max-h-72 overflow-y-auto p-1">
          {lista === null ? (
            <li className="px-3 py-2 text-sm text-[var(--fg-muted)]">Cargando…</li>
          ) : null}
          {visibles.map((c) =>
            editando?.id === c.id ? (
              <li key={c.id} className="flex items-center gap-2 px-2 py-1.5">
                <Input
                  autoFocus
                  value={editando.texto}
                  onChange={(e) => setEditando({ id: c.id, texto: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      guardarEdicion();
                    }
                    if (e.key === "Escape") setEditando(null);
                  }}
                  className="flex-1"
                />
                <Button type="button" size="sm" onClick={guardarEdicion} disabled={ocupado}>
                  Guardar
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
              </li>
            ) : borrando === c.id ? (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--danger-bg)] px-3 py-2">
                <span className="min-w-0 flex-1 text-sm">
                  ¿Quitar «<strong>{c.texto}</strong>» de la lista?
                </span>
                <Button type="button" size="sm" variant="danger" onClick={() => borrar(c.id)} disabled={ocupado}>
                  Sí, quitar
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setBorrando(null)}>
                  No
                </Button>
              </li>
            ) : (
              <li key={c.id} className="flex items-center gap-1 rounded-md hover:bg-[var(--surface-2)]">
                <button
                  type="button"
                  onClick={() => elegir(c.texto)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  <Check
                    className={cn("size-4 shrink-0", c.texto === valor ? "text-brand-600" : "invisible")}
                    aria-hidden="true"
                  />
                  <span className="truncate">{c.texto}</span>
                </button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Editar «${c.texto}»`}
                  onClick={() => setEditando({ id: c.id, texto: c.texto })}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Quitar «${c.texto}» de la lista`}
                  onClick={() => setBorrando(c.id)}
                  className="mr-1"
                >
                  <Trash2 className="size-4 text-[var(--danger)]" aria-hidden="true" />
                </Button>
              </li>
            ),
          )}
          {lista !== null && visibles.length === 0 && !busca.trim() ? (
            <li className="px-3 py-2 text-sm text-[var(--fg-muted)]">La lista está vacía: escribe la primera.</li>
          ) : null}
        </ul>

        {busca.trim().length >= 2 && !existe ? (
          <div className="border-t border-[var(--border-soft)] p-2">
            <Button type="button" variant="outline" onClick={crear} disabled={ocupado} className="w-full justify-start gap-1.5">
              <Plus className="size-4" aria-hidden="true" />
              Guardar «{busca.trim()}» en la lista
            </Button>
          </div>
        ) : null}
        {error ? <p className="border-t border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
