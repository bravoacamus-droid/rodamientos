"use client";

/*
 * Los filtros propios del tablero ejecutivo, que van en la misma fila que las
 * fechas (`FiltroRango` → `extra`). Escriben en la URL, como el resto: un
 * «clientes, este año contra el pasado» se manda por WhatsApp y abre eso.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SelectNativo } from "@rodatech/ui";

import { ETIQUETA_COMPARACION, type ModoComparacion } from "../../dominio/comparacion";

function useAplicar() {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [, iniciar] = React.useTransition();
  return React.useCallback(
    (clave: string, valor: string | null) => {
      const s = new URLSearchParams(params.toString());
      if (valor) s.set(clave, valor);
      else s.delete(clave);
      const q = s.toString();
      iniciar(() => router.replace(q ? `${ruta}?${q}` : ruta, { scroll: false }));
    },
    [params, ruta, router],
  );
}

export function FiltroComparar({ valor }: { valor: ModoComparacion }) {
  const aplicar = useAplicar();
  return (
    <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
      <span className="text-sm font-medium text-[var(--fg-muted)]">Comparar con</span>
      <SelectNativo
        value={valor}
        // «anterior» es el valor por defecto: no se escribe, la URL queda limpia.
        onChange={(e) => aplicar("comparar", e.target.value === "anio" ? "anio" : null)}
        className="w-full sm:w-auto"
      >
        {(Object.keys(ETIQUETA_COMPARACION) as ModoComparacion[]).map((m) => (
          <option key={m} value={m}>
            {ETIQUETA_COMPARACION[m]}
          </option>
        ))}
      </SelectNativo>
    </label>
  );
}

export function FiltroCliente({
  valor,
  clientes,
}: {
  valor: string | null;
  clientes: { id: string; nombre: string }[];
}) {
  const aplicar = useAplicar();
  return (
    <label className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
      <span className="text-sm font-medium text-[var(--fg-muted)]">Cliente</span>
      <SelectNativo
        value={valor ?? ""}
        onChange={(e) => aplicar("cliente", e.target.value || null)}
        className="w-full sm:w-72"
      >
        <option value="">Todos los clientes</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </SelectNativo>
    </label>
  );
}
