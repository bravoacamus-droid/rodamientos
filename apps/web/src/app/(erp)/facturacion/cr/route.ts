import JSZip from "jszip";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Todos los CR de un periodo, en un ZIP con una carpeta por cliente (120).
 *
 * Willy, 14/10: *«con un solo botón descargar todo eso por clientes o por
 * carpetas, cada uno con su correspondiente»* — es lo que le manda al
 * contador cada mes. Filtra por la fecha de la FACTURA (desde/hasta) y, si
 * viene, por cliente. Solo lee, con la sesión y su RLS.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const limpio = (s: string) => s.replace(/[\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);

export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });

  const url = new URL(req.url);
  const desde = url.searchParams.get("desde");
  const hasta = url.searchParams.get("hasta");
  const cliente = url.searchParams.get("cliente");

  const supabase = await clienteServidor();
  let consulta = supabase
    .from("comprobante_retenciones")
    .select("ruta, nombre, numero_cr, comprobantes!inner(numero, fecha_emision, cliente_id, clientes(razon_social))")
    .order("subido_en");
  if (desde && FECHA.test(desde)) consulta = consulta.gte("comprobantes.fecha_emision", desde);
  if (hasta && FECHA.test(hasta)) consulta = consulta.lte("comprobantes.fecha_emision", hasta);
  if (cliente && UUID.test(cliente)) consulta = consulta.eq("comprobantes.cliente_id", cliente);

  const { data, error } = await consulta.limit(500);
  if (error) return new Response(error.message, { status: 500 });
  if (!data || data.length === 0) {
    return new Response("No hay comprobantes de retención registrados en ese periodo.", { status: 404 });
  }

  const zip = new JSZip();
  for (const fila of data) {
    const comp = fila.comprobantes as unknown as {
      numero: string;
      clientes: { razon_social: string } | null;
    };
    const { data: archivo } = await supabase.storage.from("comprobantes-retencion").download(fila.ruta);
    if (!archivo) continue;
    const ext = fila.ruta.split(".").pop() ?? "pdf";
    const carpeta = limpio(comp.clientes?.razon_social ?? "Sin cliente");
    const nombre = limpio(`${comp.numero}${fila.numero_cr ? ` - CR ${fila.numero_cr}` : " - CR"}`);
    zip.file(`${carpeta}/${nombre}.${ext}`, await archivo.arrayBuffer());
  }

  const contenido = await zip.generateAsync({ type: "arraybuffer" });
  const sufijo = [desde, hasta].filter(Boolean).join(" a ") || "todos";
  return new Response(contenido, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="CR ${sufijo}.zip"`,
    },
  });
}
