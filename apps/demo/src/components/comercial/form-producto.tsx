"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save, Package, Pencil, Ruler, Tag, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Select, Textarea, Field, Badge, Label } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";
import { money, pct } from "@/lib/utils";

export type ProductoForm = {
  id?: string;
  sku: string;
  codigo_fabricante: string;
  descripcion: string;
  marca_id: string;
  categoria_id: string;
  unidad: string;
  costo_promedio: number;
  precio_mayorista: number;
  precio_fabrica: number;
  precio_importacion: number;
  stock_minimo: number;
  stock_maximo: number;
  ubicacion: string;
  peso_kg: number;
  activo: boolean;
  atributos: [string, string][];
};

const VACIO: ProductoForm = {
  sku: "", codigo_fabricante: "", descripcion: "", marca_id: "", categoria_id: "",
  unidad: "UND", costo_promedio: 0, precio_mayorista: 0, precio_fabrica: 0,
  precio_importacion: 0, stock_minimo: 4, stock_maximo: 20, ubicacion: "",
  peso_kg: 0, activo: true, atributos: [],
};

const UNIDADES = ["UND", "JGO", "PAR", "MTR", "KG", "LT", "ROLLO", "CAJA", "GLN"];

/** Atributos habituales según la familia del producto. */
const PLANTILLAS: Record<string, [string, string][]> = {
  rodamientos: [["tipo", ""], ["d_mm", ""], ["D_mm", ""], ["B_mm", ""], ["sello", ""], ["jaula", ""]],
  chumaceras: [["tipo", ""], ["eje_mm", ""], ["serie", ""]],
  "fajas-poleas": [["perfil", ""], ["seccion", ""], ["largo_pulg", ""]],
  "cadenas-pinones": [["tipo", ""], ["norma", ""], ["paso_mm", ""]],
  acoplamientos: [["tipo", ""], ["serie", ""]],
  "retenes-sellos": [["tipo", ""], ["material", ""], ["d_mm", ""], ["D_mm", ""], ["B_mm", ""]],
  lineales: [["tipo", ""], ["eje_mm", ""]],
};

export function FormularioProducto({
  producto,
  marcas,
  categorias,
  modo = "crear",
}: {
  producto?: Partial<ProductoForm> & { id?: string };
  marcas: { id: string; nombre: string }[];
  categorias: { id: string; nombre: string; slug: string }[];
  modo?: "crear" | "editar";
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [f, setF] = React.useState<ProductoForm>({ ...VACIO, ...producto });

  const set = <K extends keyof ProductoForm>(k: K, v: ProductoForm[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  React.useEffect(() => {
    if (abierto && producto) setF({ ...VACIO, ...producto });
  }, [abierto, producto]);

  const marca = marcas.find((m) => m.id === f.marca_id);
  const categoria = categorias.find((c) => c.id === f.categoria_id);

  /** El SKU se arma como MARCA-CÓDIGO, que es la convención del catálogo. */
  React.useEffect(() => {
    if (modo === "editar") return;
    if (marca && f.codigo_fabricante) {
      set("sku", `${marca.nombre}-${f.codigo_fabricante.toUpperCase().replace(/[\s/]+/g, "-")}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marca, f.codigo_fabricante, modo]);

  /** Al elegir la familia se proponen sus atributos técnicos habituales. */
  function aplicarPlantilla(categoriaId: string) {
    set("categoria_id", categoriaId);
    const slug = categorias.find((c) => c.id === categoriaId)?.slug ?? "";
    if (modo === "crear" && PLANTILLAS[slug] && f.atributos.length === 0) {
      set("atributos", PLANTILLAS[slug]);
    }
  }

  /** Deriva las listas de precio a partir del costo y un margen objetivo. */
  function calcularPrecios(margen: number) {
    const may = f.costo_promedio / (1 - margen / 100);
    setF((s) => ({
      ...s,
      precio_mayorista: Number(may.toFixed(2)),
      precio_fabrica: Number((may * 0.9).toFixed(2)),
      precio_importacion: Number((may * 0.8).toFixed(2)),
    }));
  }

  const margenMayorista =
    f.precio_mayorista > 0 ? ((f.precio_mayorista - f.costo_promedio) / f.precio_mayorista) * 100 : 0;

  async function guardar() {
    if (!f.codigo_fabricante.trim()) return toast.error("El código de fabricante es obligatorio");
    if (!f.descripcion.trim()) return toast.error("La descripción es obligatoria");
    if (!f.marca_id) return toast.error("Seleccione la marca");
    if (!f.categoria_id) return toast.error("Seleccione la línea de producto");

    setGuardando(true);
    const supabase = createClient();

    const atributos = Object.fromEntries(
      f.atributos.filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.trim(), v.trim()])
    );

    const datos = {
      sku: f.sku.trim().toUpperCase(),
      codigo_fabricante: f.codigo_fabricante.trim().toUpperCase(),
      descripcion: f.descripcion.trim(),
      marca_id: f.marca_id,
      categoria_id: f.categoria_id,
      unidad: f.unidad,
      atributos,
      costo_promedio: Number(f.costo_promedio) || 0,
      ultimo_costo: Number(f.costo_promedio) || 0,
      precio_mayorista: Number(f.precio_mayorista) || 0,
      precio_fabrica: Number(f.precio_fabrica) || 0,
      precio_importacion: Number(f.precio_importacion) || 0,
      stock_minimo: Number(f.stock_minimo) || 0,
      stock_maximo: Number(f.stock_maximo) || 0,
      ubicacion: f.ubicacion.trim() || null,
      peso_kg: Number(f.peso_kg) || 0,
      activo: f.activo,
      actualizado_en: new Date().toISOString(),
    };

    if (modo === "editar" && producto?.id) {
      const { error } = await supabase.from("productos").update(datos).eq("id", producto.id);
      if (error) {
        toast.error("No se pudo actualizar el producto", { description: error.message });
        setGuardando(false);
        return;
      }
      toast.success("Producto actualizado");
      setAbierto(false);
      setGuardando(false);
      router.refresh();
      return;
    }

    const { data, error } = await supabase
      .from("productos")
      .insert(datos)
      .select("id, sku")
      .single();

    if (error) {
      toast.error("No se pudo registrar el producto", {
        description: error.message.includes("duplicate")
          ? `Ya existe un producto con el SKU ${datos.sku}.`
          : error.message,
      });
      setGuardando(false);
      return;
    }

    const { data: user } = await supabase.auth.getUser();
    await supabase.from("actividad").insert({
      usuario_id: user.user?.id ?? null,
      accion: "crear_producto",
      entidad: "productos",
      entidad_id: data.id,
      descripcion: `Producto ${data.sku} agregado al maestro`,
    });

    toast.success(`Producto ${data.sku} registrado`, {
      description: "Registre un ingreso en almacén para darle stock inicial.",
    });
    setF(VACIO);
    setAbierto(false);
    setGuardando(false);
    router.push(`/productos/${data.id}`);
  }

  return (
    <>
      <Button
        variant={modo === "editar" ? "subtle" : "primary"}
        size="md"
        onClick={() => setAbierto(true)}
      >
        {modo === "editar" ? <Pencil /> : <Plus />}
        {modo === "editar" ? "Editar producto" : "Nuevo producto"}
      </Button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        ancho="max-w-4xl"
        titulo={modo === "editar" ? `Editar ${f.sku}` : "Registrar nuevo producto"}
        descripcion="El SKU se arma como MARCA-CÓDIGO. Los atributos técnicos alimentan la búsqueda y el cross-reference."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button variant="primary" loading={guardando} onClick={guardar}>
              <Save />
              {modo === "editar" ? "Guardar cambios" : "Registrar producto"}
            </Button>
          </>
        }
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
          <div className="space-y-4">
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                <Package className="size-3.5" />
                Identificación
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Marca *">
                  <Select value={f.marca_id} onChange={(e) => set("marca_id", e.target.value)}>
                    <option value="">Seleccione…</option>
                    {marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </Select>
                </Field>
                <Field label="Código de fabricante *" hint="6205-2RS, UCP208, A-42…">
                  <Input
                    value={f.codigo_fabricante}
                    onChange={(e) => set("codigo_fabricante", e.target.value)}
                    className="tabular"
                  />
                </Field>
                <Field label="SKU interno" hint={modo === "crear" ? "Se genera automáticamente" : undefined} className="sm:col-span-2">
                  <Input value={f.sku} onChange={(e) => set("sku", e.target.value)} className="tabular font-medium" />
                </Field>
                <Field label="Descripción *" className="sm:col-span-2">
                  <Textarea
                    rows={2}
                    value={f.descripcion}
                    onChange={(e) => set("descripcion", e.target.value)}
                    placeholder="Rodamiento rígido de bolas 6205-2RS · 25x52x15 mm · Doble sello de goma"
                  />
                </Field>
                <Field label="Línea de producto *">
                  <Select value={f.categoria_id} onChange={(e) => aplicarPlantilla(e.target.value)}>
                    <option value="">Seleccione…</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </Select>
                </Field>
                <Field label="Unidad de medida">
                  <Select value={f.unidad} onChange={(e) => set("unidad", e.target.value)}>
                    {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </Select>
                </Field>
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                  <Ruler className="size-3.5" />
                  Atributos técnicos
                </p>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => set("atributos", [...f.atributos, ["", ""]])}
                >
                  <Plus />
                  Agregar
                </Button>
              </div>
              {f.atributos.length === 0 ? (
                <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-[11.5px] text-muted">
                  Sin atributos. Elija una línea de producto para cargar los campos habituales, o
                  agréguelos manualmente.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {f.atributos.map(([k, v], i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={k}
                        onChange={(e) => {
                          const a = [...f.atributos];
                          a[i] = [e.target.value, v];
                          set("atributos", a);
                        }}
                        placeholder="Atributo"
                        className="h-8 w-2/5 text-[12px]"
                      />
                      <Input
                        value={v}
                        onChange={(e) => {
                          const a = [...f.atributos];
                          a[i] = [k, e.target.value];
                          set("atributos", a);
                        }}
                        placeholder="Valor"
                        className="h-8 flex-1 text-[12px]"
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => set("atributos", f.atributos.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="text-[var(--danger)]" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                <Tag className="size-3.5" />
                Costo y listas de precio
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Costo (S/)">
                  <Input
                    type="number" min={0} step="0.01"
                    value={f.costo_promedio}
                    onChange={(e) => set("costo_promedio", Number(e.target.value))}
                    className="text-right tabular"
                  />
                </Field>
                <Field label="Mayorista">
                  <Input
                    type="number" min={0} step="0.01"
                    value={f.precio_mayorista}
                    onChange={(e) => set("precio_mayorista", Number(e.target.value))}
                    className="text-right tabular"
                  />
                </Field>
                <Field label="Fábrica">
                  <Input
                    type="number" min={0} step="0.01"
                    value={f.precio_fabrica}
                    onChange={(e) => set("precio_fabrica", Number(e.target.value))}
                    className="text-right tabular"
                  />
                </Field>
                <Field label="Importación">
                  <Input
                    type="number" min={0} step="0.01"
                    value={f.precio_importacion}
                    onChange={(e) => set("precio_importacion", Number(e.target.value))}
                    className="text-right tabular"
                  />
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-subtle">Derivar precios con margen:</span>
                {[25, 30, 35, 40, 45].map((m) => (
                  <Button
                    key={m}
                    variant="subtle"
                    size="xs"
                    disabled={!f.costo_promedio}
                    onClick={() => calcularPrecios(m)}
                  >
                    {m}%
                  </Button>
                ))}
              </div>
            </section>

            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                Almacén
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Stock mínimo" hint="Dispara la alerta">
                  <Input
                    type="number" min={0}
                    value={f.stock_minimo}
                    onChange={(e) => set("stock_minimo", Number(e.target.value))}
                    className="text-right tabular"
                  />
                </Field>
                <Field label="Stock máximo">
                  <Input
                    type="number" min={0}
                    value={f.stock_maximo}
                    onChange={(e) => set("stock_maximo", Number(e.target.value))}
                    className="text-right tabular"
                  />
                </Field>
                <Field label="Ubicación" hint="Anaquel">
                  <Input value={f.ubicacion} onChange={(e) => set("ubicacion", e.target.value)} placeholder="C-04-2" />
                </Field>
                <Field label="Peso (kg)" hint="Para prorrateo">
                  <Input
                    type="number" min={0} step="0.001"
                    value={f.peso_kg}
                    onChange={(e) => set("peso_kg", Number(e.target.value))}
                    className="text-right tabular"
                  />
                </Field>
              </div>
            </section>
          </div>

          {/* ------------------------------------------------ Vista previa */}
          <div className="space-y-3">
            <div className="sticky top-0 space-y-3">
              <div className="rounded-lg border bg-[var(--surface-2)] p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
                  Así se verá en el catálogo
                </p>
                <p className="mt-2 text-[13px] font-bold text-brand-700">{f.sku || "MARCA-CÓDIGO"}</p>
                <p className="mt-0.5 line-clamp-3 text-[11px] text-muted">
                  {f.descripcion || "Descripción del producto"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {marca && <Badge tone="brand" size="xs">{marca.nombre}</Badge>}
                  {categoria && <Badge tone="neutral" size="xs">{categoria.nombre}</Badge>}
                </div>
              </div>

              <div
                className="rounded-lg p-3.5"
                style={{
                  backgroundColor: margenMayorista < 15 ? "var(--danger-bg)" : "var(--ok-bg)",
                }}
              >
                <p
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: margenMayorista < 15 ? "var(--danger)" : "var(--ok)" }}
                >
                  Margen mayorista
                </p>
                <p
                  className="mt-1 text-[20px] font-bold leading-none tabular"
                  style={{ color: margenMayorista < 15 ? "var(--danger)" : "var(--ok)" }}
                >
                  {pct(margenMayorista)}
                </p>
                <p className="mt-1.5 text-[11px] text-muted">
                  {money(f.precio_mayorista - f.costo_promedio)} sobre {money(f.costo_promedio)}
                </p>
              </div>

              <div>
                <Label>Estado</Label>
                <Select value={f.activo ? "1" : "0"} onChange={(e) => set("activo", e.target.value === "1")}>
                  <option value="1">Activo en catálogo</option>
                  <option value="0">Inactivo</option>
                </Select>
              </div>

              <p className="rounded-lg bg-[var(--surface-2)] p-3 text-[10.5px] leading-relaxed text-muted">
                El producto nace con stock cero. Para darle existencias registre un ingreso en
                <strong> Inventario → Ingresos y ajustes</strong>, o recíbalo desde una orden de compra.
              </p>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
