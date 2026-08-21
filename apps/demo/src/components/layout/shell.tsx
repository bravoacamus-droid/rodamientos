"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search, Bell, LogOut, User, ChevronDown, Command } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { ThemeToggle } from "@/components/ui/client";
import { Avatar, Badge } from "@/components/ui/primitives";
import { EstadoBadge } from "@/components/ui/estados";
import { Emblema } from "@/components/marca/logo";
import type { Rol } from "@/lib/navegacion";
import { cn } from "@/lib/utils";

export type Perfil = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  cargo: string | null;
};

export function Shell({
  perfil,
  contadores,
  children,
}: {
  perfil: Perfil;
  contadores: { alertas: number; emergencias: number; vencidos: number };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [menuMovil, setMenuMovil] = React.useState(false);
  const [paleta, setPaleta] = React.useState(false);
  const [menuUsuario, setMenuUsuario] = React.useState(false);
  const refUsuario = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaleta((p) => !p);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (refUsuario.current && !refUsuario.current.contains(e.target as Node)) {
        setMenuUsuario(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function salir() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh bg-app">
      <Sidebar
        rol={perfil.rol}
        contadores={contadores}
        abiertoMovil={menuMovil}
        onCerrarMovil={() => setMenuMovil(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-[var(--surface)]/85 px-3 backdrop-blur-md sm:px-4">
          <button
            onClick={() => setMenuMovil(true)}
            className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--surface-2)] hover:text-fg lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="size-4.5" />
          </button>

          <Link href="/dashboard" className="lg:hidden">
            <Emblema size={26} />
          </Link>

          <button
            onClick={() => setPaleta(true)}
            className="group hidden h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border bg-[var(--surface-2)] px-3 text-left text-[13px] text-subtle transition-colors hover:border-brand-300 hover:bg-[var(--surface)] sm:flex sm:max-w-md"
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">Buscar productos, clientes o comprobantes…</span>
            <kbd className="ml-auto hidden shrink-0 items-center gap-0.5 rounded border bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium md:flex">
              <Command className="size-2.5" />K
            </kbd>
          </button>

          <button
            onClick={() => setPaleta(true)}
            className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--surface-2)] hover:text-fg sm:hidden"
            aria-label="Buscar"
          >
            <Search className="size-4" />
          </button>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />

            <Link
              href="/alertas"
              className="relative flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--surface-2)] hover:text-fg"
              aria-label={`Alertas (${contadores.alertas})`}
            >
              <Bell className="size-4" />
              {contadores.alertas > 0 && (
                <span className="absolute right-1 top-1 flex size-2 items-center justify-center">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-400 opacity-70" />
                  <span className="relative inline-flex size-2 rounded-full bg-accent-400 ring-2 ring-[var(--surface)]" />
                </span>
              )}
            </Link>

            <div className="mx-1 h-5 w-px bg-[var(--border)]" />

            <div className="relative" ref={refUsuario}>
              <button
                onClick={() => setMenuUsuario((m) => !m)}
                className={cn(
                  "flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-[var(--surface-2)]",
                  menuUsuario && "bg-[var(--surface-2)]"
                )}
              >
                <Avatar nombre={perfil.nombre} size={28} />
                <span className="hidden text-left sm:block">
                  <span className="block text-[12.5px] font-semibold leading-tight text-fg">
                    {perfil.nombre.split(" ")[0]}
                  </span>
                  <span className="block text-[10.5px] leading-tight text-subtle">
                    {perfil.cargo ?? perfil.rol}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-3.5 text-subtle transition-transform duration-150",
                    menuUsuario && "rotate-180"
                  )}
                />
              </button>

              {menuUsuario && (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-xl border bg-[var(--surface)] elev-3 animate-scale-in">
                  <div className="flex items-center gap-3 border-b p-3">
                    <Avatar nombre={perfil.nombre} size={38} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-fg">{perfil.nombre}</p>
                      <p className="truncate text-[11px] text-muted">{perfil.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="text-[11px] text-subtle">Rol asignado</span>
                    <EstadoBadge tipo="rol" valor={perfil.rol} size="xs" />
                  </div>
                  <div className="p-1">
                    <Link
                      href="/configuracion"
                      onClick={() => setMenuUsuario(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-fg transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <User className="size-4 text-subtle" />
                      Mi perfil y configuración
                    </Link>
                    <button
                      onClick={salir}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--danger)] transition-colors hover:bg-[var(--danger-bg)]"
                    >
                      <LogOut className="size-4" />
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandPalette abierto={paleta} onCerrar={() => setPaleta(false)} rol={perfil.rol} />
    </div>
  );
}

/* ------------------------------------------------------- Cabecera de página */

export function PageHeader({
  titulo,
  descripcion,
  badge,
  acciones,
  children,
}: {
  titulo: string;
  descripcion?: string;
  badge?: React.ReactNode;
  acciones?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b bg-[var(--surface)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-4 pt-5 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[19px] font-bold leading-tight tracking-tight text-fg">{titulo}</h1>
            {badge}
          </div>
          {descripcion && <p className="mt-1 max-w-2xl text-[13px] text-muted">{descripcion}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      {children}
    </div>
  );
}

export function Contenedor({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("px-4 py-5 sm:px-6", className)}>{children}</div>;
}

export { Badge };
