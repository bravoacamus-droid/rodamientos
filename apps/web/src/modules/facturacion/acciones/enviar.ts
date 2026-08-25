"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteAdmin } from "@rodatech/db/admin";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { clasificarRechazo, sePuedeReenviar } from "@rodatech/sunat";
import type { Comprobante, ItemComprobante } from "@rodatech/sunat";
import type { Json } from "@rodatech/db/tipos";

import { conectorSunat } from "../api/configuracion";
import { detalleComprobante } from "../api/consultas";
import { cuotasDe, docSunatDe, unidadSunat } from "../dominio/emision";

/**
 * Envío de un comprobante ya emitido a SUNAT.
 *
 * Es un paso APARTE de la emisión, y esa separación es la decisión de diseño
 * del módulo. Emitir y enviar en el mismo botón parece más cómodo hasta el
 * primer día que SUNAT no responde: el correlativo ya se gastó, el documento
 * es válido, el cliente se va con su papel, y el sistema tendría que decidir
 * solo si reintenta o si da la venta por perdida.
 *
 * Separados, un fallo de SUNAT es un documento en estado «pendiente» que se
 * reenvía cuando se pueda. Es también lo que permite trabajar hoy, sin
 * certificado: se emite, se cobra, y el envío queda esperando.
 */

const ROLES = ["gerencia", "admin", "ventas"] as const;

const esquema = z.object({ id: z.string().uuid() });

export type ResultadoEnvio =
  | {
      ok: true;
      aceptado: boolean;
      codigo: string | null;
      mensaje: string;
      observaciones: string[];
      /** Si no se aceptó: ¿tiene sentido reintentar, o hay que emitir otro? */
      reintentable: boolean;
    }
  | { ok: false; error: string };

export async function enviarASunat(
  _previo: ResultadoEnvio | null,
  formData: FormData,
): Promise<ResultadoEnvio> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede enviar comprobantes a SUNAT." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse({ id: formData.get("id") });
  } catch {
    return { ok: false, error: "Falta el comprobante a enviar." };
  }

  const ficha = await detalleComprobante(datos.id);
  if (!ficha.ok) return { ok: false, error: ficha.error };
  if (!ficha.datos) return { ok: false, error: "El comprobante no existe." };

  const c = ficha.datos;

  if (c.estado === "anulado") {
    return { ok: false, error: "El comprobante está anulado: no se envía." };
  }
  if (c.estado_sunat === "aceptado") {
    return { ok: false, error: `${c.numero} ya fue aceptado por SUNAT.` };
  }
  if (c.tipo !== "factura" && c.tipo !== "boleta") {
    return {
      ok: false,
      error: "Las notas se envían desde su propia pantalla, no desde aquí.",
    };
  }

  const conector = await conectorSunat();
  if (!conector.ok) return { ok: false, error: conector.error };

  // Los datos del emisor salen de `empresa`, que es la fila única del negocio.
  const supabase = await clienteServidor();
  const { data: empresa } = await supabase
    .from("empresa")
    .select("ruc, razon_social, nombre_comercial, direccion, ubigeo_codigo, igv_porcentaje")
    .eq("id", 1)
    .maybeSingle();

  if (!empresa) {
    return { ok: false, error: "No están los datos fiscales de la empresa." };
  }

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

  const comprobante: Comprobante = {
    tipoDocumento: c.tipo === "factura" ? "01" : "03",
    serie: c.serie,
    correlativo: c.correlativo,
    fechaEmision: new Date(`${c.fecha_emision}T00:00:00`),
    // La moneda es constante del negocio: Willy cotiza y factura en dólares.
    moneda: "USD",
    emisor: {
      ruc: empresa.ruc,
      razonSocial: empresa.razon_social,
      nombreComercial: empresa.nombre_comercial ?? undefined,
      direccion: empresa.direccion ?? "",
      ubigeo: empresa.ubigeo_codigo ?? "150101",
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
    tasaIgv,
    formaPago: alCredito
      ? {
          tipo: "credito",
          pendiente: c.saldo,
          cuotas: cuotasDe(c.total, c.dias_credito, c.fecha_emision).map((q) => ({
            numero: q.numero,
            monto: q.monto,
            vencimiento: q.vencimiento,
          })),
        }
      : { tipo: "contado" },
  };

  // El estado pasa a «enviado» ANTES de la llamada. Si el proceso muere a
  // mitad, el documento queda marcado como en vuelo y no como pendiente: es
  // preferible revisar uno que quizá llegó a reenviar uno que sí llegó, porque
  // SUNAT rechaza el duplicado y ese rechazo confunde más que el estado raro.
  const admin = clienteAdmin();
  await admin
    .from("comprobantes")
    .update({ estado_sunat: "enviado", sunat_enviado_en: new Date().toISOString() })
    .eq("id", c.id);

  try {
    const cdr = await conector.datos.emitir(comprobante);

    // `clasificarRechazo` traduce el código a algo que pueda leer quien vende;
    // `sePuedeReenviar` responde lo único que importa en ese momento: si vale
    // la pena volver a mandarlo, o hay que emitir otro documento.
    const rechazo = cdr.aceptado ? null : clasificarRechazo(cdr.codigo);
    const reintentable = cdr.aceptado ? false : sePuedeReenviar(cdr.codigo);

    await admin
      .from("comprobantes")
      .update({
        estado_sunat: cdr.aceptado
          ? cdr.observaciones.length > 0
            ? "observado"
            : "aceptado"
          : "rechazado",
        sunat_codigo_respuesta: cdr.codigo ?? null,
        sunat_mensaje: cdr.descripcion ?? null,
        sunat_hash_cdr: (cdr as { hash?: string }).hash ?? null,
        sunat_respuesta: cdr as unknown as Json,
      })
      .eq("id", c.id);

    revalidatePath("/facturacion");
    revalidatePath(`/facturacion/${c.id}`);

    return {
      ok: true,
      aceptado: cdr.aceptado,
      codigo: cdr.codigo ?? null,
      mensaje:
        cdr.descripcion ??
        rechazo?.motivo ??
        (cdr.aceptado ? "Aceptado por SUNAT." : "Rechazado."),
      observaciones: cdr.observaciones ?? [],
      reintentable,
    };
  } catch (e) {
    const mensaje =
      e instanceof Error ? e.message : "No se pudo hablar con SUNAT.";

    // Un fallo de RED no es un rechazo: el documento vuelve a «pendiente» para
    // que se pueda reenviar. Dejarlo en «enviado» lo escondería de la cola.
    await admin
      .from("comprobantes")
      .update({ estado_sunat: "pendiente", sunat_mensaje: mensaje })
      .eq("id", c.id);

    revalidatePath(`/facturacion/${c.id}`);
    return { ok: false, error: mensaje };
  }
}
