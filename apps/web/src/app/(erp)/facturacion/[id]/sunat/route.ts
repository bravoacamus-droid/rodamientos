import JSZip from "jszip";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * El XML firmado y la constancia de SUNAT (CDR) de un comprobante (02/11).
 *
 * Moisés, el día de la primera factura real: *«al facturar falta poder
 * descargar XML, CDR; no puedo descargarlo»*. Los dos se guardaban al enviar
 * (`sunat_xml_firmado` y `sunat_respuesta.cdrXml`) y ninguna pantalla los
 * daba: la pieza sin camino otra vez. Son lo que pide el contador y lo que
 * piden algunos clientes junto con el PDF.
 *
 * Con los nombres de SUNAT, que es como los reconoce cualquier sistema:
 *   XML  20562681206-01-F002-00000580.xml
 *   CDR  R-20562681206-01-F002-00000580.zip  (con el R-….xml dentro, como lo
 *        entrega SUNAT)
 *
 * Solo lee, con la sesión y su RLS.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO_TIPO: Record<string, string> = { factura: "01", boleta: "03", nota_credito: "07", nota_debito: "08" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return new Response("Comprobante no válido.", { status: 400 });
  const que = new URL(req.url).searchParams.get("que");
  if (que !== "xml" && que !== "cdr") return new Response("Pide «xml» o «cdr».", { status: 400 });

  const supabase = await clienteServidor();
  const [{ data: c, error }, { data: empresa }] = await Promise.all([
    supabase
      .from("comprobantes")
      .select("tipo, serie, correlativo, sunat_xml_firmado, sunat_respuesta")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("empresa").select("ruc").eq("id", 1).maybeSingle(),
  ]);
  if (error) return new Response(error.message, { status: 500 });
  if (!c) return new Response("No existe ese comprobante.", { status: 404 });

  const base = `${empresa?.ruc ?? "00000000000"}-${CODIGO_TIPO[String(c.tipo)] ?? "01"}-${c.serie}-${String(c.correlativo).padStart(8, "0")}`;

  if (que === "xml") {
    if (!c.sunat_xml_firmado) {
      return new Response("Este comprobante todavía no tiene XML: se arma al enviarlo a SUNAT.", { status: 404 });
    }
    return new Response(String(c.sunat_xml_firmado), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.xml"`,
      },
    });
  }

  const cdr = (c.sunat_respuesta as { cdrXml?: string } | null)?.cdrXml;
  if (!cdr) {
    return new Response("Este comprobante no tiene constancia de SUNAT (CDR): aún no fue aceptado.", { status: 404 });
  }
  const zip = new JSZip();
  zip.file(`R-${base}.xml`, cdr);
  const contenido = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Response(contenido as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="R-${base}.zip"`,
    },
  });
}
