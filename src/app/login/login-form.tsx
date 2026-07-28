"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Eye, EyeOff, LogIn, Zap, ShieldCheck, ShoppingCart,
  Warehouse, Truck, Wallet, Crown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Label, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const CLAVE_DEMO = "Rodatech2026";

const ACCESOS = [
  { rol: "gerencia",  email: "gerencia@rodatechperu.com",  nombre: "Willy Fernández", cargo: "Gerente General",       icon: Crown,        clase: "text-brand-700 bg-brand-50 border-brand-200" },
  { rol: "admin",     email: "admin@rodatechperu.com",     nombre: "Karla Espinoza",  cargo: "Administración",        icon: ShieldCheck,  clase: "text-steel-800 bg-steel-100 border-steel-300" },
  { rol: "ventas",    email: "ventas@rodatechperu.com",    nombre: "Diego Ramírez",   cargo: "Ejecutivo Comercial",   icon: ShoppingCart, clase: "text-[var(--info)] bg-[var(--info-bg)] border-transparent" },
  { rol: "almacen",   email: "almacen@rodatechperu.com",   nombre: "Marco Salazar",   cargo: "Jefe de Almacén",       icon: Warehouse,    clase: "text-[var(--warn)] bg-[var(--warn-bg)] border-transparent" },
  { rol: "compras",   email: "compras@rodatechperu.com",   nombre: "Lucía Ynga",      cargo: "Jefa de Compras",       icon: Truck,        clase: "text-accent-800 bg-accent-50 border-accent-200" },
  { rol: "cobranzas", email: "cobranzas@rodatechperu.com", nombre: "Paola Mendoza",   cargo: "Analista de Cobranzas", icon: Wallet,       clase: "text-[var(--ok)] bg-[var(--ok-bg)] border-transparent" },
] as const;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const destino = params.get("next") || "/dashboard";

  const [email, setEmail] = React.useState("");
  const [clave, setClave] = React.useState("");
  const [verClave, setVerClave] = React.useState(false);
  const [cargando, setCargando] = React.useState<string | null>(null);

  async function ingresar(correo: string, password: string, etiqueta: string) {
    setCargando(etiqueta);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: correo, password });

    if (error) {
      setCargando(null);
      toast.error("No se pudo iniciar sesión", { description: error.message });
      return;
    }

    await supabase
      .from("profiles")
      .update({ ultimo_acceso: new Date().toISOString() })
      .eq("email", correo);

    toast.success("Bienvenido a Rodatech ERP");
    router.replace(destino);
    router.refresh();
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-fg">Ingresar al sistema</h2>
        <p className="mt-1 text-[13px] text-muted">
          Acceda con sus credenciales corporativas de Rodatech.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ingresar(email, clave, "form");
        }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="email">Correo corporativo</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            placeholder="usuario@rodatechperu.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="clave">Contraseña</Label>
          <div className="relative">
            <Input
              id="clave"
              type={verClave ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="••••••••••"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setVerClave((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle transition-colors hover:text-fg"
              aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {verClave ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={cargando === "form"}>
          <LogIn />
          Ingresar
        </Button>
      </form>

      {/* --------------------------------------------- Accesos de desarrollo */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-subtle">
            <Zap className="size-3 text-accent-500" />
            Accesos rápidos · demo
          </span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ACCESOS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.rol}
                type="button"
                disabled={!!cargando}
                onClick={() => ingresar(a.email, CLAVE_DEMO, a.rol)}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all duration-150",
                  "hover:elev-2 hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0",
                  a.clase
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/70 ring-1 ring-inset ring-black/5">
                  {cargando === a.rol ? (
                    <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Icon className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold leading-tight">
                    {a.nombre}
                  </span>
                  <span className="block truncate text-[10px] leading-tight opacity-75">
                    {a.cargo}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-[10.5px] text-subtle">
          <Badge tone="neutral" size="xs">
            Clave demo: {CLAVE_DEMO}
          </Badge>
          <span>Entorno de desarrollo · retirar antes de producción</span>
        </p>
      </div>
    </div>
  );
}
