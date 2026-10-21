import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { libroProductos } from "@/modules/productos/api/excel";

/**
 * El catálogo en Excel, con los filtros de la lista (21/10).
 *
 * Un GET que solo lee, como el de Reportes. Pide sesión y «Ver» en
 * Productos —es una URL que se puede escribir a mano— y la consulta va con
 * el cliente de la sesión, así que además manda RLS. Un id que no es un uuid
 * se ignora en vez de viajar a la base.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("productos", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  const url = new URL(req.url);
  const id = (k: string) => {
    const v = url.searchParams.get(k);
    return v && UUID.test(v) ? v : null;
  };
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80) || null;
  const filtros = {
    q,
    marca: id("marca"),
    familia: id("familia"),
    subfamilia: id("subfamilia"),
    archivados: url.searchParams.get("archivados") === "1",
  };

  // La cabecera del libro dice qué se bajó, con los nombres y no los ids.
  const supabase = await clienteServidor();
  const nombre = async (tabla: "marcas" | "familias" | "subfamilias", v: string | null) => {
    if (!v) return null;
    const { data } = await supabase.from(tabla).select("nombre").eq("id", v).maybeSingle();
    return data?.nombre ?? null;
  };
  const [marca, familia, subfamilia] = await Promise.all([
    nombre("marcas", filtros.marca),
    nombre("familias", filtros.familia),
    nombre("subfamilias", filtros.subfamilia),
  ]);
  const partes = [
    familia ? `Familia ${familia}` : "Todas las familias",
    subfamilia ? `subfamilia ${subfamilia}` : null,
    marca ? `marca ${marca}` : null,
    q ? `que dicen «${q}»` : null,
    filtros.archivados ? "activos y dados de baja" : "solo activos",
  ].filter(Boolean);

  try {
    const { libro } = await libroProductos({ filtros, descripcionFiltros: partes.join(" · ") });
    const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
    const quien = [familia, subfamilia, marca]
      .filter(Boolean)
      .join(" ")
      .replace(/[^\p{L}\p{N} .-]/gu, "")
      .slice(0, 50);
    const archivo = `Productos${quien ? ` ${quien}` : ""} ${hoy}.xlsx`;
    return new Response(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // filename* para que las tildes y la ñ lleguen enteras.
        "Content-Disposition": `attachment; filename="productos.xlsx"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el Excel: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
