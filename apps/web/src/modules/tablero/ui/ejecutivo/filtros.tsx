"use client";

/*
 * Los filtros propios del tablero ejecutivo, que van en la misma fila que las
 * fechas (`FiltroRango` → `extra`). Escriben en la URL, como el resto: un
 * «clientes, este año contra el pasado» se manda por WhatsApp y abre eso.
 */

import * as React from "react";
import { Combobox, SelectNativo } from "@rodatech/ui";

import { useFiltrosUrl } from "@/lib/use-filtros-url";

import { ETIQUETA_COMPARACION, type ModoComparacion } from "../../dominio/comparacion";

/** Parte del último cambio pedido, no del último cargado (07/10). */
function useAplicar() {
  const { aplicar } = useFiltrosUrl();
  return React.useCallback((clave: string, valor: string | null) => aplicar({ [clave]: valor }), [aplicar]);
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
  // Con buscador y no un `<select>` (07/10). Luis: *«tiene que tener un
  // buscador, no voy a buscar a mano»* — son decenas de razones sociales.
  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
      <label htmlFor="f-cliente-reporte" className="text-sm font-medium text-[var(--fg-muted)]">
        Cliente
      </label>
      <Combobox
        id="f-cliente-reporte"
        className="w-full sm:w-72"
        opciones={clientes.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
        valor={valor}
        onCambio={(v) => aplicar("cliente", v)}
        placeholder="Todos los clientes"
        placeholderBusqueda="Escribe parte del nombre…"
        textoVacio="Ningún cliente coincide."
      />
    </div>
  );
}
