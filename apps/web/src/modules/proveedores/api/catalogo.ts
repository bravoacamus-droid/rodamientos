import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type { Resultado } from "../dominio/tipos";

/**
 * Qué vende cada proveedor.
 *
 * La tabla `proveedor_productos` (046) se llena sola con cada compra —hay un
 * disparador— y a mano para lo que todavía no se le ha comprado. Esto solo
 * lee; escribir es cosa de `acciones/catalogo.ts`, que va por el RPC.
 */

export interface ProductoDeProveedor {
  producto_id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad: string;
  /** Cuántas compras lo incluyeron. 0 = solo declarado a mano. */
  veces: number;
  ultimaCompra: string | null;
  /** En la moneda de la factura del proveedor. */
  ultimoCosto: number | null;
  moneda: string | null;
  ultimoCostoUsd: number | null;
  declarado: boolean;
  notas: string | null;
  /** Es el proveedor habitual de ese producto (`productos.proveedor_id`, 025). */
  esHabitual: boolean;
}

/** Un proveedor al que se le puede pedir un producto. */
export interface ProveedorDeProducto {
  proveedor_id: string;
  proveedor: string;
  codigo: string;
  activo: boolean;
  leadTimeDias: number;
  diasPago: number;
  veces: number;
  ultimaCompra: string | null;
  ultimoCosto: number | null;
  moneda: string | null;
  ultimoCostoUsd: number | null;
  declarado: boolean;
  notas: string | null;
  esHabitual: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const opcional = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fecha = (v: unknown): string | null => (v ? String(v).slice(0, 10) : null);

/**
 * El catálogo de un proveedor.
 *
 * Ordenado por lo más comprado y luego por lo más reciente: lo que se le pide
 * siempre tiene que salir arriba, y lo declarado a mano y nunca comprado,
 * abajo. Es el orden en que se busca cuando hay que llamarle.
 */
export async function productosDeProveedor(
  proveedorId: string,
): Promise<Resultado<ProductoDeProveedor[]>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("proveedor_productos")
      .select(
        `producto_id, comprado_veces, ultima_compra, ultimo_costo,
         ultimo_costo_usd, moneda, declarado, notas,
         productos(codigo, descripcion, unidad_codigo, proveedor_id, marcas(nombre))`,
      )
      .eq("proveedor_id", proveedorId)
      .order("comprado_veces", { ascending: false })
      .order("ultima_compra", { ascending: false, nullsFirst: false })
      .limit(500);

    if (error) return fallo(error);

    const filas = (data ?? []) as unknown as {
      producto_id: string;
      comprado_veces: number | string;
      ultima_compra: string | null;
      ultimo_costo: number | string | null;
      ultimo_costo_usd: number | string | null;
      moneda: string | null;
      declarado: boolean;
      notas: string | null;
      productos: {
        codigo: string;
        descripcion: string;
        unidad_codigo: string;
        proveedor_id: string | null;
        marcas: { nombre: string } | null;
      } | null;
    }[];

    return {
      ok: true,
      datos: filas
        // Un producto borrado deja la fila sin ficha. No debería pasar —hay
        // `on delete cascade`— pero pintar una línea vacía sería peor.
        .filter((f) => f.productos !== null)
        .map((f) => ({
          producto_id: f.producto_id,
          codigo: f.productos?.codigo ?? "",
          descripcion: f.productos?.descripcion ?? "",
          marca: f.productos?.marcas?.nombre ?? null,
          unidad: f.productos?.unidad_codigo ?? "NIU",
          veces: num(f.comprado_veces),
          ultimaCompra: fecha(f.ultima_compra),
          ultimoCosto: opcional(f.ultimo_costo),
          moneda: f.moneda,
          ultimoCostoUsd: opcional(f.ultimo_costo_usd),
          declarado: Boolean(f.declarado),
          notas: f.notas,
          esHabitual: f.productos?.proveedor_id === proveedorId,
        })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * A quién se le puede pedir un producto.
 *
 * Ordenado por el costo en DÓLARES, el más barato primero — es la pregunta
 * que se hace quien mira esto—, y los que nunca lo han cobrado al final: sin
 * precio no se puede afirmar que sean baratos.
 */
export async function proveedoresDeProducto(
  productoId: string,
): Promise<Resultado<ProveedorDeProducto[]>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("v_proveedores_de_producto")
      .select(
        `proveedor_id, proveedor, proveedor_codigo, proveedor_activo,
         lead_time_dias, dias_pago, comprado_veces, ultima_compra,
         ultimo_costo, ultimo_costo_usd, moneda, declarado, notas, es_habitual`,
      )
      .eq("producto_id", productoId)
      .limit(50);

    if (error) return fallo(error);

    const filas = (data ?? []) as unknown as Record<string, unknown>[];

    return {
      ok: true,
      datos: filas
        .map((f) => ({
          proveedor_id: String(f.proveedor_id),
          proveedor: String(f.proveedor ?? ""),
          codigo: String(f.proveedor_codigo ?? ""),
          activo: Boolean(f.proveedor_activo),
          leadTimeDias: num(f.lead_time_dias),
          diasPago: num(f.dias_pago),
          veces: num(f.comprado_veces),
          ultimaCompra: fecha(f.ultima_compra),
          ultimoCosto: opcional(f.ultimo_costo),
          moneda: (f.moneda as string | null) ?? null,
          ultimoCostoUsd: opcional(f.ultimo_costo_usd),
          declarado: Boolean(f.declarado),
          notas: (f.notas as string | null) ?? null,
          esHabitual: Boolean(f.es_habitual),
        }))
        .sort((a, b) => {
          // Los de baja al final: no se les puede comprar aunque sean baratos.
          if (a.activo !== b.activo) return a.activo ? -1 : 1;
          const ca = a.ultimoCostoUsd;
          const cb = b.ultimoCostoUsd;
          if (ca === null && cb === null) return a.proveedor.localeCompare(b.proveedor);
          if (ca === null) return 1;
          if (cb === null) return -1;
          return ca - cb;
        }),
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Un proveedor al que tiene sentido pedirle precio de una lista de productos. */
export interface ProveedorParaPedir {
  id: string;
  razon_social: string;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  /** Cuántos de los productos pedidos le constan como que vende. */
  coincidencias: number;
  /** Y de esos, el último costo más reciente en dólares, si lo hay. */
  ultimoCostoUsd: number | null;
}

/**
 * A quién pedirle precio de estos productos.
 *
 * Sale de lo que el sistema ha aprendido de cada compra (`proveedor_productos`,
 * migración 046). Ordenados por cuántos de los productos pedidos vende: al que
 * le vende los cinco se le pide una vez, y a cinco proveedores de uno cada uno
 * se les pide cinco veces.
 *
 * Trae los datos de contacto porque son los que deciden si el botón de mandar
 * existe. Hoy los 97 proveedores están sin teléfono y sin correo —el Excel del
 * 02/09 no los traía— así que la pantalla los va a enseñar sin botón y
 * diciendo por qué, que es más útil que no enseñarlos.
 */
export async function proveedoresParaPedir(
  productoIds: readonly string[],
): Promise<Resultado<ProveedorParaPedir[]>> {
  if (productoIds.length === 0) return { ok: true, datos: [] };

  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("proveedor_productos")
      .select(
        `proveedor_id, ultimo_costo_usd,
         proveedores!inner(id, razon_social, telefono, whatsapp, email, activo)`,
      )
      .in("producto_id", [...productoIds].slice(0, 150))
      .eq("proveedores.activo", true);

    if (error) return fallo(error);

    const filas = (data ?? []) as unknown as {
      proveedor_id: string;
      ultimo_costo_usd: number | string | null;
      proveedores: {
        id: string;
        razon_social: string;
        telefono: string | null;
        whatsapp: string | null;
        email: string | null;
      } | null;
    }[];

    const porProveedor = new Map<string, ProveedorParaPedir>();
    for (const f of filas) {
      const p = f.proveedores;
      if (!p) continue;
      const previo = porProveedor.get(f.proveedor_id);
      const costo = opcional(f.ultimo_costo_usd);
      if (previo) {
        previo.coincidencias += 1;
        // El más reciente no se sabe desde aquí; se queda el primero que trae
        // precio, que basta como referencia de «a este ya le compraba».
        previo.ultimoCostoUsd ??= costo;
      } else {
        porProveedor.set(f.proveedor_id, {
          id: p.id,
          razon_social: p.razon_social,
          telefono: p.telefono,
          whatsapp: p.whatsapp,
          email: p.email,
          coincidencias: 1,
          ultimoCostoUsd: costo,
        });
      }
    }

    return {
      ok: true,
      datos: [...porProveedor.values()].sort(
        (a, b) =>
          b.coincidencias - a.coincidencias ||
          a.razon_social.localeCompare(b.razon_social),
      ),
    };
  } catch (e) {
    return fallo(e);
  }
}
