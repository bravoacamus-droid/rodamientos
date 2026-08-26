import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type {
  ClaseEquivalencia,
  EquivalenciaDeclarada,
  ProductoBase,
  Sustituto,
} from "../dominio/tipos";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

/** El producto del que se parte, con lo justo para encabezar la pantalla. */
export async function productoBase(id: string): Promise<Resultado<ProductoBase>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("productos")
      .select(
        `id, codigo, codigo_fabricante, descripcion, designacion_base,
         precio_venta, marcas!inner(nombre), stock(cantidad)`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: false, error: "El producto no existe." };

    const fila = data as unknown as {
      id: string;
      codigo: string;
      codigo_fabricante: string | null;
      descripcion: string;
      designacion_base: string | null;
      precio_venta: number;
      marcas: { nombre: string };
      stock: { cantidad: number } | null;
    };

    return {
      ok: true,
      datos: {
        id: fila.id,
        codigo: fila.codigo,
        codigo_fabricante: fila.codigo_fabricante,
        descripcion: fila.descripcion,
        marca: fila.marcas.nombre,
        designacion_base: fila.designacion_base,
        stock: Number(fila.stock?.cantidad ?? 0),
        precio_venta: Number(fila.precio_venta ?? 0),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * El cross-reference completo.
 *
 * Es el mismo `sustitutos_de()` que usa el constructor de cotizaciones, con un
 * límite más alto: allí se despliega bajo una línea y estorba pasar de ocho;
 * aquí la pantalla ES la lista.
 */
export async function crossReference(
  productoId: string,
  limite = 40,
): Promise<Resultado<Sustituto[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("sustitutos_de", {
      p_producto: productoId,
      p_limit: limite,
    });

    if (error) return fallo(error);
    return { ok: true, datos: (data ?? []) as unknown as Sustituto[] };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Las equivalencias declaradas de un producto, en los DOS sentidos.
 *
 * La tabla guarda un par ordenado y `parCanonico` hace que siempre entre por
 * el mismo lado, así que un producto puede aparecer como `producto_id` en unas
 * filas y como `equivalente_id` en otras. Hay que leer las dos y aplanarlas al
 * «el otro del par», que es lo único que la pantalla necesita saber.
 */
export async function declaradasDe(
  productoId: string,
): Promise<Resultado<EquivalenciaDeclarada[]>> {
  try {
    const supabase = await clienteServidor();

    const seleccion = `id, clase, nota, creado_en, producto_id, equivalente_id,
      producto:productos!producto_equivalencias_producto_id_fkey(id, codigo, descripcion, marcas!inner(nombre)),
      equivalente:productos!producto_equivalencias_equivalente_id_fkey(id, codigo, descripcion, marcas!inner(nombre)),
      perfiles(nombre)`;

    const { data, error } = await supabase
      .from("producto_equivalencias")
      .select(seleccion)
      .or(`producto_id.eq.${productoId},equivalente_id.eq.${productoId}`)
      .order("creado_en", { ascending: false })
      .limit(100);

    if (error) return fallo(error);

    type Lado = { id: string; codigo: string; descripcion: string; marcas: { nombre: string } };
    const filas = (data ?? []) as unknown as Array<{
      id: string;
      clase: string;
      nota: string | null;
      creado_en: string;
      producto_id: string;
      equivalente_id: string;
      producto: Lado | null;
      equivalente: Lado | null;
      perfiles: { nombre: string } | null;
    }>;

    return {
      ok: true,
      datos: filas.flatMap((f) => {
        // El otro lado del par. Si la relación no resolvió —producto
        // archivado y borrado, por ejemplo— la fila se descarta en vez de
        // pintar una equivalencia sin nombre.
        const otro = f.producto_id === productoId ? f.equivalente : f.producto;
        if (!otro) return [];

        return [
          {
            id: f.id,
            otro_id: otro.id,
            otro_codigo: otro.codigo,
            otro_descripcion: otro.descripcion,
            otro_marca: otro.marcas.nombre,
            clase: f.clase as ClaseEquivalencia,
            nota: f.nota,
            creado_en: f.creado_en,
            creado_por: f.perfiles?.nombre ?? null,
          },
        ];
      }),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Cuántas equivalencias hay declaradas en total y sobre cuántos productos.
 *
 * Es el indicador de si el módulo se está usando: la cascada mejora sola a
 * medida que se capturan, y sin este número no hay forma de saber si alguien
 * las captura.
 */
export async function totalDeclaradas(): Promise<
  Resultado<{ pares: number; productos: number }>
> {
  try {
    const supabase = await clienteServidor();
    const { data, error, count } = await supabase
      .from("producto_equivalencias")
      .select("producto_id, equivalente_id", { count: "exact" })
      .limit(2000);

    if (error) return fallo(error);

    const productos = new Set<string>();
    for (const f of data ?? []) {
      productos.add(String(f.producto_id));
      productos.add(String(f.equivalente_id));
    }

    return { ok: true, datos: { pares: count ?? 0, productos: productos.size } };
  } catch (e) {
    return fallo(e);
  }
}
