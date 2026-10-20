import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type {
  ClienteDetalle,
  ClienteLista,
  RubroCliente,
  ZonaCliente,
  FiltrosClientes,
  Resultado,
} from "../dominio/tipos";

export const POR_PAGINA = 50;

/**
 * Columnas del listado. Explícitas: `select("*")` traería las tres columnas
 * generadas de búsqueda (`busqueda`, `busq_razon_social`, `busq_documento`),
 * que son texto largo, duplican la fila entera y no se pintan en ningún sitio.
 */
/**
 * Las columnas de la fila del listado.
 *
 * `contacto` dejó de ser una columna de `clientes` en la 035: ahora es una
 * tabla aparte, porque una empresa tiene al de compras, al de logística y al
 * de mantenimiento. Se trae embebida en la MISMA consulta —PostgREST resuelve
 * el join— para no hacer 50 viajes más por página.
 *
 * Solo `nombre` y `principal`: la fila de la tabla enseña a uno y cuenta los
 * demás. Traer sus correos y teléfonos aquí sería cargar datos que no se
 * pintan, multiplicados por página.
 */

/**
 * Lo mismo con los contactos en `left join`: un cliente sin gente también sale,
 * que es el caso de los 37 de Willy hasta que los llene.
 *
 * Escrita entera y no derivada de la de arriba con un `.replace()`: supabase-js
 * infiere el tipo de la fila a partir del LITERAL de la cadena, y una cadena
 * calculada en tiempo de ejecución le deja `GenericStringError`.
 */
const COLUMNAS_LISTA_LEFT = `id, codigo, tipo_documento, numero_documento, razon_social,
   nombre_comercial, telefono, whatsapp, email, condicion_pago,
   dias_credito, linea_credito, bloqueado, activo,
   zona_codigo, rubro_id,
   zona:ubigeo!clientes_zona_codigo_fkey(distrito),
   rubros(nombre),
   cliente_contactos(nombre, principal, activo)`;

/**
 * Aplana los contactos embebidos —el principal al frente y cuántos hay— y la
 * zona y el rubro (141), que llegan como objetos anidados.
 */
function conContactos<T extends { cliente_contactos?: unknown }>(fila: T): T & {
  contacto: string | null;
  contactos: number;
  zona_nombre: string | null;
  rubro_nombre: string | null;
} {
  const { cliente_contactos, zona, rubros, ...resto } = fila as T & {
    zona?: { distrito: string } | null;
    rubros?: { nombre: string } | null;
  };
  const gente = (cliente_contactos ?? []) as {
    nombre: string;
    principal: boolean;
    activo: boolean;
  }[];
  const activos = gente.filter((g) => g.activo);
  // El principal si lo hay; si no, el primero. Un cliente puede no tener
  // principal marcado —al dar de baja al que lo era, el hueco queda libre a
  // propósito— y enseñar un nombre cualquiera es mejor que enseñar ninguno.
  const principal = activos.find((g) => g.principal) ?? activos[0] ?? null;
  return {
    ...(resto as unknown as T),
    contacto: principal?.nombre ?? null,
    contactos: activos.length,
    zona_nombre: zona?.distrito ?? null,
    rubro_nombre: rubros?.nombre ?? null,
  };
}

/** Separador del cursor. Un carácter de control: no aparece en una razón social. */
const SEPARADOR_CURSOR = "\u001f";

/**
 * Espejo en JS de `public.normalizar_texto`: minúsculas y sin tildes.
 *
 * Las columnas de búsqueda están GENERADAS con esa función y el índice GIN
 * trigram se construyó sobre ellas. Si el término buscado no se normaliza
 * igual, "Ñañez" no encuentra la fila que en la base está guardada como
 * "nanez" y el índice no sirve de nada.
 */
function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}

/**
 * El cursor lleva razón social + id, no solo la razón social.
 *
 * Dos clientes se pueden llamar igual —sucursales, o el mismo nombre cargado
 * dos veces— y un cursor que solo guardara el nombre saltaría o repetiría
 * filas justo en el borde de la página. Va en base64url porque viaja por la
 * URL y una razón social trae comas, comillas y tildes.
 */
function codificarCursor(razonSocial: string, id: string): string {
  return Buffer.from(razonSocial + SEPARADOR_CURSOR + id, "utf8").toString("base64url");
}

function decodificarCursor(cursor: string): { razonSocial: string; id: string } | null {
  try {
    const plano = Buffer.from(cursor, "base64url").toString("utf8");
    const corte = plano.indexOf(SEPARADOR_CURSOR);
    if (corte === -1) return null;

    const razonSocial = plano.slice(0, corte);
    const id = plano.slice(corte + 1);
    // El id entra tal cual en un filtro de PostgREST y el cursor viene de la
    // URL, o sea que es entrada hostil: si no tiene forma de uuid, se ignora
    // el cursor entero y se devuelve la primera página.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return null;
    }
    return { razonSocial, id };
  } catch {
    return null;
  }
}

/**
 * Valor citado para un filtro `or(...)` de PostgREST.
 *
 * Sin comillas, una razón social con coma o con paréntesis —«SERVICIOS S.A.,
 * SUCURSAL (LIMA)»— parte el filtro por la mitad: PostgREST responde un 400
 * incomprensible o, peor, aplica un filtro distinto del que se pidió.
 */
function citar(valor: string): string {
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Una página del maestro de clientes, por keyset.
 *
 * Ordena por `razon_social` y desempata por `id`, que es exactamente el índice
 * `ix_clientes_keyset (razon_social, id) where activo`. Se pide un elemento de
 * más que el tamaño de página: si vuelve, hay página siguiente, y así no hace
 * falta un `count` sobre la tabla entera en cada carga.
 *
 * Nunca por offset: con offset, dar de alta un cliente mientras alguien pagina
 * corre todas las filas siguientes y hace que se repita o se salte una.
 */
export async function listarClientes(
  filtros: FiltrosClientes,
): Promise<
  Resultado<{
    filas: ClienteLista[];
    siguiente: string | null;
    anterior: string | null;
  }>
> {
  try {
    const supabase = await clienteServidor();

    const atras = filtros.direccion === "ant" && Boolean(filtros.cursor);

    let consulta = supabase
      .from("clientes")
      .select(COLUMNAS_LISTA_LEFT)
      // Yendo hacia atrás se recorre el índice al revés, y las DOS columnas
      // del keyset: si solo se invirtiera la primera, el desempate por id
      // saltaría filas justo en el borde de la página.
      .order("razon_social", { ascending: !atras })
      .order("id", { ascending: !atras })
      .limit((filtros.limite ?? POR_PAGINA) + 1);

    // El índice keyset es PARCIAL (`where activo`): mientras no se pidan los
    // desactivados, el filtro tiene que estar para que Postgres pueda usarlo.
    if (!filtros.inactivos) consulta = consulta.eq("activo", true);
    if (!filtros.bloqueados) consulta = consulta.eq("bloqueado", false);
    if (filtros.condicion) consulta = consulta.eq("condicion_pago", filtros.condicion);
    if (filtros.zona) consulta = consulta.eq("zona_codigo", filtros.zona);
    if (filtros.rubro) consulta = consulta.eq("rubro_id", filtros.rubro);

    if (filtros.q) {
      const termino = normalizarTexto(filtros.q.trim());
      if (termino !== "") {
        // `like` y no `ilike`: la columna generada ya está en minúsculas y sin
        // tildes, así que `ilike` solo añadiría trabajo. El GIN trigram sobre
        // (busqueda, activo) resuelve el '%…%' sin recorrer la tabla.
        consulta = consulta.like("busqueda", `%${termino}%`);
      }
    }

    if (filtros.cursor) {
      const cursor = decodificarCursor(filtros.cursor);
      if (cursor) {
        // (razon_social, id) > (razón, id) del cursor, escrito como lo entiende
        // PostgREST. Los `eq` de arriba siguen aplicando: se combinan con AND.
        const razon = citar(cursor.razonSocial);
        // Hacia atrás es la misma condición con los dos operadores dados la
        // vuelta: lo que está POR ENCIMA del cursor.
        const op = atras ? "lt" : "gt";
        consulta = consulta.or(
          `razon_social.${op}.${razon},and(razon_social.eq.${razon},id.${op}.${cursor.id})`,
        );
      }
    }

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const todas = (data ?? []).map((f) => conContactos(f)) as unknown as ClienteLista[];
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
    // «de más» sobra por arriba, y al revés se descartaría la equivocada.
    const filas = atras ? [...recortadas].reverse() : recortadas;

    const primera = filas[0];
    const ultima = filas[filas.length - 1];
    const cursorDe = (c: ClienteLista | undefined) =>
      c ? codificarCursor(c.razon_social, c.id) : null;

    return {
      ok: true,
      datos: {
        filas,
        // Yendo hacia atrás siempre hay siguiente —se viene de ahí—; yendo
        // hacia adelante, siempre hay anterior salvo en la primera página.
        siguiente: atras ? cursorDe(ultima) : hayMas ? cursorDe(ultima) : null,
        anterior: atras
          ? hayMas
            ? cursorDe(primera)
            : null
          : filtros.cursor
            ? cursorDe(primera)
            : null,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * La ficha completa de un cliente.
 *
 * El ubigeo y el vendedor se resuelven con embeds en la MISMA consulta: con
 * tres viajes al servidor la ficha tardaría el triple para traer dos textos.
 * `clientes` tiene una sola clave foránea a `ubigeo` y una sola a `perfiles`,
 * así que PostgREST no necesita que se le nombre la relación (a diferencia de
 * `cotizaciones`, que apunta dos veces a `perfiles` y sí la exige).
 */
export async function clientePorId(id: string): Promise<Resultado<ClienteDetalle>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("clientes")
      .select(
        `${COLUMNAS_LISTA_LEFT}, direccion, ubigeo_codigo, referencia_direccion, sector,
         dias_gracia, agente_retencion, motivo_bloqueo, vendedor_id, notas, creado_en,
         ubigeo:ubigeo!clientes_ubigeo_codigo_fkey(departamento, provincia, distrito),
         perfiles(nombre)`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: false, error: "El cliente no existe." };

    const fila = conContactos(data as { cliente_contactos?: unknown }) as unknown as Omit<
      ClienteDetalle,
      | "ubigeo_nombre"
      | "vendedor_nombre"
      | "ubigeo_departamento"
      | "ubigeo_provincia"
      | "ubigeo_distrito"
      | "contactos_lista"
    > & {
      ubigeo: { departamento: string; provincia: string; distrito: string } | null;
      perfiles: { nombre: string } | null;
    };

    const { ubigeo, perfiles, ...cliente } = fila;

    // La gente, completa y ordenada como la devuelve `contactos_de_cliente`:
    // la principal primero. La ficha los pinta enteros, así que aquí sí se
    // piden sus datos —a diferencia del listado, que solo cuenta—.
    const { data: gente } = await supabase
      .from("cliente_contactos")
      .select("id, nombre, cargo, area, email, telefono, whatsapp, principal")
      .eq("cliente_id", id)
      .eq("activo", true)
      .order("principal", { ascending: false })
      .order("nombre", { ascending: true });

    return {
      ok: true,
      datos: {
        ...cliente,
        // De mayor a menor, como lo pide el contrato: «Lima · Lima · San
        // Isidro». La columna generada `ubigeo.etiqueta` va al revés (distrito
        // primero, que es como se busca), por eso se arma aquí en vez de
        // traerla hecha.
        ubigeo_nombre: ubigeo
          ? `${ubigeo.departamento} · ${ubigeo.provincia} · ${ubigeo.distrito}`
          : null,
        // Y por separado, porque Willy los quiere ver como tres campos y no
        // como una cadena que hay que partir en la pantalla.
        ubigeo_departamento: ubigeo?.departamento ?? null,
        ubigeo_provincia: ubigeo?.provincia ?? null,
        ubigeo_distrito: ubigeo?.distrito ?? null,
        contactos_lista: (gente ?? []) as ClienteDetalle["contactos_lista"],
        vendedor_nombre: perfiles?.nombre ?? null,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Los desplegables del formulario de cliente.
 *
 * Solo `ventas` y `gerencia` aparecen como vendedores asignables: `admin` es
 * un rol administrativo, y almacén, compras y cobranzas no llevan cartera. Un
 * desplegable con todo el personal es como se termina asignando clientes a
 * quien nunca los va a visitar.
 */
export async function catalogosCliente(): Promise<
  Resultado<{ vendedores: { id: string; nombre: string }[]; zonas: ZonaCliente[]; rubros: RubroCliente[] }>
> {
  try {
    const supabase = await clienteServidor();
    const [{ data, error }, zonas, rubros] = await Promise.all([
      supabase
        .from("perfiles")
        .select("id, nombre")
        .eq("activo", true)
        .in("rol", ["ventas", "gerencia"])
        .order("nombre"),
      zonasDeVisita(),
      rubrosDeCliente(),
    ]);

    if (error) return fallo(error);
    return { ok: true, datos: { vendedores: data ?? [], zonas, rubros } };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Autocompletado de ubigeo.
 *
 * Va contra el RPC `buscar_ubigeo`, que ya pone delante el distrito que
 * EMPIEZA por lo tecleado. Ese orden no se replica aquí: son casi 1.900
 * distritos y la relevancia la calcula Postgres con `similarity()` sobre el
 * índice trigram, no el servidor de Next sobre una lista traída entera.
 */
export async function buscarUbigeo(
  q: string,
): Promise<Resultado<{ codigo: string; nombre: string }[]>> {
  const termino = q.trim();
  // Con una sola letra el LIKE '%a%' hace match con medio Perú y la lista no
  // dice nada útil. Se corta antes de salir al servidor.
  if (termino.length < 2) return { ok: true, datos: [] };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("buscar_ubigeo", {
      p_q: termino,
      p_limit: 15,
    });

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((u) => ({
        codigo: u.codigo,
        // `etiqueta` es «distrito, provincia, departamento», que es como se
        // busca y como se reconoce un distrito dentro de una lista.
        nombre: u.etiqueta,
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Los tres niveles del ubigeo, para la cascada del formulario.
 *
 * Van al servidor en tres viajes en vez de precargarse enteros: los 1.874
 * distritos son ~120 kB que el 90 % de las altas no usa, porque «Traer datos»
 * ya rellena el distrito solo. Se piden los 25 departamentos al abrir y lo
 * demás cuando se elige el nivel de arriba.
 *
 * Las tres son `stable` en Postgres y leen una tabla de referencia pública:
 * el ubigeo es la lista de distritos del Perú que publica el INEI.
 */
export async function ubigeoDepartamentos(): Promise<string[]> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("ubigeo_departamentos");
    if (error) return [];
    return (data ?? []).map((d) => d.departamento);
  } catch {
    return [];
  }
}

export async function ubigeoProvincias(departamento: string): Promise<string[]> {
  if (departamento.trim() === "") return [];
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("ubigeo_provincias", {
      p_departamento: departamento,
    });
    if (error) return [];
    return (data ?? []).map((p) => p.provincia);
  } catch {
    return [];
  }
}

export async function ubigeoDistritos(
  departamento: string,
  provincia: string,
): Promise<{ codigo: string; distrito: string }[]> {
  if (departamento.trim() === "" || provincia.trim() === "") return [];
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("ubigeo_distritos", {
      p_departamento: departamento,
      p_provincia: provincia,
    });
    if (error) return [];
    return (data ?? []).map((d) => ({ codigo: d.codigo, distrito: d.distrito }));
  } catch {
    return [];
  }
}

/**
 * Las zonas que se ofrecen (141): los distritos de Lima Metropolitana y del
 * Callao, que es donde se visita. «Lima» (el Cercado) se llama «Lima Centro»,
 * como lo dice Willy.
 */
export async function zonasDeVisita(): Promise<ZonaCliente[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("ubigeo")
    .select("codigo, distrito, provincia")
    .or("codigo.like.1501%,codigo.like.0701%")
    .order("distrito")
    .limit(100);
  return (data ?? []).map((u) => ({
    codigo: String(u.codigo),
    nombre: u.codigo === "150101" ? "Lima Centro (Cercado)" : String(u.distrito),
    provincia: String(u.provincia),
  }));
}

/** Los rubros activos, por nombre (141). */
export async function rubrosDeCliente(): Promise<RubroCliente[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase.from("rubros").select("id, nombre").eq("activo", true).order("nombre").limit(500);
  return (data ?? []).map((r) => ({ id: String(r.id), nombre: String(r.nombre) }));
}

/** Una fila del resumen por zona o por rubro. */
export interface GrupoCartera {
  /** Código de zona o id de rubro; null = sin poner. */
  clave: string | null;
  nombre: string;
  clientes: number;
  /** Facturado en los últimos 12 meses, sin IGV y en dólares. */
  vendido: number;
}

/**
 * Cuántos clientes hay y cuánto compran, por zona y por rubro (141).
 *
 * Willy, 20/10: *«reportes por zona: cuántos clientes hay o cuánto están
 * comprando»* y, del rubro, *«con cuántas empresas agroindustriales contamos
 * y si vale la pena»*. Lo facturado de los últimos 12 meses, sin IGV y sin
 * las series de prueba (093), como en Informes.
 */
export async function resumenCartera(
  hoy: string,
): Promise<{ zonas: GrupoCartera[]; rubros: GrupoCartera[]; conDatos: number; total: number }> {
  const supabase = await clienteServidor();
  const desde = `${Number(hoy.slice(0, 4)) - 1}${hoy.slice(4)}`;
  const [cli, docs, prueba] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, zona_codigo, rubro_id, zona:ubigeo!clientes_zona_codigo_fkey(distrito), rubros(nombre)")
      .eq("activo", true)
      .limit(5000),
    supabase
      .from("comprobantes")
      .select("cliente_id, serie, op_gravada")
      .in("tipo", ["factura", "boleta"])
      .neq("estado", "anulado")
      .gte("fecha_emision", desde)
      .limit(10000),
    supabase.from("series_documento").select("serie").eq("es_prueba", true),
  ]);

  const deSerieDePrueba = new Set((prueba.data ?? []).map((s) => s.serie));
  const vendido = new Map<string, number>();
  for (const d of docs.data ?? []) {
    if (!d.cliente_id || deSerieDePrueba.has(d.serie)) continue;
    vendido.set(d.cliente_id, (vendido.get(d.cliente_id) ?? 0) + Number(d.op_gravada ?? 0));
  }

  const filas = (cli.data ?? []) as unknown as {
    id: string;
    zona_codigo: string | null;
    rubro_id: string | null;
    zona: { distrito: string } | null;
    rubros: { nombre: string } | null;
  }[];

  const agrupar = (clave: (f: (typeof filas)[number]) => string | null, nombre: (f: (typeof filas)[number]) => string) => {
    const g = new Map<string | null, GrupoCartera>();
    for (const f of filas) {
      const k = clave(f);
      const x = g.get(k) ?? { clave: k, nombre: k === null ? "Sin poner" : nombre(f), clientes: 0, vendido: 0 };
      x.clientes += 1;
      x.vendido += vendido.get(f.id) ?? 0;
      g.set(k, x);
    }
    // Lo que más compra arriba; «Sin poner» siempre al final.
    return [...g.values()]
      .map((x) => ({ ...x, vendido: Math.round(x.vendido * 100) / 100 }))
      .sort((a, b) => (a.clave === null ? 1 : b.clave === null ? -1 : b.vendido - a.vendido || b.clientes - a.clientes));
  };

  return {
    zonas: agrupar(
      (f) => f.zona_codigo,
      (f) => (f.zona_codigo === "150101" ? "Lima Centro (Cercado)" : f.zona?.distrito ?? "—"),
    ),
    rubros: agrupar((f) => f.rubro_id, (f) => f.rubros?.nombre ?? "—"),
    conDatos: filas.filter((f) => f.zona_codigo || f.rubro_id).length,
    total: filas.length,
  };
}
