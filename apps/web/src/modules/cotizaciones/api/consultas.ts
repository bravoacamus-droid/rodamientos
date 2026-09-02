import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";
// La regla de a quién se le habla vive en `clientes` y la usan los dos
// módulos. Por la ruta profunda: es dominio puro, no la superficie del
// módulo, y así no arrastra nada de su `api/`.
import {
  aQuienSeLeHabla,
  type ContactoEmbebido,
} from "@/modules/clientes/dominio/contactos";

import type { ClienteOpcion } from "../dominio/cliente";
import type { Disponibilidad } from "../dominio/disponibilidad";
import type {
  CotizacionLista,
  EstadoCotizacion,
  FiltrosCotizaciones,
} from "../dominio/tipos";

export const POR_PAGINA = 30;

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/**
 * Listado de cotizaciones.
 *
 * Ordena por número descendente: lo último cotizado es lo que se consulta, y
 * el número ya es `serie-correlativo` con relleno de ceros, así que ordena
 * bien como texto sin necesidad de un índice aparte.
 *
 * Pide un elemento de más para saber si hay página siguiente sin hacer count.
 */
export async function listarCotizaciones(
  filtros: FiltrosCotizaciones,
): Promise<Resultado<{ filas: CotizacionLista[]; siguiente: string | null }>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("cotizaciones")
      .select(
        `id, numero, fecha, fecha_vencimiento, cliente_id,
         orden_compra_cliente, subtotal, igv, total, margen_pct, estado,
         clientes!inner(razon_social, numero_documento),
         perfiles!cotizaciones_vendedor_id_fkey(nombre),
         cotizacion_items(count)`,
      )
      .order("numero", { ascending: false })
      .limit(POR_PAGINA + 1);

    if (filtros.cursor) consulta = consulta.lt("numero", filtros.cursor);
    if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);
    if (filtros.cliente) consulta = consulta.eq("cliente_id", filtros.cliente);
    if (filtros.desde) consulta = consulta.gte("fecha", filtros.desde);
    if (filtros.hasta) consulta = consulta.lte("fecha", filtros.hasta);
    if (filtros.q) {
      // El número y la orden de compra son los dos campos por los que se busca
      // una cotización concreta; el nombre del cliente se filtra con el select.
      consulta = consulta.or(
        `numero.ilike.%${filtros.q}%,orden_compra_cliente.ilike.%${filtros.q}%`,
      );
    }

    const { data, error } = await consulta;
    if (error) return fallo(error, "cotizaciones/listarCotizaciones");

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        clientes: { razon_social: string; numero_documento: string | null } | null;
        perfiles: { nombre: string } | null;
        cotizacion_items: { count: number }[] | null;
      }
    >;

    const todas: CotizacionLista[] = crudas.map((c) => ({
      id: String(c.id),
      numero: String(c.numero),
      fecha: String(c.fecha),
      fecha_vencimiento: String(c.fecha_vencimiento),
      cliente_id: String(c.cliente_id),
      cliente: c.clientes?.razon_social ?? "—",
      cliente_documento: c.clientes?.numero_documento ?? null,
      orden_compra_cliente: (c.orden_compra_cliente as string | null) ?? null,
      subtotal: Number(c.subtotal ?? 0),
      igv: Number(c.igv ?? 0),
      total: Number(c.total ?? 0),
      margen_pct: Number(c.margen_pct ?? 0),
      estado: c.estado as CotizacionLista["estado"],
      vendedor: c.perfiles?.nombre ?? null,
      items: c.cotizacion_items?.[0]?.count ?? 0,
    }));

    const hayMas = todas.length > POR_PAGINA;
    const filas = hayMas ? todas.slice(0, POR_PAGINA) : todas;

    return {
      ok: true,
      datos: {
        filas,
        siguiente: hayMas ? (filas[filas.length - 1]?.numero ?? null) : null,
      },
    };
  } catch (e) {
    return fallo(e, "cotizaciones/listarCotizaciones");
  }
}

/** Conteo por estado, para las pastillas de filtro de la cabecera. */
export async function conteoPorEstado(): Promise<
  Resultado<Partial<Record<EstadoCotizacion, number>>>
> {
  try {
    const supabase = await clienteServidor();
    const contar = (estado: EstadoCotizacion) =>
      supabase
        .from("cotizaciones")
        // El embed de perfiles nombra su clave foránea: `cotizaciones` apunta
        // DOS veces a `perfiles` (vendedor_id y aprobada_por) y sin nombrarla
        // PostgREST no sabe cuál usar; responde PGRST201 y la ficha sale vacía.
        .select("id", { count: "exact", head: true })
        .eq("estado", estado);

    // "atendida", no "facturada": ese estado nunca existió en el enum
    // `estado_cotizacion`. Con los tipos provisionales la consulta compilaba
    // y devolvía 0 siempre, así que la pastilla se veía vacía sin motivo.
    const estados = ["borrador", "enviada", "aprobada", "atendida"] as const;
    const respuestas = await Promise.all(estados.map((e) => contar(e)));

    const primerError = respuestas.find((r) => r.error)?.error;
    if (primerError) return fallo(primerError);

    const conteo: Partial<Record<EstadoCotizacion, number>> = {};
    estados.forEach((e, i) => {
      conteo[e] = respuestas[i]?.count ?? 0;
    });

    return { ok: true, datos: conteo };
  } catch (e) {
    return fallo(e, "cotizaciones/conteoPorEstado");
  }
}

/** Cuántos clientes se ofrecen antes de que nadie teclee nada. */
const SUGERIDOS = 8;

/**
 * Con qué arranca el selector de cliente del constructor.
 *
 * Antes se traía la cartera ENTERA y se metía en un `<select>`. Funcionaba con
 * los clientes de prueba; con la cartera de verdad no: el desplegable nativo no
 * busca —solo salta a la primera letra— y la lista completa viaja además en el
 * HTML de la página, que se paga en cada carga aunque solo se use una fila.
 *
 * Ahora la búsqueda la hace Postgres mientras se teclea (`buscarClientes`), y
 * de aquí solo salen dos cosas:
 *
 *   · los ÚLTIMOS COTIZADOS, para que la caja vacía ofrezca algo. Es lo que
 *     sirve cuando no se recuerda el nombre exacto («el de Trujillo, el de la
 *     semana pasada»).
 *   · el cliente PRESELECCIONADO, cuando se llega desde su ficha con
 *     `?cliente=…`. Va aparte a propósito: puede no estar entre los sugeridos,
 *     y llegar con el selector vacío después de pulsar «cotizarle» sería raro.
 */
export async function clientesParaCotizar(preseleccionado?: string | null): Promise<
  Resultado<{ sugeridos: ClienteOpcion[]; inicial: ClienteOpcion | null }>
> {
  try {
    const supabase = await clienteServidor();

    // Un id que llega por la URL es entrada hostil: sin forma de uuid no se
    // consulta, porque entraría tal cual en el filtro de PostgREST.
    const pedido = preseleccionado && UUID.test(preseleccionado) ? preseleccionado : null;

    // El preseleccionado se busca por id y NO con `buscar_clientes`: esa
    // función mira las columnas de búsqueda —código, documento, razón social—
    // y el uuid no está en ninguna, así que no encontraría nada nunca.
    const [sugeridos, inicial] = await Promise.all([
      supabase.rpc("clientes_sugeridos", { p_limit: SUGERIDOS }),
      pedido
        ? supabase.from("clientes").select(COLUMNAS_OPCION).eq("id", pedido).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (sugeridos.error) return fallo(sugeridos.error);

    return {
      ok: true,
      datos: {
        sugeridos: (sugeridos.data ?? []) as unknown as ClienteOpcion[],
        inicial: inicial.data ? aOpcion(inicial.data) : null,
      },
    };
  } catch (e) {
    return fallo(e, "cotizaciones/clientesParaCotizar");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La fila de `clientes` con la forma que devuelven las dos funciones.
 *
 * Se escribe campo a campo y NO con un `as`. El cast que había aquí ocultó
 * durante dos días que la consulta le pedía a `clientes` una columna que la
 * 035 había borrado: `contacto`. Ni el typecheck ni el lint dijeron nada —un
 * `as` no comprueba, afirma— y el fallo salió al abrir una cotización, con un
 * «column clientes_1.contacto does not exist» en la cara del operador.
 */
function aOpcion(fila: {
  id: string;
  codigo: string;
  razon_social: string;
  nombre_comercial: string | null;
  numero_documento: string | null;
  tipo_documento: string;
  telefono: string | null;
  condicion_pago: string;
  dias_credito: number;
  bloqueado: boolean;
  motivo_bloqueo: string | null;
  activo: boolean;
  cliente_contactos: ContactoEmbebido[];
}): ClienteOpcion {
  return {
    id: fila.id,
    codigo: fila.codigo,
    razon_social: fila.razon_social,
    nombre_comercial: fila.nombre_comercial,
    numero_documento: fila.numero_documento,
    tipo_documento: fila.tipo_documento,
    telefono: fila.telefono,
    condicion_pago: fila.condicion_pago,
    dias_credito: fila.dias_credito,
    bloqueado: fila.bloqueado,
    motivo_bloqueo: fila.motivo_bloqueo,
    activo: fila.activo,
    ...aQuienSeLeHabla(fila.cliente_contactos),
    // El historial no se pide para uno solo: la fila ya viene elegida y
    // «cotizado hace 3 meses» no cambia esa decisión.
    cotizaciones: 0,
    ultima_cotizacion: null,
  };
}

/**
 * Las mismas columnas que devuelven `buscar_clientes` y `clientes_sugeridos`.
 *
 * `contacto` NO es una de ellas. Dejó de ser columna de `clientes` en la 035
 * —una empresa tiene al de compras, al de logística y al de mantenimiento— y
 * las dos funciones lo calculan dentro. Aquí hay que traerse la gente
 * embebida y aplanarla, igual que hace el listado de clientes.
 *
 * La cadena va escrita entera y no derivada: supabase-js infiere el tipo de
 * la fila a partir del LITERAL, y una cadena calculada le deja
 * `GenericStringError`.
 */
const COLUMNAS_OPCION = `id, codigo, razon_social, nombre_comercial, numero_documento,
   tipo_documento, telefono, condicion_pago, dias_credito,
   bloqueado, motivo_bloqueo, activo,
   cliente_contactos(nombre, principal, activo)`;

/**
 * Una cotización completa, con sus líneas y lo que hace falta para imprimirla.
 *
 * Cabecera, líneas, cliente y emisor en DOS consultas y no en cuatro: la ficha
 * se abre después de cada guardado y cada viaje de más se nota.
 */
export async function cotizacionPorId(id: string): Promise<
  Resultado<{
    cabecera: {
      id: string;
      numero: string;
      estado: EstadoCotizacion;
      fecha: string;
      validez_dias: number;
      tiempo_entrega: string | null;
      mostrar_disponibilidad: boolean;
      orden_compra_cliente: string | null;
      contacto: string | null;
      condiciones: string | null;
      observaciones: string | null;
      mostrar_descuento: boolean;
      subtotal: number;
      descuento_total: number;
      igv: number;
      total: number;
      costo_total: number;
      margen_pct: number;
      cliente_id: string;
      cliente: {
        razon_social: string;
        numero_documento: string | null;
        tipo_documento: string;
        direccion: string | null;
        contacto: string | null;
        whatsapp: string | null;
        telefono: string | null;
      };
      vendedor: string | null;
    };
    lineas: {
      /** Hace falta para poder confirmar línea a línea (041). */
      id: string;
      producto_id: string | null;
      orden: number;
      codigo: string;
      marca: string | null;
      descripcion: string;
      cantidad: number;
      unidad_codigo: string;
      valor_unitario: number;
      descuento_pct: number;
      costo_unitario: number;
      precio_minimo_ref: number;
      disponibilidad: Disponibilidad;
      dias_entrega: number | null;
      cantidad_aprobada: number | null;
      importe: number;
    }[];
    emisor: {
      razon_social: string;
      nombre_comercial: string;
      ruc: string;
      direccion: string | null;
      telefono: string | null;
      email_ventas: string | null;
      email: string | null;
      web: string | null;
      logo_url: string | null;
    };
  }>
> {
  try {
    const supabase = await clienteServidor();

    const [cabecera, emisor] = await Promise.all([
      supabase
        .from("cotizaciones")
        .select(
          `id, numero, estado, fecha, validez_dias, tiempo_entrega,
           orden_compra_cliente, contacto, condiciones, observaciones,
           mostrar_descuento, mostrar_disponibilidad, subtotal, descuento_total,
           igv, total, costo_total, margen_pct, cliente_id,
           clientes!inner(razon_social, numero_documento, tipo_documento,
                          direccion, whatsapp, telefono,
                          cliente_contactos(nombre, principal, activo)),
           perfiles!cotizaciones_vendedor_id_fkey(nombre),
           cotizacion_items(id, producto_id, orden, codigo, marca, descripcion,
                            cantidad, unidad_codigo, valor_unitario,
                            descuento_pct, costo_unitario, precio_minimo_ref,
                            importe, disponibilidad, dias_entrega,
                            cantidad_aprobada)`,
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("empresa")
        .select(
          "razon_social, nombre_comercial, ruc, direccion, telefono, email_ventas, email, web, logo_url",
        )
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (cabecera.error) return fallo(cabecera.error);
    if (!cabecera.data) return { ok: false, error: "La cotización no existe." };
    if (emisor.error) return fallo(emisor.error);
    if (!emisor.data) return { ok: false, error: "Falta configurar los datos de la empresa." };

    const c = cabecera.data as unknown as Record<string, unknown>;
    const { cliente_contactos: gente, ...cli } = c.clientes as Record<string, unknown> & {
      cliente_contactos?: ContactoEmbebido[];
    };
    const items = (c.cotizacion_items ?? []) as Record<string, unknown>[];
    const vendedor = (c.perfiles as { nombre?: string } | null)?.nombre ?? null;

    return {
      ok: true,
      datos: {
        // El select con relaciones anidadas devuelve un tipo que TypeScript no
        // puede estrechar solo; la forma real la garantiza la firma de arriba.
        cabecera: {
          ...(c as Record<string, unknown>),
          // `contacto` del cliente es el destinatario por defecto de la
          // cotización, y sale de `cliente_contactos` desde la 035.
          cliente: { ...cli, contacto: aQuienSeLeHabla(gente).contacto },
          vendedor,
        } as never,
        // El orden lo fija la cotización, no el orden de llegada de la fila.
        lineas: [...items].sort(
          (a, b) => Number(a.orden) - Number(b.orden),
        ) as never,
        emisor: emisor.data as never,
      },
    };
  } catch (e) {
    return fallo(e, "cotizaciones/cotizacionPorId");
  }
}
