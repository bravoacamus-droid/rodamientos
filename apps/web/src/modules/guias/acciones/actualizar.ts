"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Corregir un borrador de guía.
 *
 * ---------------------------------------------------------------------------
 * De dónde sale
 * ---------------------------------------------------------------------------
 * Willy, 40:43, al descubrir que el inicio de traslado se había quedado en
 * hoy: *«tengo que poner aquí un botón también de editar la guía, para que
 * pueda actualizar los datos… la fecha, que puede ser hoy o mañana»*.
 *
 * Y es el caso NORMAL, no una rareza. La guía se prepara cuando se cierra la
 * venta y se completa cuando ya se sabe quién la lleva (§2.2). Entre esas dos
 * cosas pasan días, y hasta hoy lo único que se podía hacer con un borrador
 * equivocado era anularlo y volver a empezar — quemando un correlativo por una
 * fecha mal puesta.
 *
 * ---------------------------------------------------------------------------
 * Solo BORRADORES, y solo la cabecera
 * ---------------------------------------------------------------------------
 * Una guía emitida ya movió stock y puede estar en manos del cliente con un
 * sello encima: eso no se corrige, se anula. La comprobación se hace aquí y la
 * repite el `update`, que filtra por estado — entre que se lee y se escribe,
 * otro puede haber emitido.
 *
 * Las LÍNEAS no se tocan. Cambiar qué sale y cuánto obliga a revalidar contra
 * lo que ya despacharon otras guías de la misma cotización, y equivocarse ahí
 * deja el kardex diciendo que salió algo que nunca se vendió. Para eso está
 * anular: es una guía que aún no existe para nadie.
 */

/** La misma lista que `permisos_rol` tiene para `guias_remision`. */
const ROLES = ["gerencia", "admin", "ventas", "almacen"] as const;

const esquema = z.object({
  id: z.string().uuid(),
  fecha_traslado: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de inicio de traslado no es válida."),
  direccion_llegada: z.string().trim().min(1, "Falta la dirección de entrega.").max(300),
  // NOT NULL y con clave foránea a `ubigeo` desde la 002: no puede quedarse
  // vacío. Se pide aquí con palabras en vez de dejar que reviente Postgres con
  // «null value in column violates not-null constraint».
  ubigeo_llegada: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "El ubigeo de llegada son seis dígitos, y hace falta."),
  peso_bruto_kg: z.number().positive("El peso bruto tiene que ser mayor que cero."),
  numero_bultos: z.number().int().positive(),
  modalidad_traslado: z.enum(["01", "02"]),
  a_pie: z.boolean(),
  transportista_documento: z.string().trim().max(15).nullable(),
  transportista_razon_social: z.string().trim().max(200).nullable(),
  transportista_placa: z.string().trim().max(15).nullable(),
  conductor_documento: z.string().trim().max(15).nullable(),
  conductor_nombre: z.string().trim().max(200).nullable(),
  conductor_licencia: z.string().trim().max(20).nullable(),
  conductor_telefono: z.string().trim().max(40).nullable(),
  observaciones: z.string().trim().max(2000).nullable(),
});

export type ResultadoActualizar = { ok: true } | { ok: false; error: string };

const limpio = (v: string | null) => (v === null || v.trim() === "" ? null : v.trim());

export async function actualizarGuia(crudos: unknown): Promise<ResultadoActualizar> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede tocar guías." };
  }

  let d: z.infer<typeof esquema>;
  try {
    d = esquema.parse(crudos);
  } catch (e) {
    const primero = e instanceof z.ZodError ? e.issues[0]?.message : null;
    return { ok: false, error: primero ?? "Los datos de la guía no son válidos." };
  }

  const esPublico = d.modalidad_traslado === "01";
  const aPie = !esPublico && d.a_pie;

  /*
    Las mismas reglas que el constructor, dichas otra vez.

    No es duplicación por descuido: esta acción es un endpoint público y no
    puede fiarse de que la pantalla haya validado. Y `guia_transporte_ok` en la
    base solo exige esto al EMITIR, así que un borrador con la placa vacía es
    legal — pero decirlo aquí lo evita ahora, no dentro de tres días delante
    del transportista.
  */
  if (esPublico && !limpio(d.transportista_documento)) {
    return { ok: false, error: "En transporte público hace falta el RUC del transportista." };
  }
  if (aPie && !limpio(d.conductor_documento)) {
    return { ok: false, error: "Si va a pie, hace falta el DNI de quien la lleva." };
  }
  if (!esPublico && !aPie && !limpio(d.transportista_placa)) {
    return { ok: false, error: "En transporte privado hace falta la placa del vehículo." };
  }

  try {
    const supabase = await clienteServidor();

    const { data: actual, error: errorLee } = await supabase
      .from("guias_remision")
      .select("estado, numero")
      .eq("id", d.id)
      .maybeSingle();

    if (errorLee) return { ok: false, error: errorLee.message };
    if (!actual) return { ok: false, error: "Esa guía ya no existe." };
    if (actual.estado !== "borrador") {
      return {
        ok: false,
        error:
          "Solo se corrige un borrador. Esta guía ya está emitida: si algo está mal, hay que anularla.",
      };
    }

    const { error, count } = await supabase
      .from("guias_remision")
      .update(
        {
          fecha_traslado: d.fecha_traslado,
          direccion_llegada: d.direccion_llegada.trim(),
          ubigeo_llegada: d.ubigeo_llegada,
          peso_bruto_kg: d.peso_bruto_kg,
          numero_bultos: d.numero_bultos,
          modalidad_traslado: d.modalidad_traslado,
          a_pie: aPie,
          // Cada modalidad guarda lo suyo y borra lo de la otra. Dejar la placa
          // de ayer en una guía que pasó a pública imprimiría un vehículo que
          // no salió.
          transportista_documento: esPublico ? limpio(d.transportista_documento) : null,
          transportista_razon_social: esPublico
            ? limpio(d.transportista_razon_social)
            : null,
          transportista_placa: esPublico || aPie ? null : limpio(d.transportista_placa),
          conductor_documento: esPublico ? null : limpio(d.conductor_documento),
          conductor_nombre: esPublico ? null : limpio(d.conductor_nombre),
          conductor_licencia: esPublico || aPie ? null : limpio(d.conductor_licencia),
          conductor_telefono: esPublico ? null : limpio(d.conductor_telefono),
          observaciones: limpio(d.observaciones),
        },
        { count: "exact" },
      )
      // Se repite el filtro de estado: entre la lectura de arriba y esto, otro
      // puede haber emitido la guía.
      .eq("id", d.id)
      .eq("estado", "borrador");

    if (error) return { ok: false, error: error.message };
    if (count === 0) {
      return {
        ok: false,
        error: "No se guardó: alguien emitió la guía mientras la estabas corrigiendo.",
      };
    }

    revalidatePath("/guias");
    revalidatePath(`/guias/${d.id}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar la guía.",
    };
  }
}
