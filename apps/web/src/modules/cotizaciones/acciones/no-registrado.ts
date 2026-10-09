"use server";

import { randomInt } from "node:crypto";
import { clienteServidor } from "@rodatech/db/servidor";

import { crearProductoRapido, type ResultadoAlta } from "@/modules/productos/acciones/alta-rapida";

/**
 * «Producto no registrado» (Luis, 09/10).
 *
 * *«A veces le piden un producto que no vende o no es habitual, pero lo
 * consigue; solo necesita poner descripción larga»*.
 *
 * No se queda como texto suelto en la cotización: la guía exige un producto
 * del catálogo (`guia_items.producto_id` es NOT NULL), la factura exige la
 * guía y la orden de compra también pide producto. Un texto suelto se
 * quedaría atascado justo cuando el cliente dice que sí. Así que nace en el
 * catálogo con lo mínimo —familia OTROS / POR CLASIFICAR y SIN MARCA si no se
 * dice otra— y desde ahí sigue el flujo entero. Se clasifica después, si
 * vuelve a pedirse.
 *
 * El rol lo decide `guardarProducto`: el catálogo lo tocan gerencia,
 * administración y compras.
 */
export async function crearNoRegistrado(datos: {
  descripcion: string;
  codigo: string;
  marcaId: string | null;
  unidad: string;
  precioVenta: number;
}): Promise<ResultadoAlta> {
  const descripcion = String(datos.descripcion ?? "").trim().replace(/\s+/g, " ");
  if (descripcion.length < 3) return { ok: false, error: "Falta la descripción." };

  const supabase = await clienteServidor();
  const [{ data: familia }, { data: marcaPorDefecto }] = await Promise.all([
    supabase
      .from("subfamilias")
      .select("id, familia_id, familias!inner(nombre)")
      .eq("nombre", "POR CLASIFICAR")
      .eq("familias.nombre", "OTROS")
      .maybeSingle(),
    supabase.from("marcas").select("id, nombre").eq("nombre", "SIN MARCA").maybeSingle(),
  ]);
  if (!familia) return { ok: false, error: "Falta la familia OTROS / POR CLASIFICAR en el catálogo." };

  let marcaId = datos.marcaId;
  let marcaNombre: string | null = null;
  if (marcaId) {
    const { data } = await supabase.from("marcas").select("nombre").eq("id", marcaId).maybeSingle();
    if (!data) return { ok: false, error: "La marca no existe." };
    marcaNombre = data.nombre;
  } else {
    if (!marcaPorDefecto) return { ok: false, error: "Falta la marca SIN MARCA en el catálogo." };
    marcaId = marcaPorDefecto.id;
    marcaNombre = null;
  }

  // Sin código, uno como los que entraron del Excel: tres letras de la
  // descripción y ocho cifras («BOL-61250748»).
  const prefijo =
    descripcion
      .normalize("NFD")
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 3)
      .toUpperCase()
      .padEnd(3, "X");
  const propio = String(datos.codigo ?? "").trim().toUpperCase();

  for (let intento = 0; intento < 3; intento++) {
    const codigo = propio || `${prefijo}-${String(randomInt(10_000_000, 99_999_999))}`;
    const r = await crearProductoRapido({
      codigo,
      descripcion,
      marca_id: marcaId,
      familia_id: familia.familia_id,
      subfamilia_id: familia.id,
      unidad_codigo: datos.unidad,
      precio_venta: Number.isFinite(datos.precioVenta) && datos.precioVenta > 0 ? datos.precioVenta : 0,
      marcaNombre,
    });
    // Un código propio repetido se dice; uno inventado se vuelve a sortear.
    if (r.ok || propio || !/c[oó]digo/i.test(r.error)) return r;
  }
  return { ok: false, error: "No se pudo generar un código libre. Escribe uno." };
}
