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

  // Y al revés, que es el que se coló hasta el 09/09: un producto de la lista
  // al que no se le preguntó a nadie deja una fila que nunca se va a poder
  // completar, y la rejilla la enseña vacía para siempre. La pantalla ya lo
  // avisa, pero esto es un endpoint público y la pantalla no es la puerta.
  const cubiertos = new Set(datos.proveedores.flatMap((p) => p.productos));
  if (datos.items.some((i) => !cubiertos.has(i.producto_id))) {
    return {
      ok: false,
      error: "Hay un producto al que no se le pregunta a nadie. Ponle proveedor o sácalo de la lista.",
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
        /**
         * Si su comprobante lleva IGV.
         *
         * Luis, 09/09: *«supuestamente, como yo estoy comprando, viene o no
         * con IGV, ¿no? Él me dirá»*. Antes se deducía del tipo —local, con
         * IGV; importación, sin— y eso falla con el proveedor local que emite
         * boleta o está en el RUS: se le cargaba un 18 % que no existe.
         *
         * Sigue habiendo un valor por defecto, porque acertar acierta casi
         * siempre; lo que cambia es que ahora se puede decir que no.
         */
        afecto_igv: z.boolean().optional(),
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
          // Lo que se marcó en la pantalla; si no vino nada, lo de siempre:
          // local lleva IGV, importación no.
          afecto_igv: c.afecto_igv ?? c.tipo === "local",
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

    /*
      Que quede algo que preguntar de verdad.

      Luis, 09/09: *«puede ser que se equivoque, seleccione un producto con el
      mismo proveedor que ya está; no debería dejar cosas así»*. El diálogo ya
      lo bloquea, pero esto es un endpoint público y la pantalla no es la
      puerta. Se mira solo cuando el proveedor ya estaba: si es nuevo, no
      puede tener nada asignado.

      Ojo con la diferencia: añadirle un producto que ya tenía JUNTO a otros
      que no, sigue valiendo —es el caso corriente, el que vende cuatro de los
      seis—. Lo que se rechaza es que no haya ni uno nuevo.
    */
    if (yaEsta) {
      const { data: asignados, error: eYa } = await supabase
        .from("consulta_precio_asignaciones")
        .select("item_id")
        .eq("consulta_proveedor_id", cpId)
        .in("item_id", validos);
      if (eYa) {
        anotarFallo("compras/anadirALaRonda", eYa, "/compras/precios");
        return { ok: false, error: eYa.message };
      }
      if ((asignados ?? []).length === validos.length) {
        return {
          ok: false,
          error: "A ese proveedor ya se le preguntó por todo eso.",
        };
      }
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

// ---------------------------------------------------------------------------
// Sacar a alguien de una ronda abierta
// ---------------------------------------------------------------------------

const esquemaQuitar = z.object({
  consulta_id: z.string().uuid(),
  proveedor_id: z.string().uuid(),
  /**
   * De qué productos se le quita. Vacío o ausente = de la consulta entera.
   *
   * Los dos casos los pidió Luis el 09/09: *«eliminar por producto al
   * proveedor si se equivocó, o eliminar el proveedor completo con sus
   * productos»*.
   */
  items: z.array(z.string().uuid()).max(200).optional(),
});

export type ResultadoQuitar =
  | { ok: true; quitadoEntero: boolean; preciosBorrados: number }
  | { ok: false; error: string };

/**
 * Deshacer un «se lo pregunté a este», entero o por producto.
 *
 * ---------------------------------------------------------------------------
 * Por qué se borran también las respuestas
 * ---------------------------------------------------------------------------
 * `consulta_precio_respuestas` NO cuelga de `consulta_precio_asignaciones`
 * —son hermanas, las dos cuelgan del proveedor de la ronda— así que quitar la
 * asignación sola deja el precio suelto. Y la rejilla lo seguiría pintando: la
 * comparación se hace con las respuestas, y `preguntada` solo decide si la
 * celda está viva. Saldría un precio de algo que, según la misma pantalla,
 * nunca se preguntó — y podría ganar la comparación.
 *
 * Por eso quitar un producto borra el precio de ese producto. Es destructivo y
 * la pantalla lo dice antes, con el número delante.
 *
 * ---------------------------------------------------------------------------
 * Lo que no se deja quitar
 * ---------------------------------------------------------------------------
 * Al proveedor al que ya se le compró en esta ronda. Su precio es lo que
 * justifica esa compra: borrarlo deja una compra sin de dónde salió. Si de
 * verdad hay que deshacerlo, primero se anula la compra.
 */
export async function quitarDeLaRonda(datosCrudos: unknown): Promise<ResultadoQuitar> {
  const quien = await quienEs();
  if (quien.error) return { ok: false, error: quien.error };

  let datos: z.infer<typeof esquemaQuitar>;
  try {
    datos = esquemaQuitar.parse(datosCrudos);
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}` };
  }

  try {
    const supabase = await clienteServidor();

    const { data: cab, error: eCab } = await supabase
      .from("consultas_precio")
      .select("estado")
      .eq("id", datos.consulta_id)
      .maybeSingle();
    if (eCab) {
      anotarFallo("compras/quitarDeLaRonda", eCab, "/compras/precios");
      return { ok: false, error: eCab.message };
    }
    if (!cab) return { ok: false, error: "Esa consulta de precios no existe." };
    if (cab.estado !== "abierta") {
      return { ok: false, error: "Esta consulta ya está cerrada: no se puede tocar." };
    }

    // Que ya se le haya comprado en esta ronda es el único no rotundo.
    const { data: compras, error: eCompras } = await supabase
      .from("compras")
      .select("id")
      .eq("consulta_precio_id", datos.consulta_id)
      .eq("proveedor_id", datos.proveedor_id)
      .limit(1);
    if (eCompras) {
      anotarFallo("compras/quitarDeLaRonda", eCompras, "/compras/precios");
      return { ok: false, error: eCompras.message };
    }
    if ((compras ?? []).length > 0) {
      return {
        ok: false,
        error:
          "A ese proveedor ya se le compró desde esta consulta. Anula la compra antes de quitarlo.",
      };
    }

    const { data: cp, error: eCp } = await supabase
      .from("consulta_precio_proveedores")
      .select("id")
      .eq("consulta_id", datos.consulta_id)
      .eq("proveedor_id", datos.proveedor_id)
      .maybeSingle();
    if (eCp) {
      anotarFallo("compras/quitarDeLaRonda", eCp, "/compras/precios");
      return { ok: false, error: eCp.message };
    }
    if (!cp) return { ok: false, error: "Ese proveedor no está en esta consulta." };
    const cpId = String(cp.id);

    const pedidos = datos.items ?? [];

    // Quitar de todo, o de los últimos que le quedaban, es lo mismo: un
    // proveedor sin nada que contestar es una columna vacía para siempre.
    let entero = pedidos.length === 0;
    if (!entero) {
      const { data: suyas, error: eSuyas } = await supabase
        .from("consulta_precio_asignaciones")
        .select("item_id")
        .eq("consulta_proveedor_id", cpId);
      if (eSuyas) {
        anotarFallo("compras/quitarDeLaRonda", eSuyas, "/compras/precios");
        return { ok: false, error: eSuyas.message };
      }
      const tiene = (suyas ?? []).map((a) => String(a.item_id));
      const quedan = tiene.filter((id) => !pedidos.includes(id));
      if (tiene.length === 0) {
        return { ok: false, error: "A ese proveedor no se le preguntó por nada." };
      }
      if (quedan.length === 0) entero = true;
    }

    // Cuántos precios se lleva por delante. Se cuenta antes de borrar para
    // poder decirlo, no para decidir.
    const consulta = supabase
      .from("consulta_precio_respuestas")
      .select("id", { count: "exact", head: true })
      .eq("consulta_proveedor_id", cpId);
    const { count, error: eCuenta } = await (entero
      ? consulta
      : consulta.in("item_id", pedidos));
    if (eCuenta) {
      anotarFallo("compras/quitarDeLaRonda", eCuenta, "/compras/precios");
      return { ok: false, error: eCuenta.message };
    }

    if (entero) {
      // El `on delete cascade` de la 055 y la 058 se lleva asignaciones y
      // respuestas: aquí no hay nada que quede suelto.
      const { error } = await supabase
        .from("consulta_precio_proveedores")
        .delete()
        .eq("id", cpId);
      if (error) {
        anotarFallo("compras/quitarDeLaRonda", error, "/compras/precios");
        return { ok: false, error: error.message };
      }
    } else {
      // Primero el precio y después la asignación: si falla lo segundo queda
      // una pregunta sin respuesta, que es un estado que la pantalla sabe
      // pintar. Al revés quedaría un precio de algo que nadie preguntó.
      const { error: eResp } = await supabase
        .from("consulta_precio_respuestas")
        .delete()
        .eq("consulta_proveedor_id", cpId)
        .in("item_id", pedidos);
      if (eResp) {
        anotarFallo("compras/quitarDeLaRonda", eResp, "/compras/precios");
        return { ok: false, error: eResp.message };
      }
      const { error: eAsig } = await supabase
        .from("consulta_precio_asignaciones")
        .delete()
        .eq("consulta_proveedor_id", cpId)
        .in("item_id", pedidos);
      if (eAsig) {
        anotarFallo("compras/quitarDeLaRonda", eAsig, "/compras/precios");
        return { ok: false, error: eAsig.message };
      }
    }

    revalidatePath("/compras/precios");
    return { ok: true, quitadoEntero: entero, preciosBorrados: count ?? 0 };
  } catch (e) {
    anotarFallo("compras/quitarDeLaRonda", e, "/compras/precios");
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo quitar el proveedor.",
    };
  }
}
