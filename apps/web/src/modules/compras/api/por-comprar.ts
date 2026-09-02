import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { sumarDias } from "@/modules/cotizaciones";
import { fallo } from "@/lib/errores";

import {
  agruparPorComprar,
  fechaPrometida,
  resumirPorComprar,
  type LineaComprometida,
  type PedidoPendiente,
  type ProductoPorComprar,
  type ResumenPorComprar,
} from "../dominio/por-comprar";
import type { ProductoParaComprar } from "../dominio/constructor";
import type { Resultado } from "./consultas";

/**
 * Los datos de la bandeja «Por comprar».
 *
 * Dos lecturas y una cuenta. Las vistas ya existen —`v_comprometido` (041) y
 * `v_pedido_pendiente` (045)—; el reparto del stock entre los clientes que
 * esperan lo hace `dominio/por-comprar.ts`, que está probado sin base de
 * datos porque es donde se decide cuánta mercadería se compra.
 */

/**
 * Cuántas líneas confirmadas se leen como mucho.
 *
 * No es paginación: la bandeja tiene que sumar TODO para poder decir «faltan
 * 12», así que media lista daría una cifra falsa. El tope existe solo para que
 * una base en un estado imprevisto no tumbe la pantalla, y por eso se pide una
 * de más y se DICE cuando se llega a él.
 *
 * Ese aviso es la lección de los tres contadores de PENDIENTES §0.3: llevaban
 * meses dando cifras redondeadas al límite de la consulta, y nadie lo notó
 * porque el límite era silencioso. Un número incompleto que se anuncia se
 * arregla; uno que no, se cree.
 */
const TOPE_LINEAS = 3000;

/** PostgREST monta el `in.()` en la URL, y una URL tiene largo máximo. */
const POR_TANDA = 150;

export interface BandejaPorComprar {
  filas: ProductoPorComprar[];
  resumen: ResumenPorComprar;
  /** El día en Lima con el que se calcularon los vencimientos. */
  hoy: string;
  /** Se llegó al tope y las cifras se quedan cortas. Hay que decirlo. */
  truncado: boolean;
}

/** Fila cruda de `v_comprometido`. */
interface FilaComprometido {
  item_id: string;
  cotizacion_id: string;
  cotizacion: string;
  fecha: string;
  cliente_id: string;
  cliente: string | null;
  producto_id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  disponibilidad: string;
  dias_entrega: number | null;
  comprometido: number | string;
  stock: number | string;
  costo_referencia: number | string | null;
}

/** Fila cruda de `v_pedido_pendiente`. */
interface FilaPedido {
  producto_id: string;
  pendiente: number | string;
  compras: number | string;
  proxima_llegada: string | null;
  primera_compra: string | null;
}

/** Postgres devuelve los `numeric` como texto para no perder precisión. */
const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** El enum de la 040. Cualquier otra cosa se trata como inmediata. */
function disponibilidadDe(v: string): LineaComprometida["disponibilidad"] {
  return v === "exterior" || v === "fabricacion" ? v : "inmediata";
}

export async function bandejaPorComprar(): Promise<Resultado<BandejaPorComprar>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("v_comprometido")
      .select(
        `item_id, cotizacion_id, cotizacion, fecha, cliente_id, cliente,
         producto_id, codigo, descripcion, marca, disponibilidad, dias_entrega,
         comprometido, stock, costo_referencia`,
      )
      // Por producto y por fecha, para que el reparto no dependa del orden en
      // que a Postgres le apetezca devolver las filas.
      .order("producto_id", { ascending: true })
      .order("fecha", { ascending: true })
      .limit(TOPE_LINEAS + 1);

    if (error) return fallo(error);

    const crudas = (data ?? []) as unknown as FilaComprometido[];
    const truncado = crudas.length > TOPE_LINEAS;
    const usables = truncado ? crudas.slice(0, TOPE_LINEAS) : crudas;

    const lineas: LineaComprometida[] = usables.map((f) => ({
      item_id: f.item_id,
      cotizacion_id: f.cotizacion_id,
      cotizacion: f.cotizacion,
      fecha: String(f.fecha).slice(0, 10),
      cliente_id: f.cliente_id,
      cliente: f.cliente ?? "—",
      producto_id: f.producto_id,
      codigo: f.codigo,
      descripcion: f.descripcion,
      marca: f.marca,
      disponibilidad: disponibilidadDe(f.disponibilidad),
      dias_entrega: f.dias_entrega === null ? null : Number(f.dias_entrega),
      comprometido: num(f.comprometido),
      stock: num(f.stock),
      costo_referencia: num(f.costo_referencia),
    }));

    const pedidos = await pedidosDe(
      supabase,
      [...new Set(lineas.map((l) => l.producto_id))],
    );
    if (!pedidos.ok) return pedidos;

    const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
      new Date(),
    );
    const filas = agruparPorComprar(lineas, pedidos.datos, hoy, sumarDias);

    return { ok: true, datos: { filas, resumen: resumirPorComprar(filas), hoy, truncado } };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Lo pedido a proveedores de esos productos, y solo de esos.
 *
 * Se pregunta por los ids que hacen falta en lugar de leer la vista entera: si
 * la lectura se cortara por un límite, `falta` saldría de MÁS —contaría como
 * no pedido algo que sí lo está— y la bandeja mandaría a comprar dos veces.
 * Preguntando por ids no hay nada que cortar.
 */
async function pedidosDe(
  supabase: Awaited<ReturnType<typeof clienteServidor>>,
  ids: string[],
): Promise<Resultado<PedidoPendiente[]>> {
  if (ids.length === 0) return { ok: true, datos: [] };

  const salida: PedidoPendiente[] = [];

  for (let i = 0; i < ids.length; i += POR_TANDA) {
    const tanda = ids.slice(i, i + POR_TANDA);
    const { data, error } = await supabase
      .from("v_pedido_pendiente")
      .select("producto_id, pendiente, compras, proxima_llegada, primera_compra")
      .in("producto_id", tanda);

    if (error) return fallo(error);

    for (const f of (data ?? []) as unknown as FilaPedido[]) {
      salida.push({
        producto_id: f.producto_id,
        pendiente: num(f.pendiente),
        compras: num(f.compras),
        proxima_llegada: f.proxima_llegada ? String(f.proxima_llegada).slice(0, 10) : null,
        primera_compra: f.primera_compra,
      });
    }
  }

  return { ok: true, datos: salida };
}

/**
 * Un producto de la bandeja listo para caer en el registro de la compra.
 *
 * El producto es el tipo del DOMINIO, no una copia: el constructor lo va a
 * recibir tal cual, y dos formas parecidas que se separan con el tiempo son
 * la manera más silenciosa de romper esto.
 */
export interface Precarga {
  producto: ProductoParaComprar;
  cantidad: number;
}

/**
 * De «me faltan 12 del 6205» a una compra con esa línea puesta.
 *
 * La bandeja pasa `producto:cantidad` por la URL y esto lo convierte en algo
 * que el constructor entiende. Los ids se resuelven contra el maestro y no se
 * confía en nada de lo que venga en la dirección: un id inventado sencillamente
 * no aparece, y la cantidad se limpia aquí.
 *
 * Se conserva el ORDEN en que venían, que es el de la bandeja —lo más urgente
 * primero—, porque es el que quien mira espera encontrarse.
 */
export async function precargaDeCompra(
  crudo: string | undefined,
): Promise<Precarga[]> {
  if (!crudo) return [];

  const pedidas = new Map<string, number>();
  for (const trozo of crudo.split(",").slice(0, 100)) {
    const [id, cantidad] = trozo.split(":");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) continue;
    const n = Number(cantidad);
    pedidas.set(id, Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 1);
  }
  if (pedidas.size === 0) return [];

  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("productos")
    // El stock viene con el producto porque el constructor pinta «4 → 12» al
    // lado de la cantidad. Sin él escribiría «0 → 12», que es una cifra falsa
    // justo en la pantalla donde se decide cuánto pedir.
    .select(
      "id, codigo, descripcion, unidad_codigo, costo_promedio, stock_minimo, marcas(nombre), stock(cantidad)",
    )
    .in("id", [...pedidas.keys()]);

  if (error || !data) return [];

  const porId = new Map(
    (data as unknown as {
      id: string;
      codigo: string;
      descripcion: string;
      unidad_codigo: string;
      costo_promedio: number | string;
      stock_minimo: number | string;
      marcas: { nombre: string } | null;
      stock: { cantidad: number | string } | { cantidad: number | string }[] | null;
    }[]).map((p) => [p.id, p]),
  );

  const salida: Precarga[] = [];
  for (const [id, cantidad] of pedidas) {
    const p = porId.get(id);
    if (!p) continue;
    salida.push({
      producto: {
        id: p.id,
        codigo: p.codigo,
        descripcion: p.descripcion,
        marca: p.marcas?.nombre ?? null,
        unidad: p.unidad_codigo,
        // `stock` es 1:1 por la clave primaria, pero PostgREST devuelve unas
        // veces el objeto y otras un array de uno según cómo infiera la
        // relación. Se aceptan las dos formas en vez de confiar en una.
        stock: num(
          Array.isArray(p.stock) ? p.stock[0]?.cantidad : p.stock?.cantidad,
        ),
        costo_promedio: num(p.costo_promedio),
        stock_minimo: num(p.stock_minimo),
      },
      cantidad,
    });
  }
  return salida;
}

/** Un cliente que está esperando algo de lo que se va a comprar. */
export interface QuienEspera {
  cliente: string;
  cotizacion: string;
  cotizacion_id: string;
  /** Los códigos de esta compra que él espera. */
  codigos: string[];
  /** La fecha prometida más cercana de sus líneas. */
  prometida: string;
}

/**
 * Para quién es esta compra.
 *
 * Cuando se compra desde la bandeja, la compra tiene un motivo —un cliente que
 * confirmó y espera— y ese motivo se perdía por el camino: la pantalla de
 * compra no lo enseñaba, y quien recibía la mercadería días después no tenía
 * forma de saber que esas 8 unidades ya tenían dueño.
 *
 * No hace falta pasarlo por la URL: con los productos basta, porque
 * `v_comprometido` sabe quién espera cada uno.
 */
export async function paraQuienEs(
  productoIds: readonly string[],
): Promise<QuienEspera[]> {
  if (productoIds.length === 0) return [];

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_comprometido")
      .select("cliente, cotizacion, cotizacion_id, codigo, fecha, disponibilidad, dias_entrega")
      .in("producto_id", [...productoIds].slice(0, 150))
      .limit(300);

    if (error || !data) return [];

    const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
      new Date(),
    );

    const porCotizacion = new Map<string, QuienEspera>();
    for (const f of data as unknown as {
      cliente: string | null;
      cotizacion: string;
      cotizacion_id: string;
      codigo: string;
      fecha: string;
      disponibilidad: string;
      dias_entrega: number | null;
    }[]) {
      const prometida = fechaPrometida(
        {
          fecha: String(f.fecha).slice(0, 10),
          disponibilidad: disponibilidadDe(f.disponibilidad),
          dias_entrega: f.dias_entrega === null ? null : Number(f.dias_entrega),
        },
        hoy,
        sumarDias,
      );

      const previo = porCotizacion.get(f.cotizacion_id);
      if (previo) {
        if (!previo.codigos.includes(f.codigo)) previo.codigos.push(f.codigo);
        if (prometida < previo.prometida) previo.prometida = prometida;
      } else {
        porCotizacion.set(f.cotizacion_id, {
          cliente: f.cliente ?? "—",
          cotizacion: f.cotizacion,
          cotizacion_id: f.cotizacion_id,
          codigos: [f.codigo],
          prometida,
        });
      }
    }

    // El que antes lo espera, primero.
    return [...porCotizacion.values()].sort((a, b) =>
      a.prometida.localeCompare(b.prometida),
    );
  } catch {
    // Es un adorno informativo sobre una pantalla que tiene que abrir igual.
    // Tumbarla porque no se pudo averiguar para quién es sería absurdo.
    return [];
  }
}
