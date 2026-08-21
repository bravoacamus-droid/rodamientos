"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Send, CheckCircle2, XCircle, PackageCheck, Ship, AlertTriangle, Printer,
  FileDown, FileSpreadsheet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Field, Table, THead, TBody, Badge } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";
import { pdfOrdenCompra, type EmpresaPdf } from "@/lib/pdf/documentos";
import { exportarExcel } from "@/lib/excel/exportar";
import { money, num, hoyISO } from "@/lib/utils";

type Orden = {
  id: string; numero: string; tipo: "local" | "importacion"; estado: string;
  moneda: string; tipo_cambio: number; almacen_id: string | null;
  proveedor: string;
  fecha: string; fecha_estimada: string | null; incoterm: string | null;
  subtotal: number; igv: number; total: number; observaciones: string | null;
  almacen: string | null; comprador: string;
  proveedorDatos: {
    razon_social: string; ruc: string | null; pais: string | null;
    direccion: string | null; contacto: string | null;
    email: string | null; telefono: string | null;
  };
};

type ItemOrden = {
  id: string; producto_id: string | null; codigo: string; descripcion: string;
  cantidad: number; cantidad_recibida: number; unidad: string;
  costo_unitario: number; costo_landed: number;
};

export function AccionesOrdenCompra({
  orden,
  items,
  tieneImportacion,
  importacionId,
  usuarioId,
  puedeRecibir,
  empresa,
}: {
  orden: Orden;
  items: ItemOrden[];
  tieneImportacion: boolean;
  importacionId: string | null;
  usuarioId: string | null;
  puedeRecibir: boolean;
  empresa: EmpresaPdf;
}) {
  const router = useRouter();
  const [proc, setProc] = React.useState<string | null>(null);

  /** Representacion impresa de la orden, para enviar al proveedor. */
  async function generarPdf(descargar: boolean) {
    setProc(descargar ? "pdf-descargar" : "pdf-ver");
    try {
      await pdfOrdenCompra({
        empresa,
        numero: orden.numero,
        tipo: orden.tipo,
        fecha: orden.fecha,
        fecha_estimada: orden.fecha_estimada,
        moneda: orden.moneda,
        tipo_cambio: orden.tipo_cambio,
        incoterm: orden.incoterm,
        estado: orden.estado,
        proveedor: orden.proveedorDatos,
        almacen: orden.almacen,
        comprador: orden.comprador,
        items: items.map((i) => ({
          codigo: i.codigo,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          unidad: i.unidad,
          costo_unitario: i.costo_unitario,
          subtotal: i.cantidad * i.costo_unitario,
          costo_landed: i.costo_landed,
        })),
        subtotal: orden.subtotal,
        igv: orden.igv,
        total: orden.total,
        observaciones: orden.observaciones,
        descargar,
      });
    } catch {
      toast.error("No se pudo generar el PDF");
    }
    setProc(null);
  }

  /** Detalle en Excel, util para contrastar contra otros proveedores. */
  async function generarExcel() {
    setProc("excel");
    try {
      await exportarExcel({
        empresa,
        titulo: `Orden de compra ${orden.numero}`,
        subtitulo: `${orden.proveedorDatos.razon_social} - ${
          orden.tipo === "importacion" ? "Importacion" : "Compra local"
        }`,
        nombreArchivo: `Rodatech-${orden.numero}`,
        hoja: "Detalle",
        resumen: [
          ["Proveedor", orden.proveedorDatos.razon_social],
          ["RUC / Tax ID", orden.proveedorDatos.ruc ?? "-"],
          ["Emision", orden.fecha],
          ["Llegada estimada", orden.fecha_estimada ?? "-"],
          ["Moneda", orden.moneda],
          ["Tipo de cambio", String(orden.tipo_cambio)],
          ["Estado", orden.estado],
        ],
        columnas: [
          { titulo: "Codigo", clave: "codigo", ancho: 20 },
          { titulo: "Descripcion", clave: "descripcion", ancho: 52 },
          { titulo: "Cantidad", clave: "cantidad", formato: "entero", ancho: 11, total: true },
          { titulo: "Recibido", clave: "recibido", formato: "entero", ancho: 11, total: true },
          { titulo: "U.M.", clave: "unidad", ancho: 8 },
          { titulo: "Costo unitario", clave: "costo", formato: "numero", ancho: 14 },
          { titulo: "Importe", clave: "importe", formato: "numero", ancho: 15, total: true },
          ...(orden.tipo === "importacion"
            ? [{ titulo: "Costo en almacen", clave: "landed", formato: "moneda" as const, ancho: 16 }]
            : []),
        ],
        filas: items.map((i) => ({
          codigo: i.codigo,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          recibido: i.cantidad_recibida,
          unidad: i.unidad,
          costo: i.costo_unitario,
          importe: i.cantidad * i.costo_unitario,
          landed: i.costo_landed,
        })),
        nota:
          orden.tipo === "importacion"
            ? "Los importes estan en la moneda de origen; el costo en almacen ya incluye el prorrateo de gastos"
            : undefined,
      });
      toast.success("Archivo generado");
    } catch {
      toast.error("No se pudo generar el archivo");
    }
    setProc(null);
  }
  const [modalRecepcion, setModalRecepcion] = React.useState(false);

  const [guia, setGuia] = React.useState("");
  const [factura, setFactura] = React.useState("");
  const [fechaRec, setFechaRec] = React.useState(hoyISO());
  const [recibir, setRecibir] = React.useState<Record<string, { cantidad: number; costo: number }>>({});

  /** Al abrir, propone recibir el saldo completo al costo de la orden. */
  function abrirRecepcion() {
    const inicial: Record<string, { cantidad: number; costo: number }> = {};
    for (const i of items) {
      const pendiente = Number(i.cantidad) - Number(i.cantidad_recibida);
      if (pendiente <= 0) continue;
      // En importación el costo real es el landed, si ya fue calculado
      const costo =
        orden.tipo === "importacion" && Number(i.costo_landed) > 0
          ? Number(i.costo_landed)
          : orden.moneda === "USD"
            ? Number(i.costo_unitario) * Number(orden.tipo_cambio)
            : Number(i.costo_unitario);
      inicial[i.id] = { cantidad: pendiente, costo: Number(costo.toFixed(4)) };
    }
    setRecibir(inicial);
    setModalRecepcion(true);
  }

  async function cambiarEstado(estado: string) {
    setProc(estado);
    const supabase = createClient();
    const { error } = await supabase.from("ordenes_compra").update({ estado }).eq("id", orden.id);
    if (error) {
      toast.error("No se pudo actualizar la orden", { description: error.message });
    } else {
      await supabase.from("actividad").insert({
        usuario_id: usuarioId,
        accion: `orden_${estado}`,
        entidad: "ordenes_compra",
        entidad_id: orden.id,
        descripcion: `Orden ${orden.numero} marcada como ${estado}`,
      });
      toast.success(`Orden marcada como ${estado}`);
      router.refresh();
    }
    setProc(null);
  }

  /** Crea el expediente de importación a partir de la orden. */
  async function abrirExpediente() {
    setProc("expediente");
    const supabase = createClient();

    const { data: oc } = await supabase
      .from("ordenes_compra")
      .select("subtotal, tipo_cambio, fecha, proveedor_id, proveedores(pais, lead_time_dias)")
      .eq("id", orden.id)
      .single();

    if (!oc) {
      toast.error("No se pudo leer la orden");
      setProc(null);
      return;
    }

    const prov = oc.proveedores as unknown as { pais: string; lead_time_dias: number } | null;
    const fobSoles = Number(oc.subtotal) * Number(oc.tipo_cambio);
    const { data: numero } = await supabase.rpc("siguiente_numero", {
      p_prefijo: "IMP",
      p_tabla: "importaciones",
    });

    const embarque = new Date(`${oc.fecha}T12:00:00`);
    embarque.setDate(embarque.getDate() + 12);
    const llegada = new Date(`${oc.fecha}T12:00:00`);
    llegada.setDate(llegada.getDate() + (prov?.lead_time_dias ?? 45) - 6);

    const { data: imp, error } = await supabase
      .from("importaciones")
      .insert({
        numero: numero ?? `IMP-${Date.now()}`,
        orden_compra_id: orden.id,
        proveedor_id: oc.proveedor_id,
        puerto_origen: prov?.pais === "China" ? "Ningbo" : "Puerto de origen",
        puerto_destino: "Callao",
        fecha_embarque: embarque.toISOString().slice(0, 10),
        fecha_llegada: llegada.toISOString().slice(0, 10),
        moneda_origen: "USD",
        tipo_cambio: oc.tipo_cambio,
        valor_fob: Number(fobSoles.toFixed(2)),
        metodo_prorrateo: "valor",
        estado: "registrada",
        observaciones:
          "Expediente creado desde la orden de compra. Registre los gastos para obtener el costo puesto en almacén.",
      })
      .select("id, numero")
      .single();

    if (error || !imp) {
      toast.error("No se pudo crear el expediente", { description: error?.message });
      setProc(null);
      return;
    }

    await supabase.from("actividad").insert({
      usuario_id: usuarioId,
      accion: "crear_importacion",
      entidad: "importaciones",
      entidad_id: imp.id,
      descripcion: `Expediente ${imp.numero} abierto para la orden ${orden.numero}`,
    });

    toast.success(`Expediente ${imp.numero} creado`);
    router.push(`/importaciones/${imp.id}`);
  }

  /** Registra la recepción: kardex, costo promedio y avance de la orden. */
  async function registrarRecepcion() {
    const aRecibir = Object.entries(recibir).filter(([, v]) => v.cantidad > 0);
    if (!aRecibir.length) return toast.error("Indique al menos una cantidad a recibir");
    if (!orden.almacen_id) return toast.error("La orden no tiene almacén de destino");

    setProc("recepcion");
    const supabase = createClient();

    const { data: numero } = await supabase.rpc("siguiente_numero", {
      p_prefijo: "REC",
      p_tabla: "recepciones",
    });

    const { data: rec, error } = await supabase
      .from("recepciones")
      .insert({
        numero: numero ?? `REC-${Date.now()}`,
        orden_compra_id: orden.id,
        importacion_id: importacionId,
        almacen_id: orden.almacen_id,
        fecha: fechaRec,
        guia_proveedor: guia || null,
        factura_proveedor: factura || null,
        recibido_por: usuarioId,
        observaciones:
          orden.tipo === "importacion"
            ? "Ingreso nacionalizado con costo puesto en almacén"
            : "Mercadería conforme según guía del proveedor",
      })
      .select("id")
      .single();

    if (error || !rec) {
      toast.error("No se pudo registrar la recepción", { description: error?.message });
      setProc(null);
      return;
    }

    let ok = 0;
    for (const [itemId, v] of aRecibir) {
      const item = items.find((i) => i.id === itemId);
      if (!item?.producto_id) continue;

      await supabase.from("recepcion_items").insert({
        recepcion_id: rec.id,
        producto_id: item.producto_id,
        cantidad: v.cantidad,
        costo_unitario: v.costo,
      });

      // Alimenta el kardex y recalcula el costo promedio ponderado
      const { error: errMov } = await supabase.rpc("registrar_movimiento", {
        p_producto: item.producto_id,
        p_almacen: orden.almacen_id,
        p_tipo: "ingreso",
        p_cantidad: v.cantidad,
        p_costo: v.costo,
        p_ref_tipo: orden.tipo === "importacion" ? "importacion" : "compra",
        p_ref_id: orden.id,
        p_ref_numero: orden.numero,
        p_motivo:
          orden.tipo === "importacion"
            ? `Importación nacionalizada · ${orden.proveedor}`
            : `Compra local · ${orden.proveedor}`,
        p_usuario: usuarioId,
      });
      if (errMov) continue;

      await supabase
        .from("oc_items")
        .update({ cantidad_recibida: Number(item.cantidad_recibida) + v.cantidad })
        .eq("id", itemId);

      ok += 1;
    }

    // La orden avanza según lo que quedó pendiente
    const completa = items.every((i) => {
      const recibido = Number(i.cantidad_recibida) + (recibir[i.id]?.cantidad ?? 0);
      return recibido >= Number(i.cantidad);
    });

    await supabase
      .from("ordenes_compra")
      .update({ estado: completa ? "recibida" : "recibida_parcial" })
      .eq("id", orden.id);

    if (importacionId) {
      await supabase.from("importaciones").update({ estado: "recibida" }).eq("id", importacionId);
    }

    await supabase.from("actividad").insert({
      usuario_id: usuarioId,
      accion: "recepcion_mercaderia",
      entidad: "recepciones",
      entidad_id: rec.id,
      descripcion: `Recepción de ${ok} ítem(s) de la orden ${orden.numero}`,
    });

    toast.success(`${ok} ítem(s) ingresados al almacén`, {
      description: "El kardex y el costo promedio fueron actualizados.",
    });
    setModalRecepcion(false);
    setProc(null);
    router.refresh();
  }

  const pendientes = items.filter((i) => Number(i.cantidad_recibida) < Number(i.cantidad));
  const totalRecepcion = Object.values(recibir).reduce((s, v) => s + v.cantidad * v.costo, 0);
  const cerrada = ["recibida", "anulada"].includes(orden.estado);

  return (
    <>
      <Button
        variant="outline"
        size="md"
        loading={proc === "pdf-ver"}
        onClick={() => generarPdf(false)}
      >
        <Printer />
        Ver PDF
      </Button>
      <Button
        variant="subtle"
        size="md"
        loading={proc === "pdf-descargar"}
        onClick={() => generarPdf(true)}
      >
        <FileDown />
        PDF
      </Button>
      <Button variant="subtle" size="md" loading={proc === "excel"} onClick={generarExcel}>
        <FileSpreadsheet />
        Excel
      </Button>

      {orden.estado === "borrador" && (
        <Button variant="primary" size="md" loading={proc === "enviada"} onClick={() => cambiarEstado("enviada")}>
          <Send />
          Enviar al proveedor
        </Button>
      )}

      {orden.estado === "enviada" && (
        <Button variant="primary" size="md" loading={proc === "confirmada"} onClick={() => cambiarEstado("confirmada")}>
          <CheckCircle2 />
          Confirmar con el proveedor
        </Button>
      )}

      {orden.tipo === "importacion" && orden.estado === "confirmada" && (
        <Button variant="outline" size="md" loading={proc === "transito"} onClick={() => cambiarEstado("transito")}>
          <Ship />
          Marcar embarcada
        </Button>
      )}

      {orden.tipo === "importacion" && !tieneImportacion && orden.estado !== "borrador" && (
        <Button variant="accent" size="md" loading={proc === "expediente"} onClick={abrirExpediente}>
          <Ship />
          Abrir expediente de importación
        </Button>
      )}

      {puedeRecibir && !cerrada && pendientes.length > 0 && (
        <Button variant="success" size="md" onClick={abrirRecepcion}>
          <PackageCheck />
          Registrar recepción
        </Button>
      )}

      {!cerrada && orden.estado === "borrador" && (
        <Button variant="ghost" size="md" loading={proc === "anulada"} onClick={() => cambiarEstado("anulada")}>
          <XCircle />
          Anular
        </Button>
      )}

      {/* ------------------------------------------------------ Recepción */}
      <Modal
        open={modalRecepcion}
        onClose={() => setModalRecepcion(false)}
        ancho="max-w-3xl"
        titulo={`Recepción de mercadería · ${orden.numero}`}
        descripcion="Cada línea genera un ingreso en el kardex y recalcula el costo promedio ponderado del producto."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalRecepcion(false)}>Cancelar</Button>
            <Button variant="success" loading={proc === "recepcion"} onClick={registrarRecepcion}>
              <PackageCheck />
              Ingresar al almacén
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Fecha de recepción">
              <Input type="date" value={fechaRec} onChange={(e) => setFechaRec(e.target.value)} />
            </Field>
            <Field label="Guía del proveedor">
              <Input value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="G001-0012345" />
            </Field>
            <Field label="Factura del proveedor">
              <Input value={factura} onChange={(e) => setFactura(e.target.value)} placeholder="F001-00004521" />
            </Field>
          </div>

          {orden.tipo === "importacion" && (
            <div className="flex items-start gap-2 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-accent-800" />
              <p className="text-[10.5px] leading-relaxed text-accent-900">
                {items.some((i) => Number(i.costo_landed) > 0)
                  ? "Los costos propuestos son los del expediente de importación, ya prorrateados. Ingresar con estos valores deja el inventario valorizado al costo real puesto en almacén."
                  : "El expediente aún no tiene gastos registrados: los costos propuestos son solo el valor en origen convertido. Complete el expediente antes de recibir para no subvalorar el inventario."}
              </p>
            </div>
          )}

          <Table>
            <THead>
              <tr>
                <th>Producto</th>
                <th className="text-right">Pedido</th>
                <th className="text-right">Recibido</th>
                <th className="w-24 text-right">A recibir</th>
                <th className="w-32 text-right">Costo unit.</th>
                <th className="text-right">Importe</th>
              </tr>
            </THead>
            <TBody>
              {items.map((i) => {
                const pendiente = Number(i.cantidad) - Number(i.cantidad_recibida);
                const v = recibir[i.id];
                return (
                  <tr key={i.id} className={pendiente <= 0 ? "opacity-50" : undefined}>
                    <td className="max-w-[220px]">
                      <span className="block text-[12px] font-semibold text-fg">{i.codigo}</span>
                      <span className="block truncate text-[10.5px] text-muted">{i.descripcion}</span>
                    </td>
                    <td className="text-right text-[12px] tabular">{num(i.cantidad, 0)}</td>
                    <td className="text-right text-[12px] tabular">
                      {num(i.cantidad_recibida, 0)}
                      {pendiente <= 0 && (
                        <Badge tone="success" size="xs" className="ml-1">Completo</Badge>
                      )}
                    </td>
                    <td>
                      <Input
                        type="number"
                        min={0}
                        max={pendiente}
                        disabled={pendiente <= 0}
                        value={v?.cantidad ?? 0}
                        onChange={(e) =>
                          setRecibir((s) => ({
                            ...s,
                            [i.id]: {
                              cantidad: Math.min(Number(e.target.value), pendiente),
                              costo: s[i.id]?.costo ?? Number(i.costo_unitario),
                            },
                          }))
                        }
                        className="h-8 text-right text-[12.5px] tabular"
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        min={0}
                        step="0.0001"
                        disabled={pendiente <= 0}
                        value={v?.costo ?? 0}
                        onChange={(e) =>
                          setRecibir((s) => ({
                            ...s,
                            [i.id]: { cantidad: s[i.id]?.cantidad ?? 0, costo: Number(e.target.value) },
                          }))
                        }
                        className="h-8 text-right text-[12.5px] tabular"
                      />
                    </td>
                    <td className="text-right text-[12px] font-semibold text-fg tabular">
                      {money((v?.cantidad ?? 0) * (v?.costo ?? 0))}
                    </td>
                  </tr>
                );
              })}
            </TBody>
          </Table>

          <div className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3.5 py-2.5">
            <span className="text-[12px] text-muted">
              Valor del ingreso al inventario
            </span>
            <span className="text-[15px] font-bold text-fg tabular">{money(totalRecepcion)}</span>
          </div>
        </div>
      </Modal>
    </>
  );
}
