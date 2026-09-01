import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type {
  FiltrosProductos,
  Opcion,
  ProductoLista,
  ResumenCatalogo,
} from "../dominio/tipos";

export const POR_PAGINA = 50;

/**
 * Resultado de una consulta que puede fallar sin tumbar la página.
 *
 * Mientras el esquema no esté aplicado en Supabase, toda consulta va a fallar.
 * Devolver el error como dato —en vez de lanzarlo— permite que la página
 * renderice su diseño con un aviso claro, que es lo que hace falta para poder
 * revisar la interfaz antes de tener base de datos.
 */
export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/**
 * Una página del catálogo, por keyset.
 *
 * Va contra `productos_pagina()`, que ya resuelve marca, jerarquía, stock y
 * estado en una sola consulta. Se pide un elemento de más que el tamaño de
 * página: si vuelve, hay página siguiente, y así no hace falta un `count`
 * sobre 2.000+ filas en cada carga.
 */
export async function listarProductos(
  filtros: FiltrosProductos,
): Promise<Resultado<{ filas: ProductoLista[]; siguiente: string | null }>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("productos_pagina", {
      // undefined y no null: los parámetros del RPC son OPCIONALES, y
      // PostgREST omite del cuerpo lo que llega como undefined para que
      // Postgres aplique el DEFAULT de la función. Un null explícito es un
      // valor, no una ausencia.
      p_cursor: filtros.cursor ?? undefined,
      p_limit: POR_PAGINA + 1,
      p_q: filtros.q ?? undefined,
      p_familia: filtros.familia ?? undefined,
      p_subfamilia: filtros.subfamilia ?? undefined,
      p_tipo: filtros.tipo ?? undefined,
      p_marca: filtros.marca ?? undefined,
      p_archivados: filtros.archivados ?? false,
    });

    if (error) return fallo(error);

    const todas = (data ?? []) as unknown as ProductoLista[];
    const hayMas = todas.length > POR_PAGINA;
    const filas = hayMas ? todas.slice(0, POR_PAGINA) : todas;

    return {
      ok: true,
      datos: {
        filas,
        siguiente: hayMas ? (filas[filas.length - 1]?.codigo_norm ?? null) : null,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Indicadores de la cabecera.
 *
 * Los conteos se piden con `head: true` y `count: "exact"`: Postgres cuenta y
 * no devuelve ni una fila, así que traer los cuatro números no mueve datos.
 * El valorizado sale de `v_valorizacion_inventario`, que ya agrega por subfamilia.
 *
 * Las cinco consultas van en paralelo; encadenarlas multiplicaría por cinco la
 * latencia de una cabecera que no tiene dependencias internas.
 */
export async function resumenCatalogo(): Promise<Resultado<ResumenCatalogo>> {
  try {
    const supabase = await clienteServidor();
    const activos = () =>
      supabase
        .from("v_productos_stock")
        .select("id", { count: "exact", head: true });

    const [total, sinStock, criticos, sobrestock, valorizacion] =
      await Promise.all([
        activos(),
        activos().lte("stock", 0),
        activos().eq("estado_stock", "critico"),
        activos().eq("estado_stock", "sobrestock"),
        supabase.from("v_valorizacion_inventario").select("valor_costo"),
      ]);

    const primerError =
      total.error ??
      sinStock.error ??
      criticos.error ??
      sobrestock.error ??
      valorizacion.error;
    if (primerError) return fallo(primerError);

    const valorizado = (valorizacion.data ?? []).reduce(
      (suma, fila) => suma + Number(fila.valor_costo ?? 0),
      0,
    );

    return {
      ok: true,
      datos: {
        total: total.count ?? 0,
        sinStock: sinStock.count ?? 0,
        criticos: criticos.count ?? 0,
        sobrestock: sobrestock.count ?? 0,
        valorizado,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Catálogos de los desplegables de filtro.
 *
 * Las tres consultas van en paralelo: son independientes y encadenarlas
 * triplicaría la latencia de la cabecera sin ganar nada.
 */
export async function opcionesDeFiltro(): Promise<
  Resultado<{ marcas: Opcion[]; familias: Opcion[]; subfamilias: Opcion[] }>
> {
  try {
    const supabase = await clienteServidor();

    const [marcas, familias, subfamilias] = await Promise.all([
      supabase.from("marcas").select("id, nombre").order("nombre"),
      supabase.from("familias").select("id, nombre").order("nombre"),
      // familia_id para poder encadenar el desplegable de subfamilia al de
      // familia: sin él se podían combinar dos niveles incompatibles y la
      // tabla salía vacía sin que se entendiera por qué.
      supabase.from("subfamilias").select("id, nombre, familia_id").order("nombre"),
    ]);

    const primerError = marcas.error ?? familias.error ?? subfamilias.error;
    if (primerError) return fallo(primerError);

    return {
      ok: true,
      datos: {
        marcas: (marcas.data ?? []) as Opcion[],
        familias: (familias.data ?? []) as Opcion[],
        subfamilias: (subfamilias.data ?? []) as Opcion[],
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Todo lo que necesitan los desplegables del formulario de producto.
 *
 * Los tres niveles de la jerarquía se traen COMPLETOS y se encadenan en el
 * navegador. Son 3 familias, 17 subfamilias y 61 tipos: pedirlos por separado
 * en cada cambio de desplegable serían tres viajes al servidor por producto
 * dado de alta, para ahorrar unos pocos kilobytes.
 */
export async function catalogosParaProducto(): Promise<
  Resultado<{
    marcas: { id: string; nombre: string }[];
    familias: { id: string; nombre: string }[];
    subfamilias: { id: string; nombre: string; familia_id: string }[];
    tipos: { id: string; nombre: string; subfamilia_id: string }[];
    unidades: { codigo: string; nombre: string; abreviatura: string }[];
    proveedores: { id: string; razon_social: string }[];
  }>
> {
  try {
    const supabase = await clienteServidor();
    const [marcas, familias, subfamilias, tipos, unidades, proveedores] = await Promise.all([
      supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
      supabase.from("familias").select("id, nombre").eq("activo", true).order("orden"),
      supabase
        .from("subfamilias")
        .select("id, nombre, familia_id")
        .eq("activo", true)
        .order("orden"),
      supabase
        .from("tipos")
        .select("id, nombre, subfamilia_id")
        .eq("activo", true)
        .order("orden"),
      // La columna se llama `etiqueta`, no `nombre`. La abreviatura viaja
      // también: el desplegable enseña «Kilogramo · kg · KGM», y con 42
      // unidades del catálogo 03 (039) el código es lo que desempata entre
      // dos que suenan parecido.
      supabase
        .from("unidades_medida")
        .select("codigo, etiqueta, abreviatura")
        .eq("activo", true)
        .order("orden"),
      supabase
        .from("proveedores")
        .select("id, razon_social")
        .eq("activo", true)
        .order("razon_social"),
    ]);

    const primerError =
      marcas.error ?? familias.error ?? subfamilias.error ?? tipos.error ?? unidades.error ??
      proveedores.error;
    if (primerError) return fallo(primerError);

    return {
      ok: true,
      datos: {
        marcas: marcas.data ?? [],
        familias: familias.data ?? [],
        subfamilias: subfamilias.data ?? [],
        tipos: tipos.data ?? [],
        unidades: (unidades.data ?? []).map((u) => ({
          codigo: u.codigo,
          nombre: u.etiqueta,
          abreviatura: u.abreviatura,
        })),
        proveedores: proveedores.data ?? [],
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Un producto, para editarlo. */
export async function productoPorId(id: string): Promise<
  Resultado<{
    id: string;
    codigo: string;
    codigo_fabricante: string | null;
    descripcion: string;
    marca_id: string;
    familia_id: string;
    subfamilia_id: string;
    tipo_id: string | null;
    unidad_codigo: string;
    ultimo_costo: number;
    precio_venta: number;
    precio_minimo: number;
    stock_minimo: number;
    stock_maximo: number;
    peso_kg: number;
    ubicacion: string | null;
    precio_mercado: number;
    proveedor_id: string | null;
    archivado: boolean;
    designacion_base: string | null;
  }>
> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("productos")
      .select(
        `id, codigo, codigo_fabricante, descripcion, marca_id, familia_id,
         subfamilia_id, tipo_id, unidad_codigo, ultimo_costo, precio_venta,
         precio_minimo, stock_minimo, stock_maximo, peso_kg, ubicacion,
         precio_mercado, proveedor_id,
         archivado, designacion_base`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: false, error: "El producto no existe." };
    return { ok: true, datos: data };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Un producto con todo lo que necesita su ficha.
 *
 * Los equivalentes salen de `designacion_base`: el núcleo ISO del código, que
 * es lo único que comparten las marcas. No hace falta que nadie los capture.
 */
export async function productoConDetalle(id: string): Promise<
  Resultado<{
    id: string;
    codigo: string;
    codigo_fabricante: string | null;
    descripcion: string;
    marca: string;
    familia: string;
    subfamilia: string;
    tipo: string | null;
    unidad: string;
    stock: number;
    stock_minimo: number;
    precio_venta: number;
    precio_minimo: number;
    costo_promedio: number;
    ultimo_costo: number;
    peso_kg: number;
    ubicacion: string | null;
    precio_mercado: number;
    proveedor: string | null;
    archivado: boolean;
    motivo_archivado: string | null;
    designacion_base: string | null;
    equivalentes: {
      id: string;
      codigo: string;
      marca: string;
      stock: number;
      precio_venta: number;
    }[];
  }>
> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("productos")
      .select(
        `id, codigo, codigo_fabricante, descripcion, unidad_codigo,
         stock_minimo, precio_venta, precio_minimo, costo_promedio,
         ultimo_costo, peso_kg, ubicacion, precio_mercado,
         archivado, motivo_archivado, designacion_base,
         marcas!inner(nombre),
         proveedores(razon_social),
         subfamilias!inner(nombre, familias!inner(nombre)),
         tipos(nombre),
         stock(cantidad)`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: false, error: "El producto no existe." };

    const p = data as unknown as Record<string, never>;
    const base = (p as unknown as { designacion_base: string | null }).designacion_base;

    // Mismo núcleo ISO, otro producto. Sin base no hay nada que buscar.
    let equivalentes: {
      id: string;
      codigo: string;
      marca: string;
      stock: number;
      precio_venta: number;
    }[] = [];

    if (base) {
      const { data: eq } = await supabase
        .from("productos")
        .select("id, codigo, precio_venta, marcas!inner(nombre), stock(cantidad)")
        .eq("designacion_base", base)
        .eq("archivado", false)
        .neq("id", id)
        .limit(10);

      equivalentes = (eq ?? []).map((e) => {
        const fila = e as unknown as {
          id: string;
          codigo: string;
          precio_venta: number;
          marcas: { nombre: string };
          stock: { cantidad: number } | null;
        };
        return {
          id: fila.id,
          codigo: fila.codigo,
          marca: fila.marcas.nombre,
          stock: Number(fila.stock?.cantidad ?? 0),
          precio_venta: fila.precio_venta,
        };
      });
    }

    const f = data as unknown as {
      id: string;
      codigo: string;
      codigo_fabricante: string | null;
      descripcion: string;
      unidad_codigo: string;
      stock_minimo: number;
      precio_venta: number;
      precio_minimo: number;
      costo_promedio: number;
      ultimo_costo: number;
      peso_kg: number;
      ubicacion: string | null;
      precio_mercado: number;
      archivado: boolean;
      motivo_archivado: string | null;
      designacion_base: string | null;
      marcas: { nombre: string };
      /** Null cuando el producto no tiene proveedor habitual asignado. */
      proveedores: { razon_social: string } | null;
      /**
       * La familia llega ANIDADA dentro de la sub-familia, y no suelta.
       *
       * `productos` guarda `familia_id`, pero no tiene ninguna clave ajena a
       * `familias`: sus claves son compuestas —`(familia_id, subfamilia_id)` a
       * `subfamilias` y `(subfamilia_id, tipo_id)` a `tipos`— justamente para
       * que un producto no pueda apuntar a una sub-familia de otra familia.
       * PostgREST solo sabe anidar lo que una clave ajena declara, así que
       * pedir `familias!inner(...)` desde `productos` devuelve `PGRST200`.
       */
      subfamilias: { nombre: string; familias: { nombre: string } };
      tipos: { nombre: string } | null;
      stock: { cantidad: number } | null;
    };

    return {
      ok: true,
      datos: {
        id: f.id,
        codigo: f.codigo,
        codigo_fabricante: f.codigo_fabricante,
        descripcion: f.descripcion,
        marca: f.marcas.nombre,
        familia: f.subfamilias.familias.nombre,
        subfamilia: f.subfamilias.nombre,
        tipo: f.tipos?.nombre ?? null,
        unidad: f.unidad_codigo,
        stock: Number(f.stock?.cantidad ?? 0),
        stock_minimo: f.stock_minimo,
        precio_venta: f.precio_venta,
        precio_minimo: f.precio_minimo,
        costo_promedio: f.costo_promedio,
        ultimo_costo: f.ultimo_costo,
        peso_kg: f.peso_kg,
        ubicacion: f.ubicacion,
        precio_mercado: Number(f.precio_mercado ?? 0),
        proveedor: f.proveedores?.razon_social ?? null,
        archivado: f.archivado,
        motivo_archivado: f.motivo_archivado,
        designacion_base: f.designacion_base,
        equivalentes,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}
