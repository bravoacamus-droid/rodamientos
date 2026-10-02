import { perfilActual } from "@rodatech/db/servidor";

import { analisisPorId } from "@/modules/compras/api/analisis";
import { libroAnalisis } from "@/modules/compras/api/analisis-excel";
import { proveedoresPorId } from "@/modules/proveedores/api/consultas";

/** Los mismos que pueden ver y hacer análisis (098). */
const ROLES = ["gerencia", "admin", "compras"];

/**
 * El análisis GUARDADO, como su hoja de Excel.
 *
 * Luis, 02/10: *«no podemos ver los detalles después de guardar, poder
 * descargar el excel»*. El botón de la pantalla exporta lo que hay en
 * pantalla; esto exporta lo que hay en la base, y es lo que permite
 * descargarlo desde la LISTA sin abrir cada análisis.
 *
 * Un GET que lee y no escribe nada. Pide sesión y rol como cualquier Server
 * Action: es una URL que se puede escribir a mano. Y la consulta va con el
 * cliente de la sesión, así que además manda RLS.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  if (!ROLES.includes(perfil.rol)) return new Response("Tu rol no puede ver los análisis.", { status: 403 });

  const { id } = await params;
  const r = await analisisPorId(id);
  if (!r.ok) return new Response("No se pudo leer el análisis.", { status: 500 });
  if (!r.datos) return new Response("Ese análisis no existe.", { status: 404 });
  const a = r.datos;

  const prov = await proveedoresPorId([a.proveedor_id]);
  const proveedor = prov.ok ? (prov.datos.find((p) => p.id === a.proveedor_id)?.razon_social ?? null) : null;

  const libro = await libroAnalisis({
    numero: a.numero,
    proveedor,
    referencia: a.referencia ?? "",
    fecha: a.fecha,
    costoEnvio: a.costo_envio,
    desaduanajeSoles: a.desaduanaje_soles,
    tipoCambio: a.tipo_cambio ?? 0,
    lineas: a.items.map((i) => ({
      cliente: i.cliente ?? "",
      frecuencia: i.frecuencia,
      codigo: i.codigo,
      marca: i.marca ?? "",
      cantidadRef: i.cantidad_ref,
      precioFob: i.precio_fob,
      pesoKg: i.peso_kg,
      cantidadPedido: i.cantidad_pedido,
      precioMercado: i.precio_mercado,
      proveedorMercado: i.proveedor_mercado ?? "",
    })),
  });

  const nombre = `Analisis importacion ${a.numero}.xlsx`;
  return new Response(new Uint8Array(libro), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
