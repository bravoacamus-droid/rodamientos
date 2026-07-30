"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Trash2, Save, Send, History, TrendingUp, AlertTriangle, Building2,
  FileText, Sparkles, CheckCircle2, Truck, Plus, Handshake, Eye, Lock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BuscadorProductos, type ProductoBusqueda } from "@/components/comercial/buscador-productos";
import {
  Card, CardHeader, CardTitle, CardContent, CardFooter, Button, Input, Select,
  Textarea, Field, Table, THead, TBody, Badge, EmptyState, Label, Tooltip, Checkbox,
} from "@/components/ui/primitives";
import { money, num, pct, hoyISO, sumarDias, cn } from "@/lib/utils";

/* ------------------------------------------------------------------- Tipos */

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

type Cargo = {
  key: string;
  concepto: string;
  detalle: string;
  monto: number;   // lo que se cobra al cliente
  costo: number;   // lo que le cuesta a la empresa
};

export type CotizacionExistente = {
  id: string;
  numero: string;
  cliente_id: string;
  estado: string;
  lista_precio: string;
  validez_dias: number;
  tiempo_entrega: string | null;
  observaciones: string | null;
  mostrar_igv: boolean;
  mostrar_margen: boolean;
  items: {
    producto_id: string | null; codigo: string; descripcion: string; marca: string | null;
    unidad: string; cantidad: number; precio_unitario: number; descuento_pct: number;
    costo_unitario: number;
  }[];
  cargos: { concepto: string; detalle: string | null; monto: number; costo: number }[];
};

const LISTAS = [
  { id: "mayorista", label: "Mayorista" },
  { id: "fabrica", label: "Fábrica" },
  { id: "importacion", label: "Importación" },
];

const CONCEPTOS_CARGO = [
  "Flete / envío",
  "Embalaje",
  "Seguro de transporte",
  "Instalación / montaje",
  "Servicio técnico",
  "Otros gastos",
];

const ENTREGAS = [
  "Stock inmediato",
  "24 a 48 horas",
  "3 a 5 días útiles",
  "7 días útiles",
  "15 días (importación)",
];

/* ------------------------------------------------------------ Constructor */

export function ConstructorCotizacion({
  clientes,
  vendedorId,
  clienteInicial,
  productoInicial,
  existente,
}: {
  clientes: Cliente[];
  vendedorId: string | null;
  clienteInicial: string | null;
  productoInicial: Record<string, unknown> | null;
  existente?: CotizacionExistente;
}) {
  const router = useRouter();
  const edicion = !!existente;

  const [clienteId, setClienteId] = React.useState(existente?.cliente_id ?? clienteInicial ?? "");
  const [lista, setLista] = React.useState(existente?.lista_precio ?? "mayorista");
  const [validez, setValidez] = React.useState(existente?.validez_dias ?? 15);
  const [entrega, setEntrega] = React.useState(existente?.tiempo_entrega ?? "Stock inmediato");
  const [observaciones, setObservaciones] = React.useState(existente?.observaciones ?? "");
  const [mostrarIgv, setMostrarIgv] = React.useState(existente?.mostrar_igv ?? true);
  const [mostrarMargen, setMostrarMargen] = React.useState(existente?.mostrar_margen ?? false);

  const [lineas, setLineas] = React.useState<Linea[]>(
    existente
      ? existente.items.map((i) => ({
          key: crypto.randomUUID(),
          producto_id: i.producto_id ?? "",
          codigo: i.codigo,
          descripcion: i.descripcion,
          marca: i.marca,
          unidad: i.unidad,
          stock: 0,
          cantidad: Number(i.cantidad),
          precio: Number(i.precio_unitario),
          descuento: Number(i.descuento_pct),
          costo: Number(i.costo_unitario),
          precios: {
            mayorista: Number(i.precio_unitario),
            fabrica: Number(i.precio_unitario),
            importacion: Number(i.precio_unitario),
          },
        }))
      : []
  );

  const [cargos, setCargos] = React.useState<Cargo[]>(
    existente
      ? existente.cargos.map((c) => ({
          key: crypto.randomUUID(),
          concepto: c.concepto,
          detalle: c.detalle ?? "",
          monto: Number(c.monto),
          costo: Number(c.costo),
        }))
      : []
  );

  const [guardando, setGuardando] = React.useState<string | null>(null);
  const [verHistorial, setVerHistorial] = React.useState<string | null>(null);

  const cliente = clientes.find((c) => c.id === clienteId);

  /* ---------------------------------------- Ajustes automáticos por cliente */
  React.useEffect(() => {
    if (cliente && !edicion) setLista(cliente.lista_precio);
  }, [cliente, edicion]);

  /* ----------------------------- Stock real de las líneas al editar */
  React.useEffect(() => {
    if (!edicion || !lineas.length) return;
    const ids = lineas.map((l) => l.producto_id).filter(Boolean);
    if (!ids.length) return;
    let cancelado = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("v_stock_productos")
        .select("id, stock_total, precio_mayorista, precio_fabrica, precio_importacion")
        .in("id", ids);
      if (cancelado || !data) return;
      setLineas((ls) =>
        ls.map((l) => {
          const p = data.find((d) => d.id === l.producto_id);
          if (!p) return l;
          return {
            ...l,
            stock: Number(p.stock_total),
            precios: {
              mayorista: Number(p.precio_mayorista),
              fabrica: Number(p.precio_fabrica),
              importacion: Number(p.precio_importacion),
            },
          };
        })
      );
    })();
    return () => {
      cancelado = true;
    };
    // Solo al montar en modo edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------- Reprecio al cambiar de lista */
  const listaInicial = React.useRef(lista);
  React.useEffect(() => {
    if (lista === listaInicial.current) return;
    listaInicial.current = lista;
    setLineas((ls) =>
      ls.map((l) => ({ ...l, precio: l.precios[lista as keyof typeof l.precios] || l.precio }))
    );
  }, [lista]);

  /* ------------------------------------------------- Precarga de producto */
  React.useEffect(() => {
    if (!productoInicial || edicion) return;
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
  }, [productoInicial, edicion]);

  /* --------------------------------------------------------- Ítems */

  async function agregar(p: ProductoBusqueda) {
    const supabase = createClient();
    const [{ data: full }, { data: hist }] = await Promise.all([
      supabase
        .from("v_stock_productos")
        .select("unidad, precio_mayorista, precio_fabrica, precio_importacion")
        .eq("id", p.id)
        .single(),
      supabase.rpc("historial_producto", { p_producto: p.id, p_limit: 8 }),
    ]);

    const precios = {
      mayorista: Number(full?.precio_mayorista ?? p.precio_mayorista),
      fabrica: Number(full?.precio_fabrica ?? p.precio_mayorista),
      importacion: Number(full?.precio_importacion ?? p.precio_mayorista),
    };

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

  /* -------------------------------------------------------- Cargos */

  const agregarCargo = () =>
    setCargos((cs) => [
      ...cs,
      { key: crypto.randomUUID(), concepto: CONCEPTOS_CARGO[0], detalle: "", monto: 0, costo: 0 },
    ]);

  const actualizarCargo = (key: string, campo: keyof Cargo, valor: string | number) =>
    setCargos((cs) => cs.map((c) => (c.key === key ? { ...c, [campo]: valor } : c)));

  const quitarCargo = (key: string) => setCargos((cs) => cs.filter((c) => c.key !== key));

  /* ------------------------------------------------------- Totales */

  const subtotalItems = lineas.reduce(
    (s, l) => s + l.cantidad * l.precio * (1 - l.descuento / 100),
    0
  );
  const totalCargos = cargos.reduce((s, c) => s + Number(c.monto || 0), 0);
  const base = subtotalItems + totalCargos;
  const costoItems = lineas.reduce((s, l) => s + l.cantidad * l.costo, 0);
  const costoCargos = cargos.reduce((s, c) => s + Number(c.costo || 0), 0);
  const costoTotal = costoItems + costoCargos;
  const igv = base * 0.18;
  const total = base + igv;
  const margenPct = base > 0 ? ((base - costoTotal) / base) * 100 : 0;

  /* ------------------------------------------------------- Guardar */

  async function guardar(estado: string) {
    if (!clienteId) return toast.error("Seleccione un cliente");
    if (!lineas.length) return toast.error("Agregue al menos un producto");

    setGuardando(estado);
    const supabase = createClient();

    const cabecera = {
      cliente_id: clienteId,
      validez_dias: validez,
      lista_precio: lista,
      subtotal: Number(subtotalItems.toFixed(2)),
      cargos_total: Number(totalCargos.toFixed(2)),
      igv: Number(igv.toFixed(2)),
      total: Number(total.toFixed(2)),
      costo_total: Number(costoTotal.toFixed(2)),
      margen_pct: Number(margenPct.toFixed(2)),
      estado,
      contacto: cliente?.contacto ?? null,
      condiciones:
        cliente && cliente.dias_credito > 0
          ? `Crédito ${cliente.dias_credito} días · Precios ${mostrarIgv ? "más IGV" : "incluyen IGV"}`
          : `Contado · Precios ${mostrarIgv ? "más IGV" : "incluyen IGV"}`,
      tiempo_entrega: entrega,
      observaciones: observaciones || null,
      mostrar_igv: mostrarIgv,
      mostrar_margen: mostrarMargen,
    };

    let cotizacionId = existente?.id ?? null;

    if (edicion && cotizacionId) {
      const { error } = await supabase
        .from("cotizaciones")
        .update({
          ...cabecera,
          editada_en: new Date().toISOString(),
          editada_por: vendedorId,
          actualizado_en: new Date().toISOString(),
        })
        .eq("id", cotizacionId);

      if (error) {
        toast.error("No se pudo actualizar la cotización", { description: error.message });
        setGuardando(null);
        return;
      }

      await supabase.from("cotizacion_items").delete().eq("cotizacion_id", cotizacionId);
      await supabase.from("cotizacion_cargos").delete().eq("cotizacion_id", cotizacionId);
    } else {
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
          ...cabecera,
          numero,
          fecha: hoyISO(),
          moneda: "PEN",
          vendedor_id: vendedorId,
          enviada_en: estado === "borrador" ? null : new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error || !cot) {
        toast.error("No se pudo guardar la cotización", { description: error?.message });
        setGuardando(null);
        return;
      }
      cotizacionId = cot.id;
    }

    const { error: errItems } = await supabase.from("cotizacion_items").insert(
      lineas.map((l, i) => ({
        cotizacion_id: cotizacionId,
        producto_id: l.producto_id || null,
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
      toast.error("Fallaron los ítems del detalle", { description: errItems.message });
      setGuardando(null);
      return;
    }

    if (cargos.length) {
      await supabase.from("cotizacion_cargos").insert(
        cargos.map((c, i) => ({
          cotizacion_id: cotizacionId,
          orden: i + 1,
          concepto: c.concepto,
          detalle: c.detalle || null,
          monto: Number(c.monto || 0),
          costo: Number(c.costo || 0),
        }))
      );
    }

    await supabase.from("actividad").insert({
      usuario_id: vendedorId,
      accion: edicion ? "editar_cotizacion" : "crear_cotizacion",
      entidad: "cotizaciones",
      entidad_id: cotizacionId,
      descripcion: edicion
        ? `Cotización ${existente?.numero} editada · nuevo total ${money(total)}`
        : `Cotización creada por ${money(total)}`,
    });

    toast.success(edicion ? "Cotización actualizada" : "Cotización creada");
    router.push(`/cotizaciones/${cotizacionId}`);
    router.refresh();
  }

  /* --------------------------------------------------------- Render */

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {/* ------------------------------------------------------ Cliente */}
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
                  <option key={c.id} value={c.id}>{c.razon_social}</option>
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

        {/* -------------------------------------------------------- Ítems */}
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
            <BuscadorProductos onSeleccionar={agregar} autoFocus={!edicion} />
          </CardContent>

          {lineas.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              titulo="Sin productos"
              descripcion="Agregue ítems al detalle usando el buscador."
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
                  const neto = l.precio * (1 - l.descuento / 100);
                  const importe = l.cantidad * neto;
                  const m = neto > 0 ? ((neto - l.costo) / neto) * 100 : 0;
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

        {/* ------------------------------------------- Cargos adicionales */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Cargos adicionales</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Conceptos ajenos a la mercadería. El <strong>monto</strong> se cobra al cliente y el{" "}
                <strong>costo</strong> es lo que paga la empresa: la diferencia entra al margen.
              </p>
            </div>
            <Button variant="subtle" size="sm" onClick={agregarCargo}>
              <Plus />
              Agregar cargo
            </Button>
          </CardHeader>

          {cargos.length === 0 ? (
            <EmptyState
              icon={<Truck />}
              titulo="Sin cargos adicionales"
              descripcion="Agregue flete, embalaje, seguro o instalación si la operación lo requiere."
            />
          ) : (
            <>
              <Table>
                <THead>
                  <tr>
                    <th className="w-44">Concepto</th>
                    <th>Detalle</th>
                    <th className="w-32 text-right">Se cobra</th>
                    <th className="w-32 text-right">Nos cuesta</th>
                    <th className="text-right">Resultado</th>
                    <th className="w-10" />
                  </tr>
                </THead>
                <TBody>
                  {cargos.map((c) => {
                    const dif = Number(c.monto || 0) - Number(c.costo || 0);
                    return (
                      <tr key={c.key}>
                        <td>
                          <Select
                            value={c.concepto}
                            onChange={(e) => actualizarCargo(c.key, "concepto", e.target.value)}
                            className="h-8 text-[12px]"
                          >
                            {CONCEPTOS_CARGO.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </Select>
                        </td>
                        <td>
                          <Input
                            value={c.detalle}
                            onChange={(e) => actualizarCargo(c.key, "detalle", e.target.value)}
                            placeholder="Flete a Arequipa vía transporte terrestre…"
                            className="h-8 text-[12px]"
                          />
                        </td>
                        <td>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={c.monto}
                            onChange={(e) => actualizarCargo(c.key, "monto", Number(e.target.value))}
                            className="h-8 text-right text-[12.5px] tabular"
                          />
                        </td>
                        <td>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={c.costo}
                            onChange={(e) => actualizarCargo(c.key, "costo", Number(e.target.value))}
                            className="h-8 text-right text-[12.5px] tabular"
                          />
                        </td>
                        <td
                          className="text-right text-[12px] font-semibold tabular"
                          style={{ color: dif < 0 ? "var(--danger)" : dif > 0 ? "var(--ok)" : "var(--fg-subtle)" }}
                        >
                          {dif === 0 ? "Sin efecto" : money(dif)}
                        </td>
                        <td>
                          <Button variant="ghost" size="icon-sm" onClick={() => quitarCargo(c.key)}>
                            <Trash2 className="text-[var(--danger)]" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </TBody>
              </Table>
              <CardFooter className="justify-between">
                <span className="text-[12px] text-muted">
                  {cargos.length} cargo(s) · costo asumido {money(costoCargos)}
                </span>
                <span className="text-[13px] font-semibold text-fg tabular">
                  Total facturado por cargos: {money(totalCargos)}
                </span>
              </CardFooter>
            </>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------- Resumen */}
      <div className="space-y-4">
        <Card className="sticky top-[72px]">
          <CardHeader>
            <CardTitle>{edicion ? `Editando ${existente?.numero}` : "Resumen de la cotización"}</CardTitle>
            <TrendingUp className="size-4 text-subtle" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between text-[12.5px]">
                <span className="text-muted">Mercadería</span>
                <span className="font-medium text-fg tabular">{money(subtotalItems)}</span>
              </div>
              {totalCargos > 0 && (
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-muted">Cargos adicionales</span>
                  <span className="font-medium text-fg tabular">{money(totalCargos)}</span>
                </div>
              )}
              <div className="flex justify-between text-[12.5px]">
                <span className="text-muted">Subtotal gravado</span>
                <span className="font-medium text-fg tabular">{money(base)}</span>
              </div>
              <div className="flex justify-between text-[12.5px]">
                <span className="text-muted">IGV (18%)</span>
                <span className="font-medium text-fg tabular">{money(igv)}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-[13px] font-semibold text-fg">Total</span>
                <span className="text-[19px] font-bold text-brand-700 tabular">{money(total)}</span>
              </div>
            </div>

            <div
              className="rounded-lg px-3 py-2.5"
              style={{ backgroundColor: margenPct < 15 ? "var(--danger-bg)" : "var(--ok-bg)" }}
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
                {money(base - costoTotal)} sobre un costo de {money(costoTotal)}
                {costoCargos > 0 && ` (incluye ${money(costoCargos)} de cargos)`}
                {margenPct < 15 && " · por debajo del mínimo definido (15%)"}
              </p>
            </div>

            <Field label="Tiempo de entrega">
              <Select value={entrega} onChange={(e) => setEntrega(e.target.value)}>
                {ENTREGAS.map((o) => (
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

            {/* ------------------------------- Opciones del documento */}
            <div>
              <Label>Qué mostrar en el PDF</Label>
              <div className="space-y-2">
                <Checkbox
                  label="Desglosar el IGV"
                  hint={
                    mostrarIgv
                      ? "Se listan subtotal, IGV y total por separado."
                      : "Se muestra un total único con la nota «precios incluyen IGV»."
                  }
                  checked={mostrarIgv}
                  onChange={(e) => setMostrarIgv(e.target.checked)}
                />
                <Checkbox
                  label="Incluir costo y margen"
                  hint={
                    mostrarMargen
                      ? "El documento se marcará como COPIA INTERNA. No lo envíe al cliente."
                      : "Uso interno: agrega columnas de costo y margen por ítem."
                  }
                  checked={mostrarMargen}
                  onChange={(e) => setMostrarMargen(e.target.checked)}
                />
                {mostrarMargen && (
                  <div className="flex items-start gap-2 rounded-lg border border-[var(--danger)]/25 bg-[var(--danger-bg)] px-3 py-2">
                    <Lock className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--danger)" }} />
                    <p className="text-[10.5px] leading-snug" style={{ color: "var(--danger)" }}>
                      El PDF llevará una marca de agua de copia interna en todas sus páginas para
                      evitar que llegue por error al cliente.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-2">
            {edicion ? (
              <>
                <Button
                  className="w-full"
                  onClick={() => guardar(existente!.estado)}
                  loading={guardando === existente?.estado}
                  disabled={!clienteId || !lineas.length}
                >
                  <Save />
                  Guardar cambios
                </Button>
                <Button
                  variant="accent"
                  className="w-full"
                  onClick={() => guardar("en_negociacion")}
                  loading={guardando === "en_negociacion"}
                  disabled={!clienteId || !lineas.length}
                >
                  <Handshake />
                  Guardar y pasar a negociación
                </Button>
              </>
            ) : (
              <>
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
              </>
            )}
          </CardFooter>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-2.5">
              {edicion ? (
                <Eye className="mt-0.5 size-4 shrink-0 text-brand-600" />
              ) : (
                <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-600" />
              )}
              <div className="text-[11.5px] leading-relaxed text-muted">
                <p className="font-medium text-fg">
                  {edicion ? "Cotización en revisión" : "Cotización inteligente"}
                </p>
                <p className="mt-1">
                  {edicion
                    ? "Las cotizaciones se editan mientras están en borrador, enviadas o en negociación. Cada cambio recalcula el margen y queda registrado en la bitácora."
                    : "Cada línea muestra el stock disponible, el costo promedio y el margen resultante. El ícono de historial revela a qué clientes se vendió antes el ítem y a qué precio."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
