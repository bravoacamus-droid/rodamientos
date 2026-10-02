"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, SelectNativo } from "@rodatech/ui";

import { FiltroCliente } from "@/componentes/filtro-cliente";

const ESPERA_MS = 300;

const TRAMOS: { valor: string; etiqueta: string }[] = [
  { valor: "por_vencer", etiqueta: "Por vencer" },
  { valor: "1_30", etiqueta: "1 a 30 días" },
  { valor: "31_60", etiqueta: "31 a 60 días" },
  { valor: "61_90", etiqueta: "61 a 90 días" },
  { valor: "mas_90", etiqueta: "Más de 90 días" },
  { valor: "sin_vencimiento", etiqueta: "Sin vencimiento" },
];

export function FiltrosCarteraBarra({
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

  const soloVencido = params.get("vencido") === "1";

  return (
    /*
      El filtro de cliente, a la vista.

      La ficha del cliente enlaza aquí con «Lo que debe» (`?cliente=<id>`), y
      la cartera se filtraba sin decirlo: no había campo que enseñara de quién
      era lo que se veía ni equis para volver a la cartera entera. Se veía
      como si los demás clientes no debieran nada (revisión por módulos del
      02/10). Es el mismo buscador que facturación.

      Rejilla por el ancho de la caja (`@container` en la sección): en el
      teléfono, de dos en dos; con la caja ancha, en una fila.
    */
    <div className="grid grid-cols-2 items-end gap-3 px-4 pb-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,3fr)_minmax(0,2fr)_auto]">
      <label className="col-span-2 flex flex-col gap-1 @3xl:col-span-1">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Buscar</span>
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Número, cliente u orden de compra"
          autoComplete="off"
        />
      </label>

      <div className="col-span-2 @3xl:col-span-1">
        <FiltroCliente
          valor={params.get("cliente")}
          nombre={nombreCliente}
          onCambiar={(id) => aplicar("cliente", id ?? "")}
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Antigüedad</span>
        <SelectNativo
          value={params.get("tramo") ?? ""}
          onChange={(e) => aplicar("tramo", e.target.value)}
        >
          <option value="">Todas</option>
          {TRAMOS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
        </SelectNativo>
      </label>

      {/* Un botón y no una casilla: es el filtro que más se usa y así se
          activa de un toque, también en el móvil. */}
      <button
        type="button"
        onClick={() => aplicar("vencido", soloVencido ? "" : "1")}
        aria-pressed={soloVencido}
        // La altura de los campos (`h-control-md`) y no 36 px: es donde
        // se lee como parte de la fila y no como un botón suelto.
        className={`inline-flex h-control-md items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors ${
          soloVencido
            ? "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]"
            : "border-[var(--border)] hover:bg-[var(--surface-2)]"
        }`}
      >
        Solo vencido
      </button>
    </div>
  );
}
