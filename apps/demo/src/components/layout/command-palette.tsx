"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, Loader2, Package, Building2, FileText } from "lucide-react";
import { iconoNav } from "./iconos";
import { createClient } from "@/lib/supabase/client";
import { navegacionPorRol, type Rol } from "@/lib/navegacion";
import { cn, money, num } from "@/lib/utils";

type Resultado = {
  id: string;
  titulo: string;
  subtitulo?: string;
  meta?: string;
  href: string;
  icon: React.ReactNode;
  grupo: string;
};

export function CommandPalette({
  abierto,
  onCerrar,
  rol,
}: {
  abierto: boolean;
  onCerrar: () => void;
  rol: Rol;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [remoto, setRemoto] = React.useState<Resultado[]>([]);
  const [cargando, setCargando] = React.useState(false);
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const paginas = React.useMemo<Resultado[]>(
    () =>
      navegacionPorRol(rol).flatMap((g) =>
        g.items.map((i) => {
          const Icon = iconoNav(i.icon);
          return {
            id: i.href,
            titulo: i.label,
            subtitulo: i.descripcion,
            href: i.href,
            icon: <Icon className="size-4" />,
            grupo: "Navegación",
          };
        })
      ),
    [rol]
  );

  React.useEffect(() => {
    if (abierto) {
      setQ("");
      setRemoto([]);
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [abierto]);

  React.useEffect(() => {
    if (!abierto || q.trim().length < 2) {
      setRemoto([]);
      return;
    }
    let cancelado = false;
    setCargando(true);
    const t = setTimeout(async () => {
      const supabase = createClient();
      const termino = q.trim();

      const [prods, clis, docs] = await Promise.all([
        supabase.rpc("buscar_productos", { p_q: termino, p_limit: 6 }),
        supabase
          .from("clientes")
          .select("id, codigo, razon_social, ruc, distrito")
          .ilike("busqueda", `%${termino.toLowerCase()}%`)
          .limit(4),
        supabase
          .from("comprobantes")
          .select("id, numero, total, moneda, clientes(razon_social)")
          .ilike("numero", `%${termino.toUpperCase()}%`)
          .limit(4),
      ]);

      if (cancelado) return;

      const out: Resultado[] = [];

      for (const p of prods.data ?? []) {
        out.push({
          id: `p-${p.id}`,
          titulo: `${p.sku} · ${p.marca ?? ""}`.trim(),
          subtitulo: p.descripcion,
          meta: `${num(p.stock, 0)} und · ${money(p.precio_mayorista)}`,
          href: `/productos/${p.id}`,
          icon: <Package className="size-4" />,
          grupo: "Productos",
        });
      }
      for (const c of clis.data ?? []) {
        out.push({
          id: `c-${c.id}`,
          titulo: c.razon_social,
          subtitulo: `${c.codigo}${c.ruc ? ` · RUC ${c.ruc}` : ""}`,
          meta: c.distrito ?? undefined,
          href: `/clientes/${c.id}`,
          icon: <Building2 className="size-4" />,
          grupo: "Clientes",
        });
      }
      for (const d of docs.data ?? []) {
        const cli = d.clientes as unknown as { razon_social: string } | null;
        out.push({
          id: `d-${d.id}`,
          titulo: d.numero,
          subtitulo: cli?.razon_social,
          meta: money(d.total, d.moneda),
          href: `/facturacion/${d.id}`,
          icon: <FileText className="size-4" />,
          grupo: "Comprobantes",
        });
      }

      setRemoto(out);
      setCargando(false);
    }, 220);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [q, abierto]);

  const filtradas = React.useMemo(() => {
    if (!q.trim()) return paginas;
    const t = q.toLowerCase();
    return paginas.filter(
      (p) => p.titulo.toLowerCase().includes(t) || p.subtitulo?.toLowerCase().includes(t)
    );
  }, [q, paginas]);

  const items = React.useMemo(() => [...remoto, ...filtradas], [remoto, filtradas]);

  React.useEffect(() => setSel(0), [items.length]);

  const abrir = React.useCallback(
    (r: Resultado) => {
      onCerrar();
      router.push(r.href);
    },
    [onCerrar, router]
  );

  React.useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onCerrar();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, items.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter" && items[sel]) {
        e.preventDefault();
        abrir(items[sel]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [abierto, items, sel, onCerrar, abrir]);

  if (!abierto) return null;

  let grupoActual = "";

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center px-4 pt-[12vh]">
      <div className="fixed inset-0 bg-steel-950/45 backdrop-blur-[3px]" onClick={onCerrar} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border bg-[var(--surface)] elev-3 animate-scale-in">
        <div className="flex items-center gap-2.5 border-b px-4">
          {cargando ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-brand-600" />
          ) : (
            <Search className="size-4 shrink-0 text-subtle" />
          )}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar productos, clientes, comprobantes o ir a un módulo…"
            className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
          />
          <kbd className="hidden rounded border bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-subtle sm:block">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-muted">
              {q.trim().length >= 2 ? "Sin resultados para esta búsqueda." : "Escriba para buscar…"}
            </p>
          )}

          {items.map((r, i) => {
            const nuevoGrupo = r.grupo !== grupoActual;
            grupoActual = r.grupo;
            return (
              <React.Fragment key={r.id}>
                {nuevoGrupo && (
                  <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-subtle">
                    {r.grupo}
                  </p>
                )}
                <button
                  onMouseEnter={() => setSel(i)}
                  onClick={() => abrir(r)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    i === sel ? "bg-brand-50 text-brand-800" : "hover:bg-[var(--surface-2)]"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-md",
                      i === sel ? "bg-brand-600 text-white" : "bg-[var(--surface-2)] text-subtle"
                    )}
                  >
                    {r.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{r.titulo}</span>
                    {r.subtitulo && (
                      <span className="block truncate text-[11px] text-muted">{r.subtitulo}</span>
                    )}
                  </span>
                  {r.meta && (
                    <span className="shrink-0 text-[11px] text-subtle tabular">{r.meta}</span>
                  )}
                  {i === sel && <CornerDownLeft className="size-3.5 shrink-0 text-brand-500" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-4 border-t bg-[var(--surface-2)] px-4 py-2 text-[10.5px] text-subtle">
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-[var(--surface)] px-1 py-px">↑</kbd>
            <kbd className="rounded border bg-[var(--surface)] px-1 py-px">↓</kbd> navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-[var(--surface)] px-1 py-px">↵</kbd> abrir
          </span>
          <span className="ml-auto hidden sm:block">Rodatech ERP · búsqueda global</span>
        </div>
      </div>
    </div>
  );
}
