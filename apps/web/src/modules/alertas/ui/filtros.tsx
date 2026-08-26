"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado, igual que en cobranzas.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, SelectNativo } from "@rodatech/ui";

import {
  ETIQUETA_FAMILIA,
  ETIQUETA_SEVERIDAD,
  ETIQUETA_TIPO,
  TIPOS_QUE_SE_GENERAN,
  type Familia,
  type Severidad,
} from "../dominio/tipos";

const ESPERA_MS = 300;

const SEVERIDADES: readonly Severidad[] = ["critica", "alta", "media", "baja", "info"];
const FAMILIAS: readonly Familia[] = ["almacen", "dinero", "documentos"];

export function FiltrosBandejaBarra() {
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

  const archivadas = params.get("ver") === "archivadas";

  return (
    <div className="flex flex-wrap items-end gap-3 px-4 pb-4">
      <label className="flex min-w-56 flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Buscar</span>
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Producto, cliente o número de documento"
          autoComplete="off"
        />
      </label>

      <label className="flex min-w-40 flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">A quién le toca</span>
        <SelectNativo
          value={params.get("familia") ?? ""}
          onChange={(e) => aplicar("familia", e.target.value)}
        >
          <option value="">Todo</option>
          {FAMILIAS.map((f) => (
            <option key={f} value={f}>
              {ETIQUETA_FAMILIA[f]}
            </option>
          ))}
        </SelectNativo>
      </label>

      <label className="flex min-w-36 flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Gravedad</span>
        <SelectNativo
          value={params.get("severidad") ?? ""}
          onChange={(e) => aplicar("severidad", e.target.value)}
        >
          <option value="">Toda</option>
          {SEVERIDADES.map((s) => (
            <option key={s} value={s}>
              {ETIQUETA_SEVERIDAD[s]}
            </option>
          ))}
        </SelectNativo>
      </label>

      <label className="flex min-w-48 flex-col gap-1">
        <span className="text-xs font-medium text-[var(--fg-muted)]">Tipo</span>
        <SelectNativo
          value={params.get("tipo") ?? ""}
          onChange={(e) => aplicar("tipo", e.target.value)}
        >
          <option value="">Todos</option>
          {/* Solo los que `generar_alertas()` produce hoy: ofrecer
              «sin rotación» o «margen bajo», que están permitidos en el
              esquema pero nadie genera, sería ofrecer dos filtros que siempre
              devuelven cero. */}
          {TIPOS_QUE_SE_GENERAN.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO[t]}
            </option>
          ))}
        </SelectNativo>
      </label>

      <button
        type="button"
        onClick={() => aplicar("ver", archivadas ? "" : "archivadas")}
        aria-pressed={archivadas}
        className={`inline-flex h-9 items-center rounded-sm border px-3 text-sm font-medium transition-colors ${
          archivadas
            ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200"
            : "border-[var(--border)] hover:bg-[var(--surface-2)]"
        }`}
      >
        {archivadas ? "Viendo archivadas" : "Ver archivadas"}
      </button>
    </div>
  );
}
