import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

/**
 * A quién se le compró este producto, cuándo, a cuánto y con qué factura.
 *
 * Willy, 07/09 (29:47): *«tengo que tener un módulo para hacer la consulta: yo
 * digito el código y me debe aparecer el historial de compras. Le compré a A,
 * anteriormente lo compré a B, luego lo compré a C»*.
 *
 * ---------------------------------------------------------------------------
 * Compras, no cotizaciones
 * ---------------------------------------------------------------------------
 * Sale de `v_precios_compra`, que se alimenta de RECEPCIONES: lo que de verdad
 * entró al almacén y se pagó. No de `v_comparativa_precios`, que es lo que los
 * proveedores dijeron que costaría.
 *
 * La diferencia importa justo al negociar. Un precio que ya se pagó es una
 * factura; uno que solo se cotizó es una promesa, y el proveedor lo sabe.
 */

export interface CompraDeProducto {
  recepcionId: string;
  /** De qué compra salió (096). Null en una recepción suelta, sin compra. */
  compraId: string | null;
  proveedorId: string | null;
  /** El número de la recepción nuestra, para poder abrirla. */
  documento: string;
  fecha: string;
  proveedor: string | null;
  cantidad: number;
  costoUsd: number;
  /** Lo que costó la vez ANTERIOR, para decir si subió o bajó. */
  costoAnteriorUsd: number | null;
  /** Los dos papeles que se buscan cuando hay una discusión. */
  facturaProveedor: string | null;
  guiaProveedor: string | null;
}

export async function comprasDelProducto(
  productoId: string,
  limite = 12,
): Promise<{ ok: true; datos: CompraDeProducto[] } | { ok: false; error: string }> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_precios_compra")
      .select(
        "recepcion_id, documento, fecha, proveedor, proveedor_id, compra_id, cantidad, costo_usd, costo_anterior_usd, factura_proveedor, guia_proveedor",
      )
      .eq("producto_id", productoId)
      // La más reciente primero: es la que dice a cuánto está hoy.
      .order("fecha", { ascending: false })
      .limit(limite);

    if (error) return fallo(error, "productos/comprasDelProducto");

    return {
      ok: true,
      datos: (data ?? []).map((f) => ({
        recepcionId: String(f.recepcion_id),
        compraId: (f.compra_id as string | null) ?? null,
        proveedorId: (f.proveedor_id as string | null) ?? null,
        documento: String(f.documento ?? ""),
        fecha: String(f.fecha),
        proveedor: (f.proveedor as string | null) ?? null,
        cantidad: Number(f.cantidad ?? 0),
        costoUsd: Number(f.costo_usd ?? 0),
        costoAnteriorUsd:
          f.costo_anterior_usd === null ? null : Number(f.costo_anterior_usd),
        facturaProveedor: (f.factura_proveedor as string | null) ?? null,
        guiaProveedor: (f.guia_proveedor as string | null) ?? null,
      })),
    };
  } catch (e) {
    return fallo(e, "productos/comprasDelProducto");
  }
}

/**
 * A cuánto te lo deja cada proveedor, juntando lo PAGADO y lo COTIZADO.
 *
 * Luis, 21/09: *«él quiere historial, debería ser por producto: a cuánto le
 * están dejando, o a cuánto le dejaron las últimas veces, así ya sabe los
 * nuevos precios y sabe a quién preguntarle para la próxima, o a quiénes»*.
 *
 * ---------------------------------------------------------------------------
 * Por PROVEEDOR y no por fecha
 * ---------------------------------------------------------------------------
 * `comprasDelProducto`, aquí arriba, es el diario: cada entrada al almacén con
 * su factura. Contesta *«¿qué pasó?»*.
 *
 * Esto contesta la otra pregunta, que es la que se hace antes de coger el
 * teléfono: *«¿a quién le pregunto?»*. Y para eso el orden no es el del
 * tiempo sino el del precio — el más barato primero, que es por donde se
 * empieza.
 *
 * ---------------------------------------------------------------------------
 * Las dos fuentes, y por qué se distinguen
 * ---------------------------------------------------------------------------
 * · `v_proveedores_de_producto` — lo que se le PAGÓ. Sale de recepciones.
 * · `v_comparativa_precios` — lo que COTIZÓ en una ronda. Es una promesa.
 *
 * Se juntan pero no se confunden: cada fila dice de dónde viene. Un precio
 * pagado es una factura y el proveedor no lo puede negar; uno cotizado se
 * puede haber quedado viejo. Enseñar los dos como si fueran lo mismo haría
 * negociar sobre arena.
 *
 * De cada proveedor sale **UNA fila**: la más reciente. Lo que hace falta
 * saber es a cuánto te lo deja hoy, no a cuánto llegó a dejártelo.
 *
 * ---------------------------------------------------------------------------
 * `ultima_compra` en nulo NO es una compra
 * ---------------------------------------------------------------------------
 * Y costó un susto al probarlo. `proveedor_productos` —y con ella
 * `v_proveedores_de_producto`— se llena sola con **cada respuesta de una
 * ronda** (046), no solo con las compras: cotizar deja constancia de que ese
 * proveedor vende eso. Así que `ultimo_costo_usd` puede ser un precio que
 * nadie pagó nunca.
 *
 * Lo que distingue una cosa de otra es `ultima_compra`: si está en nulo, hubo
 * un WhatsApp y no una factura. La primera versión de esto etiquetaba «se le
 * compró» a un proveedor al que nunca se le compró — justo la confusión que
 * el resto de este comentario dice que no puede pasar.
 */
export interface PrecioDeProveedor {
  proveedorId: string | null;
  proveedor: string;
  costoUsd: number;
  fecha: string | null;
  origen: "comprado" | "cotizado";
  /** Sigue siendo proveedor vivo. Uno de baja se enseña, pero apagado. */
  activo: boolean;
}

export async function preciosPorProveedor(
  productoId: string,
): Promise<{ ok: true; datos: PrecioDeProveedor[] } | { ok: false; error: string }> {
  try {
    const supabase = await clienteServidor();

    const [pagado, cotizado] = await Promise.all([
      supabase
        .from("v_proveedores_de_producto")
        .select("proveedor_id, proveedor, ultimo_costo_usd, ultima_compra, proveedor_activo")
        .eq("producto_id", productoId)
        .not("ultimo_costo_usd", "is", null),
      supabase
        .from("v_comparativa_precios")
        .select("proveedor, costo_usd, fecha, consulta_estado")
        .eq("producto_id", productoId)
        .not("costo_usd", "is", null)
        // Una ronda anulada es una que se decidió que no valía: su precio no
        // puede seguir contando. Mismo criterio que `referenciasDeRonda`.
        .neq("consulta_estado", "anulada")
        .order("fecha", { ascending: false })
        .limit(200),
    ]);

    if (pagado.error) return fallo(pagado.error, "productos/preciosPorProveedor");
    if (cotizado.error) return fallo(cotizado.error, "productos/preciosPorProveedor");

    /*
      Una fila por proveedor, la más reciente.

      Se indexa por NOMBRE y no por id porque `v_comparativa_precios` trae el
      nombre del proveedor y no su id: sin esto, el mismo proveedor salía dos
      veces —una por cada vista— con el mismo precio y la misma fecha.
    */
    const porProveedor = new Map<string, PrecioDeProveedor>();

    /** Gana la fecha más reciente; sin fecha, pierde. A igual, manda la factura. */
    const quedarse = (nueva: PrecioDeProveedor) => {
      const previa = porProveedor.get(nueva.proveedor);
      if (!previa) {
        porProveedor.set(nueva.proveedor, nueva);
        return;
      }
      const f1 = previa.fecha ?? "";
      const f2 = nueva.fecha ?? "";
      if (f2 > f1 || (f2 === f1 && nueva.origen === "comprado")) {
        porProveedor.set(nueva.proveedor, nueva);
      }
    };

    for (const p of pagado.data ?? []) {
      const costo = Number(p.ultimo_costo_usd ?? 0);
      if (costo <= 0) continue;
      const ultimaCompra = (p.ultima_compra as string | null) ?? null;
      quedarse({
        proveedorId: p.proveedor_id ? String(p.proveedor_id) : null,
        proveedor: String(p.proveedor ?? "—"),
        costoUsd: costo,
        fecha: ultimaCompra,
        // Sin fecha de compra no hubo compra: el precio entró por una ronda.
        origen: ultimaCompra !== null ? "comprado" : "cotizado",
        activo: p.proveedor_activo !== false,
      });
    }

    /*
      Lo cotizado. La vista trae una fila por ronda y viene ordenada por fecha
      descendente, así que la primera de cada proveedor es la más reciente.
    */
    const vistos = new Set<string>();
    for (const c of cotizado.data ?? []) {
      const nombre = String(c.proveedor ?? "—");
      if (vistos.has(nombre)) continue;
      const costo = Number(c.costo_usd ?? 0);
      if (costo <= 0) continue;
      vistos.add(nombre);
      quedarse({
        proveedorId: null,
        proveedor: nombre,
        costoUsd: costo,
        fecha: (c.fecha as string | null) ?? null,
        origen: "cotizado",
        activo: true,
      });
    }

    const filas = [...porProveedor.values()];

    // Del más barato al más caro: es por donde se empieza a preguntar. A
    // igual precio manda lo comprado, que es una factura y no una promesa.
    filas.sort(
      (a, b) =>
        a.costoUsd - b.costoUsd ||
        (a.origen === "comprado" ? -1 : 1) - (b.origen === "comprado" ? -1 : 1),
    );

    return { ok: true, datos: filas };
  } catch (e) {
    return fallo(e, "productos/preciosPorProveedor");
  }
}
