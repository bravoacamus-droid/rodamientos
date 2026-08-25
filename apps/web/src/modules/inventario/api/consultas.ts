import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import {
  ETIQUETA_MOVIMIENTO,
  type FilaKardex,
  type FilaReposicion,
  type FilaValorizacion,
  type FiltrosConteo,
  type FiltrosKardex,
  type ProductoContable,
  type ResumenInventario,
  type TipoMovimiento,
} from "../dominio/tipos";

/** ¿Es este texto uno de los cuatro tipos de movimiento que existen? */
function esTipoMovimiento(v: string): v is TipoMovimiento {
  return Object.hasOwn(ETIQUETA_MOVIMIENTO, v);
}

export const POR_PAGINA = 50;

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/**
 * Valorización del inventario, agregada por subfamilia.
 *
 * Willy la pidió por su nombre (24:21): *su sistema actual no se la da*. Sale
 * entera de `v_valorizacion_inventario`, que ya agrupa y suma en Postgres, así
 * que no viajan 2.000 filas para sumarlas en el servidor de Node.
 */
export async function valorizacion(): Promise<Resultado<FilaValorizacion[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_valorizacion_inventario")
      .select("*")
      .order("valor_costo", { ascending: false });

    if (error) return fallo(error);
    return { ok: true, datos: (data ?? []) as unknown as FilaValorizacion[] };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Los números de la cabecera.
 *
 * Se derivan de la misma vista que la tabla, sumando sus filas. Son tantas
 * filas como subfamilias con productos —decenas, no miles—, así que sumar aquí
 * sale más barato que una segunda consulta agregada, y garantiza que la
 * cabecera y la tabla no puedan contradecirse.
 */
export async function resumenInventario(): Promise<Resultado<ResumenInventario>> {
  const filas = await valorizacion();
  if (!filas.ok) return filas;

  const r = filas.datos.reduce<ResumenInventario>(
    (a, f) => ({
      valorCosto: a.valorCosto + Number(f.valor_costo ?? 0),
      valorVenta: a.valorVenta + Number(f.valor_venta ?? 0),
      margenPotencial: a.margenPotencial + Number(f.margen_potencial ?? 0),
      unidades: a.unidades + Number(f.unidades ?? 0),
      skus: a.skus + Number(f.skus ?? 0),
      skusConStock: a.skusConStock + Number(f.skus_con_stock ?? 0),
    }),
    {
      valorCosto: 0,
      valorVenta: 0,
      margenPotencial: 0,
      unidades: 0,
      skus: 0,
      skusConStock: 0,
    },
  );

  const dos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  return {
    ok: true,
    datos: {
      ...r,
      valorCosto: dos(r.valorCosto),
      valorVenta: dos(r.valorVenta),
      margenPotencial: dos(r.margenPotencial),
      unidades: dos(r.unidades),
    },
  };
}

/**
 * Lo que hay que reponer y lo que sobra.
 *
 * `v_reposicion` ya filtra a los estados que exigen atención y traduce el
 * saldo a días de cobertura, que es como Willy decide comprar. El sobrestock
 * entra en la misma lista a propósito: *"tengo 80 rodamientos que no sé cómo
 * vender"* (25:21) es capital inmovilizado, y duele igual que un quiebre.
 */
export async function reposicion(
  limite = 100,
): Promise<Resultado<FilaReposicion[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_reposicion")
      .select("*")
      // Lo más urgente arriba: primero lo que no tiene con qué aguantar.
      .order("dias_cobertura", { ascending: true, nullsFirst: false })
      .order("valorizado", { ascending: false })
      .limit(limite);

    if (error) return fallo(error);
    return { ok: true, datos: (data ?? []) as unknown as FilaReposicion[] };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Kardex, paginado por keyset.
 *
 * El cursor es el `id` del movimiento, que es una identidad siempre creciente:
 * ordena igual que la fecha para lo que importa —el orden en que ocurrieron—
 * y además desempata dos movimientos del mismo instante, que es justo lo que
 * pasa cuando una recepción registra sus líneas de una tacada.
 */
export async function kardex(
  filtros: FiltrosKardex,
): Promise<Resultado<{ filas: FilaKardex[]; siguiente: string | null }>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("v_kardex")
      .select("*")
      .order("id", { ascending: false })
      .limit(POR_PAGINA + 1);

    if (filtros.cursor) consulta = consulta.lt("id", Number(filtros.cursor));
    if (filtros.producto) consulta = consulta.eq("producto_id", filtros.producto);
    // El tipo llega de la URL, así que se contrasta contra el enum antes de
    // usarlo: un `?tipo=loquesea` no tiene por qué llegar a Postgres para que
    // este lo rechace con un error que no se le puede enseñar a nadie.
    if (filtros.tipo && esTipoMovimiento(filtros.tipo)) {
      consulta = consulta.eq("tipo", filtros.tipo);
    }
    if (filtros.referencia) consulta = consulta.eq("referencia_tipo", filtros.referencia);
    if (filtros.desde) consulta = consulta.gte("fecha", filtros.desde);
    // `hasta` es un día y `fecha` lleva hora: sin llevarlo al final del día, un
    // movimiento de las 3 de la tarde quedaría fuera de su propio día.
    if (filtros.hasta) consulta = consulta.lte("fecha", `${filtros.hasta}T23:59:59.999Z`);

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const todas = (data ?? []) as unknown as FilaKardex[];
    const hayMas = todas.length > POR_PAGINA;
    const filas = hayMas ? todas.slice(0, POR_PAGINA) : todas;

    return {
      ok: true,
      datos: {
        filas,
        siguiente: hayMas ? String(filas[filas.length - 1]?.id ?? "") || null : null,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Un producto concreto, para encabezar su kardex. */
export async function productoDelKardex(
  id: string,
): Promise<Resultado<{ codigo: string; descripcion: string; stock: number } | null>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_productos_stock")
      .select("codigo, descripcion, stock")
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    return {
      ok: true,
      datos: data
        ? {
            codigo: String(data.codigo),
            descripcion: String(data.descripcion),
            stock: Number(data.stock ?? 0),
          }
        : null,
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Los productos que se van a contar en el cuadre.
 *
 * Se carga por FILTRO y no buscando de uno en uno: un cuadre se hace contra
 * una estantería, una familia o el almacén entero, no producto a producto. El
 * tope es alto pero existe — una hoja de conteo de 2.000 líneas en el
 * navegador no la usa nadie, y es la señal de que hay que filtrar más.
 */
export async function productosParaContar(
  filtros: FiltrosConteo,
  limite = 400,
): Promise<Resultado<{ filas: ProductoContable[]; truncado: boolean }>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("v_productos_stock")
      .select("id, codigo, descripcion, marca, subfamilia, unidad, stock, costo_promedio")
      .eq("archivado", false)
      .order("codigo_norm")
      .limit(limite + 1);

    if (filtros.familia) consulta = consulta.eq("familia_id", filtros.familia);
    if (filtros.marca) consulta = consulta.eq("marca_id", filtros.marca);
    if (filtros.soloConStock) consulta = consulta.gt("stock", 0);

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const todas = (data ?? []) as unknown as ProductoContable[];
    const truncado = todas.length > limite;

    return {
      ok: true,
      datos: { filas: truncado ? todas.slice(0, limite) : todas, truncado },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Familias y marcas, para los desplegables del cuadre y del kardex. */
export async function opcionesDeInventario(): Promise<
  Resultado<{
    familias: { id: string; nombre: string }[];
    marcas: { id: string; nombre: string }[];
  }>
> {
  try {
    const supabase = await clienteServidor();
    const [familias, marcas] = await Promise.all([
      supabase.from("familias").select("id, nombre").eq("activo", true).order("nombre"),
      supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    ]);

    const primerError = familias.error ?? marcas.error;
    if (primerError) return fallo(primerError);

    return {
      ok: true,
      datos: {
        familias: (familias.data ?? []) as { id: string; nombre: string }[],
        marcas: (marcas.data ?? []) as { id: string; nombre: string }[],
      },
    };
  } catch (e) {
    return fallo(e);
  }
}
