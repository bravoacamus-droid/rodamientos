import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

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
const COLUMNAS_LISTA = `id, codigo, tipo_documento, numero_documento, razon_social,
   nombre_comercial, contacto, telefono, whatsapp, email, condicion_pago,
   dias_credito, linea_credito, bloqueado, activo`;

/** Separador del cursor. Un carácter de control: no aparece en una razón social. */
const SEPARADOR_CURSOR = "\u001f";

function fallo(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

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
      .select(COLUMNAS_LISTA)
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

    const todas = (data ?? []) as unknown as ClienteLista[];
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
        `${COLUMNAS_LISTA}, direccion, ubigeo_codigo, referencia_direccion, sector,
         cargo_contacto, dias_gracia, motivo_bloqueo, vendedor_id, notas, creado_en,
         ubigeo(departamento, provincia, distrito),
         perfiles(nombre)`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: false, error: "El cliente no existe." };

    const fila = data as unknown as Omit<
      ClienteDetalle,
      "ubigeo_nombre" | "vendedor_nombre"
    > & {
      ubigeo: { departamento: string; provincia: string; distrito: string } | null;
      perfiles: { nombre: string } | null;
    };

    const { ubigeo, perfiles, ...cliente } = fila;

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
