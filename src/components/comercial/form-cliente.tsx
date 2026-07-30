"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save, Building2, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Select, Textarea, Field } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";

export type ClienteForm = {
  id?: string;
  codigo?: string;
  ruc: string;
  razon_social: string;
  nombre_comercial: string;
  direccion: string;
  distrito: string;
  provincia: string;
  sector: string;
  contacto: string;
  cargo_contacto: string;
  email: string;
  telefono: string;
  whatsapp: string;
  lista_precio: string;
  linea_credito: number;
  dias_credito: number;
  notas: string;
  activo: boolean;
};

const VACIO: ClienteForm = {
  ruc: "", razon_social: "", nombre_comercial: "", direccion: "", distrito: "",
  provincia: "Lima", sector: "", contacto: "", cargo_contacto: "", email: "",
  telefono: "", whatsapp: "", lista_precio: "mayorista", linea_credito: 0,
  dias_credito: 30, notas: "", activo: true,
};

const SECTORES = [
  "Minería", "Papeleras", "Ind. Plástica", "Textiles", "Alimentos",
  "Alimentos y Bebidas", "Agroindustria", "Pesquera", "Cementera",
  "Siderurgia", "Metalmecánica", "Fundición", "Construcción",
  "Transporte", "Maderera", "Servicios Industriales", "Servicios", "Mostrador",
];

export function FormularioCliente({
  cliente,
  modo = "crear",
}: {
  cliente?: Partial<ClienteForm> & { id?: string };
  modo?: "crear" | "editar";
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [f, setF] = React.useState<ClienteForm>({ ...VACIO, ...cliente });

  const set = <K extends keyof ClienteForm>(k: K, v: ClienteForm[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  React.useEffect(() => {
    if (abierto && cliente) setF({ ...VACIO, ...cliente });
  }, [abierto, cliente]);

  /** Genera el siguiente código correlativo CLI-000. */
  async function siguienteCodigo() {
    const supabase = createClient();
    const { data } = await supabase
      .from("clientes")
      .select("codigo")
      .like("codigo", "CLI-%")
      .order("codigo", { ascending: false })
      .limit(1);
    const ultimo = data?.[0]?.codigo ?? "CLI-000";
    const n = Number(ultimo.split("-")[1] ?? 0) + 1;
    return `CLI-${String(n).padStart(3, "0")}`;
  }

  async function guardar() {
    if (!f.razon_social.trim()) return toast.error("La razón social es obligatoria");
    if (f.ruc && !/^\d{11}$/.test(f.ruc.trim())) {
      return toast.error("El RUC debe tener 11 dígitos");
    }

    setGuardando(true);
    const supabase = createClient();

    const datos = {
      ruc: f.ruc.trim() || null,
      razon_social: f.razon_social.trim().toUpperCase(),
      nombre_comercial: f.nombre_comercial.trim() || null,
      direccion: f.direccion.trim() || null,
      distrito: f.distrito.trim() || null,
      provincia: f.provincia.trim() || null,
      sector: f.sector || null,
      contacto: f.contacto.trim() || null,
      cargo_contacto: f.cargo_contacto.trim() || null,
      email: f.email.trim() || null,
      telefono: f.telefono.trim() || null,
      whatsapp: f.whatsapp.trim() || null,
      lista_precio: f.lista_precio,
      linea_credito: Number(f.linea_credito) || 0,
      dias_credito: Number(f.dias_credito) || 0,
      notas: f.notas.trim() || null,
      activo: f.activo,
    };

    if (modo === "editar" && cliente?.id) {
      const { error } = await supabase.from("clientes").update(datos).eq("id", cliente.id);
      if (error) {
        toast.error("No se pudo actualizar el cliente", { description: error.message });
        setGuardando(false);
        return;
      }
      toast.success("Cliente actualizado");
    } else {
      const codigo = await siguienteCodigo();
      const { data, error } = await supabase
        .from("clientes")
        .insert({ ...datos, codigo })
        .select("id, razon_social")
        .single();

      if (error) {
        toast.error("No se pudo registrar el cliente", {
          description: error.message.includes("duplicate")
            ? "Ya existe un cliente con ese RUC."
            : error.message,
        });
        setGuardando(false);
        return;
      }

      const { data: user } = await supabase.auth.getUser();
      await supabase.from("actividad").insert({
        usuario_id: user.user?.id ?? null,
        accion: "crear_cliente",
        entidad: "clientes",
        entidad_id: data.id,
        descripcion: `Cliente ${codigo} · ${data.razon_social} registrado`,
      });

      toast.success(`Cliente ${codigo} registrado`);
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
        size="md"
        onClick={() => setAbierto(true)}
      >
        {modo === "editar" ? <Pencil /> : <Plus />}
        {modo === "editar" ? "Editar" : "Nuevo cliente"}
      </Button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        ancho="max-w-3xl"
        titulo={modo === "editar" ? `Editar ${f.razon_social}` : "Registrar nuevo cliente"}
        descripcion="Empresas industriales. La línea y el plazo de crédito rigen la cartera por cobrar."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button variant="primary" loading={guardando} onClick={guardar}>
              <Save />
              {modo === "editar" ? "Guardar cambios" : "Registrar cliente"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              <Building2 className="size-3.5" />
              Identificación
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Razón social *" className="sm:col-span-2">
                <Input
                  value={f.razon_social}
                  onChange={(e) => set("razon_social", e.target.value)}
                  placeholder="MINERA CERRO VERDE CONTRATISTAS S.A.C."
                />
              </Field>
              <Field label="RUC" hint="11 dígitos">
                <Input
                  value={f.ruc}
                  onChange={(e) => set("ruc", e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="20100128056"
                  className="tabular"
                />
              </Field>
              <Field label="Nombre comercial">
                <Input
                  value={f.nombre_comercial}
                  onChange={(e) => set("nombre_comercial", e.target.value)}
                  placeholder="MCV Contratistas"
                />
              </Field>
              <Field label="Sector industrial">
                <Select value={f.sector} onChange={(e) => set("sector", e.target.value)}>
                  <option value="">Sin clasificar</option>
                  {SECTORES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Estado">
                <Select
                  value={f.activo ? "1" : "0"}
                  onChange={(e) => set("activo", e.target.value === "1")}
                >
                  <option value="1">Activo</option>
                  <option value="0">Inactivo</option>
                </Select>
              </Field>
            </div>
          </section>

          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Ubicación y contacto
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Dirección" className="sm:col-span-2">
                <Input
                  value={f.direccion}
                  onChange={(e) => set("direccion", e.target.value)}
                  placeholder="Av. Néstor Gambetta 3200"
                />
              </Field>
              <Field label="Distrito">
                <Input value={f.distrito} onChange={(e) => set("distrito", e.target.value)} placeholder="Callao" />
              </Field>
              <Field label="Provincia">
                <Input value={f.provincia} onChange={(e) => set("provincia", e.target.value)} placeholder="Lima" />
              </Field>
              <Field label="Persona de contacto">
                <Input value={f.contacto} onChange={(e) => set("contacto", e.target.value)} placeholder="Ing. Raúl Paredes" />
              </Field>
              <Field label="Cargo">
                <Input
                  value={f.cargo_contacto}
                  onChange={(e) => set("cargo_contacto", e.target.value)}
                  placeholder="Jefe de Mantenimiento"
                />
              </Field>
              <Field label="Correo">
                <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="compras@empresa.com.pe" />
              </Field>
              <Field label="Teléfono">
                <Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="01 577 2200" />
              </Field>
              <Field label="WhatsApp" hint="Para envío de cotizaciones y estados de cuenta">
                <Input value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="999 112 233" />
              </Field>
            </div>
          </section>

          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Condiciones comerciales
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Lista de precios">
                <Select value={f.lista_precio} onChange={(e) => set("lista_precio", e.target.value)}>
                  <option value="mayorista">Mayorista</option>
                  <option value="fabrica">Fábrica</option>
                  <option value="importacion">Importación</option>
                </Select>
              </Field>
              <Field label="Línea de crédito (S/)" hint="0 = solo contado">
                <Input
                  type="number"
                  min={0}
                  step="100"
                  value={f.linea_credito}
                  onChange={(e) => set("linea_credito", Number(e.target.value))}
                  className="text-right tabular"
                />
              </Field>
              <Field label="Plazo (días)">
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={f.dias_credito}
                  onChange={(e) => set("dias_credito", Number(e.target.value))}
                  className="text-right tabular"
                />
              </Field>
              <Field label="Notas internas" className="sm:col-span-3">
                <Textarea
                  rows={2}
                  value={f.notas}
                  onChange={(e) => set("notas", e.target.value)}
                  placeholder="Requiere orden de compra previa, paga los viernes…"
                />
              </Field>
            </div>
          </section>
        </div>
      </Modal>
    </>
  );
}
