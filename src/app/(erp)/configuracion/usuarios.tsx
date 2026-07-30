"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save, Pencil, UserPlus, ShieldAlert, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Select, Field, Badge } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";

type Usuario = {
  id: string; nombre: string; email: string; rol: string;
  cargo: string | null; telefono: string | null; activo: boolean;
};

const ROLES = [
  { id: "gerencia", label: "Gerencia", desc: "Todos los módulos y aprobaciones" },
  { id: "admin", label: "Administración", desc: "Configuración, usuarios y anulaciones" },
  { id: "ventas", label: "Ventas", desc: "Cotizaciones, pedidos, facturación y clientes" },
  { id: "almacen", label: "Almacén", desc: "Inventario, kardex, ingresos y recepciones" },
  { id: "compras", label: "Compras", desc: "Órdenes, importaciones y proveedores" },
  { id: "cobranzas", label: "Cobranzas", desc: "Cartera, pagos y estados de cuenta" },
];

/* ------------------------------------------------------ Alta de usuario */

export function NuevoUsuario() {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [disponible, setDisponible] = React.useState<boolean | null>(null);

  const [email, setEmail] = React.useState("");
  const [nombre, setNombre] = React.useState("");
  const [rol, setRol] = React.useState("ventas");
  const [cargo, setCargo] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [password, setPassword] = React.useState("");

  React.useEffect(() => {
    if (!abierto) return;
    fetch("/api/usuarios")
      .then((r) => r.json())
      .then((d) => setDisponible(Boolean(d.disponible)))
      .catch(() => setDisponible(false));
  }, [abierto]);

  function generarClave() {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const bytes = crypto.getRandomValues(new Uint32Array(12));
    setPassword(Array.from(bytes, (b) => abc[b % abc.length]).join(""));
  }

  async function crear() {
    setGuardando(true);
    const res = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, nombre, rol, cargo, telefono }),
    });
    const datos = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error("No se pudo crear el usuario", { description: datos.error, duration: 9000 });
      setGuardando(false);
      return;
    }

    toast.success(`Usuario ${nombre} creado`, {
      description: `Entregue la contraseña ${password} y pídale cambiarla en el primer ingreso.`,
      duration: 12000,
    });
    setEmail(""); setNombre(""); setCargo(""); setTelefono(""); setPassword("");
    setAbierto(false);
    setGuardando(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setAbierto(true)}>
        <Plus />
        Nuevo usuario
      </Button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        ancho="max-w-xl"
        titulo="Dar de alta un usuario"
        descripcion="El rol define a qué módulos accede y qué puede escribir, tanto en la interfaz como en la base de datos."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={guardando}
              disabled={disponible === false}
              onClick={crear}
            >
              <UserPlus />
              Crear usuario
            </Button>
          </>
        }
      >
        {disponible === false && (
          <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-[var(--warn)]/25 bg-[var(--warn-bg)] px-3 py-2.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" style={{ color: "var(--warn)" }} />
            <div className="text-[11px] leading-relaxed" style={{ color: "var(--warn)" }}>
              <p className="font-semibold">Alta de usuarios no habilitada en este despliegue</p>
              <p className="mt-1">
                Crear cuentas requiere la Admin API de Supabase. Cargue{" "}
                <code className="rounded bg-white/60 px-1">SUPABASE_SERVICE_ROLE_KEY</code> en Vercel
                como variable de <strong>servidor</strong> —sin el prefijo <code>NEXT_PUBLIC_</code>—
                y redespliegue. El resto del ERP no la necesita.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre completo *">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Diego Ramírez" />
          </Field>
          <Field label="Correo corporativo *">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@rodatechperu.com"
            />
          </Field>
          <Field label="Rol *" className="sm:col-span-2">
            <Select value={rol} onChange={(e) => setRol(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>{r.label} — {r.desc}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cargo">
            <Input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ejecutivo Comercial" />
          </Field>
          <Field label="Teléfono">
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </Field>
          <Field
            label="Contraseña inicial *"
            hint="Mínimo 8 caracteres. Entréguesela al usuario para su primer ingreso."
            className="sm:col-span-2"
          >
            <div className="flex gap-2">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 font-mono text-[12.5px]"
              />
              <Button variant="subtle" onClick={generarClave}>
                <KeyRound />
                Generar
              </Button>
            </div>
          </Field>
        </div>
      </Modal>
    </>
  );
}

/* --------------------------------------------------- Edición de usuario */

export function EditarUsuario({ usuario }: { usuario: Usuario }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [nombre, setNombre] = React.useState(usuario.nombre);
  const [rol, setRol] = React.useState(usuario.rol);
  const [cargo, setCargo] = React.useState(usuario.cargo ?? "");
  const [telefono, setTelefono] = React.useState(usuario.telefono ?? "");
  const [activo, setActivo] = React.useState(usuario.activo);

  async function guardar() {
    if (!nombre.trim()) return toast.error("El nombre es obligatorio");
    setGuardando(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("profiles")
      .update({
        nombre: nombre.trim(),
        rol,
        cargo: cargo.trim() || null,
        telefono: telefono.trim() || null,
        activo,
      })
      .eq("id", usuario.id);

    if (error) {
      toast.error("No se pudo actualizar", { description: error.message });
      setGuardando(false);
      return;
    }

    toast.success("Usuario actualizado", {
      description: rol !== usuario.rol ? `Rol cambiado a ${rol}. Aplica en su próxima navegación.` : undefined,
    });
    setAbierto(false);
    setGuardando(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={() => setAbierto(true)} aria-label={`Editar ${usuario.nombre}`}>
        <Pencil />
      </Button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        titulo={`Editar ${usuario.nombre}`}
        descripcion={usuario.email}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button variant="primary" loading={guardando} onClick={guardar}>
              <Save />
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre *" className="sm:col-span-2">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Field>
          <Field label="Rol" className="sm:col-span-2">
            <Select value={rol} onChange={(e) => setRol(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>{r.label} — {r.desc}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cargo">
            <Input value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </Field>
          <Field label="Teléfono">
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </Field>
          <Field label="Estado" className="sm:col-span-2">
            <Select value={activo ? "1" : "0"} onChange={(e) => setActivo(e.target.value === "1")}>
              <option value="1">Activo</option>
              <option value="0">Inactivo — no podrá escribir en ningún módulo</option>
            </Select>
          </Field>
        </div>

        {!activo && (
          <div className="mt-3 rounded-lg border border-[var(--warn)]/25 bg-[var(--warn-bg)] px-3 py-2.5">
            <p className="text-[10.5px] leading-relaxed" style={{ color: "var(--warn)" }}>
              Desactivar el perfil bloquea toda escritura en la base de datos, pero la cuenta sigue
              pudiendo iniciar sesión y consultar. Para impedir el acceso por completo debe eliminarse
              el usuario desde el panel de Supabase.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

export function BadgeRol({ rol }: { rol: string }) {
  const cfg = ROLES.find((r) => r.id === rol);
  return <Badge tone="neutral" size="xs">{cfg?.label ?? rol}</Badge>;
}
