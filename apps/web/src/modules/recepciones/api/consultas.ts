import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";
import { cursorDe, filtroCursor } from "@/lib/orden-reciente";

import { fallo } from "@/lib/errores";
import { repartoDeCompra } from "../dominio/costeo";

import type {
  CompraPendiente,
  FiltrosRecepciones,
  RecepcionDetalle,
  RecepcionLista,
} from "../dominio/tipos";

export const POR_PAGINA = 30;

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/** Lo que PostgREST devuelve al anidar un producto con su marca. */
interface ProductoAnidado {
  codigo: string;
  descripcion: string;
  unidad_codigo: string;
  marcas: { nombre: string } | null;
}

/**
 * Listado de recepciones.
 *
 * Keyset sobre `numero` descendente, igual que cotizaciones: el número es
 * `REC-26-00001`, con año de dos cifras y relleno de ceros, así que ordena
 * bien como texto y no hace falta un índice aparte ni un OFFSET que se
 * degrada. Se pide un elemento de más para saber si hay página siguiente sin
 * pagar un `count` sobre toda la tabla.
 */
export async function listarRecepciones(
  filtros: FiltrosRecepciones,
): Promise<
  Resultado<{
    filas: RecepcionLista[];
    siguiente: string | null;
    anterior: string | null;
  }>
> {
  try {
    const supabase = await clienteServidor();

    const atras = filtros.direccion === "ant" && Boolean(filtros.cursor);

    // De `v_recepciones_lista` (202): trae ya sumadas las líneas y el valor,
    // y deja filtrar por los productos que trae cada recepción.
    let consulta = supabase
      .from("v_recepciones_lista")
      .select(
        `id, creado_en, numero, fecha, guia_proveedor, factura_proveedor, anulada, moneda,
         proveedor, compra_numero, recibido_por_nombre, items, valorizado`,
      )
      // Lo último arriba: fecha, hora de creación y número (12/10, ver lib/orden-reciente).
      .order("fecha", { ascending: atras })
      .order("creado_en", { ascending: atras })
      .order("numero", { ascending: atras })
      .limit((filtros.limite ?? POR_PAGINA) + 1);

    /*
      Ir hacia atrás es el mismo keyset del revés: se pide lo que está POR
      ENCIMA del cursor, en orden ascendente, y al final se le da la vuelta al
      array. Mismo arreglo que en guías, facturación, compras y cotizaciones.
    */
    const desdeCursor = filtroCursor(filtros.cursor, atras, "fecha");
    if (desdeCursor) consulta = consulta.or(desdeCursor);
    consulta = filtrarRecepciones(consulta, filtros);

    const { data, error } = await consulta;
    if (error) return fallo(error, "recepciones/listarRecepciones");

    const crudas = (data ?? []) as unknown as Record<string, unknown>[];
    const todas: RecepcionLista[] = crudas.map(aLista);

    /*
      El corte usa el MISMO número que el límite, no la constante: es la mitad
      del fallo del selector de filas —se pedían `limite + 1` y se cortaba por
      `POR_PAGINA`, así que con 25 pedidas salían 26—.
    */
    const porPagina = filtros.limite ?? POR_PAGINA;
    const hayMas = todas.length > porPagina;
    const recortadas = hayMas ? todas.slice(0, porPagina) : todas;

    /*
      Yendo hacia atrás, la fila «de más» sobra por ARRIBA y el orden viene
      invertido. Se recorta primero y se da la vuelta después: al revés se
      descartaría la fila equivocada.
    */
    const filas = atras ? [...recortadas].reverse() : recortadas;

    const claves = new Map(
      crudas.map((c) => [String(c.id), { fecha: String(c.fecha), creado: String(c.creado_en), numero: String(c.numero) }]),
    );
    const primera = cursorDe(claves.get(filas[0]?.id ?? ""));
    const ultima = cursorDe(claves.get(filas[filas.length - 1]?.id ?? ""));

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
    return fallo(e, "recepciones/listarRecepciones");
  }
}

/**
 * Los filtros de la lista sobre `v_recepciones_lista` (19/11). Los usan la
 * pantalla, el resumen y la exportación: lo que se ve es lo que se baja.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function filtrarRecepciones<Q extends { eq: any; gte: any; lte: any; or: any; ilike: any; contains: any }>(
  consulta: Q,
  filtros: FiltrosRecepciones,
): Q {
  let c = consulta;
  if (filtros.proveedor) c = c.eq("proveedor_id", filtros.proveedor);
  if (filtros.usuario) c = c.eq("recibido_por", filtros.usuario);
  if (filtros.moneda) c = c.eq("moneda", filtros.moneda);
  if (filtros.estado) c = c.eq("anulada", filtros.estado === "anuladas");
  if (filtros.familia) c = c.contains("familia_ids", [filtros.familia]);
  if (filtros.subfamilia) c = c.contains("subfamilia_ids", [filtros.subfamilia]);
  if (filtros.marca) c = c.contains("marca_ids", [filtros.marca]);
  if (filtros.desde) c = c.gte("fecha", filtros.desde);
  if (filtros.hasta) c = c.lte("fecha", filtros.hasta);
  if (filtros.producto) {
    // Cada palabra tiene que estar: «6205 2rs» encuentra «6205-2RS1/C3».
    for (const palabra of filtros.producto.split(" ").filter(Boolean)) {
      c = c.ilike("productos_texto", `%${palabra}%`);
    }
  }
  if (filtros.q) {
    // Por lo que se busca una recepción concreta: su número, la orden de
    // compra, o el documento del proveedor que se tiene delante en papel.
    c = c.or(
      `numero.ilike.%${filtros.q}%,guia_proveedor.ilike.%${filtros.q}%,factura_proveedor.ilike.%${filtros.q}%,compra_numero.ilike.%${filtros.q}%,proveedor.ilike.%${filtros.q}%`,
    );
  }
  return c;
}

/** Una fila de `v_recepciones_lista`, como la pinta la lista. */
function aLista(r: Record<string, unknown>): RecepcionLista {
  return {
    id: String(r.id),
    numero: String(r.numero),
    fecha: String(r.fecha),
    proveedor: (r.proveedor as string | null) ?? null,
    compra_numero: (r.compra_numero as string | null) ?? null,
    guia_proveedor: (r.guia_proveedor as string | null) ?? null,
    factura_proveedor: (r.factura_proveedor as string | null) ?? null,
    recibido_por: (r.recibido_por_nombre as string | null) ?? null,
    anulada: Boolean(r.anulada),
    moneda: r.moneda === "PEN" ? "PEN" : "USD",
    items: Number(r.items ?? 0),
    // Sin los gastos prorrateados: es lo que se le pagó al proveedor, que es
    // contra lo que se cuadra la factura.
    valorizado: Number(r.valorizado ?? 0),
  };
}

/** Tope de la exportación y del resumen. */
export const TOPE_RECEPCIONES = 5000;

/**
 * Todas las recepciones del filtro, de la más antigua a la más reciente, para
 * el resumen y la exportación. De mil en mil, el tope de PostgREST.
 */
export async function recepcionesParaExportar(
  filtros: FiltrosRecepciones,
): Promise<Resultado<{ filas: RecepcionLista[]; truncado: boolean }>> {
  try {
    const supabase = await clienteServidor();
    const filas: RecepcionLista[] = [];
    for (let desde = 0; desde < TOPE_RECEPCIONES; desde += 1000) {
      const { data, error } = await filtrarRecepciones(
        supabase
          .from("v_recepciones_lista")
          .select(
            "id, numero, fecha, guia_proveedor, factura_proveedor, anulada, moneda, proveedor, compra_numero, recibido_por_nombre, items, valorizado",
          )
          .order("fecha", { ascending: true })
          .order("creado_en", { ascending: true }),
        filtros,
      ).range(desde, desde + 999);
      if (error) return fallo(error, "recepciones/recepcionesParaExportar");
      const lote = ((data ?? []) as unknown as Record<string, unknown>[]).map(aLista);
      filas.push(...lote);
      if (lote.length < 1000) return { ok: true, datos: { filas, truncado: false } };
    }
    return { ok: true, datos: { filas: filas.slice(0, TOPE_RECEPCIONES), truncado: true } };
  } catch (e) {
    return fallo(e, "recepciones/recepcionesParaExportar");
  }
}

/** Una línea recibida, para la hoja «Detalle» del Excel. */
export interface LineaExportada {
  recepcion_id: string;
  codigo: string;
  descripcion: string;
  marca: string;
  familia: string;
  subfamilia: string;
  unidad: string;
  cantidad: number;
  costo_unitario: number;
}

/** Las líneas de esas recepciones, de cien en cien para no alargar la URL. */
export async function lineasDeRecepciones(ids: string[]): Promise<Resultado<LineaExportada[]>> {
  try {
    const supabase = await clienteServidor();
    const salida: LineaExportada[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase
        .from("recepcion_items")
        .select("recepcion_id, cantidad, costo_unitario, productos(codigo, descripcion, unidad_codigo, marcas(nombre), subfamilias(nombre, familias(nombre)))")
        .in("recepcion_id", ids.slice(i, i + 100));
      if (error) return fallo(error, "recepciones/lineasDeRecepciones");
      for (const r of (data ?? []) as unknown as Array<{
        recepcion_id: string;
        cantidad: number;
        costo_unitario: number;
        productos: {
          codigo: string;
          descripcion: string;
          unidad_codigo: string | null;
          marcas: { nombre: string } | null;
          subfamilias: { nombre: string; familias: { nombre: string } | null } | null;
        } | null;
      }>) {
        salida.push({
          recepcion_id: r.recepcion_id,
          codigo: r.productos?.codigo ?? "",
          descripcion: r.productos?.descripcion ?? "",
          marca: r.productos?.marcas?.nombre ?? "",
          familia: r.productos?.subfamilias?.familias?.nombre ?? "",
          subfamilia: r.productos?.subfamilias?.nombre ?? "",
          unidad: r.productos?.unidad_codigo ?? "",
          cantidad: Number(r.cantidad ?? 0),
          costo_unitario: Number(r.costo_unitario ?? 0),
        });
      }
    }
    return { ok: true, datos: salida };
  } catch (e) {
    return fallo(e, "recepciones/lineasDeRecepciones");
  }
}

/** Los desplegables nuevos: familias, subfamilias, marcas y quién recibe. */
export async function opcionesDeFiltroRecepciones(): Promise<
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
    if (primerError) return fallo(primerError, "recepciones/opcionesDeFiltro");
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
    return fallo(e, "recepciones/opcionesDeFiltro");
  }
}

/** Los nombres de lo filtrado, para la cabecera del Excel y del PDF. */
export async function nombresDeFiltrosRecepciones(f: FiltrosRecepciones) {
  const supabase = await clienteServidor();
  const nombre = async (
    tabla: "familias" | "subfamilias" | "marcas" | "perfiles",
    id?: string,
  ): Promise<string | null> => {
    if (!id) return null;
    const { data } = await supabase.from(tabla).select("nombre").eq("id", id).maybeSingle();
    return (data?.nombre as string | null | undefined) ?? null;
  };
  const proveedor = async () => {
    if (!f.proveedor) return null;
    const { data } = await supabase.from("proveedores").select("razon_social").eq("id", f.proveedor).maybeSingle();
    return (data?.razon_social as string | undefined) ?? null;
  };
  const [p, familia, subfamilia, marca, usuario] = await Promise.all([
    proveedor(),
    nombre("familias", f.familia),
    nombre("subfamilias", f.subfamilia),
    nombre("marcas", f.marca),
    nombre("perfiles", f.usuario),
  ]);
  return { proveedor: p, familia, subfamilia, marca, usuario };
}

/** La ficha de una recepción, con sus líneas. */
export async function detalleRecepcion(
  id: string,
): Promise<Resultado<RecepcionDetalle | null>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("recepciones")
      .select(
        `id, numero, fecha, compra_id, guia_proveedor, factura_proveedor,
         observaciones, anulada, creado_en, moneda, tipo_cambio,
         proveedores(razon_social, numero_documento),
         compras(numero),
         perfiles(nombre),
         recepcion_items(
           id, producto_id, cantidad, costo_unitario,
           productos(codigo, descripcion, unidad_codigo, marcas(nombre))
         )`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error, "recepciones/detalleRecepcion");
    if (!data) return { ok: true, datos: null };

    const r = data as unknown as Record<string, unknown> & {
      proveedores: { razon_social: string; numero_documento: string | null } | null;
      compras: { numero: string } | null;
      perfiles: { nombre: string } | null;
      recepcion_items: Array<{
        id: string;
        producto_id: string;
        cantidad: number;
        costo_unitario: number;
        productos: ProductoAnidado | null;
      }> | null;
    };

    return {
      ok: true,
      datos: {
        id: String(r.id),
        numero: String(r.numero),
        fecha: String(r.fecha),
        proveedor: r.proveedores?.razon_social ?? null,
        proveedor_documento: r.proveedores?.numero_documento ?? null,
        moneda: r.moneda === "PEN" ? "PEN" : "USD",
        tipo_cambio: Number(r.tipo_cambio) > 0 ? Number(r.tipo_cambio) : null,
        compra_id: (r.compra_id as string | null) ?? null,
        compra_numero: r.compras?.numero ?? null,
        guia_proveedor: (r.guia_proveedor as string | null) ?? null,
        factura_proveedor: (r.factura_proveedor as string | null) ?? null,
        recibido_por: r.perfiles?.nombre ?? null,
        observaciones: (r.observaciones as string | null) ?? null,
        anulada: Boolean(r.anulada),
        creado_en: String(r.creado_en),
        lineas: (r.recepcion_items ?? [])
          .map((i) => ({
            id: i.id,
            producto_id: i.producto_id,
            codigo: i.productos?.codigo ?? "—",
            marca: i.productos?.marcas?.nombre ?? null,
            descripcion: i.productos?.descripcion ?? "—",
            unidad: i.productos?.unidad_codigo ?? "NIU",
            cantidad: Number(i.cantidad ?? 0),
            costo_unitario: Number(i.costo_unitario ?? 0),
            importe:
              Math.round(Number(i.cantidad ?? 0) * Number(i.costo_unitario ?? 0) * 100) /
              100,
          }))
          // PostgREST no garantiza el orden de una relación anidada. Por
          // código, que es como el operador lee la factura del proveedor.
          .sort((a, b) => a.codigo.localeCompare(b.codigo)),
      },
    };
  } catch (e) {
    return fallo(e, "recepciones/detalleRecepcion");
  }
}

/**
 * Proveedores activos, para el desplegable del registro.
 *
 * La consulta vive en el módulo de proveedores, que es su dueño. Aquí solo se
 * reexporta con el nombre que usa esta pantalla: cuando alguien decida que un
 * proveedor de baja tampoco debe salir en las compras, se cambia en un sitio.
 */
export { proveedoresParaSelector as proveedoresActivos } from "@/modules/proveedores/api/consultas";

/**
 * Compras con mercadería todavía por llegar.
 *
 * Se traen con sus líneas para poder precargar la recepción sin un segundo
 * viaje al elegir. Son pocas por definición —una compra deja de estar
 * pendiente en cuanto llega—, así que el anidado no es caro.
 *
 * `anulada` y `recibida` quedan fuera: no hay nada que recibir de ellas.
 */
export async function comprasPendientes(): Promise<Resultado<CompraPendiente[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("compras")
      .select(
        `id, numero, fecha, proveedor_id, gastos_importacion, moneda, tipo_cambio, documento_proveedor,
         proveedores(razon_social),
         gastos_importacion_detalle:gastos_importacion(monto, reparto),
         compra_items(
           producto_id, cantidad, cantidad_recibida, costo_unitario, unidad_codigo, peso_kg,
           productos(codigo, descripcion, unidad_codigo, peso_kg, marcas(nombre))
         )`,
      )
      .in("estado", ["registrada", "recibida_parcial"])
      .order("numero", { ascending: false })
      .limit(50);

    if (error) return fallo(error, "recepciones/comprasPendientes");

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        proveedores: { razon_social: string } | null;
        gastos_importacion_detalle: { monto: number; reparto: string | null }[] | null;
        compra_items: Array<{
          producto_id: string;
          cantidad: number;
          cantidad_recibida: number;
          costo_unitario: number;
          unidad_codigo: string;
          peso_kg: number | null;
          productos: (ProductoAnidado & { peso_kg?: number | null }) | null;
        }> | null;
      }
    >;

    const compras: CompraPendiente[] = crudas.map((c) => ({
      id: String(c.id),
      numero: String(c.numero),
      fecha: String(c.fecha),
      proveedor_id: String(c.proveedor_id),
      proveedor: c.proveedores?.razon_social ?? "—",
      gastos_importacion: Number(c.gastos_importacion ?? 0),
      moneda: (c.moneda === "PEN" ? "PEN" : "USD") as "USD" | "PEN",
      tipo_cambio: c.tipo_cambio === null ? null : Number(c.tipo_cambio),
      documento_proveedor: typeof c.documento_proveedor === "string" ? c.documento_proveedor : null,
      lineas: (c.compra_items ?? []).map((i) => ({
        producto_id: i.producto_id,
        codigo: i.productos?.codigo ?? "—",
        marca: i.productos?.marcas?.nombre ?? null,
        descripcion: i.productos?.descripcion ?? "—",
        unidad: i.unidad_codigo ?? i.productos?.unidad_codigo ?? "NIU",
        cantidad: Number(i.cantidad ?? 0),
        cantidad_recibida: Number(i.cantidad_recibida ?? 0),
        costo_unitario: Number(i.costo_unitario ?? 0),
      })),
      // 097: las bases del reparto, con la misma cuenta que la base de datos.
      // El peso, el de la compra o, si no se escribió, el de la ficha.
      reparto: repartoDeCompra(
        (c.compra_items ?? []).map((i) => ({
          producto_id: i.producto_id,
          cantidad: Number(i.cantidad ?? 0),
          costo_unitario: Number(i.costo_unitario ?? 0),
          peso_kg: Number(i.peso_kg ?? 0) || Number(i.productos?.peso_kg ?? 0),
        })),
        (c.gastos_importacion_detalle ?? []).map((g) => ({
          monto: Number(g.monto ?? 0),
          reparto: g.reparto === "peso" ? ("peso" as const) : ("valor" as const),
        })),
        Number(c.gastos_importacion ?? 0),
      ),
    }));

    // Una compra en la que ya llegó todo no tiene por qué aparecer aunque su
    // estado se haya quedado atrás.
    return {
      ok: true,
      datos: compras.filter((c) =>
        c.lineas.some((l) => l.cantidad - l.cantidad_recibida > 0),
      ),
    };
  } catch (e) {
    return fallo(e, "recepciones/comprasPendientes");
  }
}

/**
 * Los papeles que se le adjuntaron a una recepción (068).
 *
 * Aparte del detalle y no dentro de él: es lo que más va a cambiar de una
 * recepción cerrada —se sube una foto, se quita la que salió movida— y
 * mezclarlo con la consulta grande obligaría a rehacerla entera por cada
 * archivo.
 */
export async function papelesDeRecepcion(
  recepcionId: string,
): Promise<Resultado<PapelDeProveedor[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("recepcion_adjuntos")
      .select("id, tipo, ruta, nombre, tamano_bytes, creado_en")
      .eq("recepcion_id", recepcionId)
      // La factura primero: es la que se busca. Y dentro de cada tipo, la más
      // antigua arriba, que es el orden en que se subieron.
      .order("tipo")
      .order("creado_en")
      .limit(50);

    if (error) return fallo(error, "recepciones/papelesDeRecepcion");

    return {
      ok: true,
      datos: (data ?? []).map((a) => ({
        id: String(a.id),
        tipo: a.tipo as PapelDeProveedor["tipo"],
        ruta: String(a.ruta),
        nombre: String(a.nombre ?? ""),
        tamanoBytes: a.tamano_bytes === null ? null : Number(a.tamano_bytes),
        creadoEn: String(a.creado_en),
      })),
    };
  } catch (e) {
    return fallo(e, "recepciones/papelesDeRecepcion");
  }
}

export interface PapelDeProveedor {
  id: string;
  tipo: "guia" | "factura" | "pago" | "otro";
  ruta: string;
  nombre: string;
  tamanoBytes: number | null;
  creadoEn: string;
}
