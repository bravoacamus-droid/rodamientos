import JSZip from "jszip";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * El XML firmado y la constancia de SUNAT (CDR) de una guía de remitente
 * (07/11), como los de la factura (02/11).
 *
 * Moisés, 07/11: *«las guías de remitente también deberían descargar el XML y
 * el CDR?»*. El CDR se guardaba desde la 168 (`sunat_respuesta.cdrXml`); el
 * XML, desde la 199, solo de las guías enviadas desde entonces.
 *
 * Con los nombres de SUNAT (09 = guía de remitente):
 *   XML  20562681206-09-T002-00000582.xml
 *   CDR  R-20562681206-09-T002-00000582.zip  (con el R-….xml dentro)
 *
 * Solo lee, con la sesión y su RLS.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return new Response("Guía no válida.", { status: 400 });
  const que = new URL(req.url).searchParams.get("que");
  if (que !== "xml" && que !== "cdr") return new Response("Pide «xml» o «cdr».", { status: 400 });

  const supabase = await clienteServidor();
  const [{ data: g, error }, { data: empresa }] = await Promise.all([
    supabase
      .from("guias_remision")
      .select("serie, correlativo, sunat_xml_firmado, sunat_respuesta")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("empresa").select("ruc").eq("id", 1).maybeSingle(),
  ]);
  if (error) return new Response(error.message, { status: 500 });
  if (!g) return new Response("No existe esa guía.", { status: 404 });

  const base = `${empresa?.ruc ?? "00000000000"}-09-${g.serie}-${String(g.correlativo).padStart(8, "0")}`;

  if (que === "xml") {
    if (!g.sunat_xml_firmado) {
      return new Response(
        "Esta guía no tiene su XML guardado: se guarda al mandarla a SUNAT, desde el 07/11.",
        { status: 404 },
      );
    }
    return new Response(String(g.sunat_xml_firmado), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.xml"`,
      },
    });
  }

  const cdr = (g.sunat_respuesta as { cdrXml?: string } | null)?.cdrXml;
  if (!cdr) {
    return new Response("Esta guía no tiene constancia de SUNAT (CDR) guardada.", { status: 404 });
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
