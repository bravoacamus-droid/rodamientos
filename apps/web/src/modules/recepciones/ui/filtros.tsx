"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado, y así un filtro se puede
// compartir por enlace y sobrevive a recargar la página.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, SelectNativo } from "@rodatech/ui";

import type { ProveedorOpcion } from "../dominio/tipos";

const ESPERA_MS = 300;

export function FiltrosRecepcionesBarra({
  proveedores,
}: {
  proveedores: ProveedorOpcion[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [, iniciarTransicion] = React.useTransition();

  // Los parámetros vigentes se leen de una ref y no de la clausura: si no,
  // un temporizador de la búsqueda que ya estaba en vuelo llevaría la copia
  // vieja y borraría el filtro recién elegido al dispararse.
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
      const destino = query ? `${ruta}?${query}` : ruta;
      iniciarTransicion(() => router.replace(destino, { scroll: false }));
    },
    [ruta, router],
  );

  const [texto, setTexto] = React.useState(params.get("q") ?? "");

  // La caja de texto se escribe letra a letra; sin espera serían diez
  // navegaciones por término.
  React.useEffect(() => {
    const actual = vigentes.current.get("q") ?? "";
    if (texto === actual) return;
    const t = setTimeout(() => aplicar("q", texto.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [texto, aplicar]);

  return (
    <div className="flex flex-wrap items-end gap-3 px-4 pb-4">
      <label className="flex min-w-56 flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Buscar</span>
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Número, guía o factura del proveedor"
          autoComplete="off"
        />
      </label>

      <label className="flex min-w-48 flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Proveedor</span>
        <SelectNativo
          value={params.get("proveedor") ?? ""}
          onChange={(e) => aplicar("proveedor", e.target.value)}
        >
          <option value="">Todos</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.razon_social}
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
