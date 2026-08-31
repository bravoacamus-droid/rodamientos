import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type {
  ClienteDetalle,
  ClienteLista,
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
   cliente_contactos(nombre, principal, activo)`;

/** Aplana los contactos embebidos: el principal al frente y cuántos hay. */
function conContactos<T extends { cliente_contactos?: unknown }>(fila: T): T & {
  contacto: string | null;
  contactos: number;
} {
  const { cliente_contactos, ...resto } = fila;
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
    ...(resto as T),
    contacto: principal?.nombre ?? null,
    contactos: activos.length,
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
): Promise<Resultado<{ filas: ClienteLista[]; siguiente: string | null }>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("clientes")
      .select(COLUMNAS_LISTA_LEFT)
      .order("razon_social", { ascending: true })
      .order("id", { ascending: true })
      .limit(POR_PAGINA + 1);

    // El índice keyset es PARCIAL (`where activo`): mientras no se pidan los
    // desactivados, el filtro tiene que estar para que Postgres pueda usarlo.
    if (!filtros.inactivos) consulta = consulta.eq("activo", true);
    if (!filtros.bloqueados) consulta = consulta.eq("bloqueado", false);
    if (filtros.condicion) consulta = consulta.eq("condicion_pago", filtros.condicion);

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
        consulta = consulta.or(
          `razon_social.gt.${razon},and(razon_social.eq.${razon},id.gt.${cursor.id})`,
        );
      }
    }

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const todas = (data ?? []).map((f) => conContactos(f)) as unknown as ClienteLista[];
    const hayMas = todas.length > POR_PAGINA;
    const filas = hayMas ? todas.slice(0, POR_PAGINA) : todas;
    const ultima = filas[filas.length - 1];

    return {
      ok: true,
      datos: {
        filas,
        siguiente:
          hayMas && ultima ? codificarCursor(ultima.razon_social, ultima.id) : null,
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
         dias_gracia, motivo_bloqueo, vendedor_id, notas, creado_en,
         ubigeo(departamento, provincia, distrito),
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
  Resultado<{ vendedores: { id: string; nombre: string }[] }>
> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("perfiles")
      .select("id, nombre")
      .eq("activo", true)
      .in("rol", ["ventas", "gerencia"])
      .order("nombre");

    if (error) return fallo(error);
    return { ok: true, datos: { vendedores: data ?? [] } };
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
