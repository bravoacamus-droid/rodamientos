"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, PanelLeft, X } from "lucide-react";
import { iconoNav } from "./iconos";
import { Logo, Emblema } from "@/components/marca/logo";
import { navegacionPorRol, type Rol } from "@/lib/navegacion";
import { cn } from "@/lib/utils";

type Contadores = { alertas: number; emergencias: number; vencidos: number };

export function Sidebar({
  rol,
  contadores,
  abiertoMovil,
  onCerrarMovil,
}: {
  rol: Rol;
  contadores: Contadores;
  abiertoMovil: boolean;
  onCerrarMovil: () => void;
}) {
  const pathname = usePathname();
  const [colapsado, setColapsado] = React.useState(false);
  const grupos = React.useMemo(() => navegacionPorRol(rol), [rol]);

  React.useEffect(() => {
    setColapsado(localStorage.getItem("rodatech-sidebar") === "1");
  }, []);

  const alternar = () => {
    setColapsado((c) => {
      localStorage.setItem("rodatech-sidebar", c ? "0" : "1");
      return !c;
    });
  };

  const contenido = (
    <>
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-white/10 px-3",
          colapsado ? "justify-center" : "justify-between"
        )}
      >
        <Link href="/dashboard" className="flex items-center rounded-lg bg-white px-2 py-1.5">
          {colapsado ? <Emblema size={26} /> : <Logo height={26} priority />}
        </Link>
        {!colapsado && (
          <button
            onClick={alternar}
            className="hidden size-7 items-center justify-center rounded-md text-brand-100/60 transition-colors hover:bg-white/10 hover:text-white lg:flex"
            aria-label="Colapsar menú"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
        <button
          onClick={onCerrarMovil}
          className="flex size-7 items-center justify-center rounded-md text-brand-100/60 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Cerrar menú"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        {grupos.map((grupo) => (
          <div key={grupo.titulo} className="mb-4 last:mb-0">
            {!colapsado && (
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-brand-100/35">
                {grupo.titulo}
              </p>
            )}
            {colapsado && <div className="mx-2 mb-2 h-px bg-white/10" />}
            <ul className="space-y-0.5">
              {grupo.items.map((item) => {
                const Icon = iconoNav(item.icon);
                const activo =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(`${item.href}/`) &&
                    !grupo.items.some(
                      (o) => o.href !== item.href && o.href.length > item.href.length && pathname.startsWith(o.href)
                    ));
                const n = item.badge ? contadores[item.badge] : 0;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onCerrarMovil}
                      title={colapsado ? item.label : undefined}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150",
                        colapsado && "justify-center px-0",
                        activo
                          ? "bg-white/12 text-white"
                          : "text-brand-100/70 hover:bg-white/[0.07] hover:text-white"
                      )}
                    >
                      {activo && (
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent-400" />
                      )}
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          activo ? "text-accent-400" : "text-brand-100/50 group-hover:text-brand-100"
                        )}
                      />
                      {!colapsado && <span className="flex-1 truncate">{item.label}</span>}
                      {n > 0 && (
                        <span
                          className={cn(
                            "flex items-center justify-center rounded-full text-[10px] font-bold tabular",
                            item.badge === "alertas"
                              ? "bg-accent-400 text-steel-950"
                              : "bg-[var(--danger)] text-white",
                            colapsado
                              ? "absolute right-1.5 top-1.5 size-1.5 p-0 text-transparent"
                              : "min-w-[18px] px-1.5 py-0.5"
                          )}
                        >
                          {n > 99 ? "99+" : n}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-2">
        {colapsado ? (
          <button
            onClick={alternar}
            className="hidden w-full items-center justify-center rounded-lg py-2 text-brand-100/50 transition-colors hover:bg-white/10 hover:text-white lg:flex"
            aria-label="Expandir menú"
          >
            <PanelLeft className="size-4" />
          </button>
        ) : (
          <div className="px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-100/40">
              Rodatech ERP
            </p>
            <p className="mt-0.5 text-[10px] text-brand-100/30">
              v1.0 · Promptive 2026
            </p>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Escritorio */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col bg-brand-900 transition-[width] duration-200 lg:flex",
          colapsado ? "w-[60px]" : "w-[236px]"
        )}
      >
        {contenido}
      </aside>

      {/* Móvil */}
      {abiertoMovil && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-steel-950/50 backdrop-blur-[2px]" onClick={onCerrarMovil} />
          <aside className="relative flex h-full w-[264px] flex-col bg-brand-900 elev-3 animate-fade-up">
            {contenido}
          </aside>
        </div>
      )}
    </>
  );
}
