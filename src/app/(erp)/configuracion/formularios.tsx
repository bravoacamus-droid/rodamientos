"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Save, Pencil, Plus, Building2, Hash, Tag, Layers, Warehouse, Trash2, Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Button, Input, Select, Textarea, Field, Badge, Table, THead, TBody,
} from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";

/* ========================================================== EMPRESA */

type Empresa = {
  razon_social: string; nombre_comercial: string; ruc: string;
  direccion: string | null; distrito: string | null; provincia: string | null;
  telefono: string | null; celular: string | null; email: string | null;
  email_ventas: string | null; web: string | null; eslogan: string | null;
  igv_porcentaje: number; moneda_base: string; tipo_cambio: number;
};

export function FormularioEmpresa({ empresa }: { empresa: Empresa }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [f, setF] = React.useState<Empresa>(empresa);

  const set = <K extends keyof Empresa>(k: K, v: Empresa[K]) => setF((s) => ({ ...s, [k]: v }));

  React.useEffect(() => {
    if (abierto) setF(empresa);
  }, [abierto, empresa]);

  async function guardar() {
    if (!f.razon_social.trim()) return toast.error("La razón social es obligatoria");
    if (!/^\d{11}$/.test(f.ruc.trim())) return toast.error("El RUC debe tener 11 dígitos");

    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("empresa")
      .update({
        razon_social: f.razon_social.trim().toUpperCase(),
        nombre_comercial: f.nombre_comercial.trim(),
        ruc: f.ruc.trim(),
        direccion: f.direccion?.trim() || null,
        distrito: f.distrito?.trim() || null,
        provincia: f.provincia?.trim() || null,
        telefono: f.telefono?.trim() || null,
        celular: f.celular?.trim() || null,
        email: f.email?.trim() || null,
        email_ventas: f.email_ventas?.trim() || null,
        web: f.web?.trim() || null,
        eslogan: f.eslogan?.trim() || null,
        igv_porcentaje: Number(f.igv_porcentaje),
        moneda_base: f.moneda_base,
        tipo_cambio: Number(f.tipo_cambio),
      })
      .eq("id", 1);

    if (error) {
      toast.error("No se pudo guardar", { description: error.message });
    } else {
      toast.success("Datos de la empresa actualizados", {
        description: "Se reflejan en cotizaciones, comprobantes y estados de cuenta.",
      });
      setAbierto(false);
      router.refresh();
    }
    setGuardando(false);
  }

  return (
    <>
      <Button variant="subtle" size="sm" onClick={() => setAbierto(true)}>
        <Pencil />
        Editar datos
      </Button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        ancho="max-w-2xl"
        titulo="Datos de la empresa"
        descripcion="Se imprimen en la cabecera de todos los documentos que emite el sistema."
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
          <Field label="Razón social *" className="sm:col-span-2">
            <Input value={f.razon_social} onChange={(e) => set("razon_social", e.target.value)} />
          </Field>
          <Field label="Nombre comercial">
            <Input value={f.nombre_comercial} onChange={(e) => set("nombre_comercial", e.target.value)} />
          </Field>
          <Field label="RUC *">
            <Input
              value={f.ruc}
              onChange={(e) => set("ruc", e.target.value.replace(/\D/g, "").slice(0, 11))}
              className="tabular"
            />
          </Field>
          <Field label="Dirección fiscal" className="sm:col-span-2">
            <Input value={f.direccion ?? ""} onChange={(e) => set("direccion", e.target.value)} />
          </Field>
          <Field label="Distrito">
            <Input value={f.distrito ?? ""} onChange={(e) => set("distrito", e.target.value)} />
          </Field>
          <Field label="Provincia">
            <Input value={f.provincia ?? ""} onChange={(e) => set("provincia", e.target.value)} />
          </Field>
          <Field label="Teléfono">
            <Input value={f.telefono ?? ""} onChange={(e) => set("telefono", e.target.value)} />
          </Field>
          <Field label="Celular / WhatsApp">
            <Input value={f.celular ?? ""} onChange={(e) => set("celular", e.target.value)} />
          </Field>
          <Field label="Correo de gerencia">
            <Input type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Correo de ventas">
            <Input type="email" value={f.email_ventas ?? ""} onChange={(e) => set("email_ventas", e.target.value)} />
          </Field>
          <Field label="Sitio web">
            <Input value={f.web ?? ""} onChange={(e) => set("web", e.target.value)} />
          </Field>
          <Field label="Eslogan" hint="Aparece al pie de los documentos">
            <Input value={f.eslogan ?? ""} onChange={(e) => set("eslogan", e.target.value)} />
          </Field>
          <Field label="IGV (%)" hint="Afecta a todos los documentos nuevos">
            <Input
              type="number" min={0} max={30} step="0.01"
              value={f.igv_porcentaje}
              onChange={(e) => set("igv_porcentaje", Number(e.target.value))}
              className="text-right tabular"
            />
          </Field>
          <Field label="Tipo de cambio referencial">
            <Input
              type="number" min={0} step="0.0001"
              value={f.tipo_cambio}
              onChange={(e) => set("tipo_cambio", Number(e.target.value))}
              className="text-right tabular"
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

/* ============================================================ SERIES */

type Serie = { id: string; tipo: string; serie: string; correlativo: number; activo: boolean; descripcion: string | null };

export function GestorSeries({ series }: { series: Serie[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [editando, setEditando] = React.useState<Serie | null>(null);
  const [tipo, setTipo] = React.useState("factura");
  const [serie, setSerie] = React.useState("");
  const [correlativo, setCorrelativo] = React.useState(0);
  const [descripcion, setDescripcion] = React.useState("");
  const [activo, setActivo] = React.useState(true);

  function abrir(s?: Serie) {
    if (s) {
      setEditando(s);
      setTipo(s.tipo);
      setSerie(s.serie);
      setCorrelativo(s.correlativo);
      setDescripcion(s.descripcion ?? "");
      setActivo(s.activo);
    } else {
      setEditando(null);
      setTipo("factura");
      setSerie("");
      setCorrelativo(0);
      setDescripcion("");
      setActivo(true);
    }
    setAbierto(true);
  }

  async function guardar() {
    if (!/^[A-Z0-9]{4}$/.test(serie.trim().toUpperCase())) {
      return toast.error("La serie debe tener 4 caracteres", {
        description: "Por ejemplo F001 para facturas o B001 para boletas.",
      });
    }

    setGuardando(true);
    const supabase = createClient();
    const datos = {
      tipo,
      serie: serie.trim().toUpperCase(),
      correlativo: Number(correlativo),
      descripcion: descripcion.trim() || null,
      activo,
    };

    const { error } = editando
      ? await supabase.from("series_documento").update(datos).eq("id", editando.id)
      : await supabase.from("series_documento").insert(datos);

    if (error) {
      toast.error("No se pudo guardar la serie", {
        description: error.message.includes("duplicate")
          ? "Ya existe esa serie para el mismo tipo de documento."
          : error.message,
      });
      setGuardando(false);
      return;
    }

    toast.success(editando ? "Serie actualizada" : "Serie creada");
    setAbierto(false);
    setGuardando(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="subtle" size="sm" onClick={() => abrir()}>
        <Plus />
        Nueva serie
      </Button>

      <Table>
        <THead>
          <tr>
            <th>Tipo</th>
            <th>Serie</th>
            <th className="text-right">Último emitido</th>
            <th>Estado</th>
            <th className="w-10" />
          </tr>
        </THead>
        <TBody>
          {series.map((s) => (
            <tr key={s.id}>
              <td className="text-[12.5px] capitalize text-fg">{s.tipo.replace("_", " ")}</td>
              <td className="text-[12.5px] font-semibold text-brand-700 tabular">{s.serie}</td>
              <td className="text-right text-[12.5px] tabular">
                {s.serie}-{String(s.correlativo).padStart(8, "0")}
              </td>
              <td>
                <Badge tone={s.activo ? "success" : "neutral"} size="xs">
                  {s.activo ? "Activa" : "Inactiva"}
                </Badge>
              </td>
              <td>
                <Button variant="ghost" size="icon-sm" onClick={() => abrir(s)} aria-label="Editar">
                  <Pencil />
                </Button>
              </td>
            </tr>
          ))}
        </TBody>
      </Table>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        titulo={editando ? `Editar serie ${editando.serie}` : "Nueva serie de documento"}
        descripcion="El correlativo se reserva de forma atómica al emitir cada comprobante."
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
          <Field label="Tipo de documento">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={!!editando}>
              <option value="factura">Factura electrónica</option>
              <option value="boleta">Boleta de venta</option>
              <option value="nota_venta">Nota de venta</option>
              <option value="nota_credito">Nota de crédito</option>
            </Select>
          </Field>
          <Field label="Serie" hint="4 caracteres: F001, B001, FC01">
            <Input
              value={serie}
              onChange={(e) => setSerie(e.target.value.toUpperCase().slice(0, 4))}
              className="tabular font-medium"
              placeholder="F002"
            />
          </Field>
          <Field
            label="Último correlativo emitido"
            hint="El siguiente documento usará este número + 1"
            className="sm:col-span-2"
          >
            <Input
              type="number" min={0}
              value={correlativo}
              onChange={(e) => setCorrelativo(Number(e.target.value))}
              className="text-right tabular"
            />
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </Field>
          <Field label="Estado" className="sm:col-span-2">
            <Select value={activo ? "1" : "0"} onChange={(e) => setActivo(e.target.value === "1")}>
              <option value="1">Activa</option>
              <option value="0">Inactiva</option>
            </Select>
          </Field>
        </div>

        {editando && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--warn)]/25 bg-[var(--warn-bg)] px-3 py-2.5">
            <Info className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--warn)" }} />
            <p className="text-[10.5px] leading-relaxed" style={{ color: "var(--warn)" }}>
              Retroceder el correlativo puede generar números duplicados si ya existen comprobantes
              emitidos por encima de ese valor.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ======================================================== CATÁLOGOS */

type Marca = { id: string; nombre: string; pais: string | null; segmento: string | null; activo: boolean; orden: number | null };
type Categoria = { id: string; nombre: string; slug: string; descripcion: string | null; orden: number | null };
type Almacen = { id: string; codigo: string; nombre: string; direccion: string | null; responsable: string | null; activo: boolean };

export function GestorMarcas({ marcas }: { marcas: Marca[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [editando, setEditando] = React.useState<Marca | null>(null);
  const [nombre, setNombre] = React.useState("");
  const [pais, setPais] = React.useState("");
  const [segmento, setSegmento] = React.useState("estandar");
  const [activo, setActivo] = React.useState(true);

  function abrir(m?: Marca) {
    setEditando(m ?? null);
    setNombre(m?.nombre ?? "");
    setPais(m?.pais ?? "");
    setSegmento(m?.segmento ?? "estandar");
    setActivo(m?.activo ?? true);
    setAbierto(true);
  }

  async function guardar() {
    if (!nombre.trim()) return toast.error("El nombre de la marca es obligatorio");
    setGuardando(true);
    const supabase = createClient();
    const datos = {
      nombre: nombre.trim().toUpperCase(),
      pais: pais.trim() || null,
      segmento,
      activo,
      orden: editando?.orden ?? 50,
    };

    const { error } = editando
      ? await supabase.from("marcas").update(datos).eq("id", editando.id)
      : await supabase.from("marcas").insert(datos);

    if (error) {
      toast.error("No se pudo guardar", {
        description: error.message.includes("duplicate") ? "Ya existe una marca con ese nombre." : error.message,
      });
      setGuardando(false);
      return;
    }
    toast.success(editando ? "Marca actualizada" : "Marca creada");
    setAbierto(false);
    setGuardando(false);
    router.refresh();
  }

  const SEGMENTOS = [
    { id: "premium", label: "Prestigio" },
    { id: "estandar", label: "Estándar" },
    { id: "economica", label: "Económica" },
  ];

  return (
    <>
      <Button variant="subtle" size="sm" onClick={() => abrir()}>
        <Plus />
        Nueva marca
      </Button>

      <div className="mt-3 space-y-3">
        {SEGMENTOS.map((seg) => {
          const items = marcas.filter((m) => m.segmento === seg.id);
          if (!items.length) return null;
          return (
            <div key={seg.id}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                {seg.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((m) => (
                  <button key={m.id} onClick={() => abrir(m)} className="transition-transform active:scale-95">
                    <Badge
                      tone={seg.id === "premium" ? "brand" : seg.id === "estandar" ? "info" : "neutral"}
                      size="sm"
                      className={m.activo ? undefined : "opacity-50 line-through"}
                    >
                      {m.nombre}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        titulo={editando ? `Editar ${editando.nombre}` : "Nueva marca"}
        descripcion="El segmento ordena las alternativas en el cross-reference: prestigio primero, económica al final."
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
          <Field label="Nombre *">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="NACHI" />
          </Field>
          <Field label="País de origen">
            <Input value={pais} onChange={(e) => setPais(e.target.value)} placeholder="Japón" />
          </Field>
          <Field label="Segmento">
            <Select value={segmento} onChange={(e) => setSegmento(e.target.value)}>
              {SEGMENTOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={activo ? "1" : "0"} onChange={(e) => setActivo(e.target.value === "1")}>
              <option value="1">Activa</option>
              <option value="0">Inactiva</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}

export function GestorCategorias({ categorias }: { categorias: Categoria[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [editando, setEditando] = React.useState<Categoria | null>(null);
  const [nombre, setNombre] = React.useState("");
  const [descripcion, setDescripcion] = React.useState("");

  function abrir(c?: Categoria) {
    setEditando(c ?? null);
    setNombre(c?.nombre ?? "");
    setDescripcion(c?.descripcion ?? "");
    setAbierto(true);
  }

  const slugify = (t: string) =>
    t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  async function guardar() {
    if (!nombre.trim()) return toast.error("El nombre es obligatorio");
    setGuardando(true);
    const supabase = createClient();
    const datos = {
      nombre: nombre.trim(),
      slug: editando?.slug ?? slugify(nombre),
      descripcion: descripcion.trim() || null,
      orden: editando?.orden ?? 50,
    };

    const { error } = editando
      ? await supabase.from("categorias").update(datos).eq("id", editando.id)
      : await supabase.from("categorias").insert(datos);

    if (error) {
      toast.error("No se pudo guardar", {
        description: error.message.includes("duplicate") ? "Ya existe una línea con ese nombre." : error.message,
      });
      setGuardando(false);
      return;
    }
    toast.success(editando ? "Línea actualizada" : "Línea creada");
    setAbierto(false);
    setGuardando(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="subtle" size="sm" onClick={() => abrir()}>
        <Plus />
        Nueva línea
      </Button>

      <div className="mt-3 space-y-2">
        {categorias.map((c) => (
          <button
            key={c.id}
            onClick={() => abrir(c)}
            className="block w-full rounded-lg border px-3 py-2 text-left transition-colors hover:border-brand-300 hover:bg-[var(--surface-2)]"
          >
            <p className="text-[12.5px] font-medium text-fg">{c.nombre}</p>
            <p className="mt-0.5 text-[11px] text-muted">{c.descripcion}</p>
          </button>
        ))}
      </div>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        titulo={editando ? `Editar ${editando.nombre}` : "Nueva línea de producto"}
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
        <div className="space-y-3">
          <Field label="Nombre *" hint={editando ? `Identificador: ${editando.slug}` : "El identificador se genera del nombre"}>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Herramientas neumáticas" />
          </Field>
          <Field label="Descripción">
            <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export function GestorAlmacenes({ almacenes }: { almacenes: Almacen[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [editando, setEditando] = React.useState<Almacen | null>(null);
  const [codigo, setCodigo] = React.useState("");
  const [nombre, setNombre] = React.useState("");
  const [direccion, setDireccion] = React.useState("");
  const [responsable, setResponsable] = React.useState("");
  const [activo, setActivo] = React.useState(true);

  function abrir(a?: Almacen) {
    setEditando(a ?? null);
    setCodigo(a?.codigo ?? `ALM-${String(almacenes.length + 1).padStart(2, "0")}`);
    setNombre(a?.nombre ?? "");
    setDireccion(a?.direccion ?? "");
    setResponsable(a?.responsable ?? "");
    setActivo(a?.activo ?? true);
    setAbierto(true);
  }

  async function guardar() {
    if (!codigo.trim() || !nombre.trim()) return toast.error("Código y nombre son obligatorios");
    setGuardando(true);
    const supabase = createClient();
    const datos = {
      codigo: codigo.trim().toUpperCase(),
      nombre: nombre.trim(),
      direccion: direccion.trim() || null,
      responsable: responsable.trim() || null,
      activo,
    };

    const { error } = editando
      ? await supabase.from("almacenes").update(datos).eq("id", editando.id)
      : await supabase.from("almacenes").insert(datos);

    if (error) {
      toast.error("No se pudo guardar", {
        description: error.message.includes("duplicate") ? "Ya existe un almacén con ese código." : error.message,
      });
      setGuardando(false);
      return;
    }
    toast.success(editando ? "Almacén actualizado" : "Almacén creado");
    setAbierto(false);
    setGuardando(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="subtle" size="sm" onClick={() => abrir()}>
        <Plus />
        Nuevo almacén
      </Button>

      <Table>
        <THead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Responsable</th>
            <th>Estado</th>
            <th className="w-10" />
          </tr>
        </THead>
        <TBody>
          {almacenes.map((a) => (
            <tr key={a.id}>
              <td className="text-[12.5px] font-semibold text-fg tabular">{a.codigo}</td>
              <td className="text-[12.5px] text-fg">{a.nombre}</td>
              <td className="text-[11.5px] text-muted">{a.responsable ?? "—"}</td>
              <td>
                <Badge tone={a.activo ? "success" : "neutral"} size="xs">
                  {a.activo ? "Operativo" : "Inactivo"}
                </Badge>
              </td>
              <td>
                <Button variant="ghost" size="icon-sm" onClick={() => abrir(a)} aria-label="Editar">
                  <Pencil />
                </Button>
              </td>
            </tr>
          ))}
        </TBody>
      </Table>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        titulo={editando ? `Editar ${editando.nombre}` : "Nuevo almacén"}
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
          <Field label="Código *">
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} className="tabular" />
          </Field>
          <Field label="Nombre *">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Almacén Sur" />
          </Field>
          <Field label="Dirección" className="sm:col-span-2">
            <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </Field>
          <Field label="Responsable">
            <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} />
          </Field>
          <Field label="Estado">
            <Select value={activo ? "1" : "0"} onChange={(e) => setActivo(e.target.value === "1")}>
              <option value="1">Operativo</option>
              <option value="0">Inactivo</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
