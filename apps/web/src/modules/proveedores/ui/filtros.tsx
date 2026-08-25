"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado, y así un filtro se puede
// compartir por enlace y sobrevive a recargar la página.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, SelectNativo } from "@rodatech/ui";

const ESPERA_MS = 300;

export function FiltrosProveedoresBarra({
  marcas,
}: {
  marcas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [, iniciarTransicion] = React.useTransition();

  // Los parámetros vigentes se leen de una ref y no de la clausura: si no, un
  // temporizador de la búsqueda que ya estaba en vuelo llevaría la copia vieja
  // y borraría el filtro recién elegido al dispararse.
  const vigentes = React.useRef(params);
  vigentes.current = params;

  const aplicar = React.useCallback(
    (clave: string, valor: string) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
      // Al cambiar el criterio, seguir en la página 3 del resultado anterior
      // no significa nada.
      siguientes.delete("cursor");

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

  const inactivos = params.get("inactivos") === "1";

  return (
    <div className="flex flex-wrap items-end gap-3 px-4 pb-4">
      <label className="flex min-w-56 flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Buscar</span>
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Razón social, RUC o código"
          autoComplete="off"
        />
      </label>

      {/* La pregunta que justifica que exista `proveedor_marcas`. */}
      <label className="flex min-w-44 flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">
          Vende la marca
        </span>
        <SelectNativo
          value={params.get("marca") ?? ""}
          onChange={(e) => aplicar("marca", e.target.value)}
        >
          <option value="">Cualquiera</option>
          {marcas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </SelectNativo>
      </label>

      <label className="flex min-w-40 flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Tipo</span>
        <SelectNativo
          value={params.get("tipo") ?? ""}
          onChange={(e) => aplicar("tipo", e.target.value)}
        >
          <option value="">Todos</option>
          <option value="local">Local</option>
          <option value="importacion">Importación</option>
        </SelectNativo>
      </label>

      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          checked={inactivos}
          onChange={(e) => aplicar("inactivos", e.target.checked ? "1" : "")}
          className="size-4"
        />
        Ver los dados de baja
      </label>
    </div>
  );
}
