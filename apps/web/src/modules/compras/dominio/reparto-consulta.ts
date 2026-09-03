/**
 * A quién se le pregunta qué, cuando los productos no comparten proveedor.
 *
 * ---------------------------------------------------------------------------
 * El caso de Rodatech
 * ---------------------------------------------------------------------------
 * Luis, 03/09: *«cada producto es de diferente proveedor, no el mismo. Cada
 * producto puede tener hasta 5 proveedores; se les va a enviar a los 5 un
 * mensaje preguntando el precio»*.
 *
 * Un pedido con dos líneas —unas chapas SKF y un retén— tiene dos juegos de
 * proveedores distintos. Hasta ahora se mandaba **la lista entera a todos**,
 * así que al de retenes le llegaba un mensaje pidiéndole chapas que no vende.
 *
 * ---------------------------------------------------------------------------
 * Junto o separado
 * ---------------------------------------------------------------------------
 * Las dos formas son legítimas y dependen de a quién se le pregunte:
 *
 *  · **Junto** — un mensaje con todo, a cada proveedor. Es lo que se hace con
 *    un distribuidor general, al que se le pide de todo aunque no lo tenga
 *    todo. Menos mensajes y una sola conversación.
 *  · **Separado** — a cada proveedor solo lo suyo. Es lo que se hace con
 *    especialistas: al de retenes, retenes.
 *
 * No lo decide el sistema, lo decide quien pregunta. Pero sí PROPONE, porque
 * el dato para decidir ya está: si ningún proveedor cubre todos los productos,
 * mandar la lista entera es mandar ruido.
 */

/** Un producto de la consulta. */
export interface ItemConsulta {
  producto_id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad: string;
  cantidad: number;
}

/** Lo mínimo de un proveedor para repartir. */
export interface ProveedorParaRepartir {
  id: string;
  razon_social: string;
}

/**
 * La selección: para cada producto, a qué proveedores se le pregunta.
 *
 * Es un mapa y no dos listas porque en «separado» un proveedor puede estar
 * marcado para un producto y no para otro, y eso no se puede expresar con un
 * conjunto de proveedores suelto.
 */
export type Seleccion = Readonly<Record<string, readonly string[]>>;

/** Lo que se le manda a UN proveedor. */
export interface GrupoDeEnvio {
  proveedor: ProveedorParaRepartir;
  /** Sus productos, en el orden de la consulta. */
  items: ItemConsulta[];
}

export type Modo = "junto" | "separado";

/**
 * Qué modo proponer.
 *
 * `separado` cuando ningún proveedor conocido cubre todos los productos: ahí
 * la lista entera es ruido garantizado para alguien. `junto` cuando alguno los
 * cubre todos, o cuando solo hay un producto —donde la distinción no existe—.
 */
export function modoSugerido(
  items: readonly ItemConsulta[],
  porProducto: Readonly<Record<string, readonly string[]>>,
): Modo {
  if (items.length <= 1) return "junto";

  const cuenta = new Map<string, number>();
  for (const item of items) {
    for (const p of porProducto[item.producto_id] ?? []) {
      cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
    }
  }

  const cubreTodo = [...cuenta.values()].some((n) => n === items.length);
  return cubreTodo ? "junto" : "separado";
}

/**
 * Los envíos que salen de una selección.
 *
 * Uno por proveedor, con SUS productos. Un proveedor marcado en tres
 * productos recibe un mensaje con los tres, no tres mensajes: es una sola
 * conversación de WhatsApp con la misma persona.
 *
 * Los que no tienen ningún producto no salen. Puede pasar al cambiar de modo
 * o al desmarcar, y un mensaje vacío no se le manda a nadie.
 */
export function gruposDeEnvio(
  items: readonly ItemConsulta[],
  seleccion: Seleccion,
  proveedores: readonly ProveedorParaRepartir[],
): GrupoDeEnvio[] {
  const porId = new Map(proveedores.map((p) => [p.id, p]));
  const grupos = new Map<string, GrupoDeEnvio>();

  // Se recorre por ITEM y no por proveedor para que el orden de los productos
  // dentro de cada mensaje sea el de la consulta. Un mensaje cuyo orden cambia
  // entre dos cargas es un mensaje que no se puede comparar con el anterior.
  for (const item of items) {
    for (const id of seleccion[item.producto_id] ?? []) {
      const proveedor = porId.get(id);
      if (!proveedor) continue;
      const grupo = grupos.get(id);
      if (grupo) grupo.items.push(item);
      else grupos.set(id, { proveedor, items: [item] });
    }
  }

  return [...grupos.values()].sort((a, b) =>
    a.proveedor.razon_social.localeCompare(b.proveedor.razon_social),
  );
}

/** Cuántos proveedores distintos hay marcados en toda la selección. */
export function cuantosProveedores(seleccion: Seleccion): number {
  const vistos = new Set<string>();
  for (const ids of Object.values(seleccion)) for (const id of ids) vistos.add(id);
  return vistos.size;
}

/** Los productos que no tienen a nadie marcado: nadie les va a poner precio. */
export function sinNadie(
  items: readonly ItemConsulta[],
  seleccion: Seleccion,
): ItemConsulta[] {
  return items.filter((i) => (seleccion[i.producto_id] ?? []).length === 0);
}

/**
 * El payload de `crear_consulta_precio`, con el reparto dentro.
 *
 * Se arma aquí y no en la pantalla para poder probarlo: es lo que decide a
 * quién se le pregunta qué, y equivocarse manda mensajes a quien no toca.
 */
export function aPayloadDeConsulta(
  items: readonly ItemConsulta[],
  seleccion: Seleccion,
  proveedores: readonly ProveedorParaRepartir[],
  nota: string | null,
): {
  nota: string | null;
  items: { producto_id: string; cantidad: number }[];
  proveedores: { proveedor_id: string; productos: string[] }[];
} {
  const grupos = gruposDeEnvio(items, seleccion, proveedores);

  return {
    nota,
    // Solo los productos que alguien va a cotizar. Meter en la ronda uno que
    // no se le preguntó a nadie deja una fila que nunca se va a poder
    // completar, y la rejilla la enseñaría vacía para siempre.
    items: items
      .filter((i) => (seleccion[i.producto_id] ?? []).length > 0)
      .map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
    proveedores: grupos.map((g) => ({
      proveedor_id: g.proveedor.id,
      productos: g.items.map((i) => i.producto_id),
    })),
  };
}
