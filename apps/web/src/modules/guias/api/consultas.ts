import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";
import { cursorDe, filtroCursor } from "@/lib/orden-reciente";

import { fallo } from "@/lib/errores";

import type {
  CotizacionDespachable,
  EstadoGuia,
  FiltrosGuias,
  GuiaDetalle,
  GuiaLista,
  LineaGuia,
  ModalidadTraslado,
  MotivoTraslado,
} from "../dominio/tipos";

export const POR_PAGINA = 30;

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

const ESTADOS = ["borrador", "emitida", "anulada"] as const;
const dos = (n: number) => Math.round(n * 100) / 100;

/**
 * Lo que el cliente CONFIRMÓ de una línea, que es el techo de lo que se le
 * puede despachar.
 *
 * Desde la 041 el cliente puede quedarse con parte —«de las 30 me llevo 25»—
 * y eso vive en `cantidad_aprobada`. La bandeja de compras lo respetaba y la
 * facturación desde la 047; las guías no, así que proponían despachar las 30
 * con 25 en el almacén. Encontrado el 03/09 recorriendo la cadena entera.
 *
 * `null` significa que se confirmó tal cual se cotizó: es lo que guarda la
 * aprobación completa, y por eso el respaldo es `cantidad` y no cero.
 */
const confirmado = (i: { cantidad: number; cantidad_aprobada: number | null }) =>
  Number(i.cantidad_aprobada ?? i.cantidad ?? 0);

/**
 * Listado de guías.
 *
 * Keyset sobre `numero` descendente: el número es `T001-00000001`, con ceros a
 * la izquierda, así que ordena bien como texto. Es el mismo criterio que el
 * resto de documentos.
 */
export async function listarGuias(
  filtros: FiltrosGuias,
): Promise<
  Resultado<{
    filas: GuiaLista[];
    siguiente: string | null;
    anterior: string | null;
  }>
> {
  try {
    const supabase = await clienteServidor();

    const atras = filtros.direccion === "ant" && Boolean(filtros.cursor);

    let consulta = supabase
      .from("guias_remision")
      .select(
        `id, creado_en, numero, fecha_emision, fecha_traslado, motivo_descripcion,
         direccion_llegada, peso_bruto_kg, numero_bultos, estado, estado_sunat,
         clientes(razon_social, numero_documento),
         cotizaciones(numero),
         guia_items(id)`,
      )
      // Lo último arriba: fecha, hora de creación y número (12/10, ver lib/orden-reciente).
      .order("fecha_emision", { ascending: atras })
      .order("creado_en", { ascending: atras })
      .order("numero", { ascending: atras })
      .limit((filtros.limite ?? POR_PAGINA) + 1);

    /*
      Ir hacia atrás es el mismo keyset del revés: se pide lo que está POR
      ENCIMA del cursor, en orden ascendente, y al final se le da la vuelta
      al array. Faltaba desde siempre — `cursorAnterior` se pasaba como
      `null` en las diez tablas del ERP.
    */
    const desdeCursor = filtroCursor(filtros.cursor, atras, "fecha_emision");
    if (desdeCursor) consulta = consulta.or(desdeCursor);
    if (filtros.cliente) consulta = consulta.eq("cliente_id", filtros.cliente);
    // La serie llega de la URL: solo letras y cifras, o no se filtra.
    if (filtros.serie && /^[A-Z0-9]{2,4}$/.test(filtros.serie)) consulta = consulta.eq("serie", filtros.serie);

    if (filtros.desde) consulta = consulta.gte("fecha_emision", filtros.desde);
    if (filtros.hasta) consulta = consulta.lte("fecha_emision", filtros.hasta);

    const estado = ESTADOS.find((e) => e === filtros.estado);
    if (estado) consulta = consulta.eq("estado", estado);

    if (filtros.q) {
      // Por lo que se busca una guía: su número, la dirección donde se entregó,
      // o la placa del vehículo que la llevó.
      consulta = consulta.or(
        `numero.ilike.%${filtros.q}%,direccion_llegada.ilike.%${filtros.q}%,transportista_placa.ilike.%${filtros.q}%`,
      );
    }

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        clientes: { razon_social: string; numero_documento: string | null } | null;
        cotizaciones: { numero: string } | null;
        guia_items: { id: string }[] | null;
      }
    >;

    const todas: GuiaLista[] = crudas.map((g) => ({
      id: String(g.id),
      numero: String(g.numero),
      fecha_emision: String(g.fecha_emision),
      fecha_traslado: String(g.fecha_traslado),
      cliente: g.clientes?.razon_social ?? null,
      // El RUC bajo el nombre: dos clientes se llaman casi igual y en una
      // guía equivocarse de destinatario es un viaje perdido.
      cliente_documento: g.clientes?.numero_documento ?? null,
      cotizacion_numero: g.cotizaciones?.numero ?? null,
      motivo: (g.motivo_descripcion as string | null) ?? null,
      direccion_llegada: (g.direccion_llegada as string | null) ?? null,
      peso_bruto_kg: Number(g.peso_bruto_kg ?? 0),
      numero_bultos: Number(g.numero_bultos ?? 0),
      estado: g.estado as EstadoGuia,
      estado_sunat: String(g.estado_sunat ?? "no_enviado"),
      items: (g.guia_items ?? []).length,
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

    const claves = new Map(
      crudas.map((c) => [String(c.id), { fecha: String(c.fecha_emision), creado: String(c.creado_en), numero: String(c.numero) }]),
    );
    const primera = cursorDe(claves.get(filas[0]?.id ?? ""));
    const ultima = cursorDe(claves.get(filas[filas.length - 1]?.id ?? ""));

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
    return fallo(e);
  }
}

/** La ficha de una guía, con sus líneas. */
export async function detalleGuia(id: string): Promise<Resultado<GuiaDetalle | null>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("guias_remision")
      .select(
        `id, serie, correlativo, numero, cliente_id, cotizacion_id,
         orden_compra_cliente, fecha_emision, fecha_traslado,
         motivo_codigo, motivo_descripcion,
         ubigeo_partida, direccion_partida, ubigeo_llegada, direccion_llegada,
         peso_bruto_kg, unidad_peso, numero_bultos, modalidad_traslado,
         transportista_documento, transportista_razon_social, transportista_placa,
         conductor_documento, conductor_nombre, conductor_licencia,
         conductor_telefono, a_pie,
         entregado_por, recibido_por, estado, estado_sunat, sunat_mensaje,
         observaciones, motivo_anulacion, creado_en,
         clientes(razon_social, numero_documento),
         cotizaciones(numero),
         guia_items(id, producto_id, orden, codigo, descripcion, cantidad, unidad_codigo, peso_kg)`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: true, datos: null };

    const g = data as unknown as Record<string, unknown> & {
      clientes: { razon_social: string; numero_documento: string | null } | null;
      cotizaciones: { numero: string } | null;
      guia_items: Array<{
        id: string;
        producto_id: string;
        orden: number;
        codigo: string | null;
        descripcion: string | null;
        cantidad: number;
        unidad_codigo: string | null;
        peso_kg: number | null;
      }> | null;
    };

    // El comprobante que salió de esta guía se pide aparte: `comprobantes`
    // apunta a `guias_remision`, no al revés, y anidarlo desde aquí obliga a
    // desambiguar la relación por ahorrar una consulta que casi siempre
    // devuelve una fila o ninguna.
    const { data: comp } = await supabase
      .from("comprobantes")
      .select("id, numero")
      .eq("guia_id", id)
      .neq("estado", "anulado")
      .maybeSingle();

    const lineas: LineaGuia[] = (g.guia_items ?? [])
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map((i) => ({
        id: String(i.id),
        producto_id: String(i.producto_id),
        codigo: i.codigo ?? "—",
        descripcion: i.descripcion ?? "—",
        unidad: i.unidad_codigo ?? "NIU",
        cantidad: Number(i.cantidad ?? 0),
        peso_kg: Number(i.peso_kg ?? 0),
      }));

    return {
      ok: true,
      datos: {
        id: String(g.id),
        serie: String(g.serie),
        correlativo: Number(g.correlativo),
        numero: String(g.numero),
        cliente_id: String(g.cliente_id),
        cliente: g.clientes?.razon_social ?? null,
        cliente_documento: g.clientes?.numero_documento ?? null,
        cotizacion_id: (g.cotizacion_id as string | null) ?? null,
        cotizacion_numero: g.cotizaciones?.numero ?? null,
        orden_compra_cliente: (g.orden_compra_cliente as string | null) ?? null,
        fecha_emision: String(g.fecha_emision),
        fecha_traslado: String(g.fecha_traslado),
        motivo_codigo: String(g.motivo_codigo ?? "01"),
        motivo_descripcion: (g.motivo_descripcion as string | null) ?? null,
        ubigeo_partida: (g.ubigeo_partida as string | null) ?? null,
        direccion_partida: (g.direccion_partida as string | null) ?? null,
        ubigeo_llegada: (g.ubigeo_llegada as string | null) ?? null,
        direccion_llegada: (g.direccion_llegada as string | null) ?? null,
        peso_bruto_kg: Number(g.peso_bruto_kg ?? 0),
        unidad_peso: String(g.unidad_peso ?? "KGM"),
        numero_bultos: Number(g.numero_bultos ?? 0),
        modalidad_traslado: (g.modalidad_traslado as ModalidadTraslado) ?? "02",
        transportista_documento: (g.transportista_documento as string | null) ?? null,
        transportista_razon_social: (g.transportista_razon_social as string | null) ?? null,
        transportista_placa: (g.transportista_placa as string | null) ?? null,
        conductor_documento: (g.conductor_documento as string | null) ?? null,
        conductor_nombre: (g.conductor_nombre as string | null) ?? null,
        conductor_licencia: (g.conductor_licencia as string | null) ?? null,
        conductor_telefono: (g.conductor_telefono as string | null) ?? null,
        a_pie: g.a_pie === true,
        entregado_por: (g.entregado_por as string | null) ?? null,
        recibido_por: (g.recibido_por as string | null) ?? null,
        estado: g.estado as EstadoGuia,
        estado_sunat: String(g.estado_sunat ?? "no_enviado"),
        sunat_mensaje: (g.sunat_mensaje as string | null) ?? null,
        observaciones: (g.observaciones as string | null) ?? null,
        motivo_anulacion: (g.motivo_anulacion as string | null) ?? null,
        creado_en: String(g.creado_en),
        lineas,
        comprobante: comp ? { id: String(comp.id), numero: String(comp.numero) } : null,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Los motivos de traslado del catálogo 20, para el desplegable. */
export async function motivosTraslado(): Promise<Resultado<MotivoTraslado[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("motivos_traslado")
      .select("codigo, descripcion")
      .eq("activo", true)
      .order("orden");

    if (error) return fallo(error);
    return {
      ok: true,
      datos: (data ?? []).map((m) => ({
        codigo: String(m.codigo),
        descripcion: String(m.descripcion),
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Cotizaciones aprobadas con mercadería pendiente de salir.
 *
 * Se excluyen las que ya se despacharon enteras. Una cotización aprobada de la
 * que ya salió todo no tiene por qué seguir ofreciéndose: es el camino más
 * corto a sacar el mismo material dos veces.
 *
 * Una «atendida» solo entra si tiene alguna guía en el ERP (07/10). Las 631
 * CT02 del histórico entraron como atendidas —se vendieron en el sistema
 * viejo, y su guía salió allí—, y sin guías aquí parecían enteras por
 * despachar: la guía nueva ofrecía cien cotizaciones de 2024. En el ERP una
 * cotización se atiende al facturarse, y sin guía no se factura (089), así
 * que una atendida sin guía solo puede venir del histórico.
 *
 * Y las aprobadas van todas, sin el tope de cien: con el histórico delante
 * —«CT02» ordena antes que «COT1»— el tope dejaba fuera las de verdad.
 */
export async function cotizacionesDespachables(): Promise<
  Resultado<{ id: string; numero: string; fecha: string; cliente: string }[]>
> {
  try {
    const supabase = await clienteServidor();

    // Las guías NO anuladas y sus líneas: es lo que ya salió del almacén.
    const { data: yaDespachado, error: errorGuias } = await supabase
      .from("guias_remision")
      .select("cotizacion_id, estado, guia_items(cotizacion_item_id, cantidad)")
      .neq("estado", "anulada");
    if (errorGuias) return fallo(errorGuias);

    const conGuia = [
      ...new Set(
        ((yaDespachado ?? []) as { cotizacion_id: string | null }[])
          .map((g) => g.cotizacion_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const { data, error } = await supabase
      .from("cotizaciones")
      .select(
        `id, numero, fecha, clientes(razon_social),
         cotizacion_items(id, cantidad, cantidad_aprobada)`,
      )
      .or(
        conGuia.length > 0
          ? `estado.eq.aprobada,and(estado.eq.atendida,id.in.(${conGuia.join(",")}))`
          : "estado.eq.aprobada",
      )
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false });

    if (error) return fallo(error);

    const despachadoPorItem = new Map<string, number>();
    for (const g of (yaDespachado ?? []) as unknown as Array<{
      guia_items: { cotizacion_item_id: string | null; cantidad: number }[] | null;
    }>) {
      for (const i of g.guia_items ?? []) {
        if (!i.cotizacion_item_id) continue;
        despachadoPorItem.set(
          i.cotizacion_item_id,
          dos((despachadoPorItem.get(i.cotizacion_item_id) ?? 0) + Number(i.cantidad ?? 0)),
        );
      }
    }

    const filas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        clientes: { razon_social: string } | null;
        cotizacion_items:
          | { id: string; cantidad: number; cantidad_aprobada: number | null }[]
          | null;
      }
    >;

    return {
      ok: true,
      datos: filas
        .filter((c) =>
          (c.cotizacion_items ?? []).some(
            (i) => confirmado(i) - (despachadoPorItem.get(i.id) ?? 0) > 0,
          ),
        )
        .map((c) => ({
          id: String(c.id),
          numero: String(c.numero),
          fecha: String(c.fecha),
          cliente: c.clientes?.razon_social ?? "—",
        })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * El saldo de un producto, que PostgREST devuelve como fila o como lista.
 *
 * Depende de cómo infiera la relación, y las dos formas son legítimas: si solo
 * se tratara una, el stock llegaría como 0 sin que nadie se enterase — y un
 * cero falso en esta pantalla es peor que no tener el dato, porque avisaría de
 * una falta que no existe.
 */
function stockDe(s: { cantidad: number }[] | { cantidad: number } | null): number {
  if (!s) return 0;
  if (Array.isArray(s)) return Number(s[0]?.cantidad ?? 0);
  return Number(s.cantidad ?? 0);
}

/** Una cotización con lo que falta por despachar de cada línea. */
/**
 * Las guías que YA tiene una cotización.
 *
 * Existe por un caso que se veía como una avería: Luis, 17/09, pulsó «Generar
 * guía» en la COT1-000008 y llegó a la pantalla con el desplegable vacío —
 * *«¿por qué no me trae mis datos automáticamente?»*.
 *
 * No era el enlace: la cotización estaba **despachada entera** en la guía
 * T001-00000002, así que `cotizacionesDespachables` la excluía con razón y el
 * `<select>` se quedaba en el texto de relleno porque su opción no existía. El
 * sistema hacía lo correcto y no lo decía, que en esta pantalla es lo mismo
 * que hacerlo mal.
 *
 * Con esto se puede decir CUÁL es esa guía y llevar a ella.
 */
export async function guiasDeCotizacion(
  cotizacionId: string,
): Promise<Resultado<{ id: string; numero: string; estado: string }[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("guias_remision")
      .select("id, serie, correlativo, estado")
      .eq("cotizacion_id", cotizacionId)
      .neq("estado", "anulada")
      .order("correlativo", { ascending: false });

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((g) => ({
        id: String(g.id),
        numero: `${g.serie}-${String(g.correlativo).padStart(8, "0")}`,
        estado: String(g.estado),
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/** El número de una cotización, para poder nombrarla en un mensaje. */
export async function numeroDeCotizacion(id: string): Promise<string | null> {
  try {
    const supabase = await clienteServidor();
    const { data } = await supabase
      .from("cotizaciones")
      .select("numero")
      .eq("id", id)
      .maybeSingle();
    return data ? String(data.numero) : null;
  } catch {
    return null;
  }
}

export async function cotizacionParaDespachar(
  id: string,
): Promise<Resultado<CotizacionDespachable | null>> {
  try {
    const supabase = await clienteServidor();

    const [{ data, error }, { data: despacho }] = await Promise.all([
      supabase
        .from("cotizaciones")
        .select(
          `id, numero, fecha, cliente_id, orden_compra_cliente,
           clientes(razon_social, numero_documento, direccion, ubigeo_codigo),
           cotizacion_items(
             id, producto_id, orden, codigo, descripcion, unidad_codigo,
             cantidad, cantidad_aprobada,
             productos(peso_kg, stock(cantidad))
           )`,
        )
        .eq("id", id)
        .maybeSingle(),
      /*
        Lo que ya va en guías no anuladas, por línea (115). Antes se sumaba
        aquí `guia_items.cantidad`, y un kit se guarda como sus piezas
        (086): 2 kits de 3 piezas contaban como 6 despachados.
      */
      supabase.rpc("despacho_por_item", { p_cotizacion: id }),
    ]);

    if (error) return fallo(error);
    if (!data) return { ok: true, datos: null };

    const despachado = new Map<string, number>();
    for (const d of despacho ?? []) {
      if (d.cotizacion_item_id) despachado.set(String(d.cotizacion_item_id), Number(d.despachado ?? 0));
    }

    const c = data as unknown as Record<string, unknown> & {
      clientes: {
        razon_social: string;
        numero_documento: string | null;
        direccion: string | null;
        ubigeo_codigo: string | null;
      } | null;
      cotizacion_items: Array<{
        id: string;
        producto_id: string;
        orden: number;
        codigo: string | null;
        descripcion: string | null;
        unidad_codigo: string | null;
        cantidad: number;
        cantidad_aprobada: number | null;
        productos: {
          peso_kg: number | null;
          // PostgREST devuelve la relación 1-1 como fila o como lista segun
          // como la infiera; se tratan las dos, igual que en kits.
          stock: { cantidad: number }[] | { cantidad: number } | null;
        } | null;
      }> | null;
    };

    return {
      ok: true,
      datos: {
        id: String(c.id),
        numero: String(c.numero),
        fecha: String(c.fecha),
        cliente_id: String(c.cliente_id),
        cliente: c.clientes?.razon_social ?? "—",
        cliente_documento: c.clientes?.numero_documento ?? null,
        cliente_direccion: c.clientes?.direccion ?? null,
        cliente_ubigeo: c.clientes?.ubigeo_codigo ?? null,
        orden_compra_cliente: (c.orden_compra_cliente as string | null) ?? null,
        lineas: (c.cotizacion_items ?? [])
          .slice()
          .sort((a, b) => a.orden - b.orden)
          .map((i) => ({
            cotizacion_item_id: String(i.id),
            producto_id: String(i.producto_id),
            codigo: i.codigo ?? "—",
            descripcion: i.descripcion ?? "—",
            unidad: i.unidad_codigo ?? "NIU",
            cantidad: confirmado(i),
            despachado: despachado.get(String(i.id)) ?? 0,
            peso_kg: Number(i.productos?.peso_kg ?? 0),
            stock: stockDe(i.productos?.stock ?? null),
          })),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Las agencias con las que se despacha a provincia.
 *
 * Willy, 26/08 (22:31): *«no son muchas, tengo dos o tres agencias»*. Los
 * campos del transportista ya estaban en la guía; lo que faltaba era la lista
 * de la que elegir, para no volver a teclear el RUC de Shalom en cada envío.
 *
 * Solo las activas: una que se dejó de usar sigue existiendo —hay guías viejas
 * que la citan— pero no tiene por qué ofrecerse al despachar hoy.
 */
export async function agenciasActivas(): Promise<
  Resultado<{ id: string; razon_social: string; nombre_corto: string | null; numero_documento: string | null }[]>
> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("agencias_transporte")
      .select("id, razon_social, nombre_corto, numero_documento")
      .eq("activo", true)
      .order("nombre_corto", { nullsFirst: false })
      .limit(100);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((a) => ({
        id: String(a.id),
        razon_social: String(a.razon_social),
        nombre_corto: (a.nombre_corto as string | null) ?? null,
        numero_documento: (a.numero_documento as string | null) ?? null,
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Las cifras de arriba de la lista (108). «Sin facturar» es la que manda:
 * desde el 17/09 no se factura sin guía, así que una guía emitida que ninguna
 * factura ampara es mercadería que salió y no se ha facturado.
 */
export interface IndicadoresGuias {
  emitidas: number;
  borradores: number;
  sinFacturar: number;
  diasSinFacturar: number | null;
  anuladas: number;
  sinSunat: number;
}

export async function indicadoresGuias(filtros: {
  desde?: string;
  hasta?: string;
  cliente?: string;
}): Promise<Resultado<IndicadoresGuias>> {
  try {
    const supabase = await clienteServidor();
    const esFecha = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
    const cliente = filtros.cliente && /^[0-9a-f-]{36}$/i.test(filtros.cliente) ? filtros.cliente : null;
    const { data, error } = await supabase.rpc("indicadores_guias", {
      ...(esFecha(filtros.desde) ? { p_desde: filtros.desde as string } : {}),
      ...(esFecha(filtros.hasta) ? { p_hasta: filtros.hasta as string } : {}),
      ...(cliente ? { p_cliente: cliente } : {}),
    });
    if (error) return fallo(error);
    const d = (data ?? {}) as Record<string, unknown>;
    const n = (k: string) => Number(d[k] ?? 0);
    return {
      ok: true,
      datos: {
        emitidas: n("emitidas"),
        borradores: n("borradores"),
        sinFacturar: n("sin_facturar"),
        diasSinFacturar: d.dias_sin_facturar === null || d.dias_sin_facturar === undefined ? null : n("dias_sin_facturar"),
        anuladas: n("anuladas"),
        sinSunat: n("sin_sunat"),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Una línea de la cotización, vista desde la guía que se corrige (115). */
export interface LineaCorregible {
  cotizacion_item_id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  /** Lo que confirmó el cliente. */
  confirmado: number;
  /** Lo que llevan las OTRAS guías no anuladas. */
  otras: number;
  /** Lo que lleva esta guía hoy. */
  enEsta: number;
  peso_kg: number;
}

/**
 * Los productos que se pueden poner en una guía en borrador (14/10).
 *
 * Luis: *«¿por qué en guía no puedo editar todos los datos?»*. El tope de
 * cada línea es lo confirmado menos lo que llevan las otras guías; lo cuenta
 * `despacho_por_item` (115), que sabe contar los kits.
 */
export async function lineasParaCorregir(
  guiaId: string,
  cotizacionId: string,
): Promise<Resultado<LineaCorregible[]>> {
  try {
    const supabase = await clienteServidor();
    const [items, otras, todas] = await Promise.all([
      supabase
        .from("cotizacion_items")
        .select("id, orden, codigo, descripcion, unidad_codigo, cantidad, cantidad_aprobada, productos(peso_kg)")
        .eq("cotizacion_id", cotizacionId)
        .order("orden"),
      supabase.rpc("despacho_por_item", { p_cotizacion: cotizacionId, p_excluir_guia: guiaId }),
      supabase.rpc("despacho_por_item", { p_cotizacion: cotizacionId }),
    ]);
    if (items.error) return fallo(items.error);
    if (otras.error) return fallo(otras.error);
    if (todas.error) return fallo(todas.error);

    const mapa = (filas: { cotizacion_item_id: string | null; despachado: number | null }[] | null) =>
      new Map((filas ?? []).map((f) => [String(f.cotizacion_item_id), Number(f.despachado ?? 0)]));
    const deOtras = mapa(otras.data);
    const deTodas = mapa(todas.data);

    const lineas = ((items.data ?? []) as unknown as Array<{
      id: string;
      codigo: string | null;
      descripcion: string | null;
      unidad_codigo: string | null;
      cantidad: number;
      cantidad_aprobada: number | null;
      productos: { peso_kg: number | null } | null;
    }>).map((i) => {
      const id = String(i.id);
      const o = deOtras.get(id) ?? 0;
      return {
        cotizacion_item_id: id,
        codigo: i.codigo ?? "—",
        descripcion: i.descripcion ?? "—",
        unidad: i.unidad_codigo ?? "NIU",
        confirmado: Number(i.cantidad_aprobada ?? i.cantidad),
        otras: o,
        enEsta: dos((deTodas.get(id) ?? 0) - o),
        peso_kg: Number(i.productos?.peso_kg ?? 0),
      };
    });

    // Lo que el cliente no quiso (confirmado 0) no se ofrece; lo que ya salió
    // entero en otras guías, tampoco, salvo que esta también lo lleve.
    return { ok: true, datos: lineas.filter((l) => l.confirmado > 0 && (l.enEsta > 0 || l.confirmado - l.otras > 0)) };
  } catch (e) {
    return fallo(e);
  }
}
