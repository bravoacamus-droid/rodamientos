"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, PackageCheck, Receipt, XCircle, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Select, Field } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";

type Pedido = {
  id: string; numero: string; estado: string; es_emergencia: boolean;
  requiere_aprobacion: boolean; aprobado_en: string | null;
  cliente_id: string; almacen_id: string | null; total: number;
};

export function AccionesPedido({
  pedido,
  yaFacturado,
  comprobanteId,
  puedeAprobar,
  usuarioId,
}: {
  pedido: Pedido;
  yaFacturado: boolean;
  comprobanteId: string | null;
  puedeAprobar: boolean;
  usuarioId: string | null;
}) {
  const router = useRouter();
  const [proc, setProc] = React.useState<string | null>(null);
  const [modalFactura, setModalFactura] = React.useState(false);
  const [tipoDoc, setTipoDoc] = React.useState<"factura" | "boleta">("factura");

  const esperando = pedido.es_emergencia && pedido.requiere_aprobacion && !pedido.aprobado_en;

  async function aprobarEmergencia() {
    setProc("aprobar");
    const supabase = createClient();
    const { error } = await supabase
      .from("pedidos")
      .update({
        aprobado_por: usuarioId,
        aprobado_en: new Date().toISOString(),
        estado: "aprobado",
      })
      .eq("id", pedido.id);

    if (error) {
      toast.error("No se pudo aprobar", { description: error.message });
    } else {
      await supabase.from("actividad").insert({
        usuario_id: usuarioId,
        accion: "aprobar_emergencia",
        entidad: "pedidos",
        entidad_id: pedido.id,
        descripcion: `Pedido de emergencia ${pedido.numero} autorizado para despacho con stock por reponer`,
      });
      toast.success("Emergencia autorizada", {
        description: "El pedido puede despacharse con stock negativo controlado.",
      });
      router.refresh();
    }
    setProc(null);
  }

  async function cambiarEstado(estado: string) {
    setProc(estado);
    const supabase = createClient();
    const { error } = await supabase.from("pedidos").update({ estado }).eq("id", pedido.id);
    if (error) toast.error("No se pudo actualizar", { description: error.message });
    else {
      toast.success(`Pedido marcado como ${estado}`);
      router.refresh();
    }
    setProc(null);
  }

  async function facturar() {
    setProc("facturar");
    const supabase = createClient();

    const [{ data: ped }, { data: cliente }] = await Promise.all([
      supabase.from("pedidos").select("*, pedido_items(*)").eq("id", pedido.id).single(),
      supabase.from("clientes").select("ruc, dias_credito").eq("id", pedido.cliente_id).single(),
    ]);

    if (!ped) {
      toast.error("No se pudo leer el pedido");
      setProc(null);
      return;
    }

    const serie = tipoDoc === "factura" ? "F001" : "B001";
    const { data: correlativo, error: errCorr } = await supabase.rpc("siguiente_correlativo", {
      p_tipo: tipoDoc,
      p_serie: serie,
    });

    if (errCorr || correlativo === null) {
      toast.error("No se pudo reservar el correlativo", { description: errCorr?.message });
      setProc(null);
      return;
    }

    const hoy = new Date().toISOString().slice(0, 10);
    const dias = cliente?.dias_credito ?? 0;
    const venc = new Date();
    venc.setDate(venc.getDate() + dias);

    const { data: letras } = await supabase.rpc("numero_a_letras", {
      p_monto: Number(ped.total),
      p_moneda: ped.moneda,
    });

    const { data: comp, error } = await supabase
      .from("comprobantes")
      .insert({
        tipo: tipoDoc,
        serie,
        correlativo,
        cliente_id: ped.cliente_id,
        pedido_id: ped.id,
        fecha_emision: hoy,
        fecha_vencimiento: venc.toISOString().slice(0, 10),
        condicion_pago: dias > 0 ? "credito" : "contado",
        dias_credito: dias,
        moneda: ped.moneda,
        tipo_cambio: ped.tipo_cambio,
        op_gravada: ped.subtotal,
        igv: ped.igv,
        total: ped.total,
        total_letras: letras,
        costo_total: ped.costo_total,
        pagado: 0,
        saldo: ped.total,
        estado: "emitido",
        vendedor_id: ped.vendedor_id,
        orden_compra_cliente: ped.orden_compra_cliente,
        observaciones: ped.es_emergencia ? `Atención de emergencia · pedido ${ped.numero}` : null,
      })
      .select("id, numero")
      .single();

    if (error || !comp) {
      toast.error("No se pudo emitir el comprobante", { description: error?.message });
      setProc(null);
      return;
    }

    const items = (ped.pedido_items ?? []) as Record<string, unknown>[];
    await supabase.from("comprobante_items").insert(
      items.map((i) => ({
        comprobante_id: comp.id,
        producto_id: i.producto_id,
        orden: i.orden,
        codigo: i.codigo,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        unidad: i.unidad,
        precio_unitario: i.precio_unitario,
        descuento_pct: i.descuento_pct,
        costo_unitario: i.costo_unitario,
        subtotal: i.subtotal,
      }))
    );

    // Salida de almacén por cada ítem (permite saldo negativo en emergencias)
    for (const i of items) {
      await supabase.rpc("registrar_movimiento", {
        p_producto: i.producto_id,
        p_almacen: ped.almacen_id,
        p_tipo: "salida",
        p_cantidad: i.cantidad,
        p_costo: i.costo_unitario,
        p_ref_tipo: "comprobante",
        p_ref_id: comp.id,
        p_ref_numero: comp.numero,
        p_motivo: `Venta según ${comp.numero}`,
        p_usuario: usuarioId,
      });
    }

    await supabase
      .from("pedidos")
      .update({ estado: "facturado" })
      .eq("id", pedido.id);

    await supabase.from("actividad").insert({
      usuario_id: usuarioId,
      accion: "emitir_comprobante",
      entidad: "comprobantes",
      entidad_id: comp.id,
      descripcion: `Emisión de ${comp.numero} desde el pedido ${pedido.numero}`,
    });

    toast.success(`Comprobante ${comp.numero} emitido`, {
      description: "El inventario fue descontado y la cuenta por cobrar quedó generada.",
    });
    router.push(`/facturacion/${comp.id}`);
  }

  return (
    <>
      {esperando && puedeAprobar && (
        <Button variant="danger" size="md" loading={proc === "aprobar"} onClick={aprobarEmergencia}>
          <ShieldCheck />
          Autorizar emergencia
        </Button>
      )}

      {["pendiente", "aprobado"].includes(pedido.estado) && !esperando && (
        <Button variant="outline" size="md" loading={proc === "preparacion"} onClick={() => cambiarEstado("preparacion")}>
          <PackageCheck />
          Pasar a preparación
        </Button>
      )}

      {pedido.estado === "preparacion" && (
        <Button variant="outline" size="md" loading={proc === "despachado"} onClick={() => cambiarEstado("despachado")}>
          <PackageCheck />
          Marcar despachado
        </Button>
      )}

      {!yaFacturado && !esperando && pedido.estado !== "anulado" && (
        <Button variant="accent" size="md" onClick={() => setModalFactura(true)}>
          <Receipt />
          Facturar pedido
        </Button>
      )}

      {yaFacturado && comprobanteId && (
        <Button variant="primary" size="md" onClick={() => router.push(`/facturacion/${comprobanteId}`)}>
          <ExternalLink />
          Ver comprobante
        </Button>
      )}

      {!yaFacturado && pedido.estado !== "anulado" && (
        <Button variant="ghost" size="md" loading={proc === "anulado"} onClick={() => cambiarEstado("anulado")}>
          <XCircle />
          Anular
        </Button>
      )}

      <Modal
        open={modalFactura}
        onClose={() => setModalFactura(false)}
        titulo="Emitir comprobante de venta"
        descripcion="Se reservará el siguiente correlativo de la serie, se descontará el inventario y se generará la cuenta por cobrar."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalFactura(false)}>Cancelar</Button>
            <Button variant="primary" loading={proc === "facturar"} onClick={facturar}>
              <Receipt />
              Emitir comprobante
            </Button>
          </>
        }
      >
        <Field label="Tipo de comprobante" hint="Las facturas requieren RUC del adquiriente.">
          <Select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as "factura" | "boleta")}>
            <option value="factura">Factura electrónica · serie F001</option>
            <option value="boleta">Boleta de venta electrónica · serie B001</option>
          </Select>
        </Field>
      </Modal>
    </>
  );
}
