import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import { ENTIDADES, type FiltrosBitacora, type Movimiento } from "../dominio/tipos";

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

export const POR_PAGINA = 50;

/**
 * La bitácora, de lo más reciente a lo más antiguo.
 *
 * Keyset sobre el `id`, que es una identidad ascendente: es monótono, único y
 * ya tiene índice (`ix_actividad_keyset`). Un OFFSET sobre una tabla que solo
 * crece se degrada justo cuando la bitácora empieza a servir para algo.
 */
export async function movimientos(
  filtros: FiltrosBitacora,
): Promise<Resultado<{ filas: Movimiento[]; siguiente: string | null }>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("actividad")
      .select("id, usuario_id, usuario_nombre, accion, entidad, entidad_id, descripcion, creado_en")
      .order("id", { ascending: false })
      // Uno de más, para saber si hay página siguiente sin contar la tabla.
      .limit(POR_PAGINA + 1);

    if (filtros.cursor) {
      const n = Number(filtros.cursor);
      if (Number.isFinite(n)) consulta = consulta.lt("id", n);
    }
    // La entidad se compara contra la lista conocida y no se pasa tal cual: es
    // un valor que llega de la barra de direcciones.
    const entidad = ENTIDADES.find((e) => e === filtros.entidad);
    if (entidad) consulta = consulta.eq("entidad", entidad);
    if (filtros.usuario) consulta = consulta.eq("usuario_id", filtros.usuario);
    if (filtros.desde) consulta = consulta.gte("creado_en", `${filtros.desde}T00:00:00Z`);
    if (filtros.hasta) consulta = consulta.lte("creado_en", `${filtros.hasta}T23:59:59Z`);

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const todas = (data ?? []).map((f) => ({
      id: Number(f.id),
      usuario_id: (f.usuario_id as string | null) ?? null,
      usuario_nombre: String(f.usuario_nombre ?? "sistema"),
      accion: String(f.accion),
      entidad: String(f.entidad),
      entidad_id: (f.entidad_id as string | null) ?? null,
      descripcion: (f.descripcion as string | null) ?? null,
      creado_en: String(f.creado_en),
    }));

    const hayMas = todas.length > POR_PAGINA;
    const filas = hayMas ? todas.slice(0, POR_PAGINA) : todas;
    const ultima = filas[filas.length - 1];

    return {
      ok: true,
      datos: { filas, siguiente: hayMas && ultima ? String(ultima.id) : null },
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
      .select("id, usuario_id, usuario_nombre, accion, entidad, entidad_id, descripcion, creado_en")
      .eq("entidad", entidad)
      .eq("entidad_id", id)
      .order("id", { ascending: false })
      .limit(50);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((f) => ({
        id: Number(f.id),
        usuario_id: (f.usuario_id as string | null) ?? null,
        usuario_nombre: String(f.usuario_nombre ?? "sistema"),
        accion: String(f.accion),
        entidad: String(f.entidad),
        entidad_id: (f.entidad_id as string | null) ?? null,
        descripcion: (f.descripcion as string | null) ?? null,
        creado_en: String(f.creado_en),
      })),
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
