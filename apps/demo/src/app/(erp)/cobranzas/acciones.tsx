"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet, FileText, MessageCircle, MoreHorizontal, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Select, Textarea, Field, Tooltip } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";
import { pdfEstadoCuenta, type EmpresaPdf } from "@/lib/pdf/documentos";
import { money, hoyISO, whatsappUrl } from "@/lib/utils";

type Documento = {
  id: string; numero: string; cliente_id: string; cliente: string; ruc: string | null;
  telefono: string | null; whatsapp: string | null; email: string | null;
  saldo: number; total: number; moneda: string; fecha_vencimiento: string;
  dias_vencido: number; linea_credito: number; dias_credito: number;
};

export function AccionesCartera({
  documento: d,
  empresa,
}: {
  documento: Documento;
  empresa: EmpresaPdf;
}) {
  const router = useRouter();
  const [menu, setMenu] = React.useState(false);
  const [modalPago, setModalPago] = React.useState(false);
  const [modalGestion, setModalGestion] = React.useState(false);
  const [proc, setProc] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  const [monto, setMonto] = React.useState(d.saldo);
  const [medio, setMedio] = React.useState("transferencia");
  const [banco, setBanco] = React.useState("BCP");
  const [operacion, setOperacion] = React.useState("");
  const [fechaPago, setFechaPago] = React.useState(hoyISO());

  const [canal, setCanal] = React.useState("whatsapp");
  const [resultado, setResultado] = React.useState("Compromiso de pago");
  const [compromiso, setCompromiso] = React.useState("");
  const [nota, setNota] = React.useState("");

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function registrarPago() {
    if (monto <= 0) return toast.error("Ingrese un monto válido");
    setProc("pago");
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from("pagos").insert({
      comprobante_id: d.id,
      fecha: fechaPago,
      monto,
      medio,
      banco: medio === "efectivo" ? null : banco,
      referencia: operacion || null,
      registrado_por: user.user?.id ?? null,
    });

    if (error) toast.error("No se pudo registrar el pago", { description: error.message });
    else {
      toast.success(`Cobro de ${money(monto)} aplicado a ${d.numero}`);
      setModalPago(false);
      router.refresh();
    }
    setProc(null);
  }

  async function registrarGestion() {
    setProc("gestion");
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from("gestiones_cobranza").insert({
      cliente_id: d.cliente_id,
      comprobante_id: d.id,
      canal,
      resultado,
      compromiso_fecha: compromiso || null,
      nota: nota || null,
      usuario_id: user.user?.id ?? null,
    });

    if (error) toast.error("No se pudo registrar la gestión", { description: error.message });
    else {
      toast.success("Gestión de cobranza registrada");
      setModalGestion(false);
      setNota("");
      router.refresh();
    }
    setProc(null);
  }

  async function estadoDeCuenta() {
    setProc("estado");
    const supabase = createClient();
    const [{ data: cliente }, { data: docs }] = await Promise.all([
      supabase.from("clientes").select("razon_social, ruc, direccion, contacto, linea_credito, dias_credito").eq("id", d.cliente_id).single(),
      supabase
        .from("comprobantes")
        .select("numero, fecha_emision, fecha_vencimiento, total, pagado, saldo")
        .eq("cliente_id", d.cliente_id)
        .gt("saldo", 0)
        .neq("estado", "anulado")
        .order("fecha_vencimiento"),
    ]);

    if (!cliente) {
      toast.error("No se pudo leer el cliente");
      setProc(null);
      return;
    }

    const hoy = new Date();
    await pdfEstadoCuenta({
      empresa,
      cliente: {
        razon_social: cliente.razon_social,
        ruc: cliente.ruc,
        direccion: cliente.direccion,
        contacto: cliente.contacto,
        linea_credito: Number(cliente.linea_credito),
        dias_credito: Number(cliente.dias_credito),
      },
      documentos: (docs ?? []).map((x) => ({
        numero: x.numero,
        fecha_emision: x.fecha_emision,
        fecha_vencimiento: x.fecha_vencimiento,
        total: Number(x.total),
        pagado: Number(x.pagado),
        saldo: Number(x.saldo),
        dias_vencido: Math.max(
          Math.floor((hoy.getTime() - new Date(`${x.fecha_vencimiento}T12:00:00`).getTime()) / 86400000),
          0
        ),
      })),
    });
    setProc(null);
    setMenu(false);
  }

  const wa = whatsappUrl(
    d.whatsapp ?? d.telefono,
    d.dias_vencido > 0
      ? `Estimados ${d.cliente}, le recordamos el documento ${d.numero} por ${money(d.saldo, d.moneda)}, vencido el ${d.fecha_vencimiento}. Agradeceremos su regularización. — Inversiones Rodatech E.I.R.L.`
      : `Estimados ${d.cliente}, le recordamos el documento ${d.numero} por ${money(d.saldo, d.moneda)} con vencimiento al ${d.fecha_vencimiento}. — Inversiones Rodatech E.I.R.L.`
  );

  return (
    <div ref={ref} className="relative flex items-center justify-end gap-0.5">
      <Tooltip label="Registrar cobro">
        <Button variant="ghost" size="icon-sm" onClick={() => { setMonto(d.saldo); setModalPago(true); }}>
          <Wallet className="text-[var(--ok)]" />
        </Button>
      </Tooltip>

      {wa && (
        <Tooltip label="Recordatorio por WhatsApp">
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="icon-sm">
              <MessageCircle />
            </Button>
          </a>
        </Tooltip>
      )}

      <Button variant="ghost" size="icon-sm" onClick={() => setMenu((m) => !m)} aria-label="Más acciones">
        <MoreHorizontal />
      </Button>

      {menu && (
        <div className="absolute right-0 top-full z-40 mt-1 w-52 overflow-hidden rounded-lg border bg-[var(--surface)] p-1 elev-3 animate-scale-in">
          <button
            onClick={estadoDeCuenta}
            disabled={proc === "estado"}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12.5px] text-fg transition-colors hover:bg-[var(--surface-2)]"
          >
            <FileText className="size-3.5 text-subtle" />
            {proc === "estado" ? "Generando…" : "Estado de cuenta PDF"}
          </button>
          <button
            onClick={() => { setModalGestion(true); setMenu(false); }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12.5px] text-fg transition-colors hover:bg-[var(--surface-2)]"
          >
            <Phone className="size-3.5 text-subtle" />
            Registrar gestión
          </button>
        </div>
      )}

      {/* --------------------------------------------------------- Pago */}
      <Modal
        open={modalPago}
        onClose={() => setModalPago(false)}
        titulo={`Registrar cobro · ${d.numero}`}
        descripcion={`${d.cliente} · saldo ${money(d.saldo, d.moneda)}${d.dias_vencido > 0 ? ` · vencido hace ${d.dias_vencido} días` : ""}`}
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
            <Input type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(Number(e.target.value))} className="text-right tabular" />
          </Field>
          <Field label="Fecha">
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
          <Field label="N.º de operación" className="sm:col-span-2">
            <Input value={operacion} onChange={(e) => setOperacion(e.target.value)} placeholder="OP-458213" />
          </Field>
        </div>
      </Modal>

      {/* ----------------------------------------------------- Gestión */}
      <Modal
        open={modalGestion}
        onClose={() => setModalGestion(false)}
        titulo={`Gestión de cobranza · ${d.cliente}`}
        descripcion={`Documento ${d.numero} por ${money(d.saldo, d.moneda)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalGestion(false)}>Cancelar</Button>
            <Button variant="primary" loading={proc === "gestion"} onClick={registrarGestion}>
              Guardar gestión
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Canal de contacto">
            <Select value={canal} onChange={(e) => setCanal(e.target.value)}>
              {["whatsapp", "llamada", "correo", "visita"].map((c) => (
                <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Resultado">
            <Select value={resultado} onChange={(e) => setResultado(e.target.value)}>
              {[
                "Compromiso de pago",
                "Contactado sin compromiso",
                "Solicita reprogramación",
                "Pendiente de conformidad contable",
                "No contactado",
              ].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha de compromiso" className="sm:col-span-2">
            <Input type="date" value={compromiso} onChange={(e) => setCompromiso(e.target.value)} />
          </Field>
          <Field label="Nota" className="sm:col-span-2">
            <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Detalle del contacto…" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
