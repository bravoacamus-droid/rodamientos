"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";

import { anotarFallo } from "@/lib/errores";

/**
 * El comparador de proveedores: abrir la ronda, apuntar lo que contestaron y
 * convertir lo elegido en compras.
 *
 * Ninguna de las tres manda nada a nadie. La ronda se abre desde «Pedir
 * precio», que genera los enlaces de WhatsApp y los abre el navegador; aquí
 * solo se guarda qué se preguntó para poder anotar las respuestas después.
 */

/** La misma lista que `permisos_rol` tiene para `compras`. */
const ROLES = ["gerencia", "admin", "compras"] as const;

/**
 * El tipo va escrito y no inferido: con dos ramas que solo se distinguen por
 * qué campo traen, TypeScript infiere `error?: string` en las dos y el
 * estrechamiento por `in` no llega a servir de nada.
 */
async function quienEs(): Promise<{ error: string } | { error?: never }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { error: "Tu rol no puede pedir precios." };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Abrir la ronda
// ---------------------------------------------------------------------------

const esquemaCrear = z.object({
  nota: z.string().max(500).nullable().default(null),
  items: z
    .array(
      z.object({
        producto_id: z.string().uuid(),
        cantidad: z.number().positive().finite(),
      }),
    )
    .min(1, "No hay ningún producto que preguntar.")
    .max(200),
  /**
   * A quién se le pregunta, y QUÉ.
   *
   * Cada producto puede tener sus propios proveedores —unas chapas SKF y un
   * retén no los vende la misma gente— así que la ronda lleva el reparto
   * dentro (058). La forma antigua, un array de uuid, sigue valiendo en la
   * base para cuando de verdad se pregunta lo mismo a todos.
   */
  proveedores: z
    .array(
      z.object({
        proveedor_id: z.string().uuid(),
        productos: z
          .array(z.string().uuid())
          .min(1, "Un proveedor sin productos no tiene a qué contestar."),
      }),
    )
    .min(1, "Hay que elegir a quién preguntarle.")
    .max(20),
});

export type ResultadoRonda =
  | { ok: true; id: string; numero: string }
  | { ok: false; error: string };

export async function abrirRonda(datosCrudos: unknown): Promise<ResultadoRonda> {
  const quien = await quienEs();
  if (quien.error) return { ok: false, error: quien.error };

  let datos: z.infer<typeof esquemaCrear>;
  try {
    datos = esquemaCrear.parse(datosCrudos);
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}` };
  }

  // El UNIQUE de la base lo rechazaría igual, pero con «viola una
  // restricción». Mismo invariante en dos capas, a propósito.
  if (new Set(datos.items.map((i) => i.producto_id)).size !== datos.items.length) {
    return { ok: false, error: "Hay un producto repetido en la lista." };
  }
  const ids = datos.proveedores.map((p) => p.proveedor_id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Hay un proveedor repetido." };
  }

  // Asignarle a alguien un producto que no está en la lista dejaría una
  // asignación sin ítem, y la base la descartaría en silencio.
  const productos = new Set(datos.items.map((i) => i.producto_id));
  if (datos.proveedores.some((p) => p.productos.some((x) => !productos.has(x)))) {
    return {
      ok: false,
      error: "A un proveedor se le asignó un producto que no está en la consulta.",
    };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("crear_consulta_precio", {
      p_datos: datos as unknown as Json,
    });
    if (error) {
      anotarFallo("compras/abrirRonda", error, "/compras/precios");
      return { ok: false, error: error.message };
    }

    const r = data as unknown as { id: string; numero: string };
    revalidatePath("/compras/precios");
    return { ok: true, id: r.id, numero: r.numero };
  } catch (e) {
    anotarFallo("compras/abrirRonda", e, "/compras/precios");
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo abrir la consulta.",
    };
  }
}

// ---------------------------------------------------------------------------
// Apuntar lo que contestó uno
// ---------------------------------------------------------------------------

const esquemaAnotar = z.object({
  consulta_proveedor_id: z.string().uuid(),
  estado: z.enum(["esperando", "respondio", "no_contesto", "no_tiene"]),
  moneda: z.enum(["USD", "PEN"]),
  tipo_cambio: z.number().positive().finite().nullable().default(null),
  incluye_igv: z.boolean(),
  validez_hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de validez no es válida.")
    .nullable()
    .default(null),
  dias_entrega: z.number().int().min(0).max(999).nullable().default(null),
  nota: z.string().max(1000).nullable().default(null),
  lineas: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        costo_unitario: z.number().nonnegative().finite().nullable(),
        dias_entrega: z.number().int().min(0).max(999).nullable(),
        disponible: z.boolean(),
        nota: z.string().max(300).nullable(),
      }),
    )
    .max(200),
});

export type ResultadoAnotar = { ok: true; lineas: number } | { ok: false; error: string };

export async function anotarRespuesta(datosCrudos: unknown): Promise<ResultadoAnotar> {
  const quien = await quienEs();
  if (quien.error) return { ok: false, error: quien.error };

  let datos: z.infer<typeof esquemaAnotar>;
  try {
    datos = esquemaAnotar.parse(datosCrudos);
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}` };
  }

  // El mismo mensaje legible que en `registrarCompra`, y por el mismo motivo:
  // sin tipo de cambio, un precio en soles no se puede comparar contra uno en
  // dólares — y compararlo tal cual es equivocarse por casi cuatro.
  if (datos.moneda !== "USD" && !datos.tipo_cambio) {
    return {
      ok: false,
      error:
        "Falta el tipo de cambio. Sin él, un precio en soles no se puede comparar con uno en dólares.",
    };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("anotar_respuesta_precio", {
      p_datos: datos as unknown as Json,
    });
    if (error) {
      anotarFallo("compras/anotarRespuesta", error, "/compras/precios");
      return { ok: false, error: error.message };
    }

    revalidatePath("/compras/precios");
    return { ok: true, lineas: Number((data as { lineas?: number })?.lineas ?? 0) };
  } catch (e) {
    anotarFallo("compras/anotarRespuesta", e, "/compras/precios");
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar la respuesta.",
    };
  }
}

// ---------------------------------------------------------------------------
// Convertir lo elegido en compras
// ---------------------------------------------------------------------------

const esquemaComprar = z.object({
  consulta_id: z.string().uuid(),
  compras: z
    .array(
      z.object({
        proveedor_id: z.string().uuid(),
        moneda: z.enum(["USD", "PEN"]),
        tipo_cambio: z.number().positive().finite().nullable(),
        tipo: z.enum(["local", "importacion"]).default("local"),
        fecha_estimada: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .default(null),
        lineas: z
          .array(
            z.object({
              producto_id: z.string().uuid(),
              cantidad: z.number().positive().finite(),
              costo_unitario: z.number().nonnegative().finite(),
            }),
          )
          .min(1),
      }),
    )
    .min(1, "No hay nada elegido que comprar.")
    .max(20),
});

export interface CompraHecha {
  proveedor_id: string;
  numero: string;
  id: string;
  total: number;
}

export type ResultadoComprar =
  | { ok: true; compras: CompraHecha[]; fallidas: { proveedor_id: string; error: string }[] }
  | { ok: false; error: string };

/**
 * Una compra por proveedor, desde la comparación.
 *
 * **Cada compra va por su cuenta, y a propósito.** Son documentos
 * independientes con su propio correlativo; si la segunda falla, la primera
 * sigue siendo una compra buena y hay que decir cuál salió y cuál no. Meterlas
 * todas en una transacción haría lo contrario: perder una compra correcta
 * porque otra, de otro proveedor, tenía un problema.
 *
 * El enlace con la ronda se pone DESPUÉS de crearla, con un update aparte.
 * `crear_compra` no acepta el campo y redefinirla entera por tercera vez para
 * añadirle una columna sería duplicar 130 líneas. Si el enlace falla, la
 * compra existe igual — que es el orden correcto de las dos pérdidas.
 */
export async function comprarDeLaRonda(datosCrudos: unknown): Promise<ResultadoComprar> {
  const quien = await quienEs();
  if (quien.error) return { ok: false, error: quien.error };

  let datos: z.infer<typeof esquemaComprar>;
  try {
    datos = esquemaComprar.parse(datosCrudos);
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}` };
  }

  for (const c of datos.compras) {
    if (c.moneda !== "USD" && !c.tipo_cambio) {
      return {
        ok: false,
        error:
          "Una de las compras es en soles y no tiene tipo de cambio. Anótalo en la respuesta de ese proveedor antes de comprar.",
      };
    }
  }

  const supabase = await clienteServidor();
  const hechas: CompraHecha[] = [];
  const fallidas: { proveedor_id: string; error: string }[] = [];

  for (const c of datos.compras) {
    try {
      const { data, error } = await supabase.rpc("crear_compra", {
        p_datos: {
          proveedor_id: c.proveedor_id,
          tipo: c.tipo,
          moneda: c.moneda,
          tipo_cambio: c.tipo_cambio,
          fecha_estimada: c.fecha_estimada,
          // El IGV lo decide de dónde viene la mercadería, NO la moneda.
          // Una compra local en dólares lleva IGV; una importación en soles,
          // no. Deducirlo de la moneda dejaba sin IGV toda compra en USD.
          afecto_igv: c.tipo === "local",
          observaciones: `De la consulta de precios`,
          items: c.lineas,
        } as unknown as Json,
      });

      if (error) {
        anotarFallo("compras/comprarDeLaRonda", error, "/compras/precios");
        fallidas.push({ proveedor_id: c.proveedor_id, error: error.message });
        continue;
      }

      const r = data as unknown as { id: string; numero: string; total: number };

      // El enlace, aparte. Si falla, la compra ya existe y eso es lo que
      // importa: se pierde de qué ronda salió, no la compra.
      const { error: eEnlace } = await supabase
        .from("compras")
        .update({ consulta_precio_id: datos.consulta_id })
        .eq("id", r.id);
      if (eEnlace) anotarFallo("compras/enlazarRonda", eEnlace, "/compras/precios");

      hechas.push({
        proveedor_id: c.proveedor_id,
        id: r.id,
        numero: r.numero,
        total: Number(r.total ?? 0),
      });
    } catch (e) {
      anotarFallo("compras/comprarDeLaRonda", e, "/compras/precios");
      fallidas.push({
        proveedor_id: c.proveedor_id,
        error: e instanceof Error ? e.message : "No se pudo registrar la compra.",
      });
    }
  }

  if (hechas.length === 0) {
    return {
      ok: false,
      error: fallidas[0]?.error ?? "No se pudo registrar ninguna compra.",
    };
  }

  // La ronda se cierra sola cuando ya produjo todas sus compras. Es una
  // consecuencia, no un botón más: igual que el cierre de la cotización en la
  // 047.
  if (fallidas.length === 0) {
    const { error } = await supabase
      .from("consultas_precio")
      .update({ estado: "cerrada", actualizado_en: new Date().toISOString() })
      .eq("id", datos.consulta_id)
      .eq("estado", "abierta");
    if (error) anotarFallo("compras/cerrarRonda", error, "/compras/precios");
  }

  revalidatePath("/compras");
  revalidatePath("/compras/precios");
  revalidatePath("/compras/por-comprar");
  revalidatePath("/recepciones/nueva");

  return { ok: true, compras: hechas, fallidas };
}

// ---------------------------------------------------------------------------
// Cerrar a mano
// ---------------------------------------------------------------------------

export type ResultadoCerrar = { ok: true } | { ok: false; error: string };

/** Para la ronda que ya no lleva a ninguna compra: se preguntó y no salió. */
export async function cerrarRonda(
  id: string,
  estado: "cerrada" | "anulada",
): Promise<ResultadoCerrar> {
  const quien = await quienEs();
  if (quien.error) return { ok: false, error: quien.error };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Consulta no válida." };

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("consultas_precio")
      .update({ estado, actualizado_en: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      anotarFallo("compras/cerrarRonda", error, "/compras/precios");
      return { ok: false, error: error.message };
    }
    revalidatePath("/compras/precios");
    return { ok: true };
  } catch (e) {
    anotarFallo("compras/cerrarRonda", e, "/compras/precios");
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo cerrar la consulta.",
    };
  }
}

// ---------------------------------------------------------------------------
// Meter a alguien en una ronda ya abierta
// ---------------------------------------------------------------------------

const esquemaAnadir = z.object({
  consulta_id: z.string().uuid(),
  proveedor_id: z.string().uuid(),
  /** Los ítems de la consulta que se le van a preguntar A ÉL. */
  items: z.array(z.string().uuid()).min(1).max(200),
});

export type ResultadoAnadir =
  | { ok: true; consulta_proveedor_id: string }
  | { ok: false; error: string };

/**
 * «Me faltó preguntarle a este».
 *
 * Pasa siempre: se abre la ronda con los tres de siempre y al ver la rejilla
 * uno se acuerda de un cuarto que también lo trae. Hasta ahora la única salida
 * era abrir otra ronda entera, y entonces los precios quedaban repartidos en
 * dos sitios y ninguna de las dos comparaba de verdad.
 *
 * No va por RPC porque no hay nada que calcular: son dos `insert` bajo las
 * políticas de la 055 y la 058, que ya exigen `puede_escribir('compras')`. Lo
 * que sí se comprueba aquí es que los ítems sean de ESA consulta — sin eso se
 * podrían asignar los de otra, y la base los aceptaría: la asignación apunta
 * al ítem y al proveedor, no a la consulta.
 */
export async function anadirALaRonda(datosCrudos: unknown): Promise<ResultadoAnadir> {
  const quien = await quienEs();
  if (quien.error) return { ok: false, error: quien.error };

  let datos: z.infer<typeof esquemaAnadir>;
  try {
    datos = esquemaAnadir.parse(datosCrudos);
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}` };
  }

  try {
    const supabase = await clienteServidor();

    // Una ronda cerrada ya produjo sus compras: añadirle a alguien sería
    // pedirle precio de algo que ya se compró.
    const { data: cab, error: eCab } = await supabase
      .from("consultas_precio")
      .select("estado")
      .eq("id", datos.consulta_id)
      .maybeSingle();
    if (eCab) {
      anotarFallo("compras/anadirALaRonda", eCab, "/compras/precios");
      return { ok: false, error: eCab.message };
    }
    if (!cab) return { ok: false, error: "Esa consulta de precios no existe." };
    if (cab.estado !== "abierta") {
      return {
        ok: false,
        error: "Esta consulta ya está cerrada. Abre una nueva para seguir preguntando.",
      };
    }

    // Que los ítems sean de esta consulta y de ninguna otra.
    const { data: suyos, error: eItems } = await supabase
      .from("consulta_precio_items")
      .select("id")
      .eq("consulta_id", datos.consulta_id)
      .in("id", datos.items);
    if (eItems) {
      anotarFallo("compras/anadirALaRonda", eItems, "/compras/precios");
      return { ok: false, error: eItems.message };
    }
    const validos = (suyos ?? []).map((i) => String(i.id));
    if (validos.length !== datos.items.length) {
      return { ok: false, error: "Hay un producto que no es de esta consulta." };
    }

    /*
      Buscar antes de crear, y no al revés.

      El mismo proveedor suele faltar en VARIAS filas de la rejilla —vende
      cuatro de los seis productos— y se le añade pulsando en una fila y luego
      en otra. Si esto solo supiera insertar, la segunda vez daría «ya se le
      preguntó» y el producto se quedaría sin preguntar: un error donde lo
      correcto era ampliarle la lista.
    */
    const { data: yaEsta, error: eBuscar } = await supabase
      .from("consulta_precio_proveedores")
      .select("id")
      .eq("consulta_id", datos.consulta_id)
      .eq("proveedor_id", datos.proveedor_id)
      .maybeSingle();
    if (eBuscar) {
      anotarFallo("compras/anadirALaRonda", eBuscar, "/compras/precios");
      return { ok: false, error: eBuscar.message };
    }

    let cpId: string;
    if (yaEsta) {
      cpId = String(yaEsta.id);
    } else {
      const { data: cp, error: eProv } = await supabase
        .from("consulta_precio_proveedores")
        .insert({ consulta_id: datos.consulta_id, proveedor_id: datos.proveedor_id })
        .select("id")
        .single();
      if (eProv) {
        anotarFallo("compras/anadirALaRonda", eProv, "/compras/precios");
        return { ok: false, error: eProv.message };
      }
      cpId = String(cp.id);
    }

    // `ignoreDuplicates` sobre la clave primaria de la 058: volver a asignarle
    // un producto que ya tenía no es un error, es no hacer nada.
    const { error: eAsig } = await supabase
      .from("consulta_precio_asignaciones")
      .upsert(
        validos.map((item_id) => ({ consulta_proveedor_id: cpId, item_id })),
        { onConflict: "consulta_proveedor_id,item_id", ignoreDuplicates: true },
      );
    if (eAsig) {
      // Sin asignaciones el proveedor quedaría en la ronda sin nada que
      // contestar, y la rejilla enseñaría una columna vacía para siempre. Se
      // deshace solo si lo acabábamos de crear: si ya estaba, borrarlo se
      // llevaría por delante las respuestas que hubiera dado.
      if (!yaEsta) {
        await supabase.from("consulta_precio_proveedores").delete().eq("id", cpId);
      }
      anotarFallo("compras/anadirALaRonda", eAsig, "/compras/precios");
      return { ok: false, error: eAsig.message };
    }

    revalidatePath("/compras/precios");
    return { ok: true, consulta_proveedor_id: cpId };
  } catch (e) {
    anotarFallo("compras/anadirALaRonda", e, "/compras/precios");
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo añadir el proveedor.",
    };
  }
}
