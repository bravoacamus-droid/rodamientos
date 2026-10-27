import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

/**
 * De dónde viene un comprobante y quién lo anuló (TR-05, TR-07).
 *
 * La ficha enseñaba la cotización y la guía como TEXTO —para ir de una
 * factura a su guía había que saberse el número y buscarlo—, y de una
 * anulada solo decía «No se cobra»: ni cuándo, ni quién, ni por qué.
 *
 * Va aparte de `detalleComprobante` a propósito: esa consulta la comparten el
 * papel, el PDF y el envío a SUNAT, y lo que aquí se pide solo lo pinta la
 * pantalla. Si esto falla, la ficha sigue cargando con el texto de siempre.
 */
export interface EnlacesComprobante {
  cotizacion: { id: string; numero: string } | null;
  /** Todas las guías que ampara, en el orden en que se marcaron. */
  guias: { id: string; numero: string }[];
  anulacion: {
    en: string | null;
    por: string | null;
    motivo: string | null;
  } | null;
}

export async function enlacesDelComprobante(
  id: string,
): Promise<{ ok: true; datos: EnlacesComprobante } | { ok: false; error: string }> {
  try {
    const supabase = await clienteServidor();

    /*
      Las dos claves, con su nombre delante y sin excepción.

      Entre `comprobantes` y `guias_remision` hay dos caminos desde la 084 —la
      columna vieja `guia_id` y la tabla `comprobante_guias`—, y entre
      `comprobantes` y `perfiles` otros dos (vendedor y anulado_por). Ante
      dos, PostgREST no elige: tumba la consulta entera (PGRST201). Así se
      rompió la ficha de la factura el 21/09.
    */
    const { data, error } = await supabase
      .from("comprobantes")
      .select(
        `id, estado, anulado_en, motivo_anulacion,
         cotizaciones(id, numero),
         guias_remision!comprobantes_guia_id_fkey(id, numero),
         comprobante_guias(orden, guias_remision!comprobante_guias_guia_id_fkey(id, numero)),
         perfiles!comprobantes_anulado_por_fkey(nombre)`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error, "facturacion/enlacesDelComprobante");
    if (!data) return { ok: true, datos: { cotizacion: null, guias: [], anulacion: null } };

    const c = data as unknown as {
      estado: string;
      anulado_en: string | null;
      motivo_anulacion: string | null;
      cotizaciones: { id: string; numero: string | null } | null;
      guias_remision: { id: string; numero: string | null } | null;
      comprobante_guias:
        | { orden: number | null; guias_remision: { id: string; numero: string | null } | null }[]
        | null;
      perfiles: { nombre: string | null } | null;
    };

    // Las de la tabla (084); si está vacía, la columna vieja, que es como
    // quedaron las facturas anteriores. Igual que el papel.
    const deLaTabla = (c.comprobante_guias ?? [])
      .slice()
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((g) => g.guias_remision)
      .filter((g): g is { id: string; numero: string } => Boolean(g?.id && g.numero));
    const guias =
      deLaTabla.length > 0
        ? deLaTabla
        : c.guias_remision?.id && c.guias_remision.numero
          ? [{ id: c.guias_remision.id, numero: c.guias_remision.numero }]
          : [];

    return {
      ok: true,
      datos: {
        cotizacion:
          c.cotizaciones?.id && c.cotizaciones.numero
            ? { id: c.cotizaciones.id, numero: c.cotizaciones.numero }
            : null,
        guias: guias.map((g) => ({ id: g.id, numero: g.numero })),
        anulacion:
          c.estado === "anulado"
            ? { en: c.anulado_en, por: c.perfiles?.nombre ?? null, motivo: c.motivo_anulacion }
            : null,
      },
    };
  } catch (e) {
    return fallo(e, "facturacion/enlacesDelComprobante");
  }
}
