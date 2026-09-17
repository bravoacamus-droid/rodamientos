import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

/**
 * Lecturas del módulo de kits.
 *
 * Un kit es un producto con `es_kit` y su lista en `kit_componentes` (085), así
 * que todo esto lee de `productos` — no hay una segunda tabla de cosas
 * vendibles.
 */

export interface ComponenteDeKit {
  producto_id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad: string;
  /** Cuántas unidades de este producto lleva UN kit. */
  cantidad: number;
  /** Lo que hay en el almacén de este componente. */
  stock: number;
  /** El de lista del producto, para poder volver a él. */
  precioLista: number;
  /** Lo que vale DENTRO de este kit: el propio si lo tiene, si no el de lista. */
  precioVenta: number;
  /** ¿Tiene precio propio en el kit, o hereda el de lista? (087) */
  precioPropio: boolean;
  costo: number;
  /** ¿El costo sale del kardex o de lo anotado en la ficha? (083) */
  costoDelKardex: boolean;
  precioMinimo: number;
  precioMercado: number;
  /** Cuántos kits completos dan las existencias de este componente. */
  alcanzaPara: number;
}

export interface KitDetalle {
  id: string;
  codigo: string;
  descripcion: string;
  precioVenta: number;
  archivado: boolean;
  componentes: ComponenteDeKit[];
  /** Cuántos se pueden armar: el componente que menos alcanza manda. */
  armable: number;
  /** La suma de los componentes, para comparar con el precio que se cobra. */
  sumaVenta: number;
  sumaCosto: number;
}

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

/** Lo que PostgREST devuelve de cada componente. */
interface FilaComponente {
  cantidad: number;
  orden: number;
  precio_unitario: number | null;
  productos: {
    id: string;
    codigo: string;
    descripcion: string;
    unidad_codigo: string;
    precio_venta: number;
    precio_minimo: number;
    precio_mercado: number;
    costo_promedio: number;
    ultimo_costo: number;
    marcas: { nombre: string } | null;
    stock: { cantidad: number }[] | { cantidad: number } | null;
  } | null;
}

/** El stock de un producto, que PostgREST devuelve como fila o como lista. */
function stockDe(s: FilaComponente["productos"] extends null ? never : NonNullable<FilaComponente["productos"]>["stock"]): number {
  if (!s) return 0;
  if (Array.isArray(s)) return Number(s[0]?.cantidad ?? 0);
  return Number(s.cantidad ?? 0);
}

function armar(filas: FilaComponente[]): {
  componentes: ComponenteDeKit[];
  armable: number;
  sumaVenta: number;
  sumaCosto: number;
} {
  const componentes = filas
    .filter((f) => f.productos !== null)
    .sort((a, b) => a.orden - b.orden)
    .map((f) => {
      const p = f.productos!;
      const stock = stockDe(p.stock);
      const cantidad = Number(f.cantidad);
      return {
        producto_id: p.id,
        codigo: p.codigo,
        descripcion: p.descripcion,
        marca: p.marcas?.nombre ?? null,
        unidad: p.unidad_codigo,
        cantidad,
        stock,
        precioLista: Number(p.precio_venta ?? 0),
        // El del kit manda; el de lista es el respaldo. Un 0 puesto a mano
        // vale 0 —la pieza va sin cargo—, así que se compara con null y no
        // con falsy.
        precioVenta:
          f.precio_unitario !== null && f.precio_unitario !== undefined
            ? Number(f.precio_unitario)
            : Number(p.precio_venta ?? 0),
        precioPropio: f.precio_unitario !== null && f.precio_unitario !== undefined,
        // El del kardex manda, el de la ficha es el respaldo (083).
        costo: Number(p.costo_promedio) || Number(p.ultimo_costo) || 0,
        costoDelKardex: Number(p.costo_promedio) > 0,
        precioMinimo: Number(p.precio_minimo ?? 0),
        precioMercado: Number(p.precio_mercado ?? 0),
        // Cuántos kits enteros salen de lo que hay de ESTE componente. Medio
        // kit no se vende, así que se trunca.
        alcanzaPara: cantidad > 0 ? Math.floor(stock / cantidad) : 0,
      };
    });

  return {
    componentes,
    // Un kit sin componentes no se puede armar: 0, no infinito.
    armable:
      componentes.length === 0
        ? 0
        : Math.min(...componentes.map((c) => c.alcanzaPara)),
    sumaVenta: componentes.reduce((t, c) => t + c.precioVenta * c.cantidad, 0),
    sumaCosto: componentes.reduce((t, c) => t + c.costo * c.cantidad, 0),
  };
}

const SELECT_COMPONENTES = `
  cantidad, orden, precio_unitario,
  productos!kit_componentes_producto_id_fkey(
    id, codigo, descripcion, unidad_codigo, precio_venta,
    precio_minimo, precio_mercado, costo_promedio, ultimo_costo,
    marcas(nombre),
    stock(cantidad)
  )`;

/** Los kits del catálogo, con cuántos se pueden armar. */
export async function listarKits(): Promise<Resultado<KitDetalle[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("productos")
      .select(
        `id, codigo, descripcion, precio_venta, archivado,
         kit_componentes!kit_componentes_kit_id_fkey(${SELECT_COMPONENTES})`,
      )
      .eq("es_kit", true)
      .order("codigo");

    if (error) return { ok: false, error: error.message };

    const filas = (data ?? []) as unknown as (Record<string, unknown> & {
      kit_componentes: FilaComponente[];
    })[];

    return {
      ok: true,
      datos: filas.map((k) => {
        const { componentes, armable, sumaVenta, sumaCosto } = armar(
          k.kit_componentes ?? [],
        );
        return {
          id: String(k.id),
          codigo: String(k.codigo),
          descripcion: String(k.descripcion),
          precioVenta: Number(k.precio_venta ?? 0),
          archivado: Boolean(k.archivado),
          componentes,
          armable,
          sumaVenta,
          sumaCosto,
        };
      }),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer los kits." };
  }
}

/** Un kit con todo su contenido. */
export async function kitPorId(id: string): Promise<Resultado<KitDetalle | null>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("productos")
      .select(
        `id, codigo, descripcion, precio_venta, archivado,
         kit_componentes!kit_componentes_kit_id_fkey(${SELECT_COMPONENTES})`,
      )
      .eq("id", id)
      .eq("es_kit", true)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: true, datos: null };

    const k = data as unknown as Record<string, unknown> & {
      kit_componentes: FilaComponente[];
    };
    const { componentes, armable, sumaVenta, sumaCosto } = armar(k.kit_componentes ?? []);

    return {
      ok: true,
      datos: {
        id: String(k.id),
        codigo: String(k.codigo),
        descripcion: String(k.descripcion),
        precioVenta: Number(k.precio_venta ?? 0),
        archivado: Boolean(k.archivado),
        componentes,
        armable,
        sumaVenta,
        sumaCosto,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer el kit." };
  }
}
