"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X, Search, ChevronLeft, ChevronRight, Check, Sun, Moon } from "lucide-react";
import { cn, debounce } from "@/lib/utils";
import { Button, Input } from "./primitives";

/* ------------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  titulo,
  descripcion,
  children,
  footer,
  ancho = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  ancho?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-steel-950/45 backdrop-blur-[2px] animate-fade-up"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 my-8 w-full rounded-xl border bg-[var(--surface)] elev-3 animate-scale-in",
          ancho
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-xs text-muted">{descripcion}</p>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X />
          </Button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t bg-[var(--surface-2)] px-5 py-3 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Tabs */

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: string; label: string; count?: number; icon?: React.ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("scroll-x flex gap-1 border-b", className)}>
      {tabs.map((t) => {
        const activo = t.id === value;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative -mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors [&_svg]:size-3.5",
              activo
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-muted hover:text-fg"
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[10px] font-semibold tabular",
                  activo ? "bg-brand-100 text-brand-700" : "bg-[var(--surface-2)] text-subtle"
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------- Buscador con URL sync */

export function SearchBox({
  placeholder = "Buscar…",
  param = "q",
  className,
  autoFocus,
}: {
  placeholder?: string;
  param?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [valor, setValor] = React.useState(params.get(param) ?? "");
  const [pendiente, startTransition] = React.useTransition();

  const push = React.useMemo(
    () =>
      debounce((v: string) => {
        const p = new URLSearchParams(Array.from(params.entries()));
        if (v) p.set(param, v);
        else p.delete(param);
        p.delete("page");
        startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
      }, 320),
    [params, param, pathname, router]
  );

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
      <Input
        autoFocus={autoFocus}
        value={valor}
        onChange={(e) => {
          setValor(e.target.value);
          push(e.target.value);
        }}
        placeholder={placeholder}
        className="pl-9 pr-9"
      />
      {(valor || pendiente) && (
        <button
          onClick={() => {
            setValor("");
            push("");
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-fg"
          aria-label="Limpiar"
        >
          {pendiente ? (
            <span className="block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <X className="size-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------- Filtro por valor */

export function FiltroSelect({
  param,
  opciones,
  placeholder,
  className,
}: {
  param: string;
  opciones: { value: string; label: string }[];
  placeholder: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const actual = params.get(param) ?? "";

  return (
    <select
      value={actual}
      onChange={(e) => {
        const p = new URLSearchParams(Array.from(params.entries()));
        if (e.target.value) p.set(param, e.target.value);
        else p.delete(param);
        p.delete("page");
        router.replace(`${pathname}?${p.toString()}`, { scroll: false });
      }}
      className={cn(
        "h-9.5 cursor-pointer appearance-none rounded-md border bg-[var(--surface)] pl-3 pr-8 text-sm text-fg",
        "transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600/15",
        actual && "border-brand-300 bg-brand-50 text-brand-700 font-medium",
        className
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238894a2' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.6rem center",
        backgroundSize: "1rem",
      }}
    >
      <option value="">{placeholder}</option>
      {opciones.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------------- Paginación */

export function Paginacion({
  page,
  totalPages,
  total,
  porPagina,
}: {
  page: number;
  totalPages: number;
  total: number;
  porPagina: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const ir = (p: number) => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (p <= 1) sp.delete("page");
    else sp.set("page", String(p));
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const desde = total === 0 ? 0 : (page - 1) * porPagina + 1;
  const hasta = Math.min(page * porPagina, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5">
      <p className="text-xs text-muted tabular">
        <span className="font-medium text-fg">{desde}–{hasta}</span> de{" "}
        <span className="font-medium text-fg">{total.toLocaleString("es-PE")}</span> registros
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => ir(page - 1)}>
          <ChevronLeft />
        </Button>
        <span className="px-2 text-xs text-muted tabular">
          {page} / {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= totalPages}
          onClick={() => ir(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Theme toggle */

export function ThemeToggle() {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    const guardado = localStorage.getItem("rodatech-theme");
    const inicial = guardado === "dark";
    setDark(inicial);
    document.documentElement.dataset.theme = inicial ? "dark" : "light";
  }, []);

  return (
    <button
      onClick={() => {
        const nuevo = !dark;
        setDark(nuevo);
        document.documentElement.dataset.theme = nuevo ? "dark" : "light";
        localStorage.setItem("rodatech-theme", nuevo ? "dark" : "light");
      }}
      className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--surface-2)] hover:text-fg"
      aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
    >
      {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
}

/* ------------------------------------------------------------ Copiar texto */

export function CopiarBoton({ texto, label }: { texto: string; label?: string }) {
  const [ok, setOk] = React.useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(texto);
        setOk(true);
        setTimeout(() => setOk(false), 1600);
      }}
      className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-brand-600"
    >
      {ok ? <Check className="size-3 text-[var(--ok)]" /> : null}
      {ok ? "Copiado" : (label ?? texto)}
    </button>
  );
}
