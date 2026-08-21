"use client";

import * as React from "react";
import { Search, Loader2, Package, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input, Badge } from "@/components/ui/primitives";
import { money, num, truncar, cn } from "@/lib/utils";

export type ProductoBusqueda = {
  id: string;
  sku: string;
  codigo_fabricante: string;
  descripcion: string;
  marca: string | null;
  categoria: string | null;
  stock: number;
  precio_mayorista: number;
  costo_promedio: number;
  estado_stock: string;
};

export function BuscadorProductos({
  onSeleccionar,
  placeholder = "Buscar producto por código, SKU o descripción…",
  autoFocus,
  className,
}: {
  onSeleccionar: (p: ProductoBusqueda) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [q, setQ] = React.useState("");
  const [resultados, setResultados] = React.useState<ProductoBusqueda[]>([]);
  const [cargando, setCargando] = React.useState(false);
  const [abierto, setAbierto] = React.useState(false);
  const [sel, setSel] = React.useState(0);
  const contenedor = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  React.useEffect(() => {
    if (q.trim().length < 2) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    setCargando(true);
    const t = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("buscar_productos", { p_q: q.trim(), p_limit: 12 });
      if (cancelado) return;
      setResultados((data ?? []) as ProductoBusqueda[]);
      setSel(0);
      setAbierto(true);
      setCargando(false);
    }, 240);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [q]);

  const elegir = (p: ProductoBusqueda) => {
    onSeleccionar(p);
    setQ("");
    setResultados([]);
    setAbierto(false);
  };

  return (
    <div ref={contenedor} className={cn("relative", className)}>
      <div className="relative">
        {cargando ? (
          <Loader2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-brand-600" />
        ) : (
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        )}
        <Input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => resultados.length && setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, resultados.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            }
            if (e.key === "Enter" && resultados[sel]) {
              e.preventDefault();
              elegir(resultados[sel]);
            }
            if (e.key === "Escape") setAbierto(false);
          }}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>

      {abierto && resultados.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[340px] overflow-y-auto rounded-lg border bg-[var(--surface)] p-1 elev-3 animate-scale-in">
          {resultados.map((p, i) => {
            const hay = Number(p.stock) > 0;
            return (
              <button
                key={p.id}
                type="button"
                onMouseEnter={() => setSel(i)}
                onClick={() => elegir(p)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
                  i === sel ? "bg-brand-50" : "hover:bg-[var(--surface-2)]"
                )}
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: hay ? "var(--ok-bg)" : "var(--danger-bg)",
                    color: hay ? "var(--ok)" : "var(--danger)",
                  }}
                >
                  <Package className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[12.5px] font-semibold text-fg">{p.sku}</span>
                    {p.marca && <Badge tone="neutral" size="xs">{p.marca}</Badge>}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {truncar(p.descripcion, 68)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className="block text-[11.5px] font-semibold tabular"
                    style={{ color: hay ? "var(--ok)" : "var(--danger)" }}
                  >
                    {num(p.stock, 0)} und
                  </span>
                  <span className="block text-[11.5px] text-fg tabular">
                    {money(p.precio_mayorista)}
                  </span>
                </span>
                <Plus className="size-3.5 shrink-0 text-brand-500" />
              </button>
            );
          })}
        </div>
      )}

      {abierto && !cargando && q.trim().length >= 2 && resultados.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg border bg-[var(--surface)] px-3 py-4 text-center elev-2">
          <p className="text-[12px] text-muted">Sin coincidencias para «{q}»</p>
        </div>
      )}
    </div>
  );
}
