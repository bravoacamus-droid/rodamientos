"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Trash2, Save, Siren, ShoppingCart, Building2, AlertTriangle,
  CheckCircle2, ShieldCheck, Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BuscadorProductos, type ProductoBusqueda } from "@/components/comercial/buscador-productos";
import {
  Card, CardHeader, CardTitle, CardContent, CardFooter, Button, Input, Select,
  Textarea, Field, Table, THead, TBody, Badge, EmptyState, Checkbox, Progress,
} from "@/components/ui/primitives";
import { money, num, pct, hoyISO, sumarDias, cn } from "@/lib/utils";

type Cliente = {
  id: string; codigo: string; razon_social: string; ruc: string | null;
  contacto: string | null; lista_precio: string; dias_credito: number;
  linea_credito: number; distrito: string | null;
};

type Linea = {
  key: string;
  producto_id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  stock: number;
  cantidad: number;
  precio: number;
  descuento: number;
  costo: number;
  precios: { mayorista: number; fabrica: number; importacion: number };
};

export function ConstructorPedido({
  clientes,
  almacenes,
  deudaPorCliente,
  vendedorId,
  rol,
  clienteInicial,
  emergenciaInicial,
}: {
  clientes: Cliente[];
  almacenes: { id: string; codigo: string; nombre: string }[];
  deudaPorCliente: Record<string, number>;
  vendedorId: string | null;
  rol: string;
  clienteInicial: string | null;
  emergenciaInicial: boolean;
}) {
  const router = useRouter();

  const [clienteId, setClienteId] = React.useState(clienteInicial ?? "");
  const [lista, setLista] = React.useState("mayorista");
  const [almacen, setAlmacen] = React.useState(almacenes[0]?.id ?? "");
  const [fechaEntrega, setFechaEntrega] = React.useState(sumarDias(hoyISO(), 1));
  const [ordenCliente, setOrdenCliente] = React.useState("");
  const [esEmergencia, setEsEmergencia] = React.useState(emergenciaInicial);
  const [observaciones, setObservaciones] = React.useState("");
  const [lineas, setLineas] = React.useState<Linea[]>([]);
  const [guardando, setGuardando] = React.useState(false);

  const cliente = clientes.find((c) => c.id === clienteId);
  const puedeAprobar = ["admin", "gerencia"].includes(rol);

  React.useEffect(() => {
    if (cliente) {
      setLista(cliente.lista_precio);
      setFechaEntrega(sumarDias(hoyISO(), esEmergencia ? 0 : 1));
    }
  }, [cliente, esEmergencia]);

  React.useEffect(() => {
    setLineas((ls) =>
      ls.map((l) => ({ ...l, precio: l.precios[lista as keyof typeof l.precios] || l.precio }))
    );
  }, [lista]);

  async function agregar(p: ProductoBusqueda) {
    const supabase = createClient();
    const { data } = await supabase
      .from("v_stock_productos")
      .select("unidad, precio_mayorista, precio_fabrica, precio_importacion")
      .eq("id", p.id)
      .single();

    const precios = {
      mayorista: Number(data?.precio_mayorista ?? p.precio_mayorista),
      fabrica: Number(data?.precio_fabrica ?? p.precio_mayorista),
      importacion: Number(data?.precio_importacion ?? p.precio_mayorista),
    };

    setLineas((ls) => {
      if (ls.some((l) => l.producto_id === p.id)) {
        toast.info("El producto ya está en el pedido");
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
          precio: precios[lista as keyof typeof precios] || precios.mayorista,
          descuento: 0,
          costo: Number(p.costo_promedio),
          precios,
        },
      ];
    });
  }

  const actualizar = (key: string, campo: "cantidad" | "precio" | "descuento", valor: number) =>
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));

  const quitar = (key: string) => setLineas((ls) => ls.filter((l) => l.key !== key));

  /* ------------------------------------------------------- Totales */
  const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precio * (1 - l.descuento / 100), 0);
  const costoTotal = lineas.reduce((s, l) => s + l.cantidad * l.costo, 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;
  const margenPct = subtotal > 0 ? ((subtotal - costoTotal) / subtotal) * 100 : 0;

  /* Líneas cuyo stock no alcanza: obligan a tratar el pedido como emergencia */
  const sinStock = lineas.filter((l) => l.stock < l.cantidad);
  const deuda = cliente ? (deudaPorCliente[cliente.id] ?? 0) : 0;
  const disponible = cliente ? Math.max(cliente.linea_credito - deuda, 0) : 0;
  const excedeCredito = !!cliente && cliente.linea_credito > 0 && total > disponible;

  async function guardar() {
    if (!clienteId) return toast.error("Seleccione un cliente");
    if (!lineas.length) return toast.error("Agregue al menos un producto");
    if (!almacen) return toast.error("Seleccione el almacén de despacho");
    if (sinStock.length && !esEmergencia) {
      return toast.error("Hay ítems sin stock suficiente", {
        description: "Marque el pedido como emergencia para despachar con stock por reponer.",
      });
    }

    setGuardando(true);
    const supabase = createClient();

    const { data: numero, error: errNum } = await supabase.rpc("siguiente_numero", {
      p_prefijo: "PED",
      p_tabla: "pedidos",
    });
    if (errNum || !numero) {
      toast.error("No se pudo generar el correlativo", { description: errNum?.message });
      setGuardando(false);
      return;
    }

    // Una emergencia solo nace aprobada si quien la registra tiene la potestad
    const requiereAprobacion = esEmergencia && sinStock.length > 0;
    const autoAprobado = requiereAprobacion && puedeAprobar;

    const { data: pedido, error } = await supabase
      .from("pedidos")
      .insert({
        numero,
        cliente_id: clienteId,
        fecha: hoyISO(),
        fecha_entrega: fechaEntrega,
        moneda: "PEN",
        tipo_cambio: 3.755,
        subtotal: Number(subtotal.toFixed(2)),
        igv: Number(igv.toFixed(2)),
        total: Number(total.toFixed(2)),
        costo_total: Number(costoTotal.toFixed(2)),
        estado: autoAprobado || !requiereAprobacion ? "aprobado" : "pendiente",
        es_emergencia: esEmergencia,
        requiere_aprobacion: requiereAprobacion,
        aprobado_por: autoAprobado ? vendedorId : null,
        aprobado_en: autoAprobado ? new Date().toISOString() : null,
        orden_compra_cliente: ordenCliente || null,
        vendedor_id: vendedorId,
        almacen_id: almacen,
        observaciones:
          observaciones ||
          (esEmergencia
            ? "PEDIDO DE EMERGENCIA · se atiende con stock por reponer."
            : null),
      })
      .select("id, numero")
      .single();

    if (error || !pedido) {
      toast.error("No se pudo crear el pedido", { description: error?.message });
      setGuardando(false);
      return;
    }

    const { error: errItems } = await supabase.from("pedido_items").insert(
      lineas.map((l, i) => ({
        pedido_id: pedido.id,
        producto_id: l.producto_id,
        orden: i + 1,
        codigo: l.codigo,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        cantidad_atendida: 0,
        unidad: l.unidad,
        precio_unitario: l.precio,
        descuento_pct: l.descuento,
        costo_unitario: l.costo,
        subtotal: Number((l.cantidad * l.precio * (1 - l.descuento / 100)).toFixed(2)),
        por_reponer: l.stock < l.cantidad,
      }))
    );

    if (errItems) {
      toast.error("El pedido se creó pero fallaron los ítems", { description: errItems.message });
    }

    await supabase.from("actividad").insert({
      usuario_id: vendedorId,
      accion: esEmergencia ? "pedido_emergencia" : "crear_pedido",
      entidad: "pedidos",
      entidad_id: pedido.id,
      descripcion: `Pedido ${pedido.numero} por ${money(total)}${esEmergencia ? " · emergencia" : ""}`,
    });

    toast.success(`Pedido ${pedido.numero} creado`, {
      description: requiereAprobacion && !autoAprobado
        ? "Requiere aprobación de Administración para despachar con stock negativo."
        : "Puede facturarse desde la ficha del pedido.",
    });
    router.push(`/pedidos/${pedido.id}`);
    router.refresh();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Cliente y despacho</CardTitle>
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
                <option value="mayorista">Mayorista</option>
                <option value="fabrica">Fábrica</option>
                <option value="importacion">Importación</option>
              </Select>
            </Field>
            <Field label="Almacén de despacho">
              <Select value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha de entrega">
              <Input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            </Field>
            <Field label="Orden de compra del cliente" className="sm:col-span-3">
              <Input
                value={ordenCliente}
                onChange={(e) => setOrdenCliente(e.target.value)}
                placeholder="OC-45821"
              />
            </Field>

            {cliente && (
              <div className="sm:col-span-2 lg:col-span-4">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg bg-[var(--surface-2)] px-3.5 py-2.5">
                  {[
                    ["RUC", cliente.ruc ?? "—"],
                    ["Contacto", cliente.contacto ?? "—"],
                    ["Crédito", cliente.dias_credito > 0 ? `${cliente.dias_credito} días` : "Contado"],
                    ["Línea", money(cliente.linea_credito)],
                    ["Deuda vigente", money(deuda)],
                    ["Disponible", money(disponible)],
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

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Ítems del pedido</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Las líneas cuyo stock no alcanza se marcan como venta por reponer.
              </p>
            </div>
            <Badge tone="brand" size="sm">{lineas.length} ítem(s)</Badge>
          </CardHeader>
          <CardContent>
            <BuscadorProductos onSeleccionar={agregar} autoFocus />
          </CardContent>

          {lineas.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart />}
              titulo="Sin ítems"
              descripcion="Busque productos por código o descripción para armar el pedido."
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
                  <th className="text-right">Margen</th>
                  <th className="text-right">Importe</th>
                  <th className="w-10" />
                </tr>
              </THead>
              <TBody>
                {lineas.map((l) => {
                  const neto = l.precio * (1 - l.descuento / 100);
                  const m = neto > 0 ? ((neto - l.costo) / neto) * 100 : 0;
                  const falta = l.stock < l.cantidad;
                  return (
                    <tr key={l.key} className={falta ? "!bg-[var(--danger-bg)]" : undefined}>
                      <td className="max-w-[260px]">
                        <span className="block text-[12.5px] font-semibold text-fg">{l.codigo}</span>
                        <span className="block truncate text-[11px] text-muted">{l.descripcion}</span>
                        {falta && (
                          <Badge tone="danger" size="xs" className="mt-0.5">
                            Faltan {num(l.cantidad - l.stock, 0)} und
                          </Badge>
                        )}
                      </td>
                      <td className="text-right text-[12px] tabular">
                        <span style={{ color: falta ? "var(--danger)" : "var(--ok)" }}>
                          {num(l.stock, 0)}
                        </span>
                      </td>
                      <td>
                        <Input
                          type="number" min={1}
                          value={l.cantidad}
                          onChange={(e) => actualizar(l.key, "cantidad", Number(e.target.value))}
                          className="h-8 text-right text-[12.5px] tabular"
                        />
                      </td>
                      <td>
                        <Input
                          type="number" min={0} step="0.01"
                          value={l.precio}
                          onChange={(e) => actualizar(l.key, "precio", Number(e.target.value))}
                          className={cn("h-8 text-right text-[12.5px] tabular", m < 15 && "border-[var(--danger)]")}
                        />
                      </td>
                      <td>
                        <Input
                          type="number" min={0} max={100} step="0.5"
                          value={l.descuento}
                          onChange={(e) => actualizar(l.key, "descuento", Number(e.target.value))}
                          className="h-8 text-right text-[12.5px] tabular"
                        />
                      </td>
                      <td
                        className="text-right text-[12px] font-semibold tabular"
                        style={{ color: m < 15 ? "var(--danger)" : m > 30 ? "var(--ok)" : "var(--warn)" }}
                      >
                        {pct(m, 0)}
                      </td>
                      <td className="text-right text-[12.5px] font-semibold text-fg tabular">
                        {money(l.cantidad * neto)}
                      </td>
                      <td>
                        <Button variant="ghost" size="icon-sm" onClick={() => quitar(l.key)}>
                          <Trash2 className="text-[var(--danger)]" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------ Resumen */}
      <div className="space-y-4">
        <Card className="sticky top-[72px]">
          <CardHeader>
            <CardTitle>Resumen del pedido</CardTitle>
            <ShoppingCart className="size-4 text-subtle" />
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
              <p
                className="text-right text-[11px] tabular"
                style={{ color: margenPct < 15 ? "var(--danger)" : "var(--ok)" }}
              >
                Margen {pct(margenPct)}
              </p>
            </div>

            {/* --------------------------------------- Control de crédito */}
            {cliente && cliente.linea_credito > 0 && (
              <div
                className="rounded-lg px-3 py-2.5"
                style={{ backgroundColor: excedeCredito ? "var(--danger-bg)" : "var(--surface-2)" }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="flex items-center gap-1.5 text-[11.5px] font-semibold"
                    style={{ color: excedeCredito ? "var(--danger)" : "var(--fg-muted)" }}
                  >
                    <Wallet className="size-3.5" />
                    Línea de crédito
                  </span>
                  <span className="text-[11.5px] font-medium text-fg tabular">
                    {money(disponible)} libre
                  </span>
                </div>
                <Progress
                  className="mt-2"
                  value={Math.min(deuda + total, cliente.linea_credito)}
                  max={cliente.linea_credito}
                  tone={excedeCredito ? "danger" : "success"}
                />
                {excedeCredito && (
                  <p className="mt-1.5 text-[10.5px]" style={{ color: "var(--danger)" }}>
                    Este pedido excede la línea autorizada en{" "}
                    {money(total - disponible)}. Puede registrarlo, pero conviene validarlo con
                    cobranzas antes de despachar.
                  </p>
                )}
              </div>
            )}

            {/* ------------------------------------------- Emergencia */}
            <Checkbox
              label="Pedido de emergencia"
              hint={
                esEmergencia
                  ? "Permite despachar con stock negativo controlado. Se regulariza al ingresar la mercadería."
                  : "Actívelo cuando el cliente tiene una parada de planta y no puede esperar reposición."
              }
              checked={esEmergencia}
              onChange={(e) => setEsEmergencia(e.target.checked)}
            />

            {sinStock.length > 0 && (
              <div
                className="flex items-start gap-2 rounded-lg px-3 py-2.5"
                style={{
                  backgroundColor: esEmergencia ? "var(--warn-bg)" : "var(--danger-bg)",
                  border: `1px solid ${esEmergencia ? "var(--warn)" : "var(--danger)"}25`,
                }}
              >
                {esEmergencia ? (
                  <Siren className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--warn)" }} />
                ) : (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--danger)" }} />
                )}
                <p
                  className="text-[10.5px] leading-relaxed"
                  style={{ color: esEmergencia ? "var(--warn)" : "var(--danger)" }}
                >
                  {sinStock.length} ítem(s) sin stock suficiente.{" "}
                  {esEmergencia
                    ? puedeAprobar
                      ? "Su rol puede autorizarlo: el pedido nacerá aprobado."
                      : "Quedará pendiente de aprobación por Administración o Gerencia."
                    : "Marque el pedido como emergencia para poder registrarlo."}
                </p>
              </div>
            )}

            {esEmergencia && sinStock.length === 0 && lineas.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: "var(--ok-bg)" }}>
                <CheckCircle2 className="size-3.5" style={{ color: "var(--ok)" }} />
                <p className="text-[10.5px]" style={{ color: "var(--ok)" }}>
                  Hay stock para todo: se despacha de inmediato sin aprobación.
                </p>
              </div>
            )}

            <Field label="Observaciones">
              <Textarea
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Parada de planta, contacto en obra, horario de recepción…"
              />
            </Field>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              onClick={guardar}
              loading={guardando}
              disabled={!clienteId || !lineas.length || (sinStock.length > 0 && !esEmergencia)}
            >
              {esEmergencia ? <Siren /> : <Save />}
              Registrar pedido
            </Button>
          </CardFooter>
        </Card>

        {esEmergencia && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
                <div className="text-[11.5px] leading-relaxed text-muted">
                  <p className="font-medium text-fg">Venta por reponer</p>
                  <p className="mt-1">
                    Al facturar, el inventario se descuenta aunque quede en negativo. Cuando ingrese la
                    mercadería el saldo se regulariza y todo el movimiento queda registrado en el kardex
                    con su responsable.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
