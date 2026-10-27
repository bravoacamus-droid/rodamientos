import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import {
  CLAVES_DE_REFERENCIA,
  ENTIDADES,
  ENTIDADES_DE_CARGA,
  ENTIDADES_DE_PERMISOS,
  FIN_DE_LAS_CARGAS,
  QUIEN_SISTEMA,
  limitesDelDiaEnLima,
  textoDeBusqueda,
  type FiltrosBitacora,
  type Movimiento,
  type QuePaso,
} from "../dominio/tipos";

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

export const POR_PAGINA = 50;

/**
 * Una fila de `actividad` como la lee la pantalla.
 *
 * `referencia` la añade la 158; hasta que esté aplicada la columna no existe,
 * y por eso se pide con `*` y se lee si viene: PostgREST tumba la consulta
 * entera si se le nombra una columna que no existe (CLAUDE.md §5).
 */
function aMovimiento(f: Record<string, unknown>): Movimiento {
  return {
    id: Number(f.id),
    usuario_id: (f.usuario_id as string | null) ?? null,
    usuario_nombre: String(f.usuario_nombre ?? "sistema"),
    accion: String(f.accion),
    entidad: String(f.entidad),
    entidad_id: (f.entidad_id as string | null) ?? null,
    descripcion: (f.descripcion as string | null) ?? null,
    creado_en: String(f.creado_en),
    referencia: (f.referencia as string | null | undefined) ?? null,
    metadata: (f.metadata as Record<string, unknown> | null | undefined) ?? null,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿La consulta cayó porque `referencia` todavía no existe (158 sin aplicar)? */
function faltaLaColumna(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42703" || /referencia/.test(error.message ?? "")));
}

/**
 * La bitácora, de lo más reciente a lo más antiguo.
 *
 * Keyset sobre el `id`, que es una identidad ascendente: es monótono, único y
 * ya tiene índice (`ix_actividad_keyset`). Un OFFSET sobre una tabla que solo
 * crece se degrada justo cuando la bitácora empieza a servir para algo.
 */
export async function movimientos(
  filtros: FiltrosBitacora,
): Promise<
  Resultado<{
    filas: Movimiento[];
    siguiente: string | null;
    anterior: string | null;
  }>
> {
  try {
    const supabase = await clienteServidor();

    const atras = filtros.direccion === "ant" && Boolean(filtros.cursor);
    const porPagina = filtros.limite ?? POR_PAGINA;
    const texto = textoDeBusqueda(filtros.q);

    const consultar = (conReferencia: boolean) => {
      let consulta = supabase
        .from("actividad")
        .select("*")
        .order("id", { ascending: atras })
        // Uno de más, para saber si hay página siguiente sin contar la tabla.
        .limit(porPagina + 1);

      // Hacia atrás, lo que está POR ENCIMA del cursor y en orden ascendente;
      // el array se da la vuelta al final.
      if (filtros.cursor) {
        const n = Number(filtros.cursor);
        if (Number.isFinite(n)) consulta = atras ? consulta.gt("id", n) : consulta.lt("id", n);
      }
      // La entidad se compara contra la lista conocida y no se pasa tal cual: es
      // un valor que llega de la barra de direcciones. «Permisos» incluye las
      // filas viejas de `permisos_rol`, que se llaman igual.
      const entidad = ENTIDADES.find((e) => e === filtros.entidad);
      if (entidad === "permisos") consulta = consulta.in("entidad", ["permisos", "permisos_rol"]);
      else if (entidad) consulta = consulta.eq("entidad", entidad);

      const sistema = filtros.usuario === QUIEN_SISTEMA;
      if (sistema) consulta = consulta.is("usuario_id", null);
      else if (filtros.usuario && UUID.test(filtros.usuario)) consulta = consulta.eq("usuario_id", filtros.usuario);

      // Las cargas de datos se ocultan salvo que se pidan, o que se pida ver
      // justo lo que hizo «sistema». Sus borrados se ven siempre, y lo de
      // después de las cargas también: el envío a SUNAT escribe como sistema.
      if (!filtros.cargas && !sistema) {
        consulta = consulta.or(
          `usuario_id.not.is.null,accion.eq.borrado,entidad.not.in.(${ENTIDADES_DE_CARGA.join(",")}),` +
            `creado_en.gte."${FIN_DE_LAS_CARGAS}"`,
        );
      }

      switch (filtros.que as QuePaso | undefined) {
        case "graves":
          consulta = consulta.or(
            'accion.eq.borrado,descripcion.ilike."%→ anulad%",' +
              'descripcion.ilike."%anulada: false → true%",descripcion.ilike."%anulado: false → true%"',
          );
          break;
        case "precios":
          consulta = consulta.eq("entidad", "productos").ilike("descripcion", "%precio%");
          break;
        case "permisos":
          consulta = consulta.in("entidad", [...ENTIDADES_DE_PERMISOS]);
          break;
      }

      if (texto) {
        consulta = consulta.or(
          conReferencia
            ? `referencia.ilike."%${texto}%",usuario_nombre.ilike."%${texto}%"`
            : // Sin la columna, el número de un borrado está en metadata.antes,
              // que es de donde lo pinta la fila: si se ve, se encuentra.
              [
                `descripcion.ilike."%${texto}%"`,
                `usuario_nombre.ilike."%${texto}%"`,
                ...CLAVES_DE_REFERENCIA.map((k) => `metadata->antes->>${k}.ilike."%${texto}%"`),
              ].join(","),
        );
      }

      const { desde, hasta } = limitesDelDiaEnLima(filtros.desde, filtros.hasta);
      if (desde) consulta = consulta.gte("creado_en", desde);
      if (hasta) consulta = consulta.lte("creado_en", hasta);
      return consulta;
    };

    let { data, error } = await consultar(true);
    // Mientras la 158 no esté aplicada, buscar por número no puede mirar
    // `referencia`: se busca en la descripción y en quién lo hizo.
    if (error && texto && faltaLaColumna(error)) ({ data, error } = await consultar(false));
    if (error) return fallo(error);

    const todas = ((data ?? []) as Record<string, unknown>[]).map(aMovimiento);

    const hayMas = todas.length > porPagina;
    const recortadas = hayMas ? todas.slice(0, porPagina) : todas;

    // Se recorta primero y se da la vuelta después: yendo hacia atrás la fila
    // «de más» sobra por arriba.
    const filas = atras ? [...recortadas].reverse() : recortadas;

    const primera = filas[0] ? String(filas[0].id) : null;
    const ultima = filas[filas.length - 1]
      ? String(filas[filas.length - 1]!.id)
      : null;

    return {
      ok: true,
      datos: {
        filas,
        siguiente: atras ? ultima : hayMas ? ultima : null,
        anterior: atras ? (hayMas ? primera : null) : filtros.cursor ? primera : null,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Lo que ha pasado con UN documento.
 *
 * Es la pregunta que abrió todo esto —«¿quién anuló esta factura?»— y se
 * contesta mejor dentro de la ficha que en una lista general con filtros.
 */
export async function historialDe(
  entidad: string,
  id: string,
): Promise<Resultado<Movimiento[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("actividad")
      .select("*")
      .eq("entidad", entidad)
      .eq("entidad_id", id)
      .order("id", { ascending: false })
      .limit(50);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: ((data ?? []) as Record<string, unknown>[]).map(aMovimiento),
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Quién aparece en la bitácora, para el desplegable del filtro. */
export async function quienesAparecen(): Promise<
  Resultado<{ id: string; nombre: string }[]>
> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("perfiles")
      .select("id, nombre")
      .order("nombre");
    if (error) return fallo(error);
    return {
      ok: true,
      datos: (data ?? []).map((p) => ({
        id: String(p.id),
        nombre: String(p.nombre ?? "—"),
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

export interface Fallo {
  id: number;
  origen: string;
  mensaje: string;
  codigo: string | null;
  usuario_nombre: string;
  ruta: string | null;
  veces: number;
  primera_vez: string;
  ultima_vez: string;
}

/**
 * Los fallos de servidor que nadie ha revisado todavía.
 *
 * Apilados por huella (migración 054): un fallo que ocurre cien veces es un
 * fallo, no cien. Lo que decide si esta lista se mira es que quepa de un
 * vistazo.
 */
export async function fallosPendientes(): Promise<Resultado<Fallo[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("fallos")
      .select("id, origen, mensaje, codigo, usuario_nombre, ruta, veces, primera_vez, ultima_vez")
      .eq("revisado", false)
      .order("ultima_vez", { ascending: false })
      .limit(50);

    if (error) return fallo(error, "bitacora/fallosPendientes");

    return {
      ok: true,
      datos: (data ?? []).map((f) => ({
        id: Number(f.id),
        origen: String(f.origen),
        mensaje: String(f.mensaje),
        codigo: (f.codigo as string | null) ?? null,
        usuario_nombre: String(f.usuario_nombre ?? "sistema"),
        ruta: (f.ruta as string | null) ?? null,
        veces: Number(f.veces ?? 1),
        primera_vez: String(f.primera_vez),
        ultima_vez: String(f.ultima_vez),
      })),
    };
  } catch (e) {
    return fallo(e, "bitacora/fallosPendientes");
  }
}
