"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteAdmin } from "@rodatech/db/admin";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";
import {
  MENSAJE_SIN_CONEXION,
  clasificarRechazo,
  decidirEnvio,
  esErrorDeRed,
  hayQueConsultarAntesDeRechazar,
  sePuedeReenviar,
} from "@rodatech/sunat";
import type { ResultadoConsultaCdr } from "@rodatech/sunat";
import type { Json } from "@rodatech/db/tipos";

import { bloqueoPorSeriePrueba, conectorSunat } from "../api/configuracion";
import { detalleComprobante } from "../api/consultas";
import { enMonedaDelDocumento } from "../dominio/moneda-documento";
import { comprobanteParaSunat, notaParaSunat } from "../dominio/para-sunat";

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
  const { data: filaEmpresa } = await supabase
    .from("empresa")
    .select("ruc, razon_social, nombre_comercial, direccion, ubigeo_codigo, igv_porcentaje")
    .eq("id", 1)
    .maybeSingle();

  if (!filaEmpresa) {
    return { ok: false, error: "No están los datos fiscales de la empresa." };
  }
  // El distrito, la provincia y el departamento del domicilio fiscal: sin
  // ellos SUNAT acepta con tres observaciones en cada documento (beta, 23/10).
  const { data: lugar } = filaEmpresa.ubigeo_codigo
    ? await supabase
        .from("ubigeo")
        .select("departamento, provincia, distrito")
        .eq("codigo", filaEmpresa.ubigeo_codigo)
        .maybeSingle()
    : { data: null };
  const empresa = { ...filaEmpresa, ...(lugar ?? {}) };

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

  const comprobante = comprobanteParaSunat(c, empresa);

  // El estado pasa a «enviado» ANTES de la llamada. Si el proceso muere a
  // mitad, el documento queda marcado como en vuelo y no como pendiente: es
  // preferible revisar uno que quizá llegó a reenviar uno que sí llegó, porque
  // SUNAT rechaza el duplicado y ese rechazo confunde más que el estado raro.
  //
  // Y es un CANDADO (auditoría 15/10): solo pasa a «enviado» si nadie lo
  // tiene ya en vuelo. Dos clics o dos pestañas mandaban el mismo documento
  // dos veces. Uno «enviado» hace más de 15 minutos se da por muerto (052).
  /*
    ¿Pudo haber llegado ya a SUNAT? (auditoría 21/10, A4.) Sí, si un intento
    anterior acabó sin respuesta: quedó «pendiente» por un corte, o «enviado»
    y se murió a mitad. Se mira ANTES del candado, que pisa los dos campos.

    Un «rechazado» no cuenta: si fue un 1033 a la primera, ese número es de
    OTRO documento, y la constancia que tenga SUNAT es la de ese otro.
  */
  const yaSeHabiaMandado =
    c.sunat_enviado_en !== null && (c.estado_sunat === "pendiente" || c.estado_sunat === "enviado");

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
    /*
      Firmar, GUARDAR y mandar, en tres pasos (auditoría SUNAT 28/10, M3).

      Antes era un solo `emitir()` que tiraba el XML firmado: lo que se mandó
      a SUNAT no quedaba en ninguna parte —la columna `sunat_xml_firmado`
      estaba desde la 002 sin que nadie la escribiera— y el hash que imprime
      el papel (`sunat_hash_cdr`) salía siempre vacío, porque se buscaba en el
      CDR y el CDR no lo trae: es el DigestValue de NUESTRA firma.

      Se guarda ANTES de mandar: si la red se corta a mitad, lo que pudo
      llegar a SUNAT ya está archivado. Cada reenvío firma de nuevo y lo
      sobrescribe, así que queda siempre el último que salió.

      En una columna y no en Storage: son 10-30 kB de texto por documento,
      entra en el respaldo de tablas (147) con todo lo demás, y se escribe en
      el mismo `update` que el estado, sin un segundo sitio que pueda quedar
      a medias. El comentario de la 002 hablaba de una «ruta en Storage» que
      nunca se construyó.
    */
    const firmado =
      esNota && afectado
        ? await conector.datos.generarYFirmarNota(notaParaSunat(c, empresa, { afectado, descripcionMotivo }))
        : await conector.datos.generarYFirmar(comprobante);
    await admin
      .from("comprobantes")
      .update({ sunat_xml_firmado: firmado.xmlFirmado, sunat_hash_cdr: firmado.hash || null })
      .eq("id", c.id);

    const cdr = await conector.datos.enviar(
      firmado,
      esNota && afectado ? (c.tipo === "nota_debito" ? "08" : "07") : comprobante.tipoDocumento,
      c.serie,
      c.correlativo,
    );

    /*
      Un 1033 sobre algo que ya había salido NO es «emite otro» (auditoría
      21/10, A4): lo más probable es que SUNAT lo aceptara y la respuesta se
      perdiera. Se le pide la constancia antes de decidir. Si no se puede
      preguntar (beta, red), queda pendiente y avisado: nunca rechazado.
    */
    let consulta: ResultadoConsultaCdr | null | undefined;
    if (hayQueConsultarAntesDeRechazar(cdr, yaSeHabiaMandado)) {
      try {
        consulta = await conector.datos.consultarCdr(
          empresa.ruc,
          esNota ? (c.tipo === "nota_debito" ? "08" : "07") : comprobante.tipoDocumento,
          c.serie,
          c.correlativo,
        );
      } catch {
        consulta = null;
      }
    }
    const decision = decidirEnvio(cdr, yaSeHabiaMandado, consulta);

    if (decision.estado === "pendiente") {
      await admin
        .from("comprobantes")
        .update({
          estado_sunat: "pendiente",
          sunat_codigo_respuesta: cdr.codigo ?? null,
          sunat_mensaje: decision.mensaje,
        })
        .eq("id", c.id);
      revalidatePath("/facturacion");
      revalidatePath(`/facturacion/${c.id}`);
      return { ok: false, error: decision.mensaje };
    }

    const final = decision.cdr;
    // `clasificarRechazo` traduce el código a algo que pueda leer quien vende;
    // `sePuedeReenviar` responde lo único que importa en ese momento: si vale
    // la pena volver a mandarlo, o hay que emitir otro documento.
    const rechazo = final.aceptado ? null : clasificarRechazo(final.codigo);
    const reintentable = final.aceptado ? false : sePuedeReenviar(final.codigo);

    await admin
      .from("comprobantes")
      .update({
        estado_sunat: decision.estado,
        sunat_codigo_respuesta: final.codigo ?? null,
        sunat_mensaje: final.descripcion ?? null,
        // El hash ya se guardó al firmar: es el DigestValue de la firma, que
        // el CDR no trae. No se pisa aquí.
        sunat_respuesta: final as unknown as Json,
      })
      .eq("id", c.id);

    revalidatePath("/facturacion");
    revalidatePath(`/facturacion/${c.id}`);

    return {
      ok: true,
      aceptado: final.aceptado,
      codigo: final.codigo ?? null,
      mensaje:
        final.descripcion ||
        rechazo?.motivo ||
        (final.aceptado ? "Aceptado por SUNAT." : "Rechazado."),
      observaciones: final.observaciones ?? [],
      reintentable,
    };
  } catch (e) {
    // Un corte o un cuelgue se dice en cristiano; «fetch failed» no le sirve a
    // nadie (auditoría 21/10). Lo demás —un certificado roto, por ejemplo—
    // sí trae un mensaje útil.
    const mensaje = esErrorDeRed(e)
      ? MENSAJE_SIN_CONEXION
      : e instanceof Error
        ? e.message
        : "No se pudo hablar con SUNAT.";

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
