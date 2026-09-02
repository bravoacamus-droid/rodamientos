"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado, y así «lo que hizo Rosa la
// semana pasada» se puede mandar por enlace.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, SelectNativo } from "@rodatech/ui";

import { ENTIDADES, ETIQUETA_ENTIDAD } from "../dominio/tipos";

export function FiltrosBarra({
  personas,
}: {
  personas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [, iniciar] = React.useTransition();

  const vigentes = React.useRef(params);
  vigentes.current = params;

  const aplicar = React.useCallback(
    (clave: string, valor: string) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
      // Cambiar el criterio y seguir en la página 3 del resultado anterior no
      // significa nada.
      siguientes.delete("cursor");
      const query = siguientes.toString();
      iniciar(() => router.replace(query ? `${ruta}?${query}` : ruta, { scroll: false }));
    },
    [router, ruta],
  );

  return (
    <div className="mb-3 grid gap-3 px-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Qué</span>
        <SelectNativo
          value={params.get("entidad") ?? ""}
          onChange={(e) => aplicar("entidad", e.target.value)}
        >
          <option value="">Todo</option>
          {ENTIDADES.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ENTIDAD[e]}
            </option>
          ))}
        </SelectNativo>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Quién</span>
        <SelectNativo
          value={params.get("usuario") ?? ""}
          onChange={(e) => aplicar("usuario", e.target.value)}
        >
          <option value="">Cualquiera</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </SelectNativo>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Desde</span>
        <Input
          type="date"
          value={params.get("desde") ?? ""}
          onChange={(e) => aplicar("desde", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Hasta</span>
        <Input
          type="date"
          value={params.get("hasta") ?? ""}
          onChange={(e) => aplicar("hasta", e.target.value)}
        />
      </label>
    </div>
  );
}
