import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";
import { describirRango, leerRango } from "@/modules/reportes";

/**
 * Los filtros del reporte de compras (periodo y proveedor), leídos de la URL
 * (26/11). Los leen el Excel y el PDF, igual que la pantalla.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function opcionesComprasDeUrl(url: URL): Promise<
  | {
      ok: true;
      opciones: { desde: string; hasta: string; proveedor: string | null; nombreProveedor: string | null; descripcionRango: string };
      archivo: (ext: string) => string;
    }
  | { ok: false; respuesta: Response }
> {
  const p = (k: string) => url.searchParams.get(k) ?? undefined;
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  const rango = leerRango(
    { desde: p("desde"), hasta: p("hasta"), atajo: p("atajo") ?? (p("desde") ? undefined : "12_meses") },
    hoy,
  );
  const crudo = p("proveedor");
  const proveedor = crudo && UUID.test(crudo) ? crudo : null;

  let nombre: string | null = null;
  if (proveedor) {
    const supabase = await clienteServidor();
    const { data } = await supabase.from("proveedores").select("razon_social").eq("id", proveedor).maybeSingle();
    nombre = data?.razon_social ?? null;
    if (!nombre) return { ok: false, respuesta: new Response("Ese proveedor no existe.", { status: 404 }) };
  }
  const quien = nombre ? ` ${nombre.replace(/[^\p{L}\p{N} .-]/gu, "").slice(0, 40)}` : "";
  return {
    ok: true,
    opciones: {
      desde: rango.desde,
      hasta: rango.hasta,
      proveedor,
      nombreProveedor: nombre,
      descripcionRango: describirRango(rango, hoy),
    },
    archivo: (ext) => `Compras${quien} ${rango.desde} a ${rango.hasta}.${ext}`,
  };
}
