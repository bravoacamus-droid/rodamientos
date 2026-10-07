"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado, y así «lo que hizo Rosa la
// semana pasada» se puede mandar por enlace.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useParamsVigentes } from "@/lib/use-filtros-url";
import { Combobox, Input, SelectNativo } from "@rodatech/ui";

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

  // Parte del último filtro pedido, no del último cargado (07/10).
  const vigentes = useParamsVigentes();

  const aplicar = React.useCallback(
    (clave: string, valor: string) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
      // Cambiar el criterio y seguir en la página 3 del resultado anterior no
      // significa nada.
      siguientes.delete("cursor");
      const query = siguientes.toString();
      vigentes.current = siguientes;
      iniciar(() => router.replace(query ? `${ruta}?${query}` : ruta, { scroll: false }));
    },
    [router, ruta, vigentes],
  );

  return (
    <div className="mb-3 grid gap-3 px-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Qué</span>
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

      <div className="flex w-full flex-col gap-1 sm:w-52">
        <label htmlFor="f-quien" className="text-sm font-medium text-[var(--fg-muted)]">Quién</label>
        <Combobox
          id="f-quien"
          opciones={personas.map((p) => ({ valor: p.id, etiqueta: p.nombre }))}
          valor={params.get("usuario") || null}
          onCambio={(v) => aplicar("usuario", v ?? "")}
          placeholder="Cualquiera"
          placeholderBusqueda="Escribe el nombre…"
          textoVacio="Nadie coincide."
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Desde</span>
        <Input
          type="date"
          value={params.get("desde") ?? ""}
          onChange={(e) => aplicar("desde", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Hasta</span>
        <Input
          type="date"
          value={params.get("hasta") ?? ""}
          onChange={(e) => aplicar("hasta", e.target.value)}
        />
      </label>
    </div>
  );
}
