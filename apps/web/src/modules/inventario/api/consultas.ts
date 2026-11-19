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
  type ResumenKardex,
  type TipoMovimiento,
} from "../dominio/tipos";
import { rangoLima } from "../dominio/filtros-kardex";

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
    // Columnas explícitas y no `select("*")`: es la regla del archivo, y
    // aquí faltaba. La vista SÍ se puede leer entera —agrupa por subfamilia
    // en Postgres, así que son decenas de filas y no una por producto— pero
    // con `*` viajan columnas que nadie pinta. Ver PENDIENTES §0.4.
    const { data, error } = await supabase
      .from("v_valorizacion_inventario")
      .select(
        "familia_id, familia, subfamilia_id, subfamilia, skus, skus_con_stock, unidades, valor_costo, valor_venta, margen_potencial",
      )
      .order("valor_costo", { ascending: false });

    if (error) return fallo(error, "inventario/valorizacion");
    return { ok: true, datos: (data ?? []) as unknown as FilaValorizacion[] };
  } catch (e) {
    return fallo(e, "inventario/valorizacion");
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
 *
 * Lo que está a cero SIN mínimo, sin máximo y sin una sola salida en 90 días
 * no se lista: se cuenta (revisión por módulos del 02/10). Con el catálogo
 * recién cargado del Excel eran los 789 productos, y la tabla enseñaba cien
 * filas de «0 · sin consumo · —» elegidas al azar entre ellos. Nada de eso es
 * algo que reponer —nadie lo ha pedido ni nadie lo vende— y tapaba lo que sí
 * lo es. El día que un producto tenga mínimo o se venda, vuelve a la lista.
 */
export async function reposicion(
  limite = 100,
): Promise<Resultado<{ filas: FilaReposicion[]; omitidos: number }>> {
  try {
    const supabase = await clienteServidor();
    const [lista, omitidos] = await Promise.all([
      supabase
        .from("v_reposicion")
        .select("*")
        .or(
          "estado_stock.neq.sin_stock,stock_minimo.gt.0,stock_maximo.gt.0,consumo_diario.gt.0",
        )
        // Lo más urgente arriba: primero lo que no tiene con qué aguantar.
        .order("dias_cobertura", { ascending: true, nullsFirst: false })
        .order("valorizado", { ascending: false })
        .limit(limite),
      supabase
        .from("v_reposicion")
        .select("id", { count: "exact", head: true })
        .eq("estado_stock", "sin_stock")
        .lte("stock_minimo", 0)
        .lte("stock_maximo", 0)
        .lte("consumo_diario", 0),
    ]);

    if (lista.error) return fallo(lista.error, "inventario/reposicion");
    return {
      ok: true,
      datos: {
        filas: (lista.data ?? []) as unknown as FilaReposicion[],
        // Si el conteo falla no se inventa: se queda en cero y la lista,
        // que es lo que importa, sale igual.
        omitidos: omitidos.count ?? 0,
      },
    };
  } catch (e) {
    return fallo(e, "inventario/reposicion");
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
): Promise<
  Resultado<{
    filas: FilaKardex[];
    siguiente: string | null;
    anterior: string | null;
  }>
> {
  try {
    const supabase = await clienteServidor();

    const atras = filtros.direccion === "ant" && Boolean(filtros.cursor);

    let consulta = supabase
      .from("v_kardex")
      .select("*")
      .order("id", { ascending: atras })
      .limit((filtros.limite ?? POR_PAGINA) + 1);

    // Hacia atrás, lo que está POR ENCIMA del cursor y en orden ascendente;
    // el array se da la vuelta al final.
    if (filtros.cursor) {
      const desde = Number(filtros.cursor);
      consulta = atras ? consulta.gt("id", desde) : consulta.lt("id", desde);
    }
    consulta = filtrarKardex(consulta, filtros);

    const { data, error } = await consulta;
    if (error) return fallo(error, "inventario/kardex");

    const todas = (data ?? []) as unknown as FilaKardex[];
    /*
      El corte usa el MISMO número que el límite.

      Aquí estaba la mitad del fallo del selector de filas (10/09): se pedían
      `limite + 1` para saber si hay siguiente, pero se cortaba por
      `POR_PAGINA` —una constante— así que con 25 pedidas se pintaban 26.
    */
    const porPagina = filtros.limite ?? POR_PAGINA;
    const hayMas = todas.length > porPagina;
    const recortadas = hayMas ? todas.slice(0, porPagina) : todas;

    // Se recorta primero y se da la vuelta después: yendo hacia atrás la fila
    // «de más» sobra por arriba.
    const filas = atras ? [...recortadas].reverse() : recortadas;

    const idDe = (f: FilaKardex | undefined) =>
      f ? String(f.id ?? "") || null : null;
    const primera = idDe(filas[0]);
    const ultima = idDe(filas[filas.length - 1]);

    return {
      ok: true,
      datos: {
        filas,
        // Yendo hacia atrás siempre hay siguiente —se viene de ahí—; yendo
        // hacia adelante, siempre hay anterior salvo en la primera página.
        siguiente: atras ? ultima : hayMas ? ultima : null,
        anterior: atras ? (hayMas ? primera : null) : filtros.cursor ? primera : null,
      },
    };
  } catch (e) {
    return fallo(e, "inventario/kardex");
  }
}

/**
 * Los filtros del kardex sobre una consulta a `v_kardex` (19/11). Los usan
 * la lista y la exportación, así que lo que se ve es lo que se baja.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtrarKardex<Q extends { eq: any; gte: any; lte: any; or: any }>(consulta: Q, filtros: FiltrosKardex): Q {
  let c = consulta;
  if (filtros.producto) c = c.eq("producto_id", filtros.producto);
  if (filtros.familia) c = c.eq("familia_id", filtros.familia);
  if (filtros.subfamilia) c = c.eq("subfamilia_id", filtros.subfamilia);
  if (filtros.marca) c = c.eq("marca_id", filtros.marca);
  if (filtros.usuario) c = c.eq("usuario_id", filtros.usuario);
  // El tipo llega de la URL, así que se contrasta contra el enum antes de
  // usarlo: un `?tipo=loquesea` no tiene por qué llegar a Postgres para que
  // este lo rechace con un error que no se le puede enseñar a nadie.
  if (filtros.tipo && esTipoMovimiento(filtros.tipo)) c = c.eq("tipo", filtros.tipo);
  if (filtros.referencia) c = c.eq("referencia_tipo", filtros.referencia);
  // En hora de Lima (19/11): con la medianoche de Greenwich, lo movido a las
  // 8 de la noche caía en el día siguiente.
  const rango = rangoLima(filtros.desde, filtros.hasta);
  if (rango.desde) c = c.gte("fecha", rango.desde);
  if (rango.hasta) c = c.lte("fecha", rango.hasta);
  if (filtros.q) {
    const q = filtros.q.replace(/[,()*%\\]/g, " ").trim();
    if (q) {
      c = c.or(
        `codigo.ilike.%${q}%,descripcion.ilike.%${q}%,codigo_fabricante.ilike.%${q}%,referencia_numero.ilike.%${q}%`,
      );
    }
  }
  return c;
}

/** Los totales del kardex con los filtros de la lista (201). */
export async function resumenKardex(filtros: FiltrosKardex): Promise<Resultado<ResumenKardex>> {
  try {
    const supabase = await clienteServidor();
    const rango = rangoLima(filtros.desde, filtros.hasta);
    const { data, error } = await supabase.rpc("kardex_resumen", {
      p_producto: filtros.producto,
      p_familia: filtros.familia,
      p_subfamilia: filtros.subfamilia,
      p_marca: filtros.marca,
      p_tipo: filtros.tipo && esTipoMovimiento(filtros.tipo) ? filtros.tipo : undefined,
      p_referencia: filtros.referencia,
      p_usuario: filtros.usuario,
      p_texto: filtros.q,
      p_desde: rango.desde,
      p_hasta: rango.hasta,
    });
    if (error) return fallo(error, "inventario/resumenKardex");
    const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    const n = (v: unknown) => Number(v ?? 0);
    const oNulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return {
      ok: true,
      datos: {
        movimientos: n(r?.movimientos),
        productos: n(r?.productos),
        entradas: n(r?.entradas),
        salidas: n(r?.salidas),
        valorEntradas: n(r?.valor_entradas),
        valorSalidas: n(r?.valor_salidas),
        saldoInicial: oNulo(r?.saldo_inicial),
        saldoFinal: oNulo(r?.saldo_final),
      },
    };
  } catch (e) {
    return fallo(e, "inventario/resumenKardex");
  }
}

/** Tope de la exportación: un kardex de más filas no se lee en papel. */
export const TOPE_EXPORTAR = 10000;

/**
 * El kardex entero con los filtros, para el Excel y el PDF: del más ANTIGUO
 * al más reciente, que es como se lee un libro (el saldo va corriendo hacia
 * abajo). De mil en mil, que es el tope de PostgREST.
 */
export async function kardexParaExportar(
  filtros: FiltrosKardex,
): Promise<Resultado<{ filas: FilaKardex[]; truncado: boolean }>> {
  try {
    const supabase = await clienteServidor();
    const filas: FilaKardex[] = [];
    const PAGINA = 1000;
    for (let desde = 0; desde < TOPE_EXPORTAR; desde += PAGINA) {
      const { data, error } = await filtrarKardex(
        supabase
          .from("v_kardex")
          .select(
            "id, fecha, producto_id, codigo, descripcion, tipo, entrada, salida, costo_unitario, saldo_cantidad, saldo_valorizado, costo_promedio, referencia_tipo, referencia_id, referencia_numero, motivo, usuario, codigo_fabricante, unidad_codigo, marca, familia, subfamilia",
          )
          .order("id", { ascending: true }),
        filtros,
      ).range(desde, desde + PAGINA - 1);
      if (error) return fallo(error, "inventario/kardexParaExportar");
      const lote = (data ?? []) as unknown as FilaKardex[];
      filas.push(...lote);
      if (lote.length < PAGINA) return { ok: true, datos: { filas, truncado: false } };
    }
    return { ok: true, datos: { filas: filas.slice(0, TOPE_EXPORTAR), truncado: true } };
  } catch (e) {
    return fallo(e, "inventario/kardexParaExportar");
  }
}

/** Los desplegables del kardex: familias, subfamilias, marcas y usuarios. */
export async function opcionesDelKardex(): Promise<
  Resultado<{
    familias: { id: string; nombre: string }[];
    subfamilias: { id: string; nombre: string; familia_id: string }[];
    marcas: { id: string; nombre: string }[];
    usuarios: { id: string; nombre: string }[];
  }>
> {
  try {
    const supabase = await clienteServidor();
    const [familias, subfamilias, marcas, usuarios] = await Promise.all([
      supabase.from("familias").select("id, nombre").order("nombre"),
      supabase.from("subfamilias").select("id, nombre, familia_id").order("nombre"),
      supabase.from("marcas").select("id, nombre").order("nombre"),
      supabase.from("perfiles").select("id, nombre").order("nombre"),
    ]);
    const primerError = familias.error ?? subfamilias.error ?? marcas.error ?? usuarios.error;
    if (primerError) return fallo(primerError, "inventario/opcionesDelKardex");
    return {
      ok: true,
      datos: {
        familias: (familias.data ?? []) as { id: string; nombre: string }[],
        subfamilias: (subfamilias.data ?? []) as { id: string; nombre: string; familia_id: string }[],
        marcas: (marcas.data ?? []) as { id: string; nombre: string }[],
        usuarios: ((usuarios.data ?? []) as { id: string; nombre: string | null }[]).map((u) => ({
          id: u.id,
          nombre: u.nombre ?? "(sin nombre)",
        })),
      },
    };
  } catch (e) {
    return fallo(e, "inventario/opcionesDelKardex");
  }
}

/** Los nombres de lo filtrado, para la cabecera del Excel y del PDF. */
export async function nombresDeFiltrosKardex(filtros: FiltrosKardex): Promise<{
  producto: string | null;
  familia: string | null;
  subfamilia: string | null;
  marca: string | null;
  usuario: string | null;
}> {
  const supabase = await clienteServidor();
  const nombre = async (tabla: "familias" | "subfamilias" | "marcas" | "perfiles", id?: string) => {
    if (!id) return null;
    const { data } = await supabase.from(tabla).select("nombre").eq("id", id).maybeSingle();
    return (data?.nombre as string | null | undefined) ?? null;
  };
  const producto = async () => {
    if (!filtros.producto) return null;
    const { data } = await supabase
      .from("productos")
      .select("codigo, descripcion")
      .eq("id", filtros.producto)
      .maybeSingle();
    return data ? `${data.codigo} (${data.descripcion})` : null;
  };
  const [p, familia, subfamilia, marca, usuario] = await Promise.all([
    producto(),
    nombre("familias", filtros.familia),
    nombre("subfamilias", filtros.subfamilia),
    nombre("marcas", filtros.marca),
    nombre("perfiles", filtros.usuario),
  ]);
  return { producto: p, familia, subfamilia, marca, usuario };
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

    if (error) return fallo(error, "inventario/productoDelKardex");
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
    return fallo(e, "inventario/productoDelKardex");
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
    if (filtros.subfamilia) consulta = consulta.eq("subfamilia_id", filtros.subfamilia);
    if (filtros.marca) consulta = consulta.eq("marca_id", filtros.marca);
    // Por código o descripción (19/11): para traer a la hoja un producto o
    // unos pocos sin tener que cargar la familia entera.
    if (filtros.q) {
      const q = filtros.q.replace(/[,()*%\\]/g, " ").trim();
      if (q) consulta = consulta.or(`codigo.ilike.%${q}%,codigo_fabricante.ilike.%${q}%,descripcion.ilike.%${q}%`);
    }
    if (filtros.soloConStock) consulta = consulta.gt("stock", 0);

    const { data, error } = await consulta;
    if (error) return fallo(error, "inventario/productosParaContar");

    const todas = (data ?? []) as unknown as ProductoContable[];
    const truncado = todas.length > limite;

    return {
      ok: true,
      datos: { filas: truncado ? todas.slice(0, limite) : todas, truncado },
    };
  } catch (e) {
    return fallo(e, "inventario/productosParaContar");
  }
}

/** Familias, subfamilias y marcas, para los desplegables del cuadre. */
export async function opcionesDeInventario(): Promise<
  Resultado<{
    familias: { id: string; nombre: string }[];
    subfamilias: { id: string; nombre: string; familia_id: string }[];
    marcas: { id: string; nombre: string }[];
  }>
> {
  try {
    const supabase = await clienteServidor();
    const [familias, subfamilias, marcas] = await Promise.all([
      supabase.from("familias").select("id, nombre").eq("activo", true).order("nombre"),
      supabase.from("subfamilias").select("id, nombre, familia_id").order("nombre"),
      supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    ]);

    const primerError = familias.error ?? subfamilias.error ?? marcas.error;
    if (primerError) return fallo(primerError);

    return {
      ok: true,
      datos: {
        familias: (familias.data ?? []) as { id: string; nombre: string }[],
        subfamilias: (subfamilias.data ?? []) as { id: string; nombre: string; familia_id: string }[],
        marcas: (marcas.data ?? []) as { id: string; nombre: string }[],
      },
    };
  } catch (e) {
    return fallo(e, "inventario/opcionesDeInventario");
  }
}
