/**
 * A quién le falta preguntarle, para unos productos concretos de la ronda.
 *
 * ---------------------------------------------------------------------------
 * Por qué primero el producto y luego el proveedor
 * ---------------------------------------------------------------------------
 * Luis, 09/09: *«cuando abra el modal primero tiene que decir a qué producto
 * quieres agregar el proveedor, después busco el proveedor; ese buscador
 * inteligente tiene que ser»*.
 *
 * Y en ese orden el buscador puede ser inteligente, que en el otro no podía:
 * sabiendo los productos, el sistema ya sabe quién los vende
 * —`proveedor_productos`, que se llena sola con cada compra (046)— y puede
 * proponerlos sin que nadie escriba nada. Al revés, con el proveedor elegido
 * primero, lo único que se podía hacer era enseñar la lista entera.
 *
 * ---------------------------------------------------------------------------
 * Y la validación que pidió
 * ---------------------------------------------------------------------------
 * *«puede ser que se equivoque, seleccione un producto con el mismo proveedor
 * que ya está; no debería dejar cosas así»*.
 *
 * Pero hay dos casos y solo uno es un error:
 *
 *  · Ya se le preguntó por **todos** los elegidos → no hay nada que hacer, y
 *    se bloquea. Dejarlo pasar daría un «añadido» que no añade nada.
 *  · Ya se le preguntó por **alguno** → es el caso corriente y legítimo: el
 *    mismo proveedor vende cuatro de los seis productos y se le va ampliando
 *    la lista. Se deja, diciendo qué se le añade de verdad.
 */

import type { ItemConsultado, ProveedorConsultado } from "./comparador";
import type { Referencia } from "./referencia";

export interface Candidato {
  proveedor_id: string;
  proveedor: string;
  /** Lo último que cobró, en USD. `null` = nunca se le ha comprado. */
  ultimoCostoUsd: number | null;
  /** De los elegidos, cuántos consta que vende. 0 si no consta nada. */
  vende: number;
  /** De los elegidos, los `item_id` por los que YA se le preguntó. */
  yaPreguntados: string[];
  /** De los elegidos, los que se le añadirían. Vacío = no hay nada que hacer. */
  porPreguntar: string[];
}

/** Qué le falta a UN proveedor de los productos elegidos. */
export function queLeFalta(
  proveedorId: string,
  elegidos: readonly string[],
  enLaRonda: readonly ProveedorConsultado[],
  preguntadas: ReadonlySet<string>,
): { yaPreguntados: string[]; porPreguntar: string[] } {
  const suyo = enLaRonda.find((p) => p.proveedor_id === proveedorId);
  if (!suyo) return { yaPreguntados: [], porPreguntar: [...elegidos] };

  const yaPreguntados: string[] = [];
  const porPreguntar: string[] = [];
  for (const itemId of elegidos) {
    if (preguntadas.has(`${itemId}|${suyo.consulta_proveedor_id}`)) {
      yaPreguntados.push(itemId);
    } else {
      porPreguntar.push(itemId);
    }
  }
  return { yaPreguntados, porPreguntar };
}

/**
 * Los que el sistema propone para los productos elegidos.
 *
 * Sale de `referencias`, que es lo que consta que vende cada uno. Ordena por
 * cuántos de los elegidos cubre —el que los tiene todos ahorra una
 * conversación— y a igualdad, por lo que cobró la última vez. Los que no
 * tienen precio previo van al final: no es que sean caros, es que no se sabe,
 * y no se puede colar un desconocido delante de uno que ya dio un buen precio.
 *
 * Los inactivos no salen. Los que ya tienen preguntado todo lo elegido, sí:
 * salen bloqueados, porque esconderlos hace pensar que se olvidaron.
 */
export function candidatosPara(
  elegidos: readonly string[],
  items: readonly ItemConsultado[],
  referencias: Readonly<Record<string, Referencia>>,
  enLaRonda: readonly ProveedorConsultado[],
  preguntadas: ReadonlySet<string>,
): Candidato[] {
  const productoDe = new Map(items.map((i) => [i.item_id, i.producto_id]));

  const cuenta = new Map<string, { nombre: string; costo: number | null; vende: number }>();
  for (const itemId of elegidos) {
    const productoId = productoDe.get(itemId);
    if (productoId === undefined) continue;
    for (const p of referencias[productoId]?.proveedores ?? []) {
      if (!p.activo) continue;
      const previo = cuenta.get(p.proveedor_id);
      cuenta.set(p.proveedor_id, {
        nombre: p.proveedor,
        // El más barato de los que dio: es el que hace pensar «a este».
        costo:
          previo?.costo == null
            ? p.ultimoCostoUsd
            : p.ultimoCostoUsd == null
              ? previo.costo
              : Math.min(previo.costo, p.ultimoCostoUsd),
        vende: (previo?.vende ?? 0) + 1,
      });
    }
  }

  return [...cuenta]
    .map(([proveedor_id, d]) => ({
      proveedor_id,
      proveedor: d.nombre,
      ultimoCostoUsd: d.costo,
      vende: d.vende,
      ...queLeFalta(proveedor_id, elegidos, enLaRonda, preguntadas),
    }))
    .sort((a, b) => {
      // Primero los que tienen algo que aportar.
      const utilA = a.porPreguntar.length > 0 ? 0 : 1;
      const utilB = b.porPreguntar.length > 0 ? 0 : 1;
      if (utilA !== utilB) return utilA - utilB;
      if (a.vende !== b.vende) return b.vende - a.vende;
      if (a.ultimoCostoUsd === null && b.ultimoCostoUsd === null) {
        return a.proveedor.localeCompare(b.proveedor);
      }
      if (a.ultimoCostoUsd === null) return 1;
      if (b.ultimoCostoUsd === null) return -1;
      if (a.ultimoCostoUsd !== b.ultimoCostoUsd) return a.ultimoCostoUsd - b.ultimoCostoUsd;
      return a.proveedor.localeCompare(b.proveedor);
    });
}
