import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import type {
  FiltrosProveedores,
  ProveedorDetalle,
  ProveedorLista,
  Resultado,
} from "../dominio/tipos";

export const POR_PAGINA = 50;

/**
 * Columnas del listado. Explícitas: `select("*")` traería la columna generada
 * `busqueda`, que es texto largo, duplica la fila y no se pinta en ningún
 * sitio.
 */
const COLUMNAS_LISTA = `id, codigo, tipo_documento, numero_documento, razon_social,
   tipo, pais, contacto, telefono, whatsapp, email, dias_pago, lead_time_dias, activo`;

/** Separador del cursor. Un carácter de control: no aparece en una razón social. */
const SEPARADOR_CURSOR = "\u001f";

function fallo(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

/**
 * Espejo en JS de `public.normalizar_texto`: minúsculas y sin tildes.
 *
 * La columna `busqueda` está GENERADA con esa función y el índice GIN trigram
 * se construyó sobre ella. Si el término buscado no se normaliza igual,
 * "Ñañez" no encuentra la fila que en la base está guardada como "nanez" y el
 * índice no sirve de nada.
 */
function normalizarTexto(valor: string): string {
  return valor.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
}

/**
 * El cursor lleva razón social + id, no solo la razón social.
 *
 * `ix_proveedores_keyset` es justamente `(razon_social, id)`. Dos proveedores
 * se pueden llamar igual —sucursales, o el mismo nombre cargado dos veces— y
 * un cursor que solo guardara el nombre saltaría o repetiría filas en el borde
 * de la página. Va en base64url porque viaja por la URL y una razón social
 * trae comas, comillas y tildes.
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
 * SUCURSAL (LIMA)»— parte el filtro por la mitad.
 */
function citar(valor: string): string {
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Lo que PostgREST devuelve al anidar las marcas de un proveedor. */
interface MarcaAnidada {
  marca_id: string;
  marcas: { nombre: string } | null;
}

/** Una página del maestro, por keyset sobre (razon_social, id). */
export async function listarProveedores(
  filtros: FiltrosProveedores,
): Promise<Resultado<{ filas: ProveedorLista[]; siguiente: string | null }>> {
  try {
    const supabase = await clienteServidor();

    // «¿Quién me vende SKF?» es la pregunta que justifica que exista
    // `proveedor_marcas`. El `!inner` la convierte en un filtro de verdad; sin
    // él, un proveedor que no lleva esa marca saldría igual, con el anidado
    // vacío. Solo cambia el modificador del embed, así que el resto de la
    // consulta se construye una sola vez.
    const embed = filtros.marca
      ? "proveedor_marcas!inner(marca_id, marcas(nombre))"
      : "proveedor_marcas(marca_id, marcas(nombre))";

    let consulta = supabase
      .from("proveedores")
      .select(`${COLUMNAS_LISTA}, ${embed}`)
      .order("razon_social")
      .order("id")
      .limit(POR_PAGINA + 1);

    if (!filtros.inactivos) consulta = consulta.eq("activo", true);
    if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo);
    if (filtros.marca) {
      consulta = consulta.eq("proveedor_marcas.marca_id", filtros.marca);
    }
    if (filtros.q) {
      consulta = consulta.like("busqueda", `%${normalizarTexto(filtros.q)}%`);
    }

    const cursor = filtros.cursor ? decodificarCursor(filtros.cursor) : null;
    if (cursor) {
      // Keyset compuesto: o la razón social es mayor, o es la misma y el id lo
      // desempata. PostgREST no tiene tuplas, así que se escribe como un `or`.
      consulta = consulta.or(
        `razon_social.gt.${citar(cursor.razonSocial)},and(razon_social.eq.${citar(cursor.razonSocial)},id.gt.${cursor.id})`,
      );
    }

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & { proveedor_marcas: MarcaAnidada[] | null }
    >;

    const todas: ProveedorLista[] = crudas.map((p) => ({
      id: String(p.id),
      codigo: String(p.codigo),
      tipo_documento: p.tipo_documento as ProveedorLista["tipo_documento"],
      numero_documento: (p.numero_documento as string | null) ?? null,
      razon_social: String(p.razon_social),
      tipo: p.tipo as ProveedorLista["tipo"],
      pais: String(p.pais ?? ""),
      contacto: (p.contacto as string | null) ?? null,
      telefono: (p.telefono as string | null) ?? null,
      whatsapp: (p.whatsapp as string | null) ?? null,
      email: (p.email as string | null) ?? null,
      dias_pago: Number(p.dias_pago ?? 0),
      lead_time_dias: Number(p.lead_time_dias ?? 0),
      activo: Boolean(p.activo),
      marcas: (p.proveedor_marcas ?? [])
        .map((m) => m.marcas?.nombre)
        .filter((n): n is string => Boolean(n))
        .sort(),
    }));

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

/** La ficha completa de un proveedor. */
export async function detalleProveedor(
  id: string,
): Promise<Resultado<ProveedorDetalle | null>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("proveedores")
      .select(
        `${COLUMNAS_LISTA}, direccion, ubigeo_codigo, notas, creado_en,
         ubigeo(departamento, provincia, distrito),
         proveedor_marcas(marca_id, marcas(nombre))`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: true, datos: null };

    const p = data as unknown as Record<string, unknown> & {
      ubigeo: { departamento: string; provincia: string; distrito: string } | null;
      proveedor_marcas: MarcaAnidada[] | null;
    };

    const marcas = p.proveedor_marcas ?? [];

    return {
      ok: true,
      datos: {
        id: String(p.id),
        codigo: String(p.codigo),
        tipo_documento: p.tipo_documento as ProveedorDetalle["tipo_documento"],
        numero_documento: (p.numero_documento as string | null) ?? null,
        razon_social: String(p.razon_social),
        tipo: p.tipo as ProveedorDetalle["tipo"],
        pais: String(p.pais ?? ""),
        contacto: (p.contacto as string | null) ?? null,
        telefono: (p.telefono as string | null) ?? null,
        whatsapp: (p.whatsapp as string | null) ?? null,
        email: (p.email as string | null) ?? null,
        dias_pago: Number(p.dias_pago ?? 0),
        lead_time_dias: Number(p.lead_time_dias ?? 0),
        activo: Boolean(p.activo),
        direccion: (p.direccion as string | null) ?? null,
        ubigeo_codigo: (p.ubigeo_codigo as string | null) ?? null,
        ubigeo_nombre: p.ubigeo
          ? `${p.ubigeo.departamento} · ${p.ubigeo.provincia} · ${p.ubigeo.distrito}`
          : null,
        notas: (p.notas as string | null) ?? null,
        creado_en: String(p.creado_en),
        marcas: marcas
          .map((m) => m.marcas?.nombre)
          .filter((n): n is string => Boolean(n))
          .sort(),
        marca_ids: marcas.map((m) => m.marca_id),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Las marcas del maestro, para el selector y el filtro. */
export async function marcasDisponibles(): Promise<
  Resultado<{ id: string; nombre: string }[]>
> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("marcas")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre");

    if (error) return fallo(error);
    return { ok: true, datos: (data ?? []) as { id: string; nombre: string }[] };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Proveedores activos en forma mínima, para desplegables de otras pantallas.
 *
 * Lo usa el registro de recepción. Vive aquí y no duplicado allí para que
 * añadir un filtro —por ejemplo, esconder los dados de baja— se haga en un
 * solo sitio.
 */
export async function proveedoresParaSelector(): Promise<
  Resultado<
    { id: string; codigo: string; razon_social: string; numero_documento: string | null; tipo: string }[]
  >
> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("proveedores")
      .select("id, codigo, razon_social, numero_documento, tipo")
      .eq("activo", true)
      .order("razon_social");

    if (error) return fallo(error);
    return { ok: true, datos: data ?? [] };
  } catch (e) {
    return fallo(e);
  }
}
