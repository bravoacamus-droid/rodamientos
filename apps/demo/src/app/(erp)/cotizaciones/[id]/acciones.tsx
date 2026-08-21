"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileDown, Send, CheckCircle2, XCircle, MessageCircle, ShoppingCart,
  Pencil, Handshake, Lock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Textarea, Field, Checkbox } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";
import { pdfCotizacion, type EmpresaPdf, type ItemPdf, type CargoPdf } from "@/lib/pdf/documentos";
import { money, whatsappUrl } from "@/lib/utils";

type Cotizacion = {
  id: string; numero: string; fecha: string; fecha_vencimiento: string;
  moneda: string; estado: string; subtotal: number; igv: number; total: number;
  condiciones: string | null; tiempo_entrega: string | null; observaciones: string | null;
  mostrar_igv: boolean; mostrar_margen: boolean;
};

type Cliente = {
  id: string; razon_social: string; ruc: string | null; direccion: string | null;
  distrito: string | null; contacto: string | null; email: string | null;
  telefono: string | null; whatsapp: string | null; dias_credito: number;
};

/** Estados en los que la propuesta sigue viva y puede modificarse. */
const EDITABLES = ["borrador", "enviada", "en_negociacion"];

export function AccionesCotizacion({
  cotizacion,
  cliente,
  vendedor,
  items,
  cargos,
  empresa,
}: {
  cotizacion: Cotizacion;
  cliente: Cliente;
  vendedor: string;
  items: ItemPdf[];
  cargos: CargoPdf[];
  empresa: EmpresaPdf;
}) {
  const router = useRouter();
  const [generando, setGenerando] = React.useState<string | null>(null);
  const [procesando, setProcesando] = React.useState<string | null>(null);
  const [modalRechazo, setModalRechazo] = React.useState(false);
  const [modalPdf, setModalPdf] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");

  // Opciones de impresión: parten de lo guardado en la cotización.
  const [conIgv, setConIgv] = React.useState(cotizacion.mostrar_igv);
  const [conMargen, setConMargen] = React.useState(cotizacion.mostrar_margen);

  const editable = EDITABLES.includes(cotizacion.estado);

  async function generarPdf(descargar: boolean) {
    setGenerando(descargar ? "descargar" : "ver");
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
        cargos,
        subtotal: cotizacion.subtotal,
        igv: cotizacion.igv,
        total: cotizacion.total,
        condiciones: cotizacion.condiciones,
        tiempo_entrega: cotizacion.tiempo_entrega,
        observaciones: cotizacion.observaciones,
        mostrarIgv: conIgv,
        mostrarMargen: conMargen,
        descargar,
      });
      setModalPdf(false);
    } catch {
      toast.error("No se pudo generar el PDF");
    }
    setGenerando(null);
  }

  /** Guarda las preferencias de impresión para que persistan en el documento. */
  async function recordarOpciones() {
    const supabase = createClient();
    await supabase
      .from("cotizaciones")
      .update({ mostrar_igv: conIgv, mostrar_margen: conMargen })
      .eq("id", cotizacion.id);
    router.refresh();
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
        descripcion: `Cotización ${cotizacion.numero} pasó a ${estado.replace("_", " ")}`,
      });
      toast.success(`Cotización marcada como ${estado.replace("_", " ")}`);
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

    const lineas = (cot.cotizacion_items ?? []) as Record<string, unknown>[];
    await supabase.from("pedido_items").insert(
      lineas.map((i) => ({
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

  return (
    <>
      <Button variant="outline" size="md" onClick={() => setModalPdf(true)}>
        <FileDown />
        Generar PDF
      </Button>

      {editable && (
        <Link href={`/cotizaciones/${cotizacion.id}/editar`}>
          <Button variant="subtle" size="md">
            <Pencil />
            Editar
          </Button>
        </Link>
      )}

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

      {cotizacion.estado === "enviada" && (
        <Button
          variant="accent"
          size="md"
          loading={procesando === "en_negociacion"}
          onClick={() => cambiarEstado("en_negociacion")}
        >
          <Handshake />
          Pasar a negociación
        </Button>
      )}

      {editable && (
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

      {["aceptada", "enviada", "en_negociacion"].includes(cotizacion.estado) && (
        <Button variant="primary" size="md" loading={procesando === "pedido"} onClick={convertirEnPedido}>
          <ShoppingCart />
          Convertir en pedido
        </Button>
      )}

      {/* ------------------------------------------------ Opciones del PDF */}
      <Modal
        open={modalPdf}
        onClose={() => setModalPdf(false)}
        titulo={`Generar la propuesta ${cotizacion.numero}`}
        descripcion="Elija qué información incluir antes de emitir el documento."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalPdf(false)}>Cancelar</Button>
            <Button
              variant="outline"
              loading={generando === "ver"}
              onClick={() => { recordarOpciones(); generarPdf(false); }}
            >
              Ver en pantalla
            </Button>
            <Button
              variant="primary"
              loading={generando === "descargar"}
              onClick={() => { recordarOpciones(); generarPdf(true); }}
            >
              <FileDown />
              Descargar
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Checkbox
            label="Desglosar el IGV"
            hint={
              conIgv
                ? "El documento lista subtotal, IGV y total por separado."
                : "El documento muestra un total único con la nota «los precios incluyen IGV»."
            }
            checked={conIgv}
            onChange={(e) => setConIgv(e.target.checked)}
          />
          <Checkbox
            label="Incluir costo y margen"
            hint="Agrega las columnas de costo y margen por línea. Genera una copia de uso interno."
            checked={conMargen}
            onChange={(e) => setConMargen(e.target.checked)}
          />

          {conMargen && (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--danger)]/25 bg-[var(--danger-bg)] px-3 py-2.5">
              <Lock className="mt-0.5 size-4 shrink-0" style={{ color: "var(--danger)" }} />
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--danger)" }}>
                El PDF llevará una marca de agua <strong>COPIA INTERNA</strong> en todas sus páginas y
                el archivo se nombrará con el sufijo <code>-INTERNA</code>. Este documento expone su
                estructura de costos: no debe enviarse al cliente.
              </p>
            </div>
          )}

          {cargos.length > 0 && (
            <p className="pt-1 text-[11px] text-muted">
              Se incluirán {cargos.length} cargo(s) adicional(es) por{" "}
              {money(cargos.reduce((s, c) => s + Number(c.monto), 0))}, listados al final del detalle.
            </p>
          )}
        </div>
      </Modal>

      {/* --------------------------------------------------------- Rechazo */}
      <Modal
        open={modalRechazo}
        onClose={() => setModalRechazo(false)}
        titulo="Registrar rechazo de la cotización"
        descripcion="El motivo alimenta el análisis comercial de oportunidades perdidas."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalRechazo(false)}>Cancelar</Button>
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
