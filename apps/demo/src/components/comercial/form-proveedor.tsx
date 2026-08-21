"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save, Factory, Pencil, Ship, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Select, Textarea, Field, Badge } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";
import { cn } from "@/lib/utils";

export type ProveedorForm = {
  id?: string;
  codigo?: string;
  ruc: string;
  razon_social: string;
  tipo: "local" | "importacion";
  pais: string;
  moneda: string;
  direccion: string;
  contacto: string;
  email: string;
  telefono: string;
  dias_pago: number;
  lead_time_dias: number;
  marcas_provee: string[];
  notas: string;
  activo: boolean;
};

const VACIO: ProveedorForm = {
  ruc: "", razon_social: "", tipo: "local", pais: "Perú", moneda: "PEN",
  direccion: "", contacto: "", email: "", telefono: "", dias_pago: 0,
  lead_time_dias: 3, marcas_provee: [], notas: "", activo: true,
};

export function FormularioProveedor({
  proveedor,
  marcas,
  modo = "crear",
}: {
  proveedor?: Partial<ProveedorForm> & { id?: string };
  marcas: string[];
  modo?: "crear" | "editar";
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [f, setF] = React.useState<ProveedorForm>({ ...VACIO, ...proveedor });

  const set = <K extends keyof ProveedorForm>(k: K, v: ProveedorForm[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  React.useEffect(() => {
    if (abierto && proveedor) setF({ ...VACIO, ...proveedor });
  }, [abierto, proveedor]);

  /** El tipo define moneda, país y plazo por defecto. */
  function cambiarTipo(tipo: "local" | "importacion") {
    setF((s) => ({
      ...s,
      tipo,
      moneda: tipo === "importacion" ? "USD" : "PEN",
      pais: tipo === "importacion" && s.pais === "Perú" ? "" : s.pais,
      lead_time_dias: tipo === "importacion" ? 45 : 3,
    }));
  }

  const alternarMarca = (m: string) =>
    setF((s) => ({
      ...s,
      marcas_provee: s.marcas_provee.includes(m)
        ? s.marcas_provee.filter((x) => x !== m)
        : [...s.marcas_provee, m],
    }));

  async function siguienteCodigo() {
    const supabase = createClient();
    const { data } = await supabase
      .from("proveedores")
      .select("codigo")
      .like("codigo", "PRV-%")
      .order("codigo", { ascending: false })
      .limit(1);
    const ultimo = data?.[0]?.codigo ?? "PRV-000";
    const n = Number(ultimo.split("-")[1] ?? 0) + 1;
    return `PRV-${String(n).padStart(3, "0")}`;
  }

  async function guardar() {
    if (!f.razon_social.trim()) return toast.error("La razón social es obligatoria");
    if (f.tipo === "local" && f.ruc && !/^\d{11}$/.test(f.ruc.trim())) {
      return toast.error("El RUC debe tener 11 dígitos");
    }

    setGuardando(true);
    const supabase = createClient();

    const datos = {
      ruc: f.ruc.trim() || null,
      razon_social: f.razon_social.trim().toUpperCase(),
      tipo: f.tipo,
      pais: f.pais.trim() || (f.tipo === "local" ? "Perú" : null),
      moneda: f.moneda,
      direccion: f.direccion.trim() || null,
      contacto: f.contacto.trim() || null,
      email: f.email.trim() || null,
      telefono: f.telefono.trim() || null,
      dias_pago: Number(f.dias_pago) || 0,
      lead_time_dias: Number(f.lead_time_dias) || 1,
      marcas_provee: f.marcas_provee.length ? f.marcas_provee : null,
      notas: f.notas.trim() || null,
      activo: f.activo,
    };

    if (modo === "editar" && proveedor?.id) {
      const { error } = await supabase.from("proveedores").update(datos).eq("id", proveedor.id);
      if (error) {
        toast.error("No se pudo actualizar el proveedor", { description: error.message });
        setGuardando(false);
        return;
      }
      toast.success("Proveedor actualizado");
    } else {
      const codigo = await siguienteCodigo();
      const { data, error } = await supabase
        .from("proveedores")
        .insert({ ...datos, codigo })
        .select("id, razon_social")
        .single();

      if (error) {
        toast.error("No se pudo registrar el proveedor", { description: error.message });
        setGuardando(false);
        return;
      }

      const { data: user } = await supabase.auth.getUser();
      await supabase.from("actividad").insert({
        usuario_id: user.user?.id ?? null,
        accion: "crear_proveedor",
        entidad: "proveedores",
        entidad_id: data.id,
        descripcion: `Proveedor ${codigo} · ${data.razon_social} registrado`,
      });

      toast.success(`Proveedor ${codigo} registrado`);
      setF(VACIO);
    }

    setAbierto(false);
    setGuardando(false);
    router.refresh();
  }

  return (
    <>
      <Button
        variant={modo === "editar" ? "subtle" : "primary"}
        size={modo === "editar" ? "sm" : "md"}
        onClick={() => setAbierto(true)}
      >
        {modo === "editar" ? <Pencil /> : <Plus />}
        {modo === "editar" ? "Editar" : "Nuevo proveedor"}
      </Button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        ancho="max-w-2xl"
        titulo={modo === "editar" ? `Editar ${f.razon_social}` : "Registrar nuevo proveedor"}
        descripcion="Los proveedores del exterior habilitan órdenes de importación con cálculo de costo puesto en almacén."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button variant="primary" loading={guardando} onClick={guardar}>
              <Save />
              {modo === "editar" ? "Guardar cambios" : "Registrar proveedor"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Tipo de proveedor
            </p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "local", label: "Local", desc: "Compra en soles con IGV", icon: Truck },
                { id: "importacion", label: "Del exterior", desc: "Importación con landed cost", icon: Ship },
              ] as const).map((t) => {
                const Icon = t.icon;
                const activo = f.tipo === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => cambiarTipo(t.id)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all",
                      activo ? "border-brand-400 bg-brand-50 ring-brand" : "hover:border-brand-300"
                    )}
                  >
                    <Icon className={cn("mt-0.5 size-4 shrink-0", activo ? "text-brand-600" : "text-subtle")} />
                    <span>
                      <span className={cn("block text-[12.5px] font-medium", activo ? "text-brand-800" : "text-fg")}>
                        {t.label}
                      </span>
                      <span className="block text-[10.5px] text-muted">{t.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Razón social *" className="sm:col-span-2">
              <Input
                value={f.razon_social}
                onChange={(e) => set("razon_social", e.target.value)}
                placeholder={f.tipo === "local"
                  ? "DISTRIBUIDORA RODASUR S.A.C."
                  : "NINGBO BEARING IMP & EXP CO., LTD."}
              />
            </Field>
            <Field label={f.tipo === "local" ? "RUC" : "Tax ID / registro"}>
              <Input
                value={f.ruc}
                onChange={(e) =>
                  set("ruc", f.tipo === "local" ? e.target.value.replace(/\D/g, "").slice(0, 11) : e.target.value)
                }
                className="tabular"
              />
            </Field>
            <Field label="País">
              <Input value={f.pais} onChange={(e) => set("pais", e.target.value)} placeholder={f.tipo === "local" ? "Perú" : "China"} />
            </Field>
            <Field label="Moneda de compra">
              <Select value={f.moneda} onChange={(e) => set("moneda", e.target.value)}>
                <option value="PEN">Soles (S/)</option>
                <option value="USD">Dólares (US$)</option>
              </Select>
            </Field>
            <Field label="Estado">
              <Select value={f.activo ? "1" : "0"} onChange={(e) => set("activo", e.target.value === "1")}>
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </Select>
            </Field>
            <Field label="Dirección" className="sm:col-span-2">
              <Input value={f.direccion} onChange={(e) => set("direccion", e.target.value)} />
            </Field>
            <Field label="Contacto">
              <Input value={f.contacto} onChange={(e) => set("contacto", e.target.value)} />
            </Field>
            <Field label="Correo">
              <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Teléfono">
              <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
            </Field>
            <Field label="Plazo de pago (días)" hint="0 = contado">
              <Input
                type="number"
                min={0}
                value={f.dias_pago}
                onChange={(e) => set("dias_pago", Number(e.target.value))}
                className="text-right tabular"
              />
            </Field>
            <Field
              label="Lead time (días)"
              hint={f.tipo === "importacion" ? "Desde la orden hasta el arribo" : "Desde la orden hasta la entrega"}
              className="sm:col-span-2"
            >
              <Input
                type="number"
                min={1}
                value={f.lead_time_dias}
                onChange={(e) => set("lead_time_dias", Number(e.target.value))}
                className="text-right tabular"
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              <Factory className="size-3.5" />
              Marcas que representa
              <span className="font-normal normal-case tracking-normal text-subtle">
                · define qué productos ofrece al generar una orden
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {marcas.map((m) => {
                const activo = f.marcas_provee.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => alternarMarca(m)}
                    className="transition-transform active:scale-95"
                  >
                    <Badge tone={activo ? "brand" : "neutral"} size="sm">{m}</Badge>
                  </button>
                );
              })}
            </div>
            {f.marcas_provee.length === 0 && (
              <p className="mt-1.5 text-[10.5px] text-muted">
                Sin marcas seleccionadas: al crear una orden se ofrecerá todo el catálogo.
              </p>
            )}
          </div>

          <Field label="Notas internas">
            <Textarea
              rows={2}
              value={f.notas}
              onChange={(e) => set("notas", e.target.value)}
              placeholder="Pedido mínimo, condiciones de flete, contacto alterno…"
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
