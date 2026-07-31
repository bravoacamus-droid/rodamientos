"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Trash2, Save, Send, Truck, Ship, Factory, ShoppingCart, Sparkles,
  Plus, AlertTriangle, Package, BarChart3,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BuscadorProductos, type ProductoBusqueda } from "@/components/comercial/buscador-productos";
import {
  ExplicacionReposicion, CRITICIDAD, type FilaReposicion,
} from "@/components/comercial/explicacion-reposicion";
import {
  Card, CardHeader, CardTitle, CardContent, CardFooter, Button, Input, Select,
  Textarea, Field, Table, THead, TBody, Badge, EmptyState, Label,
} from "@/components/ui/primitives";
import { money, num, hoyISO, sumarDias, cn } from "@/lib/utils";

type Proveedor = {
  id: string; codigo: string; razon_social: string; ruc: string | null;
  tipo: "local" | "importacion"; pais: string | null; moneda: string;
  contacto: string | null; email: string | null; dias_pago: number;
  lead_time_dias: number; marcas_provee: string[] | null;
};

/** El análisis de reposición ya trae la justificación de cada sugerencia. */
type Sugerencia = FilaReposicion;

type Linea = {
  key: string;
  producto_id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  stock: number;
  cantidad: number;
  costo: number;
  peso: number;
};

const INCOTERMS = ["FOB", "CIF", "EXW", "FCA", "CFR", "DAP"];

export function ConstructorOrdenCompra({
  proveedores,
  almacenes,
  sugerencias,
  compradorId,
  tipoInicial,
  proveedorInicial,
}: {
  proveedores: Proveedor[];
  almacenes: { id: string; codigo: string; nombre: string }[];
  sugerencias: Sugerencia[];
  compradorId: string | null;
  tipoInicial: "local" | "importacion";
  proveedorInicial: string | null;
}) {
  const router = useRouter();

  const [tipo, setTipo] = React.useState<"local" | "importacion">(tipoInicial);
  const [proveedorId, setProveedorId] = React.useState(proveedorInicial ?? "");
  const [almacen, setAlmacen] = React.useState(almacenes[0]?.id ?? "");
  const [moneda, setMoneda] = React.useState(tipoInicial === "importacion" ? "USD" : "PEN");
  const [tipoCambio, setTipoCambio] = React.useState(3.755);
  const [incoterm, setIncoterm] = React.useState("FOB");
  const [fechaEstimada, setFechaEstimada] = React.useState(sumarDias(hoyISO(), 3));
  const [observaciones, setObservaciones] = React.useState("");
  const [lineas, setLineas] = React.useState<Linea[]>([]);
  const [guardando, setGuardando] = React.useState<string | null>(null);
  const [cargandoSug, setCargandoSug] = React.useState(false);

  const proveedor = proveedores.find((p) => p.id === proveedorId);
  const disponibles = proveedores.filter((p) => p.tipo === tipo);

  /* El proveedor define moneda, plazo de arribo e incoterm por defecto. */
  React.useEffect(() => {
    if (!proveedor) return;
    setMoneda(proveedor.moneda);
    setFechaEstimada(sumarDias(hoyISO(), proveedor.lead_time_dias));
  }, [proveedor]);

  React.useEffect(() => {
    if (proveedor && proveedor.tipo !== tipo) setProveedorId("");
  }, [tipo, proveedor]);

  /* ---------------------------------------------------------- Ítems */

  async function agregar(p: ProductoBusqueda) {
    const supabase = createClient();
    const { data } = await supabase
      .from("v_stock_productos")
      .select("unidad, costo_promedio")
      .eq("id", p.id)
      .single();

    const { data: prod } = await supabase
      .from("productos")
      .select("ultimo_costo, peso_kg")
      .eq("id", p.id)
      .single();

    // En importación el costo se expresa en la moneda de origen
    const costoLocal = Number(prod?.ultimo_costo || data?.costo_promedio || p.costo_promedio);
    const costo = moneda === "USD" ? Number((costoLocal * 0.48 / tipoCambio).toFixed(4)) : costoLocal;

    setLineas((ls) => {
      if (ls.some((l) => l.producto_id === p.id)) {
        toast.info("El producto ya está en la orden");
        return ls.map((l) => (l.producto_id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [
        ...ls,
        {
          key: crypto.randomUUID(),
          producto_id: p.id,
          codigo: p.sku,
          descripcion: p.descripcion,
          unidad: String(data?.unidad ?? "UND"),
          stock: Number(p.stock),
          cantidad: 1,
          costo,
          peso: Number(prod?.peso_kg ?? 0),
        },
      ];
    });
  }

  /** Carga los ítems que el motor de alertas recomienda reponer. */
  async function cargarSugerencias() {
    if (!sugerencias.length) return toast.info("No hay reposiciones sugeridas");
    setCargandoSug(true);
    const supabase = createClient();

    // Solo lo que este proveedor representa
    const candidatas = proveedor?.marcas_provee?.length
      ? sugerencias.filter((s) => proveedor.marcas_provee!.includes(s.marca ?? ""))
      : sugerencias;

    const ids = candidatas.map((s) => s.producto_id);
    const { data: pesos } = ids.length
      ? await supabase.from("productos").select("id, ultimo_costo, peso_kg").in("id", ids)
      : { data: [] };

    const nuevas: Linea[] = candidatas.map((s) => {
      const extra = (pesos ?? []).find((x) => x.id === s.producto_id);
      const costoLocal = Number(extra?.ultimo_costo || s.costo_promedio);
      return {
        key: crypto.randomUUID(),
        producto_id: s.producto_id,
        codigo: s.sku,
        descripcion: s.descripcion,
        unidad: s.unidad,
        stock: Number(s.stock_actual),
        cantidad: Math.max(Math.round(s.cantidad_sugerida), 1),
        costo: moneda === "USD" ? Number((costoLocal * 0.48 / tipoCambio).toFixed(4)) : costoLocal,
        peso: Number(extra?.peso_kg ?? 0),
      };
    });

    setLineas((ls) => {
      const existentes = new Set(ls.map((l) => l.producto_id));
      const agregadas = nuevas.filter((n) => !existentes.has(n.producto_id));
      if (!agregadas.length) {
        toast.info(
          proveedor?.marcas_provee?.length
            ? "Las sugerencias no corresponden a las marcas de este proveedor"
            : "Las sugerencias ya están en la orden"
        );
      } else {
        toast.success(`${agregadas.length} ítem(s) sugeridos agregados`, {
          description:
            "Cantidades para 45 días de cobertura más el lead time del proveedor. " +
            "Use el botón «Por qué» de cada sugerencia para ver el sustento.",
        });
      }
      return [...ls, ...agregadas];
    });
    setCargandoSug(false);
  }

  const actualizar = (key: string, campo: "cantidad" | "costo", valor: number) =>
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));

  const quitar = (key: string) => setLineas((ls) => ls.filter((l) => l.key !== key));

  /* -------------------------------------------------------- Totales */

  const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.costo, 0);
  const igv = tipo === "local" ? subtotal * 0.18 : 0;
  const total = subtotal + igv;
  const pesoTotal = lineas.reduce((s, l) => s + l.cantidad * l.peso, 0);
  const totalSoles = moneda === "USD" ? total * tipoCambio : total;

  /* -------------------------------------------------------- Guardar */

  async function guardar(estado: "borrador" | "enviada") {
    if (!proveedorId) return toast.error("Seleccione un proveedor");
    if (!lineas.length) return toast.error("Agregue al menos un producto");
    if (!almacen) return toast.error("Seleccione el almacén de destino");

    setGuardando(estado);
    const supabase = createClient();

    const { data: numero, error: errNum } = await supabase.rpc("siguiente_numero", {
      p_prefijo: "OC",
      p_tabla: "ordenes_compra",
    });
    if (errNum || !numero) {
      toast.error("No se pudo generar el correlativo", { description: errNum?.message });
      setGuardando(null);
      return;
    }

    const { data: oc, error } = await supabase
      .from("ordenes_compra")
      .insert({
        numero,
        proveedor_id: proveedorId,
        tipo,
        fecha: hoyISO(),
        fecha_estimada: fechaEstimada,
        moneda,
        tipo_cambio: tipoCambio,
        incoterm: tipo === "importacion" ? incoterm : null,
        subtotal: Number(subtotal.toFixed(2)),
        igv: Number(igv.toFixed(2)),
        total: Number(total.toFixed(2)),
        estado,
        almacen_id: almacen,
        comprador_id: compradorId,
        observaciones: observaciones || null,
      })
      .select("id, numero")
      .single();

    if (error || !oc) {
      toast.error("No se pudo crear la orden", { description: error?.message });
      setGuardando(null);
      return;
    }

    const { error: errItems } = await supabase.from("oc_items").insert(
      lineas.map((l, i) => ({
        orden_compra_id: oc.id,
        producto_id: l.producto_id,
        orden: i + 1,
        codigo: l.codigo,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        cantidad_recibida: 0,
        unidad: l.unidad,
        costo_unitario: l.costo,
        subtotal: Number((l.cantidad * l.costo).toFixed(2)),
        peso_kg: l.peso,
        costo_landed: tipo === "local" ? l.costo : 0,
      }))
    );

    if (errItems) {
      toast.error("La orden se creó pero fallaron los ítems", { description: errItems.message });
    }

    await supabase.from("actividad").insert({
      usuario_id: compradorId,
      accion: "crear_orden_compra",
      entidad: "ordenes_compra",
      entidad_id: oc.id,
      descripcion: `Orden ${oc.numero} a ${proveedor?.razon_social} por ${money(total, moneda)}`,
    });

    toast.success(`Orden ${oc.numero} creada`, {
      description:
        tipo === "importacion"
          ? "Abra el expediente de importación para registrar los gastos y obtener el costo puesto en almacén."
          : "Al recibir la mercadería se generará el ingreso al kardex.",
    });
    router.push(`/compras/${oc.id}`);
    router.refresh();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
      <div className="space-y-4">
        {/* ------------------------------------------------ Proveedor */}
        <Card>
          <CardHeader>
            <CardTitle>Proveedor y condiciones</CardTitle>
            <Factory className="size-4 text-subtle" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Origen del abastecimiento</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "local", label: "Compra local", desc: "Soles con IGV, entrega rápida", icon: Truck },
                  { id: "importacion", label: "Importación", desc: "Moneda extranjera y landed cost", icon: Ship },
                ] as const).map((t) => {
                  const Icon = t.icon;
                  const activo = tipo === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTipo(t.id);
                        setMoneda(t.id === "importacion" ? "USD" : "PEN");
                      }}
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

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Proveedor" className="sm:col-span-2">
                <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                  <option value="">Seleccione un proveedor…</option>
                  {disponibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.razon_social}{p.pais ? ` · ${p.pais}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Moneda">
                <Select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                  <option value="PEN">Soles (S/)</option>
                  <option value="USD">Dólares (US$)</option>
                </Select>
              </Field>
              {moneda === "USD" ? (
                <Field label="Tipo de cambio">
                  <Input
                    type="number"
                    step="0.0001"
                    value={tipoCambio}
                    onChange={(e) => setTipoCambio(Number(e.target.value))}
                    className="text-right tabular"
                  />
                </Field>
              ) : (
                <Field label="Almacén de destino">
                  <Select value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
                    {almacenes.map((a) => (
                      <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>
                    ))}
                  </Select>
                </Field>
              )}

              {moneda === "USD" && (
                <Field label="Almacén de destino">
                  <Select value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
                    {almacenes.map((a) => (
                      <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>
                    ))}
                  </Select>
                </Field>
              )}
              {tipo === "importacion" && (
                <Field label="Incoterm">
                  <Select value={incoterm} onChange={(e) => setIncoterm(e.target.value)}>
                    {INCOTERMS.map((i) => <option key={i} value={i}>{i}</option>)}
                  </Select>
                </Field>
              )}
              <Field label={tipo === "importacion" ? "Arribo estimado" : "Entrega estimada"}>
                <Input type="date" value={fechaEstimada} onChange={(e) => setFechaEstimada(e.target.value)} />
              </Field>
            </div>

            {proveedor && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg bg-[var(--surface-2)] px-3.5 py-2.5">
                {[
                  ["Código", proveedor.codigo],
                  ["Contacto", proveedor.contacto ?? "—"],
                  ["Lead time", `${proveedor.lead_time_dias} días`],
                  ["Pago", proveedor.dias_pago === 0 ? "Contado" : `${proveedor.dias_pago} días`],
                ].map(([k, v]) => (
                  <span key={k} className="text-[11.5px]">
                    <span className="text-subtle">{k}: </span>
                    <span className="font-medium text-fg">{v}</span>
                  </span>
                ))}
                {proveedor.marcas_provee?.length ? (
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="text-[11.5px] text-subtle">Marcas:</span>
                    {proveedor.marcas_provee.map((m) => (
                      <Badge key={m} tone="brand" size="xs">{m}</Badge>
                    ))}
                  </span>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---------------------------------------------------- Ítems */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Ítems a comprar</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                El costo sugerido parte del último costo de compra registrado para cada ítem.
              </p>
            </div>
            <Button
              variant="accent"
              size="sm"
              onClick={cargarSugerencias}
              loading={cargandoSug}
              disabled={!sugerencias.length}
            >
              <Sparkles />
              Cargar reposición sugerida ({sugerencias.length})
            </Button>
          </CardHeader>

          <CardContent>
            <BuscadorProductos onSeleccionar={agregar} autoFocus />
          </CardContent>

          {lineas.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart />}
              titulo="Sin ítems en la orden"
              descripcion="Busque productos o cargue de un golpe lo que el sistema recomienda reponer según rotación."
            />
          ) : (
            <>
              <Table>
                <THead>
                  <tr>
                    <th>Producto</th>
                    <th className="text-right">Stock actual</th>
                    <th className="w-24 text-right">Cantidad</th>
                    <th className="w-32 text-right">Costo unit.</th>
                    <th className="text-right">Peso kg</th>
                    <th className="text-right">Importe</th>
                    <th className="w-10" />
                  </tr>
                </THead>
                <TBody>
                  {lineas.map((l) => (
                    <tr key={l.key}>
                      <td className="max-w-[300px]">
                        <span className="block text-[12.5px] font-semibold text-fg">{l.codigo}</span>
                        <span className="block truncate text-[11px] text-muted">{l.descripcion}</span>
                      </td>
                      <td className="text-right text-[12px] tabular">
                        <span style={{ color: l.stock <= 0 ? "var(--danger)" : "var(--fg-muted)" }}>
                          {num(l.stock, 0)}
                        </span>
                      </td>
                      <td>
                        <Input
                          type="number"
                          min={1}
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
                      <td className="text-right text-[11.5px] text-muted tabular">
                        {num(l.cantidad * l.peso, 1)}
                      </td>
                      <td className="text-right text-[12.5px] font-semibold text-fg tabular">
                        {money(l.cantidad * l.costo, moneda)}
                      </td>
                      <td>
                        <Button variant="ghost" size="icon-sm" onClick={() => quitar(l.key)}>
                          <Trash2 className="text-[var(--danger)]" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </TBody>
              </Table>
              <CardFooter className="justify-between">
                <span className="text-[12px] text-muted">
                  {num(lineas.reduce((s, l) => s + l.cantidad, 0), 0)} unidades ·{" "}
                  {num(pesoTotal, 1)} kg estimados
                </span>
                <span className="text-[13px] font-semibold text-fg tabular">
                  {money(total, moneda)}
                </span>
              </CardFooter>
            </>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------ Resumen */}
      <div className="space-y-4">
        <Card className="sticky top-[72px]">
          <CardHeader>
            <CardTitle>Resumen de la orden</CardTitle>
            {tipo === "importacion" ? <Ship className="size-4 text-subtle" /> : <Truck className="size-4 text-subtle" />}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between text-[12.5px]">
                <span className="text-muted">Subtotal</span>
                <span className="font-medium text-fg tabular">{money(subtotal, moneda)}</span>
              </div>
              {tipo === "local" && (
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-muted">IGV (18%)</span>
                  <span className="font-medium text-fg tabular">{money(igv, moneda)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-[13px] font-semibold text-fg">Total</span>
                <span className="text-[19px] font-bold text-brand-700 tabular">{money(total, moneda)}</span>
              </div>
              {moneda === "USD" && (
                <p className="text-right text-[11px] text-subtle tabular">
                  ≈ {money(totalSoles)} al cambio de {tipoCambio}
                </p>
              )}
            </div>

            {tipo === "importacion" && (
              <div className="flex items-start gap-2 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-accent-800" />
                <p className="text-[10.5px] leading-relaxed text-accent-900">
                  Este importe es el valor en origen. El costo real por ítem se obtiene al abrir el
                  expediente de importación y prorratear flete, seguro, aranceles y gastos de aduana.
                </p>
              </div>
            )}

            <Field label="Observaciones">
              <Textarea
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Reposición según rotación, urgencia por pedido confirmado…"
              />
            </Field>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button
              className="w-full"
              onClick={() => guardar("enviada")}
              loading={guardando === "enviada"}
              disabled={!proveedorId || !lineas.length}
            >
              <Send />
              Emitir y enviar al proveedor
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => guardar("borrador")}
              loading={guardando === "borrador"}
              disabled={!proveedorId || !lineas.length}
            >
              <Save />
              Guardar como borrador
            </Button>
          </CardFooter>
        </Card>

        {sugerencias.length > 0 && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Reposición sugerida</CardTitle>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  Ítems con cobertura menor a 30 días según su rotación
                </p>
              </div>
              <Package className="size-4 text-subtle" />
            </CardHeader>
            <CardContent className="max-h-[380px] space-y-1.5 overflow-y-auto">
              {sugerencias.slice(0, 15).map((s) => {
                const crit = CRITICIDAD[s.criticidad] ?? CRITICIDAD.holgado;
                return (
                  <div key={s.producto_id} className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[12px] font-semibold text-fg">
                        {s.sku}
                      </span>
                      <Badge tone={crit.tone} size="xs">{crit.label}</Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-[10.5px] text-muted">
                        Stock {num(s.stock_actual, 0)} · cobertura{" "}
                        {s.cobertura_dias > 900 ? "—" : `${num(s.cobertura_dias, 0)} d`}
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-brand-700 tabular">
                        {num(s.cantidad_sugerida, 0)} und
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10px] text-subtle">{money(s.inversion)}</span>
                      <ExplicacionReposicion fila={s} />
                    </div>
                  </div>
                );
              })}

              <Link
                href="/inventario/reposicion"
                className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11.5px] font-medium text-brand-600 transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                <BarChart3 className="size-3.5" />
                Ver el análisis completo con gráficos
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
