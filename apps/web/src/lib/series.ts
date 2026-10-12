import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

/**
 * Las series de unos tipos de documento, para el desplegable «Serie» de las
 * listas (12/10).
 *
 * Luis: *«en cotizaciones, facturas o también en guías tiene el número,
 * algunos COT1, CT02; por eso también tenemos que filtrar»*. Hay dos de cada
 * una: la de prueba (COT1, F001, T001) y la del libro de Willy (CT02, F002).
 * La de prueba se dice, para no confundirlas.
 */
export async function seriesDe(tipos: readonly string[]): Promise<{ valor: string; etiqueta: string }[]> {
  try {
    const supabase = await clienteServidor();
    const { data } = await supabase
      .from("series_documento")
      .select("serie, es_prueba")
      .in("tipo", [...tipos] as never)
      .order("serie");
    const vistas = new Set<string>();
    return (data ?? [])
      .filter((s) => (vistas.has(s.serie) ? false : (vistas.add(s.serie), true)))
      .map((s) => ({ valor: s.serie, etiqueta: s.es_prueba ? `${s.serie} (de prueba)` : s.serie }));
  } catch {
    return [];
  }
}
