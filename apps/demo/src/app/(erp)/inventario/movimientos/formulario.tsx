"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PackagePlus, Trash2, Save, ArrowDownToLine, ArrowUpFromLine,
  SlidersHorizontal, ClipboardPaste, Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BuscadorProductos, type ProductoBusqueda } from "@/components/comercial/buscador-productos";
import {
  Card, CardHeader, CardTitle, CardContent, CardFooter, Button, Input, Select,
  Textarea, Field, Table, THead, TBody, Badge, EmptyState, Label,
} from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/client";
import { money, num, cn } from "@/lib/utils";

type Linea = {
  key: string;
  producto: ProductoBusqueda;
  cantidad: number;
  costo: number;
};

const TIPOS = [
  { id: "ingreso", label: "Ingreso de mercadería", icon: ArrowDownToLine, desc: "Compra local, devolución o carga inicial" },
  { id: "ajuste_positivo", label: "Ajuste positivo", icon: SlidersHorizontal, desc: "Diferencia a favor en la toma física" },
  { id: "ajuste_negativo", label: "Ajuste negativo", icon: ArrowUpFromLine, desc: "Merma, rotura o faltante" },
  { id: "regularizacion", label: "Regularización", icon: PackagePlus, desc: "Reposición de un stock negativo de emergencia" },
] as const;

export function FormularioMovimientos({
  almacenes,
  precargado,
}: {
  almacenes: { id: string; codigo: string; nombre: string }[];
  precargado: {
    id: string; sku: string; descripcion: string; unidad: string;
    costo_promedio: number; stock_total: number;
  } | null;
}) {
  const router = useRouter();
  const [modo, setModo] = React.useState<"individual" | "masivo">("individual");
  const [tipo, setTipo] = React.useState<string>("ingreso");
  const [almacen, setAlmacen] = React.useState(almacenes[0]?.id ?? "");
  const [documento, setDocumento] = React.useState("");
  const [motivo, setMotivo] = React.useState("");
  const [lineas, setLineas] = React.useState<Linea[]>(
    precargado
      ? [{
          key: crypto.randomUUID(),
          producto: {
            id: precargado.id, sku: precargado.sku, codigo_fabricante: precargado.sku,
            descripcion: precargado.descripcion, marca: null, categoria: null,
            stock: precargado.stock_total, precio_mayorista: 0,
            costo_promedio: precargado.costo_promedio, estado_stock: "normal",
          },
          cantidad: 1,
          costo: Number(precargado.costo_promedio),
        }]
      : []
  );
  const [pegado, setPegado] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);

  const agregar = (p: ProductoBusqueda) => {
    setLineas((ls) => {
      const existe = ls.find((l) => l.producto.id === p.id);
      if (existe) {
        return ls.map((l) => (l.producto.id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [...ls, { key: crypto.randomUUID(), producto: p, cantidad: 1, costo: Number(p.costo_promedio) }];
    });
  };

  const actualizar = (key: string, campo: "cantidad" | "costo", valor: number) =>
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));

  const quitar = (key: string) => setLineas((ls) => ls.filter((l) => l.key !== key));

  async function procesarPegado() {
    const filas = pegado
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!filas.length) return;

    const supabase = createClient();
    const nuevas: Linea[] = [];
    let noEncontrados = 0;

    for (const fila of filas) {
      const partes = fila.split(/[\t;,]+/).map((p) => p.trim());
      const codigo = partes[0];
      const cantidad = Number(partes[1] ?? 1) || 1;
      const costo = partes[2] ? Number(partes[2]) : undefined;
      if (!codigo) continue;

      const { data } = await supabase.rpc("buscar_productos", { p_q: codigo, p_limit: 1 });
      const p = (data ?? [])[0] as ProductoBusqueda | undefined;
      if (!p) {
        noEncontrados += 1;
        continue;
      }
      nuevas.push({
        key: crypto.randomUUID(),
        producto: p,
        cantidad,
        costo: costo ?? Number(p.costo_promedio),
      });
    }

    setLineas((ls) => [...ls, ...nuevas]);
    setPegado("");
    toast.success(`${nuevas.length} ítem(s) reconocidos`, {
      description: noEncontrados ? `${noEncontrados} código(s) no se encontraron en el maestro.` : undefined,
    });
  }

  async function guardar() {
    if (!lineas.length) return toast.error("Agregue al menos un ítem");
    if (!almacen) return toast.error("Seleccione un almacén");

    setGuardando(true);
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    const uid = user.user?.id ?? null;

    let ok = 0;
    for (const l of lineas) {
      const { error } = await supabase.rpc("registrar_movimiento", {
        p_producto: l.producto.id,
        p_almacen: almacen,
        p_tipo: tipo,
        p_cantidad: l.cantidad,
        p_costo: l.costo,
        p_ref_tipo: "ajuste",
        p_ref_id: null,
        p_ref_numero: documento || "MOV-MANUAL",
        p_motivo: motivo || TIPOS.find((t) => t.id === tipo)?.label,
        p_usuario: uid,
      });
      if (!error) ok += 1;
    }

    if (ok) {
      await supabase.from("actividad").insert({
        usuario_id: uid,
        accion: "movimiento_inventario",
        entidad: "movimientos_inventario",
        descripcion: `Registró ${ok} movimiento(s) de tipo ${tipo} en almacén`,
      });
      toast.success(`${ok} movimiento(s) registrados`, {
        description: "El kardex y el costo promedio fueron actualizados.",
      });
      setLineas([]);
      setDocumento("");
      setMotivo("");
      router.refresh();
    } else {
      toast.error("No se pudo registrar el movimiento", {
        description: "Verifique que su rol tenga permisos sobre el almacén.",
      });
    }
    setGuardando(false);
  }

  const totalUnidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  const totalValor = lineas.reduce((s, l) => s + l.cantidad * l.costo, 0);
  const esSalida = tipo === "ajuste_negativo";

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Ítems del movimiento</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Busque el producto y ajuste cantidad y costo unitario de cada línea.
              </p>
            </div>
            <Badge tone="brand" size="sm">{lineas.length} línea(s)</Badge>
          </CardHeader>

          <CardContent className="space-y-3">
            <Tabs
              tabs={[
                { id: "individual", label: "Ingreso individual" },
                { id: "masivo", label: "Carga masiva" },
              ]}
              value={modo}
              onChange={(v) => setModo(v as "individual" | "masivo")}
            />

            {modo === "individual" ? (
              <BuscadorProductos onSeleccionar={agregar} autoFocus />
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
                  <ClipboardPaste className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
                  <p className="text-[11px] leading-relaxed text-brand-800">
                    Pegue una línea por ítem con el formato{" "}
                    <code className="rounded bg-white px-1">código, cantidad, costo</code>. Acepta valores
                    separados por coma, punto y coma o tabulación (copiar/pegar directo desde Excel).
                  </p>
                </div>
                <Textarea
                  value={pegado}
                  onChange={(e) => setPegado(e.target.value)}
                  rows={6}
                  placeholder={"6205-2RS, 24, 12.50\nUCP208, 6, 78.00\n22217, 3"}
                  className="font-mono text-[12px]"
                />
                <Button variant="subtle" size="sm" onClick={procesarPegado} disabled={!pegado.trim()}>
                  <ClipboardPaste />
                  Reconocer {pegado.split("\n").filter((l) => l.trim()).length} línea(s)
                </Button>
              </div>
            )}
          </CardContent>

          {lineas.length === 0 ? (
            <EmptyState
              icon={<PackagePlus />}
              titulo="Sin ítems agregados"
              descripcion="Use el buscador para agregar productos al movimiento."
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <th>Producto</th>
                  <th className="text-right">Stock actual</th>
                  <th className="w-28 text-right">Cantidad</th>
                  <th className="w-32 text-right">Costo unit.</th>
                  <th className="text-right">Importe</th>
                  <th className="w-10" />
                </tr>
              </THead>
              <TBody>
                {lineas.map((l) => (
                  <tr key={l.key}>
                    <td className="max-w-[280px]">
                      <span className="block text-[12.5px] font-semibold text-fg">{l.producto.sku}</span>
                      <span className="block truncate text-[11px] text-muted">{l.producto.descripcion}</span>
                    </td>
                    <td className="text-right text-[12px] tabular">
                      <span style={{ color: Number(l.producto.stock) < 0 ? "var(--danger)" : undefined }}>
                        {num(l.producto.stock, 0)}
                      </span>
                    </td>
                    <td>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        value={l.cantidad}
                        onChange={(e) => actualizar(l.key, "cantidad", Number(e.target.value))}
                        className="h-8 text-right text-[12.5px] tabular"
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        min={0}
                        step="0.0001"
                        value={l.costo}
                        onChange={(e) => actualizar(l.key, "costo", Number(e.target.value))}
                        className="h-8 text-right text-[12.5px] tabular"
                      />
                    </td>
                    <td className="text-right text-[12.5px] font-semibold text-fg tabular">
                      {money(l.cantidad * l.costo)}
                    </td>
                    <td>
                      <Button variant="ghost" size="icon-sm" onClick={() => quitar(l.key)} aria-label="Quitar">
                        <Trash2 className="text-[var(--danger)]" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </TBody>
            </Table>
          )}

          {lineas.length > 0 && (
            <CardFooter className="justify-between">
              <span className="text-[12px] text-muted">
                {num(totalUnidades, 0)} unidades en {lineas.length} línea(s)
              </span>
              <span className="text-[13px] font-semibold text-fg tabular">
                Valor del movimiento: {money(totalValor)}
              </span>
            </CardFooter>
          )}
        </Card>
      </div>

      {/* ----------------------------------------------------- Panel lateral */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Datos del movimiento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Tipo de movimiento</Label>
              <div className="space-y-1.5">
                {TIPOS.map((t) => {
                  const Icon = t.icon;
                  const activo = tipo === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTipo(t.id)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-all",
                        activo
                          ? "border-brand-400 bg-brand-50 ring-brand"
                          : "hover:border-brand-300 hover:bg-[var(--surface-2)]"
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

            <Field label="Almacén de destino">
              <Select value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} · {a.nombre}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Documento de referencia" hint="Guía del proveedor, acta de inventario, etc.">
              <Input
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="G001-0012345"
              />
            </Field>

            <Field label="Motivo / observación">
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ingreso por compra local al proveedor…"
              />
            </Field>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={guardar} loading={guardando} disabled={!lineas.length}>
              <Save />
              Registrar {lineas.length || ""} movimiento{lineas.length === 1 ? "" : "s"}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
              <div className="text-[11.5px] leading-relaxed text-muted">
                <p className="font-medium text-fg">Efecto sobre el costo</p>
                <p className="mt-1">
                  {esSalida
                    ? "Las salidas se valorizan al costo promedio vigente del ítem y reducen el saldo valorizado del kardex."
                    : "Los ingresos recalculan el costo promedio ponderado del producto y actualizan el último costo de compra."}
                </p>
                <p className="mt-2">
                  Cada línea genera un asiento independiente en el kardex, con fecha, usuario responsable y
                  documento de respaldo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
