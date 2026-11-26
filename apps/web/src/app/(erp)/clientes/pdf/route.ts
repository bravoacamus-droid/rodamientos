import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { pdfClientes } from "@/modules/clientes/api/exportar";
import { leerFiltrosClientes, lectorDe } from "@/modules/clientes/dominio/filtros";

/** La cartera en PDF, con los filtros de la lista (26/11). Igual que el Excel. */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("clientes", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  try {
    const filtros = leerFiltrosClientes(lectorDe(new URL(req.url).searchParams));
    const { pdf, archivo } = await pdfClientes(filtros);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="clientes.pdf"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el PDF: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
