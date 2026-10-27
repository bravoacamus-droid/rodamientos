import "server-only";

import { z } from "zod";
import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type { Resultado } from "./consultas";

export interface LineaAjuste {
  producto_id: string;
  codigo: string;
  descripcion: string;
  cantidad_sistema: number;
  cantidad_fisica: number;
  diferencia: number;
  costo_unitario: number;
}

export interface DetalleAjuste {
  id: string;
  numero: string;
  fecha: string;
  tipo: string;
  motivo: string | null;
  anulado: boolean;
  creado_en: string;
  /** Quién lo hizo. `null` si se hizo por SQL o el perfil ya no existe. */
  hecho_por: string | null;
  lineas: LineaAjuste[];
}

/**
 * Un ajuste de inventario, para su ficha (TR-12, 27/10).
 *
 * El kardex enseñaba el número del ajuste sin enlace, porque no había ficha a
 * la que llevar: `/inventario/ajuste` es el formulario para hacer uno nuevo.
 * Y es el botón que Willy pidió «que se use con cuidado» (26:49): de él es de
 * lo que más se va a preguntar quién, cuándo y por qué.
 *
 * `null` si no existe; el id se valida antes de llegar a la base.
 */
export async function detalleAjuste(id: string): Promise<Resultado<DetalleAjuste | null>> {
  if (!z.string().uuid().safeParse(id).success) return { ok: true, datos: null };
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("ajustes_inventario")
      .select(
        "id, numero, fecha, tipo, motivo, anulado, creado_en, " +
          "perfiles!ajustes_inventario_usuario_id_fkey(nombre), " +
          "ajuste_items(producto_id, cantidad_sistema, cantidad_fisica, diferencia, costo_unitario, " +
          "productos!ajuste_items_producto_id_fkey(codigo, descripcion))",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return fallo(error, "inventario/detalleAjuste");
    if (!data) return { ok: true, datos: null };

    // El select es una cadena armada: los tipos generados no la siguen.
    const a = data as unknown as {
      id: string;
      numero: string;
      fecha: string;
      tipo: string;
      motivo: string | null;
      anulado: boolean | null;
      creado_en: string;
      perfiles: { nombre: string | null } | null;
      ajuste_items: {
        producto_id: string;
        cantidad_sistema: number | string;
        cantidad_fisica: number | string;
        diferencia: number | string | null;
        costo_unitario: number | string | null;
        productos: { codigo: string | null; descripcion: string | null } | null;
      }[];
    };

    return {
      ok: true,
      datos: {
        id: a.id,
        numero: a.numero,
        fecha: a.fecha,
        tipo: a.tipo,
        motivo: a.motivo,
        anulado: Boolean(a.anulado),
        creado_en: a.creado_en,
        hecho_por: a.perfiles?.nombre ?? null,
        lineas: (a.ajuste_items ?? [])
          .map((l) => ({
            producto_id: l.producto_id,
            codigo: l.productos?.codigo ?? "—",
            descripcion: l.productos?.descripcion ?? "",
            cantidad_sistema: Number(l.cantidad_sistema ?? 0),
            cantidad_fisica: Number(l.cantidad_fisica ?? 0),
            diferencia: Number(l.diferencia ?? 0),
            costo_unitario: Number(l.costo_unitario ?? 0),
          }))
          .sort((x, y) => x.codigo.localeCompare(y.codigo)),
      },
    };
  } catch (e) {
    return fallo(e, "inventario/detalleAjuste");
  }
}
