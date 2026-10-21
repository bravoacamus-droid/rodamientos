"use client";

import * as React from "react";
import { Input } from "@rodatech/ui";
import { ChevronDown } from "lucide-react";

/**
 * Texto libre con sus sugerencias a la vista.
 *
 * Era un `<datalist>`, y el QA del 20/10 lo dio por roto: *«no salen las
 * opciones de Cargo»*. Tenía razón a medias —salían, pero solo al escribir o
 * con doble clic, sin una flecha que lo dijera—, y para Willy una lista que
 * no se ve no existe. Ahora hay flecha, y la lista va debajo del campo, en
 * el flujo de la página: dentro de un diálogo con scroll, una capa flotante
 * se cortaba por abajo.
 */
export function InputSugerencias({
  id,
  valor,
  onCambio,
  sugerencias,
  placeholder,
  className,
}: {
  id: string;
  valor: string;
  onCambio: (v: string) => void;
  sugerencias: readonly string[];
  placeholder?: string;
  className?: string;
}) {
  const [abierta, setAbierta] = React.useState(false);
  const t = valor.trim().toLowerCase();
  // Con la flecha se ven todas; escribiendo, las que coinciden.
  const [todas, setTodas] = React.useState(false);
  const lista = todas || t === "" ? sugerencias : sugerencias.filter((s) => s.toLowerCase().includes(t));
  const visible = abierta && lista.length > 0 && !(lista.length === 1 && lista[0] === valor);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <Input
          id={id}
          className={`${className ?? ""} pr-11`}
          value={valor}
          onChange={(e) => {
            onCambio(e.target.value);
            setTodas(false);
            setAbierta(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAbierta(false);
          }}
          onBlur={() => setAbierta(false)}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={visible}
          aria-controls={`${id}-lista`}
        />
        <button
          type="button"
          // mousedown y no click: así el campo no pierde el foco y la lista
          // no se cierra antes de abrirse.
          onMouseDown={(e) => {
            e.preventDefault();
            setTodas(true);
            setAbierta((a) => !a);
          }}
          aria-label="Ver opciones"
          title="Ver opciones"
          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
        >
          <ChevronDown className="size-4" aria-hidden="true" />
        </button>
      </div>
      {visible ? (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="max-h-48 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-sm"
        >
          {lista.map((s) => (
            <li key={s} role="option" aria-selected={s === valor}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onCambio(s);
                  setAbierta(false);
                }}
                className="flex min-h-10 w-full items-center px-3 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
