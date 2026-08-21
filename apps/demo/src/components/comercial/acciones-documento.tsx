"use client";

import * as React from "react";
import { toast } from "sonner";
import { Eye, FileDown, Loader2, FileSpreadsheet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Tooltip } from "@/components/ui/primitives";
import { pdfComprobante, type EmpresaPdf } from "@/lib/pdf/documentos";
import { TIPO_COMPROBANTE } from "@/components/ui/estados";
import { exportarExcel, type Columna, type Empresa as EmpresaExcel } from "@/lib/excel/exportar";

/**
 * Acciones de fila para un comprobante: abrir o descargar el PDF sin salir del
 * listado. Los datos del documento se leen bajo demanda para no cargar todos
 * los detalles de la página.
 */
export function AccionesComprobanteFila({
  comprobanteId,
  numero,
  empresa,
}: {
  comprobanteId: string;
  numero: string;
  empresa: EmpresaPdf;
}) {
  const [cargando, setCargando] = React.useState<string | null>(null);

  async function generar(descargar: boolean) {
    setCargando(descargar ? "descargar" : "ver");
    const supabase = createClient();

    const [{ data: c }, { data: items }] = await Promise.all([
      supabase
        .from("comprobantes")
        .select(
          "*, clientes(razon_social, ruc, direccion, distrito), profiles(nombre)"
        )
        .eq("id", comprobanteId)
        .maybeSingle(),
      supabase
        .from("comprobante_items")
        .select("*")
        .eq("comprobante_id", comprobanteId)
        .order("orden"),
    ]);

    if (!c) {
      toast.error("No se pudo leer el comprobante");
      setCargando(null);
      return;
    }

    const cliente = c.clientes as unknown as {
      razon_social: string; ruc: string | null;
      direccion: string | null; distrito: string | null;
    };
    const vendedor = c.profiles as unknown as { nombre: string } | null;

    // El documento afectado por una nota de crédito se lee aparte
    let referencia: string | null = null;
    if (c.referencia_id) {
      const { data } = await supabase
        .from("comprobantes")
        .select("numero")
        .eq("id", c.referencia_id)
        .maybeSingle();
      referencia = data?.numero ?? null;
    }

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
        vendedor: vendedor?.nombre ?? "Rodatech",
        guia_remision: c.guia_remision,
        orden_compra_cliente: c.orden_compra_cliente,
        referencia,
        motivo_nota: c.motivo_nota,
        items: (items ?? []).map((i) => ({
          codigo: i.codigo,
          descripcion: i.descripcion,
          cantidad: Number(i.cantidad),
          unidad: i.unidad,
          precio_unitario: Number(i.precio_unitario),
          descuento_pct: Number(i.descuento_pct),
          subtotal: Number(i.subtotal),
        })),
        op_gravada: Number(c.op_gravada),
        igv: Number(c.igv),
        total: Number(c.total),
        total_letras: c.total_letras,
        pagado: Number(c.pagado),
        saldo: Number(c.saldo),
        descargar,
      });
    } catch {
      toast.error(`No se pudo generar el PDF de ${numero}`);
    }
    setCargando(null);
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Tooltip label="Ver el comprobante">
        <Button variant="ghost" size="icon-sm" onClick={() => generar(false)} disabled={!!cargando}>
          {cargando === "ver" ? <Loader2 className="animate-spin" /> : <Eye />}
        </Button>
      </Tooltip>
      <Tooltip label="Descargar en PDF">
        <Button variant="ghost" size="icon-sm" onClick={() => generar(true)} disabled={!!cargando}>
          {cargando === "descargar" ? <Loader2 className="animate-spin" /> : <FileDown />}
        </Button>
      </Tooltip>
    </div>
  );
}

/* ------------------------------------------------ Exportación de listados */

/**
 * Exporta a Excel el listado que el usuario está viendo, con sus filtros ya
 * aplicados: el archivo refleja la pantalla y no toda la tabla.
 */
export function BotonExcel({
  empresa,
  titulo,
  subtitulo,
  nombreArchivo,
  columnas,
  filas,
  resumen,
  nota,
  etiqueta = "Excel",
  variante = "outline",
}: {
  empresa: EmpresaExcel;
  titulo: string;
  subtitulo?: string;
  nombreArchivo: string;
  columnas: Columna[];
  filas: Record<string, unknown>[];
  resumen?: [string, string][];
  nota?: string;
  etiqueta?: string;
  variante?: "outline" | "subtle" | "ghost";
}) {
  const [cargando, setCargando] = React.useState(false);

  async function exportar() {
    if (!filas.length) return toast.info("No hay filas que exportar");
    setCargando(true);
    try {
      await exportarExcel({
        empresa,
        titulo,
        subtitulo,
        nombreArchivo,
        columnas,
        filas,
        resumen,
        nota,
      });
      toast.success(`${filas.length} fila(s) exportadas`);
    } catch {
      toast.error("No se pudo generar el archivo");
    }
    setCargando(false);
  }

  return (
    <Button variant={variante} size="md" onClick={exportar} loading={cargando}>
      <FileSpreadsheet />
      {etiqueta}
    </Button>
  );
}
