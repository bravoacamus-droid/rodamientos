"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileDown, Wallet, FileMinus, XCircle, MessageCircle, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Select, Textarea, Field } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";
import { pdfComprobante, type EmpresaPdf, type ItemPdf } from "@/lib/pdf/documentos";
import { money, hoyISO, whatsappUrl } from "@/lib/utils";
import { TIPO_COMPROBANTE } from "@/components/ui/estados";

type Comprobante = {
  id: string; tipo: string; numero: string; fecha_emision: string;
  fecha_vencimiento: string | null; condicion_pago: string; moneda: string;
  op_gravada: number; igv: number; total: number; total_letras: string | null;
  pagado: number; saldo: number; estado: string;
  guia_remision: string | null; orden_compra_cliente: string | null;
  motivo_nota: string | null; referencia_numero: string | null;
};

type Cliente = {
  id: string; razon_social: string; ruc: string | null; direccion: string | null;
  distrito: string | null; contacto: string | null; whatsapp: string | null; telefono: string | null;
};

export function AccionesComprobante({
  comprobante: c,
  cliente,
  vendedor,
  items,
  empresa,
  usuarioId,
  rol,
}: {
  comprobante: Comprobante;
  cliente: Cliente;
  vendedor: string;
  items: ItemPdf[];
  empresa: EmpresaPdf;
  usuarioId: string | null;
  rol: string;
}) {
  const router = useRouter();
  const [generando, setGenerando] = React.useState(false);
  const [proc, setProc] = React.useState<string | null>(null);

  const [modalPago, setModalPago] = React.useState(false);
  const [monto, setMonto] = React.useState(c.saldo);
  const [medio, setMedio] = React.useState("transferencia");
  const [banco, setBanco] = React.useState("BCP");
  const [referencia, setReferencia] = React.useState("");
  const [fechaPago, setFechaPago] = React.useState(hoyISO());

  const [modalNota, setModalNota] = React.useState(false);
  const [motivoNota, setMotivoNota] = React.useState("Devolución de mercadería");

  const puedeCobrar = ["admin", "gerencia", "cobranzas"].includes(rol);
  const puedeAnular = ["admin", "gerencia"].includes(rol);
  const esNota = c.tipo === "nota_credito";

  async function generarPdf(descargar: boolean) {
    setGenerando(true);
    try {
      await pdfComprobante({
        empresa,
        tipo: c.tipo,
        tipoLabel: TIPO_COMPROBANTE[c.tipo] ?? "Comprobante",
        numero: c.numero,
        fecha_emision: c.fecha_emision,
        fecha_vencimiento: c.fecha_vencimiento,
        condicion_pago: c.condicion_pago,
        moneda: c.moneda,
        cliente: {
          razon_social: cliente.razon_social,
          ruc: cliente.ruc,
          direccion: cliente.direccion,
          distrito: cliente.distrito,
        },
        vendedor,
        guia_remision: c.guia_remision,
        orden_compra_cliente: c.orden_compra_cliente,
        referencia: c.referencia_numero,
        motivo_nota: c.motivo_nota,
        items,
        op_gravada: c.op_gravada,
        igv: c.igv,
        total: c.total,
        total_letras: c.total_letras,
        pagado: c.pagado,
        saldo: c.saldo,
        descargar,
      });
    } catch {
      toast.error("No se pudo generar el documento");
    }
    setGenerando(false);
  }

  async function registrarPago() {
    if (monto <= 0) return toast.error("Ingrese un monto válido");
    setProc("pago");
    const supabase = createClient();
    const { error } = await supabase.from("pagos").insert({
      comprobante_id: c.id,
      fecha: fechaPago,
      monto,
      medio,
      banco: medio === "efectivo" ? null : banco,
      referencia: referencia || null,
      registrado_por: usuarioId,
    });

    if (error) {
      toast.error("No se pudo registrar el pago", { description: error.message });
    } else {
      await supabase.from("actividad").insert({
        usuario_id: usuarioId,
        accion: "registrar_pago",
        entidad: "pagos",
        entidad_id: c.id,
        descripcion: `Cobro de ${money(monto)} aplicado a ${c.numero}`,
      });
      toast.success("Pago registrado", { description: "El saldo del documento fue actualizado." });
      setModalPago(false);
      router.refresh();
    }
    setProc(null);
  }

  async function emitirNotaCredito() {
    setProc("nota");
    const supabase = createClient();

    const { data: correlativo, error: errC } = await supabase.rpc("siguiente_correlativo", {
      p_tipo: "nota_credito",
      p_serie: "FC01",
    });
    if (errC || correlativo === null) {
      toast.error("No se pudo reservar el correlativo", { description: errC?.message });
      setProc(null);
      return;
    }

    const { data: letras } = await supabase.rpc("numero_a_letras", {
      p_monto: c.total,
      p_moneda: c.moneda,
    });

    const { data: nc, error } = await supabase
      .from("comprobantes")
      .insert({
        tipo: "nota_credito",
        serie: "FC01",
        correlativo,
        cliente_id: cliente.id,
        referencia_id: c.id,
        motivo_nota: motivoNota,
        fecha_emision: hoyISO(),
        fecha_vencimiento: hoyISO(),
        condicion_pago: "contado",
        dias_credito: 0,
        moneda: c.moneda,
        op_gravada: c.op_gravada,
        igv: c.igv,
        total: c.total,
        total_letras: letras,
        costo_total: 0,
        pagado: c.total,
        saldo: 0,
        estado: "pagado",
        observaciones: `Nota de crédito que afecta al comprobante ${c.numero}`,
      })
      .select("id, numero")
      .single();

    if (error || !nc) {
      toast.error("No se pudo emitir la nota de crédito", { description: error?.message });
      setProc(null);
      return;
    }

    const { data: origen } = await supabase
      .from("comprobante_items")
      .select("*")
      .eq("comprobante_id", c.id);

    await supabase.from("comprobante_items").insert(
      (origen ?? []).map((i) => ({
        comprobante_id: nc.id,
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

    // Reingreso de la mercadería devuelta al almacén central
    const { data: alm } = await supabase.from("almacenes").select("id").eq("codigo", "ALM-01").single();
    if (alm) {
      for (const i of origen ?? []) {
        if (!i.producto_id) continue;
        await supabase.rpc("registrar_movimiento", {
          p_producto: i.producto_id,
          p_almacen: alm.id,
          p_tipo: "ingreso",
          p_cantidad: i.cantidad,
          p_costo: i.costo_unitario,
          p_ref_tipo: "nota_credito",
          p_ref_id: nc.id,
          p_ref_numero: nc.numero,
          p_motivo: `Devolución por nota de crédito ${nc.numero}`,
          p_usuario: usuarioId,
        });
      }
    }

    await supabase.from("actividad").insert({
      usuario_id: usuarioId,
      accion: "emitir_nota_credito",
      entidad: "comprobantes",
      entidad_id: nc.id,
      descripcion: `Nota de crédito ${nc.numero} emitida sobre ${c.numero}`,
    });

    toast.success(`Nota de crédito ${nc.numero} emitida`);
    router.push(`/facturacion/${nc.id}`);
  }

  async function anular() {
    setProc("anular");
    const supabase = createClient();
    const { error } = await supabase.from("comprobantes").update({ estado: "anulado" }).eq("id", c.id);
    if (error) toast.error("No se pudo anular", { description: error.message });
    else {
      toast.success("Comprobante anulado");
      router.refresh();
    }
    setProc(null);
  }

  const wa = whatsappUrl(
    cliente.whatsapp ?? cliente.telefono,
    `Estimado(a) ${cliente.contacto ?? cliente.razon_social}, le compartimos el comprobante ${c.numero} por ${money(c.total, c.moneda)}${c.saldo > 0 ? `, con vencimiento al ${c.fecha_vencimiento}` : ""}. — Inversiones Rodatech E.I.R.L.`
  );

  return (
    <>
      <Button variant="outline" size="md" onClick={() => generarPdf(false)} loading={generando}>
        <Printer />
        Ver / imprimir
      </Button>
      <Button variant="subtle" size="md" onClick={() => generarPdf(true)}>
        <FileDown />
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

      {!esNota && c.saldo > 0.01 && c.estado !== "anulado" && puedeCobrar && (
        <Button variant="success" size="md" onClick={() => { setMonto(c.saldo); setModalPago(true); }}>
          <Wallet />
          Registrar pago
        </Button>
      )}

      {!esNota && c.estado !== "anulado" && puedeAnular && (
        <Button variant="accent" size="md" onClick={() => setModalNota(true)}>
          <FileMinus />
          Nota de crédito
        </Button>
      )}

      {c.estado !== "anulado" && puedeAnular && c.pagado === 0 && (
        <Button variant="ghost" size="md" loading={proc === "anular"} onClick={anular}>
          <XCircle />
          Anular
        </Button>
      )}

      {/* ----------------------------------------------------------- Pago */}
      <Modal
        open={modalPago}
        onClose={() => setModalPago(false)}
        titulo={`Registrar cobro · ${c.numero}`}
        descripcion={`Saldo pendiente: ${money(c.saldo, c.moneda)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalPago(false)}>Cancelar</Button>
            <Button variant="success" loading={proc === "pago"} onClick={registrarPago}>
              <Wallet />
              Registrar cobro
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Monto cobrado">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(Number(e.target.value))}
              className="text-right tabular"
            />
          </Field>
          <Field label="Fecha del cobro">
            <Input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          </Field>
          <Field label="Medio de pago">
            <Select value={medio} onChange={(e) => setMedio(e.target.value)}>
              {["transferencia", "deposito", "efectivo", "cheque", "letra"].map((m) => (
                <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Banco">
            <Select value={banco} onChange={(e) => setBanco(e.target.value)} disabled={medio === "efectivo"}>
              {["BCP", "BBVA", "Interbank", "Scotiabank", "Banco de la Nación", "Otro"].map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="Número de operación / referencia" className="sm:col-span-2">
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="OP-458213" />
          </Field>
        </div>
        <div className="mt-3 flex gap-1.5">
          {[0.25, 0.5, 1].map((f) => (
            <Button key={f} variant="subtle" size="xs" onClick={() => setMonto(Number((c.saldo * f).toFixed(2)))}>
              {f === 1 ? "Saldo total" : `${f * 100}%`}
            </Button>
          ))}
        </div>
      </Modal>

      {/* ------------------------------------------------- Nota de crédito */}
      <Modal
        open={modalNota}
        onClose={() => setModalNota(false)}
        titulo={`Emitir nota de crédito sobre ${c.numero}`}
        descripcion="Se reservará el correlativo de la serie FC01 y la mercadería devuelta reingresará al almacén central."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalNota(false)}>Cancelar</Button>
            <Button variant="accent" loading={proc === "nota"} onClick={emitirNotaCredito}>
              <FileMinus />
              Emitir nota de crédito
            </Button>
          </>
        }
      >
        <Field label="Motivo de la nota">
          <Select value={motivoNota} onChange={(e) => setMotivoNota(e.target.value)}>
            {[
              "Devolución de mercadería",
              "Anulación de la operación",
              "Descuento comercial posterior",
              "Error en la descripción del ítem",
              "Error en el importe facturado",
            ].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Textarea
          className="mt-3"
          rows={2}
          placeholder="Detalle adicional (opcional)…"
          onChange={(e) => setMotivoNota((m) => (e.target.value ? `${m} · ${e.target.value}` : m))}
        />
      </Modal>
    </>
  );
}
