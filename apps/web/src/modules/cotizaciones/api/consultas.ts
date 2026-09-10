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
): Promise<
  Resultado<{
    filas: CotizacionLista[];
    siguiente: string | null;
    anterior: string | null;
  }>
> {
  try {
    const supabase = await clienteServidor();

    const atras = filtros.direccion === "ant" && Boolean(filtros.cursor);

    let consulta = supabase
      .from("cotizaciones")
      .select(
        `id, numero, fecha, fecha_vencimiento, cliente_id,
         orden_compra_cliente, subtotal, igv, total, margen_pct, estado,
         clientes!inner(razon_social, numero_documento),
         perfiles!cotizaciones_vendedor_id_fkey(nombre),
         cotizacion_items(count)`,
      )
      .order("numero", { ascending: atras })
      .limit((filtros.limite ?? POR_PAGINA) + 1);

    /*
      Ir hacia atrás es el mismo keyset del revés: se pide lo que está POR
      ENCIMA del cursor, en orden ascendente, y al final se le da la vuelta
      al array. Faltaba desde siempre — `cursorAnterior` se pasaba como
      `null` en las diez tablas del ERP.
    */
    if (filtros.cursor) {
      consulta = atras
        ? consulta.gt("numero", filtros.cursor)
        : consulta.lt("numero", filtros.cursor);
    }
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

    /*
      El corte usa el MISMO número que el límite.

      Aquí estaba la mitad del fallo del selector de filas (10/09): se pedían
      `limite + 1` para saber si hay siguiente, pero se cortaba por
      `POR_PAGINA` —una constante— así que con 25 pedidas se pintaban 26.
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

    const primera = filas[0]?.numero ?? null;
    const ultima = filas[filas.length - 1]?.numero ?? null;

    return {
      ok: true,
      datos: {
        filas,
        /*
          Yendo hacia atrás siempre hay siguiente —se viene de ahí—; yendo
          hacia adelante, siempre hay anterior salvo en la primera página. Sin
          esto, el botón contrario al que se acaba de pulsar se apaga.
        */
        siguiente: atras ? ultima : hayMas ? ultima : null,
        anterior: atras ? (hayMas ? primera : null) : filtros.cursor ? primera : null,
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
      /** El de la URL que se le manda al cliente (072). */
      token_publico: string;
      cliente_id: string;
      cliente: {
        razon_social: string;
        numero_documento: string | null;
        tipo_documento: string;
        direccion: string | null;
        contacto: string | null;
        whatsapp: string | null;
        telefono: string | null;
        /** Para imprimir la forma de pago en la cotización. */
        condicion_pago: string;
        dias_credito: number;
        /** Para mandarle la cotización por correo (Willy 13:21). */
        email: string | null;
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
      /** Lo ya facturado de esta línea (047). Decide si queda algo por cobrar. */
      cantidad_atendida: number;
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
           igv, total, costo_total, margen_pct, cliente_id, token_publico,
           clientes!inner(razon_social, numero_documento, tipo_documento,
                          direccion, whatsapp, telefono,
                          condicion_pago, dias_credito, email,
                          cliente_contactos(nombre, principal, activo)),
           perfiles!cotizaciones_vendedor_id_fkey(nombre),
           cotizacion_items(id, producto_id, orden, codigo, marca, descripcion,
                            cantidad, unidad_codigo, valor_unitario,
                            descuento_pct, costo_unitario, precio_minimo_ref,
                            importe, disponibilidad, dias_entrega,
                            cantidad_aprobada, cantidad_atendida)`,
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

/** Un comprobante que salió de esta cotización. */
export interface ComprobanteDelPedido {
  id: string;
  numero: string;
  tipo: string;
  fecha: string;
  total: number;
  saldo: number;
  estado_sunat: string;
}

/**
 * ¿Ya salió mercadería de este pedido?
 *
 * Es media respuesta a «¿se puede editar todavía?». La otra media —si hay
 * algo facturado— sale de las líneas, que la ficha ya tiene delante.
 *
 * Existe para no pintar un botón condenado: desde la 070 una cotización
 * aprobada se edita, pero deja de poder editarse en cuanto hay guía, y sin
 * esta consulta el botón aparecería igual para rebotar al guardar. La
 * comprobación de verdad sigue estando en la base, donde no se puede saltar;
 * esto solo evita ofrecer lo que ya no se puede hacer.
 *
 * Ante la duda dice que SÍ hay guía: si la consulta falla, esconder el botón
 * deja una pantalla pobre, y enseñarlo promete algo que va a fallar.
 */
export async function tieneGuia(cotizacionId: string): Promise<boolean> {
  try {
    const supabase = await clienteServidor();
    const { count, error } = await supabase
      .from("guias_remision")
      .select("id", { count: "exact", head: true })
      .eq("cotizacion_id", cotizacionId)
      // Una anulada no despachó nada. Contarla bloquearía la edición por una
      // guía que se emitió por error y se dio de baja.
      .neq("estado", "anulada");

    if (error) return true;
    return (count ?? 0) > 0;
  } catch {
    return true;
  }
}

/** Una compra abierta que lleva alguno de los productos de este pedido. */
export interface CompraAbierta {
  id: string;
  numero: string;
  proveedor: string;
  /** Los códigos de ESTE pedido que van en esa compra. */
  codigos: string[];
}

/**
 * Compras en marcha que llevan productos de esta cotización.
 *
 * ---------------------------------------------------------------------------
 * Por qué avisa y no bloquea
 * ---------------------------------------------------------------------------
 * Luis, 08/09, sobre editar una cotización aprobada: *«siempre y cuando
 * todavía no se haga las compras de los productos»*. La intención es clara y
 * la base no puede cumplirla al pie de la letra: **no hay vínculo entre una
 * compra y la cotización que la motivó**. `compra_items` guarda
 * `producto_id`, y la bandeja «Por comprar» agrupa por PRODUCTO justamente
 * porque una compra junta lo que esperan varios clientes.
 *
 * Así que esto responde «hay una compra abierta con este código», que no es
 * lo mismo que «se compró para este pedido»: puede ser reposición de almacén
 * o el pedido de otro cliente. Con 790 productos, bloquear por eso cerraría
 * la edición casi siempre y por un motivo que Willy no podría ver ni
 * deshacer.
 *
 * Se enseña con el número de compra y el proveedor delante, y decide quien
 * está mirando. Las `recibida` y `anulada` quedan fuera: una compra que ya
 * llegó no se descuadra porque el pedido cambie.
 *
 * Si falla, devuelve vacío: es un aviso sobre una pantalla que tiene que
 * abrir igual.
 */
export async function comprasAbiertasDe(
  productoIds: readonly string[],
): Promise<CompraAbierta[]> {
  const ids = [...new Set(productoIds)].filter(Boolean);
  if (ids.length === 0) return [];

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("compra_items")
      .select("producto_id, productos(codigo), compras!inner(id, numero, estado, proveedores(razon_social))")
      .in("producto_id", ids)
      .in("compras.estado", ["registrada", "recibida_parcial"])
      .limit(200);

    if (error || !data) return [];

    // `!inner` obliga a la compra a existir, pero PostgREST sigue devolviendo
    // la relación como objeto o como array de uno según cómo infiera la
    // cardinalidad. Se aceptan las dos formas en vez de confiar en una.
    const uno = <T,>(v: T | T[] | null): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : v;

    const porCompra = new Map<string, CompraAbierta>();

    for (const f of data as unknown as {
      producto_id: string;
      productos: { codigo: string } | { codigo: string }[] | null;
      compras:
        | { id: string; numero: string; proveedores: { razon_social: string } | { razon_social: string }[] | null }
        | { id: string; numero: string; proveedores: { razon_social: string } | { razon_social: string }[] | null }[]
        | null;
    }[]) {
      const compra = uno(f.compras);
      if (!compra) continue;

      const codigo = uno(f.productos)?.codigo ?? "";
      const previa = porCompra.get(compra.id);

      if (previa) {
        if (codigo && !previa.codigos.includes(codigo)) previa.codigos.push(codigo);
      } else {
        porCompra.set(compra.id, {
          id: compra.id,
          numero: compra.numero,
          proveedor: uno(compra.proveedores)?.razon_social ?? "—",
          codigos: codigo ? [codigo] : [],
        });
      }
    }

    return [...porCompra.values()];
  } catch {
    return [];
  }
}

/**
 * Qué se le ha facturado ya de este pedido.
 *
 * El enlace existía y solo iba en un sentido: la factura decía de qué
 * cotización nacía, y la cotización no sabía nada de sus facturas. Con el
 * facturado por partes (047) eso deja al pedido sin contar la mitad de su
 * historia — se le emitieron 1 de 5 unidades y la pantalla seguía enseñando
 * las 5 como si no hubiera pasado nada.
 *
 * Si falla, la ficha del pedido tiene que abrir igual: es información de
 * apoyo, no el documento.
 */
export async function comprobantesDelPedido(
  cotizacionId: string,
): Promise<ComprobanteDelPedido[]> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("comprobantes")
      .select("id, numero, tipo, fecha_emision, total, saldo, estado_sunat, estado")
      .eq("cotizacion_id", cotizacionId)
      // Una anulada no facturó nada: enseñarla como emitida haría cuadrar mal
      // lo que queda por cobrar.
      .neq("estado", "anulado")
      .order("fecha_emision", { ascending: false })
      .limit(50);

    if (error || !data) return [];

    return data.map((c) => ({
      id: String(c.id),
      numero: String(c.numero),
      tipo: String(c.tipo),
      fecha: String(c.fecha_emision).slice(0, 10),
      total: Number(c.total ?? 0),
      saldo: Number(c.saldo ?? 0),
      estado_sunat: String(c.estado_sunat ?? "pendiente"),
    }));
  } catch {
    return [];
  }
}
