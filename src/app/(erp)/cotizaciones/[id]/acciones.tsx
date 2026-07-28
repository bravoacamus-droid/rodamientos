"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileDown, Send, CheckCircle2, XCircle, MessageCircle, ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Textarea, Field } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";
import { pdfCotizacion, type EmpresaPdf, type ItemPdf } from "@/lib/pdf/documentos";
import { money, whatsappUrl } from "@/lib/utils";

type Cotizacion = {
  id: string; numero: string; fecha: string; fecha_vencimiento: string;
  moneda: string; estado: string; subtotal: number; igv: number; total: number;
  condiciones: string | null; tiempo_entrega: string | null; observaciones: string | null;
};

type Cliente = {
  id: string; razon_social: string; ruc: string | null; direccion: string | null;
  distrito: string | null; contacto: string | null; email: string | null;
  telefono: string | null; whatsapp: string | null; dias_credito: number;
};

export function AccionesCotizacion({
  cotizacion,
  cliente,
  vendedor,
  items,
  empresa,
}: {
  cotizacion: Cotizacion;
  cliente: Cliente;
  vendedor: string;
  items: ItemPdf[];
  empresa: EmpresaPdf;
}) {
  const router = useRouter();
  const [generando, setGenerando] = React.useState(false);
  const [procesando, setProcesando] = React.useState<string | null>(null);
  const [modalRechazo, setModalRechazo] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");

  async function generarPdf(descargar: boolean) {
    setGenerando(true);
    try {
      await pdfCotizacion({
        empresa,
        numero: cotizacion.numero,
        fecha: cotizacion.fecha,
        fecha_vencimiento: cotizacion.fecha_vencimiento,
        moneda: cotizacion.moneda,
        cliente: {
          razon_social: cliente.razon_social,
          ruc: cliente.ruc,
          direccion: `${cliente.direccion ?? ""}${cliente.distrito ? ` · ${cliente.distrito}` : ""}`,
          contacto: cliente.contacto,
          email: cliente.email,
          telefono: cliente.telefono,
        },
        vendedor,
        items,
        subtotal: cotizacion.subtotal,
        igv: cotizacion.igv,
        total: cotizacion.total,
        condiciones: cotizacion.condiciones,
        tiempo_entrega: cotizacion.tiempo_entrega,
        observaciones: cotizacion.observaciones,
        descargar,
      });
    } catch {
      toast.error("No se pudo generar el PDF");
    }
    setGenerando(false);
  }

  async function cambiarEstado(estado: string, extra?: Record<string, unknown>) {
    setProcesando(estado);
    const supabase = createClient();
    const { error } = await supabase
      .from("cotizaciones")
      .update({ estado, actualizado_en: new Date().toISOString(), ...extra })
      .eq("id", cotizacion.id);

    if (error) {
      toast.error("No se pudo actualizar la cotización", { description: error.message });
    } else {
      const { data: user } = await supabase.auth.getUser();
      await supabase.from("actividad").insert({
        usuario_id: user.user?.id ?? null,
        accion: `cotizacion_${estado}`,
        entidad: "cotizaciones",
        entidad_id: cotizacion.id,
        descripcion: `Cotización ${cotizacion.numero} marcada como ${estado}`,
      });
      toast.success(`Cotización marcada como ${estado}`);
      router.refresh();
    }
    setProcesando(null);
    setModalRechazo(false);
  }

  async function convertirEnPedido() {
    setProcesando("pedido");
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();

    const { data: numero } = await supabase.rpc("siguiente_numero", {
      p_prefijo: "PED",
      p_tabla: "pedidos",
    });

    const { data: cot } = await supabase
      .from("cotizaciones")
      .select("*, cotizacion_items(*)")
      .eq("id", cotizacion.id)
      .single();

    if (!cot || !numero) {
      toast.error("No se pudo generar el pedido");
      setProcesando(null);
      return;
    }

    const { data: alm } = await supabase.from("almacenes").select("id").eq("codigo", "ALM-01").single();

    const { data: pedido, error } = await supabase
      .from("pedidos")
      .insert({
        numero,
        cliente_id: cot.cliente_id,
        cotizacion_id: cot.id,
        fecha: new Date().toISOString().slice(0, 10),
        moneda: cot.moneda,
        tipo_cambio: cot.tipo_cambio,
        subtotal: cot.subtotal,
        igv: cot.igv,
        total: cot.total,
        costo_total: cot.costo_total,
        estado: "pendiente",
        vendedor_id: cot.vendedor_id,
        almacen_id: alm?.id ?? null,
        observaciones: `Generado desde la cotización ${cot.numero}`,
      })
      .select("id")
      .single();

    if (error || !pedido) {
      toast.error("No se pudo generar el pedido", { description: error?.message });
      setProcesando(null);
      return;
    }

    const items = (cot.cotizacion_items ?? []) as Record<string, unknown>[];
    await supabase.from("pedido_items").insert(
      items.map((i) => ({
        pedido_id: pedido.id,
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

    await supabase.from("cotizaciones").update({ estado: "convertida" }).eq("id", cotizacion.id);
    await supabase.from("actividad").insert({
      usuario_id: user.user?.id ?? null,
      accion: "convertir_cotizacion",
      entidad: "pedidos",
      entidad_id: pedido.id,
      descripcion: `Cotización ${cotizacion.numero} convertida en el pedido ${numero}`,
    });

    toast.success(`Pedido ${numero} creado`);
    router.push(`/pedidos/${pedido.id}`);
  }

  const wa = whatsappUrl(
    cliente.whatsapp ?? cliente.telefono,
    `Estimado(a) ${cliente.contacto ?? cliente.razon_social}, le compartimos la cotización ${cotizacion.numero} por ${money(cotizacion.total)}. Quedamos atentos a sus comentarios. — Inversiones Rodatech E.I.R.L.`
  );

  const abierta = ["borrador", "enviada"].includes(cotizacion.estado);

  return (
    <>
      <Button variant="outline" size="md" onClick={() => generarPdf(false)} loading={generando}>
        <FileDown />
        Ver PDF
      </Button>
      <Button variant="subtle" size="md" onClick={() => generarPdf(true)}>
        Descargar
      </Button>

      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="md">
            <MessageCircle />
            WhatsApp
          </Button>
        </a>
      )}

      {cotizacion.estado === "borrador" && (
        <Button
          variant="primary"
          size="md"
          loading={procesando === "enviada"}
          onClick={() => cambiarEstado("enviada", { enviada_en: new Date().toISOString() })}
        >
          <Send />
          Marcar enviada
        </Button>
      )}

      {abierta && (
        <>
          <Button
            variant="success"
            size="md"
            loading={procesando === "aceptada"}
            onClick={() => cambiarEstado("aceptada")}
          >
            <CheckCircle2 />
            Aceptar
          </Button>
          <Button variant="ghost" size="md" onClick={() => setModalRechazo(true)}>
            <XCircle />
            Rechazar
          </Button>
        </>
      )}

      {["aceptada", "enviada"].includes(cotizacion.estado) && (
        <Button variant="accent" size="md" loading={procesando === "pedido"} onClick={convertirEnPedido}>
          <ShoppingCart />
          Convertir en pedido
        </Button>
      )}

      <Modal
        open={modalRechazo}
        onClose={() => setModalRechazo(false)}
        titulo="Registrar rechazo de la cotización"
        descripcion="El motivo alimenta el análisis comercial de oportunidades perdidas."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalRechazo(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={procesando === "rechazada"}
              onClick={() => cambiarEstado("rechazada", { motivo_rechazo: motivo || "Sin motivo indicado" })}
            >
              Registrar rechazo
            </Button>
          </>
        }
      >
        <Field label="Motivo del rechazo">
          <Textarea
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Precio por encima de la competencia, plazo de entrega, cliente postergó la compra…"
          />
        </Field>
      </Modal>
    </>
  );
}
