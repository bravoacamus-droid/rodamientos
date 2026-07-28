"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Trash2, Save, Send, History, TrendingUp, AlertTriangle, Building2,
  FileText, Sparkles, CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BuscadorProductos, type ProductoBusqueda } from "@/components/comercial/buscador-productos";
import {
  Card, CardHeader, CardTitle, CardContent, CardFooter, Button, Input, Select,
  Textarea, Field, Table, THead, TBody, Badge, EmptyState, Label, Tooltip,
} from "@/components/ui/primitives";
import { money, num, pct, hoyISO, sumarDias, cn } from "@/lib/utils";

type Cliente = {
  id: string; codigo: string; razon_social: string; ruc: string | null;
  contacto: string | null; lista_precio: string; dias_credito: number;
  linea_credito: number; distrito: string | null;
};

type Historial = { fecha: string; documento: string; cliente: string; precio_unitario: number; origen: string };

type Linea = {
  key: string;
  producto_id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad: string;
  stock: number;
  cantidad: number;
  precio: number;
  descuento: number;
  costo: number;
  precios: { mayorista: number; fabrica: number; importacion: number };
  historial?: Historial[];
};

const LISTAS = [
  { id: "mayorista", label: "Mayorista" },
  { id: "fabrica", label: "Fábrica" },
  { id: "importacion", label: "Importación" },
];

export function ConstructorCotizacion({
  clientes,
  vendedorId,
  clienteInicial,
  productoInicial,
}: {
  clientes: Cliente[];
  vendedorId: string | null;
  clienteInicial: string | null;
  productoInicial: Record<string, unknown> | null;
}) {
  const router = useRouter();
  const [clienteId, setClienteId] = React.useState(clienteInicial ?? "");
  const [lista, setLista] = React.useState("mayorista");
  const [validez, setValidez] = React.useState(15);
  const [entrega, setEntrega] = React.useState("Stock inmediato");
  const [observaciones, setObservaciones] = React.useState("");
  const [lineas, setLineas] = React.useState<Linea[]>([]);
  const [guardando, setGuardando] = React.useState<string | null>(null);
  const [verHistorial, setVerHistorial] = React.useState<string | null>(null);

  const cliente = clientes.find((c) => c.id === clienteId);

  React.useEffect(() => {
    if (cliente) setLista(cliente.lista_precio);
  }, [cliente]);

  /* -------------------------------------------------- Precarga de producto */
  React.useEffect(() => {
    if (!productoInicial) return;
    const p = productoInicial as Record<string, number | string | null>;
    setLineas([
      {
        key: crypto.randomUUID(),
        producto_id: String(p.id),
        codigo: String(p.sku),
        descripcion: String(p.descripcion),
        marca: (p.marca as string) ?? null,
        unidad: String(p.unidad ?? "UND"),
        stock: Number(p.stock_total ?? 0),
        cantidad: 1,
        precio: Number(p.precio_mayorista ?? 0),
        descuento: 0,
        costo: Number(p.costo_promedio ?? 0),
        precios: {
          mayorista: Number(p.precio_mayorista ?? 0),
          fabrica: Number(p.precio_fabrica ?? 0),
          importacion: Number(p.precio_importacion ?? 0),
        },
      },
    ]);
  }, [productoInicial]);

  /* ------------------------------------------------------ Precio por lista */
  React.useEffect(() => {
    setLineas((ls) =>
      ls.map((l) => ({
        ...l,
        precio: l.precios[lista as keyof typeof l.precios] || l.precio,
      }))
    );
  }, [lista]);

  async function agregar(p: ProductoBusqueda) {
    const supabase = createClient();
    const { data: full } = await supabase
      .from("v_stock_productos")
      .select("unidad, precio_mayorista, precio_fabrica, precio_importacion")
      .eq("id", p.id)
      .single();

    const precios = {
      mayorista: Number(full?.precio_mayorista ?? p.precio_mayorista),
      fabrica: Number(full?.precio_fabrica ?? p.precio_mayorista),
      importacion: Number(full?.precio_importacion ?? p.precio_mayorista),
    };

    const { data: hist } = await supabase.rpc("historial_producto", {
      p_producto: p.id,
      p_limit: 8,
    });

    setLineas((ls) => {
      if (ls.some((l) => l.producto_id === p.id)) {
        toast.info("El producto ya está en la cotización");
        return ls.map((l) => (l.producto_id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [
        ...ls,
        {
          key: crypto.randomUUID(),
          producto_id: p.id,
          codigo: p.sku,
          descripcion: p.descripcion,
          marca: p.marca,
          unidad: String(full?.unidad ?? "UND"),
          stock: Number(p.stock),
          cantidad: 1,
          precio: precios[lista as keyof typeof precios] || precios.mayorista,
          descuento: 0,
          costo: Number(p.costo_promedio),
          precios,
          historial: (hist ?? []) as Historial[],
        },
      ];
    });
  }

  const actualizar = (key: string, campo: keyof Linea, valor: number) =>
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));

  const quitar = (key: string) => setLineas((ls) => ls.filter((l) => l.key !== key));

  /* ----------------------------------------------------------- Totales */
  const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precio * (1 - l.descuento / 100), 0);
  const costoTotal = lineas.reduce((s, l) => s + l.cantidad * l.costo, 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;
  const margenPct = subtotal > 0 ? ((subtotal - costoTotal) / subtotal) * 100 : 0;

  async function guardar(estado: "borrador" | "enviada") {
    if (!clienteId) return toast.error("Seleccione un cliente");
    if (!lineas.length) return toast.error("Agregue al menos un producto");

    setGuardando(estado);
    const supabase = createClient();

    const { data: numero, error: errNum } = await supabase.rpc("siguiente_numero", {
      p_prefijo: "COT",
      p_tabla: "cotizaciones",
    });
    if (errNum || !numero) {
      toast.error("No se pudo generar el correlativo", { description: errNum?.message });
      setGuardando(null);
      return;
    }

    const { data: cot, error } = await supabase
      .from("cotizaciones")
      .insert({
        numero,
        cliente_id: clienteId,
        fecha: hoyISO(),
        validez_dias: validez,
        moneda: "PEN",
        lista_precio: lista,
        subtotal: Number(subtotal.toFixed(2)),
        igv: Number(igv.toFixed(2)),
        total: Number(total.toFixed(2)),
        costo_total: Number(costoTotal.toFixed(2)),
        margen_pct: Number(margenPct.toFixed(2)),
        estado,
        vendedor_id: vendedorId,
        contacto: cliente?.contacto ?? null,
        condiciones:
          cliente && cliente.dias_credito > 0
            ? `Crédito ${cliente.dias_credito} días · Precios incluyen IGV`
            : "Contado · Precios incluyen IGV",
        tiempo_entrega: entrega,
        observaciones: observaciones || null,
        enviada_en: estado === "enviada" ? new Date().toISOString() : null,
      })
      .select("id, numero")
      .single();

    if (error || !cot) {
      toast.error("No se pudo guardar la cotización", { description: error?.message });
      setGuardando(null);
      return;
    }

    const { error: errItems } = await supabase.from("cotizacion_items").insert(
      lineas.map((l, i) => ({
        cotizacion_id: cot.id,
        producto_id: l.producto_id,
        orden: i + 1,
        codigo: l.codigo,
        descripcion: l.descripcion,
        marca: l.marca,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precio_unitario: l.precio,
        descuento_pct: l.descuento,
        costo_unitario: l.costo,
        subtotal: Number((l.cantidad * l.precio * (1 - l.descuento / 100)).toFixed(2)),
        entrega,
      }))
    );

    if (errItems) {
      toast.error("La cotización se creó pero fallaron los ítems", { description: errItems.message });
    }

    await supabase.from("actividad").insert({
      usuario_id: vendedorId,
      accion: "crear_cotizacion",
      entidad: "cotizaciones",
      entidad_id: cot.id,
      descripcion: `Cotización ${cot.numero} creada por ${money(total)}`,
    });

    toast.success(`Cotización ${cot.numero} creada`);
    router.push(`/cotizaciones/${cot.id}`);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
      <div className="space-y-4">
        {/* -------------------------------------------------------- Cliente */}
        <Card>
          <CardHeader>
            <CardTitle>Cliente y condiciones</CardTitle>
            <Building2 className="size-4 text-subtle" />
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Cliente" className="sm:col-span-2">
              <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Seleccione un cliente…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razon_social}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lista de precios">
              <Select value={lista} onChange={(e) => setLista(e.target.value)}>
                {LISTAS.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Validez (días)">
              <Input
                type="number"
                min={1}
                value={validez}
                onChange={(e) => setValidez(Number(e.target.value))}
              />
            </Field>

            {cliente && (
              <div className="sm:col-span-2 lg:col-span-4">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg bg-[var(--surface-2)] px-3.5 py-2.5">
                  {[
                    ["RUC", cliente.ruc ?? "—"],
                    ["Contacto", cliente.contacto ?? "—"],
                    ["Distrito", cliente.distrito ?? "—"],
                    ["Crédito", `${cliente.dias_credito} días`],
                    ["Línea", money(cliente.linea_credito)],
                  ].map(([k, v]) => (
                    <span key={k} className="text-[11.5px]">
                      <span className="text-subtle">{k}: </span>
                      <span className="font-medium text-fg">{v}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* --------------------------------------------------------- Ítems */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Productos cotizados</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Busque por código o descripción. El margen se calcula sobre el costo promedio vigente.
              </p>
            </div>
            <Badge tone="brand" size="sm">{lineas.length} ítem(s)</Badge>
          </CardHeader>
          <CardContent>
            <BuscadorProductos onSeleccionar={agregar} autoFocus />
          </CardContent>

          {lineas.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              titulo="Sin productos"
              descripcion="Agregue ítems al detalle usando el buscador. Puede escribir el código del rodamiento o parte de la descripción."
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <th>Producto</th>
                  <th className="text-right">Stock</th>
                  <th className="w-24 text-right">Cant.</th>
                  <th className="w-32 text-right">P. Unit.</th>
                  <th className="w-20 text-right">Dscto %</th>
                  <th className="text-right">Costo</th>
                  <th className="text-right">Margen</th>
                  <th className="text-right">Importe</th>
                  <th className="w-20" />
                </tr>
              </THead>
              <TBody>
                {lineas.map((l) => {
                  const importe = l.cantidad * l.precio * (1 - l.descuento / 100);
                  const m = l.precio > 0 ? ((l.precio * (1 - l.descuento / 100) - l.costo) / (l.precio * (1 - l.descuento / 100))) * 100 : 0;
                  const sinStock = l.stock < l.cantidad;
                  const histCliente = (l.historial ?? []).filter(
                    (h) => cliente && h.cliente === cliente.razon_social
                  );
                  return (
                    <React.Fragment key={l.key}>
                      <tr>
                        <td className="max-w-[260px]">
                          <span className="block text-[12.5px] font-semibold text-fg">{l.codigo}</span>
                          <span className="block truncate text-[11px] text-muted">{l.descripcion}</span>
                        </td>
                        <td className="text-right text-[12px] tabular">
                          <span style={{ color: sinStock ? "var(--danger)" : "var(--ok)" }}>
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
                            step="0.01"
                            value={l.precio}
                            onChange={(e) => actualizar(l.key, "precio", Number(e.target.value))}
                            className={cn(
                              "h-8 text-right text-[12.5px] tabular",
                              m < 15 && "border-[var(--danger)]"
                            )}
                          />
                        </td>
                        <td>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            value={l.descuento}
                            onChange={(e) => actualizar(l.key, "descuento", Number(e.target.value))}
                            className="h-8 text-right text-[12.5px] tabular"
                          />
                        </td>
                        <td className="text-right text-[11.5px] text-muted tabular">{money(l.costo)}</td>
                        <td
                          className="text-right text-[12px] font-semibold tabular"
                          style={{ color: m < 15 ? "var(--danger)" : m > 30 ? "var(--ok)" : "var(--warn)" }}
                        >
                          {pct(m, 0)}
                        </td>
                        <td className="text-right text-[12.5px] font-semibold text-fg tabular">
                          {money(importe)}
                        </td>
                        <td>
                          <div className="flex items-center gap-0.5">
                            <Tooltip label="Historial de precios">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setVerHistorial(verHistorial === l.key ? null : l.key)}
                              >
                                <History className={cn(histCliente.length && "text-brand-600")} />
                              </Button>
                            </Tooltip>
                            <Button variant="ghost" size="icon-sm" onClick={() => quitar(l.key)}>
                              <Trash2 className="text-[var(--danger)]" />
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {verHistorial === l.key && (
                        <tr className="!bg-[var(--surface-2)]">
                          <td colSpan={9} className="!py-3">
                            <div className="flex items-start gap-3">
                              <History className="mt-0.5 size-4 shrink-0 text-brand-600" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[11.5px] font-semibold text-fg">
                                  Historial de precios de {l.codigo}
                                </p>
                                {(l.historial ?? []).length === 0 ? (
                                  <p className="mt-1 text-[11px] text-muted">
                                    Sin operaciones previas registradas para este producto.
                                  </p>
                                ) : (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {(l.historial ?? []).slice(0, 8).map((h, i) => {
                                      const mismo = cliente && h.cliente === cliente.razon_social;
                                      return (
                                        <button
                                          key={i}
                                          type="button"
                                          onClick={() => actualizar(l.key, "precio", Number(h.precio_unitario))}
                                          className={cn(
                                            "rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:border-brand-400",
                                            mismo ? "border-brand-300 bg-brand-50" : "bg-[var(--surface)]"
                                          )}
                                        >
                                          <span className="block text-[11.5px] font-semibold text-fg tabular">
                                            {money(h.precio_unitario)}
                                          </span>
                                          <span className="block max-w-[160px] truncate text-[10px] text-muted">
                                            {mismo ? "★ " : ""}{h.cliente}
                                          </span>
                                          <span className="block text-[9.5px] text-subtle">
                                            {h.origen} · {new Date(h.fecha + "T12:00:00").toLocaleDateString("es-PE")}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                                <p className="mt-2 text-[10.5px] text-subtle">
                                  Haga clic en un precio para aplicarlo a esta línea. ★ marca operaciones con
                                  el cliente seleccionado.
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {/* -------------------------------------------------------- Resumen */}
      <div className="space-y-4">
        <Card className="sticky top-[72px]">
          <CardHeader>
            <CardTitle>Resumen de la cotización</CardTitle>
            <TrendingUp className="size-4 text-subtle" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              {[
                ["Subtotal", money(subtotal)],
                ["IGV (18%)", money(igv)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-[12.5px]">
                  <span className="text-muted">{k}</span>
                  <span className="font-medium text-fg tabular">{v}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-[13px] font-semibold text-fg">Total</span>
                <span className="text-[19px] font-bold text-brand-700 tabular">{money(total)}</span>
              </div>
            </div>

            <div
              className="rounded-lg px-3 py-2.5"
              style={{
                backgroundColor: margenPct < 15 ? "var(--danger-bg)" : "var(--ok-bg)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="flex items-center gap-1.5 text-[11.5px] font-semibold"
                  style={{ color: margenPct < 15 ? "var(--danger)" : "var(--ok)" }}
                >
                  {margenPct < 15 ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
                  Margen bruto
                </span>
                <span
                  className="text-[15px] font-bold tabular"
                  style={{ color: margenPct < 15 ? "var(--danger)" : "var(--ok)" }}
                >
                  {pct(margenPct)}
                </span>
              </div>
              <p className="mt-1 text-[10.5px] text-muted">
                {money(subtotal - costoTotal)} sobre un costo de {money(costoTotal)}
                {margenPct < 15 && " · por debajo del mínimo definido (15%)"}
              </p>
            </div>

            <Field label="Tiempo de entrega">
              <Select value={entrega} onChange={(e) => setEntrega(e.target.value)}>
                {["Stock inmediato", "24 a 48 horas", "3 a 5 días útiles", "7 días útiles", "15 días (importación)"].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </Select>
            </Field>

            <Field label="Observaciones" hint={`Vence el ${sumarDias(hoyISO(), validez)}`}>
              <Textarea
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Solicitud recibida por WhatsApp, referencia del cliente…"
              />
            </Field>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button
              className="w-full"
              onClick={() => guardar("enviada")}
              loading={guardando === "enviada"}
              disabled={!clienteId || !lineas.length}
            >
              <Send />
              Guardar y marcar enviada
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => guardar("borrador")}
              loading={guardando === "borrador"}
              disabled={!clienteId || !lineas.length}
            >
              <Save />
              Guardar como borrador
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-2.5">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-600" />
              <div className="text-[11.5px] leading-relaxed text-muted">
                <p className="font-medium text-fg">Cotización inteligente</p>
                <p className="mt-1">
                  Cada línea muestra el stock disponible, el costo promedio y el margen resultante. El
                  ícono de historial revela a qué clientes se vendió antes el ítem y a qué precio, para
                  cotizar más rápido y sin perder rentabilidad.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
