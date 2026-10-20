"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteAdmin } from "@rodatech/db/admin";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";
import { clasificarRechazo, sePuedeReenviar } from "@rodatech/sunat";
import type { Comprobante, ItemComprobante, NotaComprobante } from "@rodatech/sunat";
import type { Json } from "@rodatech/db/tipos";

import { bloqueoPorSeriePrueba, conectorSunat } from "../api/configuracion";
import { detalleComprobante } from "../api/consultas";
import { cuotasDe, docSunatDe, unidadSunat } from "../dominio/emision";
import { cuotasNetas } from "../dominio/retencion";
import { enMonedaDelDocumento } from "../dominio/moneda-documento";

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
  const negado = await sinPermiso("facturacion", "editar");
  if (negado) {
    return { ok: false, error: negado };
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

  // En la moneda en que se emitió (116): una factura en soles va a SUNAT en
  // soles, con las líneas, los totales y las cuotas en soles.
  const c = enMonedaDelDocumento(ficha.datos);

  if (c.estado === "anulado") {
    return { ok: false, error: "El comprobante está anulado: no se envía." };
  }
  if (c.estado_sunat === "aceptado" || c.estado_sunat === "observado") {
    return { ok: false, error: `${c.numero} ya fue aceptado por SUNAT.` };
  }
  /*
    Las notas también (15/10). Aquí decía «las notas se envían desde su propia
    pantalla», y esa pantalla no existía: `emitirNota` del conector estaba
    escrito y nadie lo llamaba, así que ninguna nota llegaba a SUNAT.
  */
  const esNota = c.tipo === "nota_credito" || c.tipo === "nota_debito";

  const prueba = await bloqueoPorSeriePrueba(c.serie);
  if (prueba) return { ok: false, error: prueba };

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

  // De una nota, lo que SUNAT pide además: el documento que corrige y el motivo.
  let afectado: { tipoDocumento: "01" | "03"; serie: string; correlativo: number } | null = null;
  let descripcionMotivo = "";
  if (esNota) {
    if (!c.referencia_id || !c.motivo_nota_codigo) {
      return { ok: false, error: "A esta nota le falta el documento que corrige o su motivo." };
    }
    const [{ data: ref }, { data: mot }] = await Promise.all([
      supabase.from("comprobantes").select("tipo, serie, correlativo, estado_sunat").eq("id", c.referencia_id).maybeSingle(),
      supabase
        .from("motivos_nota")
        .select("descripcion")
        .eq("tipo", c.tipo)
        .eq("codigo", c.motivo_nota_codigo)
        .maybeSingle(),
    ]);
    if (!ref) return { ok: false, error: "No se encontró el documento que corrige esta nota." };
    // SUNAT rechaza la nota de un documento que no conoce.
    if (!["aceptado", "observado"].includes(String(ref.estado_sunat))) {
      return { ok: false, error: `Primero tiene que estar aceptado en SUNAT el documento que corrige (${c.referencia_numero ?? ""}).` };
    }
    afectado = { tipoDocumento: ref.tipo === "boleta" ? "03" : "01", serie: ref.serie, correlativo: ref.correlativo };
    descripcionMotivo = mot?.descripcion ?? "Corrección";
  }

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

  // El estado pasa a «enviado» ANTES de la llamada. Si el proceso muere a
  // mitad, el documento queda marcado como en vuelo y no como pendiente: es
  // preferible revisar uno que quizá llegó a reenviar uno que sí llegó, porque
  // SUNAT rechaza el duplicado y ese rechazo confunde más que el estado raro.
  //
  // Y es un CANDADO (auditoría 15/10): solo pasa a «enviado» si nadie lo
  // tiene ya en vuelo. Dos clics o dos pestañas mandaban el mismo documento
  // dos veces. Uno «enviado» hace más de 15 minutos se da por muerto (052).
  const admin = clienteAdmin();
  const hace15 = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: tomado } = await admin
    .from("comprobantes")
    .update({ estado_sunat: "enviado", sunat_enviado_en: new Date().toISOString() })
    .eq("id", c.id)
    .or(`estado_sunat.in.(no_enviado,pendiente,rechazado),and(estado_sunat.eq.enviado,sunat_enviado_en.lt.${hace15})`)
    .select("id");
  if (!tomado || tomado.length === 0) {
    return { ok: false, error: `${c.numero} ya se está enviando. Espera la respuesta antes de volver a mandarlo.` };
  }

  try {
    const cdr =
      esNota && afectado
        ? await conector.datos.emitirNota({
            ...comprobante,
            tipoDocumento: c.tipo === "nota_debito" ? "08" : "07",
            motivo: c.motivo_nota_codigo as NotaComprobante["motivo"],
            descripcionMotivo,
            documentoAfectado: afectado,
            // Una nota va al contado: ajusta una deuda, no abre otra a plazo.
            formaPago: { tipo: "contado" },
          })
        : await conector.datos.emitir(comprobante);

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
