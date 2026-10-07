"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado, y así un filtro se puede
// compartir por enlace y sobrevive a recargar la página.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, SelectNativo } from "@rodatech/ui";

import { FiltroCliente } from "@/componentes/filtro-cliente";

import { ETIQUETA_ESTADO } from "../dominio/tipos";

const ESPERA_MS = 300;

export function FiltrosGuiasBarra({
  nombreCliente,
}: {
  /** La razón social del cliente filtrado, si hay uno. */
  nombreCliente: string | null;
}) {
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

  return (
    /* Rejilla y no `flex-wrap`: con anchos libres, el filtro de cliente se
       estiraba al nombre más largo y empujaba las fechas a la fila de abajo.

       Y por el ancho de la tarjeta (`@container`), no de la pantalla.
       Revisión por módulos del 02/10: a 1280 con el menú abierto entraban
       las siete columnas en 920 px y las fechas se cortaban en «dd/mm/yy»;
       en el teléfono, cinco campos uno debajo de otro empujaban la lista
       fuera de la primera pantalla.

       Las fechas salen de aquí al 07/10: las pone la barra de periodo común
       (`BarraPeriodo`), la misma de las cinco listas de ventas. */
    <div className="@container">
    <div className="grid grid-cols-2 gap-3 px-4 pb-4 @3xl:grid-cols-5">
      <label className="col-span-2 flex flex-col gap-1">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Buscar</span>
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Número, dirección de entrega o placa"
          autoComplete="off"
        />
      </label>

      {/* El mismo buscador que en facturación: se teclea y va listando, en
          vez de un desplegable con la cartera entera dentro. */}
      <div className="col-span-2">
        <FiltroCliente
          valor={params.get("cliente")}
          nombre={nombreCliente}
          onCambiar={(id) => aplicar("cliente", id ?? "")}
        />
      </div>

      <label className="col-span-2 flex flex-col gap-1 @3xl:col-span-1">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Estado</span>
        <SelectNativo
          value={params.get("estado") ?? ""}
          onChange={(e) => aplicar("estado", e.target.value)}
        >
          <option value="">Todos</option>
          {Object.entries(ETIQUETA_ESTADO).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </SelectNativo>
      </label>

    </div>
    </div>
  );
}
