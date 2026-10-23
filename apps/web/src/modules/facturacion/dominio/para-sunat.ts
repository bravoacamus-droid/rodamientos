import type { Comprobante, ItemComprobante, NotaComprobante } from "@rodatech/sunat";

import { cuotasDe, docSunatDe, unidadSunat } from "./emision";
import { cuotasNetas } from "./retencion";
import type { ComprobanteDetalle } from "./tipos";

/**
 * Cómo se convierte un comprobante de la base en lo que se manda a SUNAT.
 *
 * Vivía dentro de la Server Action `enviarASunat`, y por eso nadie lo había
 * probado contra SUNAT: para ejecutarlo había que pulsar el botón sobre un
 * comprobante de verdad. Se saca aquí, puro, el 23/10 para que la prueba en
 * beta (`scripts/probar-sunat-beta`) mande EXACTAMENTE lo mismo que el botón.
 *
 * Recibe el comprobante ya en la moneda del documento (`enMonedaDelDocumento`).
 */

export interface EmisorSunat {
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  direccion: string | null;
  ubigeo_codigo: string | null;
  igv_porcentaje: number | null;
  /**
   * Del ubigeo de la empresa. Sin ellos SUNAT acepta, pero con tres
   * observaciones (4096-4098) en CADA documento: lo vio beta el 23/10.
   */
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
}

/** De una nota, lo que SUNAT pide además: el documento que corrige y el motivo. */
export interface DatosNota {
  afectado: { tipoDocumento: "01" | "03"; serie: string; correlativo: number };
  descripcionMotivo: string;
}

export function comprobanteParaSunat(c: ComprobanteDetalle, empresa: EmisorSunat): Comprobante {
  const tasaIgv = Number(empresa.igv_porcentaje ?? 18) / 100;

  const items: ItemComprobante[] = c.lineas.map((l) => {
    const neto = l.valor_unitario * (1 - l.descuento_pct / 100);
    const valorVenta = Math.round(l.cantidad * neto * 100) / 100;
    const igvLinea = Math.round(valorVenta * tasaIgv * 100) / 100;
    return {
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: unidadSunat(l.unidad) as ItemComprobante["unidad"],
      valorUnitario: Math.round(neto * 10000) / 10000,
      // Precio con IGV: es referencial (catálogo 16) pero SUNAT lo valida
      // contra el valor unitario y la tasa, así que se deriva, no se inventa.
      precioUnitario: Math.round(neto * (1 + tasaIgv) * 10000) / 10000,
      afectacionIgv: "10",
      igv: igvLinea,
      valorVenta,
      codigoProducto: l.codigo,
    };
  });

  const alCredito = c.condicion_pago === "credito" && c.dias_credito > 0;

  return {
    tipoDocumento: c.tipo === "boleta" ? "03" : "01",
    serie: c.serie,
    correlativo: c.correlativo,
    // Con su zona: sin ella, en un servidor en UTC salía fechada un día antes.
    fechaEmision: new Date(`${c.fecha_emision.slice(0, 10)}T00:00:00-05:00`),
    // Casi siempre dólares; en soles si la venta se aprobó en soles (116).
    moneda: c.moneda,
    emisor: {
      ruc: empresa.ruc,
      razonSocial: empresa.razon_social,
      nombreComercial: empresa.nombre_comercial ?? undefined,
      direccion: empresa.direccion ?? "",
      ubigeo: empresa.ubigeo_codigo ?? "150101",
      departamento: empresa.departamento?.toUpperCase() || undefined,
      provincia: empresa.provincia?.toUpperCase() || undefined,
      distrito: empresa.distrito?.toUpperCase() || undefined,
    },
    receptor: {
      tipoDoc: docSunatDe(c.cliente_tipo_documento) as "0" | "1" | "4" | "6" | "7",
      numDoc: c.cliente_documento ?? "",
      razonSocial: c.cliente ?? "",
      direccion: c.cliente_direccion ?? undefined,
      email: c.cliente_email ?? undefined,
    },
    items,
    totales: {
      gravadas: c.op_gravada,
      exoneradas: c.op_exonerada || undefined,
      inafectas: c.op_inafecta || undefined,
      igv: c.igv,
      total: c.total,
    },
    // En porcentaje: es lo que va en el XML. Con la fracción, SUNAT beta
    // rechazó todas las facturas el 23/10 (3103). Las cuentas de arriba sí
    // usan la fracción.
    tasaIgv: tasaIgv * 100,
    formaPago: alCredito
      ? {
          tipo: "credito",
          /*
            Con retención, el pendiente y las cuotas son el total MENOS lo
            retenido (14/10): así lo pide SUNAT y así lo imprime su F002-564.
            La base guarda las cuotas sobre el total porque la retención entra
            luego como un cobro.
          */
          pendiente: c.retencion_aplica
            ? Math.round((c.total - c.retencion_monto) * 100) / 100
            : c.saldo,
          cuotas: cuotasNetas(
            cuotasDe(c.total, c.dias_credito, c.fecha_emision),
            c.retencion_aplica ? c.retencion_monto : 0,
          ).map((q) => ({
            numero: q.numero,
            monto: q.monto,
            vencimiento: q.vencimiento,
          })),
        }
      : { tipo: "contado" },
  };
}

export function notaParaSunat(c: ComprobanteDetalle, empresa: EmisorSunat, nota: DatosNota): NotaComprobante {
  return {
    ...comprobanteParaSunat(c, empresa),
    tipoDocumento: c.tipo === "nota_debito" ? "08" : "07",
    motivo: c.motivo_nota_codigo as NotaComprobante["motivo"],
    descripcionMotivo: nota.descripcionMotivo,
    documentoAfectado: nota.afectado,
    // Una nota va al contado: ajusta una deuda, no abre otra a plazo.
    formaPago: { tipo: "contado" },
  };
}
