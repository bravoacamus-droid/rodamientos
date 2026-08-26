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
        <span className="text-xs font-medium text-[var(--fg-muted)]">Buscar</span>
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Número de compra, tracking, courier o factura"
          autoComplete="off"
        />
      </label>

      <button
        type="button"
        onClick={() => aplicar("abiertas", soloAbiertas ? "0" : "1")}
        aria-pressed={soloAbiertas}
        className={`inline-flex h-9 items-center rounded-sm border px-3 text-sm font-medium transition-colors ${
          soloAbiertas
            ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200"
            : "border-[var(--border)] hover:bg-[var(--surface-2)]"
        }`}
      >
        {soloAbiertas ? "Solo lo que viene" : "Viendo todo"}
      </button>
    </div>
  );
}
