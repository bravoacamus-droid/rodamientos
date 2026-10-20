import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { describirRango, leerRango } from "@/modules/reportes";
import { libroCompras } from "@/modules/tablero/api/excel-compras";

/** El Excel del reporte de compras (133), con los filtros de la pantalla. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("compras", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  const url = new URL(req.url);
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
    if (!nombre) return new Response("Ese proveedor no existe.", { status: 404 });
  }

  try {
    const libro = await libroCompras({
      desde: rango.desde,
      hasta: rango.hasta,
      proveedor,
      descripcionRango: describirRango(rango, hoy),
    });
    const quien = nombre ? ` ${nombre.replace(/[^\p{L}\p{N} .-]/gu, "").slice(0, 40)}` : "";
    const archivo = `Compras${quien} ${rango.desde} a ${rango.hasta}.xlsx`;
    return new Response(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="compras.xlsx"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el Excel: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
