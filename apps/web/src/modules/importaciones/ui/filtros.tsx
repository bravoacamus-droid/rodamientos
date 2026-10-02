"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@rodatech/ui";

const ESPERA_MS = 300;

export function FiltrosImportacionesBarra() {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [, iniciarTransicion] = React.useTransition();

  const vigentes = React.useRef(params);
  vigentes.current = params;

  const aplicar = React.useCallback(
    (clave: string, valor: string) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);

      const query = siguientes.toString();
      iniciarTransicion(() =>
        router.replace(query ? `${ruta}?${query}` : ruta, { scroll: false }),
      );
    },
    [ruta, router],
  );

  const [texto, setTexto] = React.useState(params.get("q") ?? "");

  React.useEffect(() => {
    const actual = vigentes.current.get("q") ?? "";
    if (texto === actual) return;
    const t = setTimeout(() => aplicar("q", texto.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [texto, aplicar]);

  // El filtro arranca ENCENDIDO: sin parámetro en la URL, la pantalla enseña
  // solo lo abierto. Por eso `"0"` es lo que hay que escribir para verlo todo,
  // y no la ausencia del parámetro.
  const soloAbiertas = (params.get("abiertas") ?? "1") === "1";

  return (
    <div className="flex flex-wrap items-end gap-3 px-4 pb-4">
      <label className="flex min-w-56 flex-1 flex-col gap-1">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Buscar</span>
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Número de compra, tracking, courier o factura"
          autoComplete="off"
        />
      </label>

      {/*
        Dos opciones a la vista y no un botón cuyo texto cambia con el estado:
        «Solo lo que viene / Viendo todo» no decía qué pasaba al pulsarlo, y en
        azul parecía la acción principal (revisión de diseño del 02/10).
      */}
      <div role="group" aria-label="Qué importaciones ver" className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Ver</span>
        <div className="inline-flex rounded-md border border-[var(--border)] p-0.5">
          {(
            [
              ["1", "En camino"],
              ["0", "Todas"],
            ] as const
          ).map(([valor, texto]) => {
            const activo = (valor === "1") === soloAbiertas;
            return (
              <button
                key={valor}
                type="button"
                aria-pressed={activo}
                onClick={() => aplicar("abiertas", valor)}
                className={`h-9 rounded-sm px-3 text-sm font-medium transition-colors ${
                  activo ? "bg-[var(--surface-2)] text-[var(--fg)] shadow-sm" : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                }`}
              >
                {texto}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
