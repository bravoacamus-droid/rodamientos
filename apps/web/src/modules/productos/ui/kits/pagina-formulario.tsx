import { notFound } from "next/navigation";

import { kitPorId } from "../../api/kits";
import { FormularioKit } from "./formulario";

/**
 * Alta y edición de un kit, en la misma pantalla.
 *
 * Es el mismo criterio que el constructor de cotizaciones: crear y editar son
 * la misma tarea —buscar productos y poner cantidades—, y una copia para
 * editar garantiza que el día que se arregle algo en una, en la otra no.
 *
 * Ojo con `params`: Next lo pasa SIEMPRE, también en `/productos/kits/nuevo`,
 * donde llega como un objeto vacío. Comprobar que la prop exista no distingue
 * el alta de la edición —hay que mirar el `id` de dentro—, y confundirlo daba
 * un 404 en la pantalla de crear.
 */
export default async function PaginaFormularioKit({
  params,
}: {
  params?: Promise<{ id?: string }>;
}) {
  const id = params ? (await params).id : undefined;
  if (!id) return <FormularioKit kit={null} />;

  const r = await kitPorId(id);
  if (!r.ok || !r.datos) notFound();

  return <FormularioKit kit={r.datos} />;
}
