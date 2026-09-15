"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";

import type { ResultadoConfig } from "./guardar";

/**
 * Las cuentas para cobrar.
 *
 * Existen desde la 064 y se imprimen al pie de cada cotización y factura, pero
 * nunca tuvieron pantalla: se daban de alta con SQL contra producción. Luis,
 * 15/09: *«no puedo ver las cuentas que se crearon, que están en cotización»*.
 *
 * Quien las toca es quien administra la empresa, igual que los datos fiscales:
 * `permisos_rol` ya dice `gerencia` y `admin` para esta tabla, y aquí se
 * comprueba otra vez porque una Server Action es un endpoint público y el
 * mensaje de una política RLS no se le puede enseñar a nadie.
 */
const ROLES = ["gerencia", "admin"] as const;

async function exigirPermiso(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return "Solo Gerencia y Administración cambian las cuentas para cobrar.";
  }
  return null;
}

/**
 * Lo que se acepta de una cuenta.
 *
 * `strict()` para que un campo de más no llegue al `insert`, y el número
 * obligatorio porque la tabla lo exige (`cuenta_numero_no_vacio`): mejor un
 * mensaje en español aquí que un error de restricción desde Postgres.
 */
const esquema = z
  .object({
    banco: z.string().trim().min(2, "Pon el nombre del banco.").max(80),
    moneda: z.enum(["PEN", "USD"]),
    numero: z.string().trim().min(4, "El número de cuenta es demasiado corto.").max(40),
    cci: z.string().trim().max(40).nullable(),
    orden: z.number().int().min(0).max(99),
  })
  .strict();

export type DatosCuenta = z.infer<typeof esquema>;

/**
 * Refresca esta pantalla.
 *
 * Solo esta: las cotizaciones y las facturas leen la base en cada petición
 * —van con la sesión en la cookie, así que son dinámicas— y salen al día sin
 * que nadie las invalide.
 */
function refrescar() {
  revalidatePath("/configuracion/empresa");
}

/**
 * Los datos viajan en UN campo JSON, no en cinco `name=`.
 *
 * Es el mismo arreglo que `guardarEmpresa`: así el esquema de zod del servidor
 * y el objeto del formulario son la misma forma, y un campo nuevo no se puede
 * quedar a medio camino.
 */
function leerCuenta(formData: FormData):
  | { ok: true; datos: DatosCuenta }
  | { ok: false; error: string } {
  const crudo = formData.get("cuenta");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos de la cuenta." };
  }
  try {
    return { ok: true, datos: esquema.parse(JSON.parse(crudo)) };
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: detalle ?? "Los datos no son válidos." };
  }
}

export async function crearCuenta(
  _previo: ResultadoConfig | null,
  formData: FormData,
): Promise<ResultadoConfig> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };

  const v = leerCuenta(formData);
  if (!v.ok) return { ok: false, error: v.error };

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.from("cuentas_bancarias").insert({
      banco: v.datos.banco,
      moneda: v.datos.moneda,
      numero: v.datos.numero,
      cci: v.datos.cci || null,
      orden: v.datos.orden,
    });

    // `ux_cuentas_numero` es único sobre el número normalizado: el mismo número
    // escrito con guiones o sin ellos es la misma cuenta.
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Esa cuenta ya está dada de alta." };
      }
      return { ok: false, error: mensajeDeError(error) };
    }

    refrescar();
    return { ok: true, mensaje: "Cuenta añadida." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

export async function guardarCuenta(
  _previo: ResultadoConfig | null,
  formData: FormData,
): Promise<ResultadoConfig> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "La cuenta no es válida." };
  }

  const v = leerCuenta(formData);
  if (!v.ok) return { ok: false, error: v.error };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("cuentas_bancarias")
      .update({
        banco: v.datos.banco,
        moneda: v.datos.moneda,
        numero: v.datos.numero,
        cci: v.datos.cci || null,
        orden: v.datos.orden,
      })
      .eq("id", id)
      .select("id");

    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Ya hay otra cuenta con ese número." };
      }
      return { ok: false, error: mensajeDeError(error) };
    }
    // Cero filas y sin error es lo que devuelve un UPDATE que RLS no deja
    // pasar. Sin esta comprobación, la pantalla diría que guardó.
    if (!data || data.length === 0) {
      return { ok: false, error: "La base no dejó guardar esa cuenta." };
    }

    refrescar();
    return { ok: true, mensaje: "Cuenta actualizada." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/**
 * Encender o apagar una cuenta.
 *
 * **No se borra, y es decisión de la 064**: *«sin DELETE: se desactivan. Una
 * cotización vieja cita la cuenta que citó»*. Borrar la fila dejaría
 * cotizaciones enviadas apuntando a una cuenta que ya no existe, y lo que el
 * cliente tiene en la mano es el papel que se le mandó.
 *
 * Apagada deja de imprimirse y sigue viéndose aquí — para no volver a darla de
 * alta por duplicado sin querer.
 */
export async function activarCuenta(
  _previo: ResultadoConfig | null,
  formData: FormData,
): Promise<ResultadoConfig> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };

  const id = String(formData.get("id") ?? "");
  const activo = formData.get("activo") === "1";
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "La cuenta no es válida." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("cuentas_bancarias")
      .update({ activo })
      .eq("id", id)
      .select("id");

    if (error) return { ok: false, error: mensajeDeError(error) };
    if (!data || data.length === 0) {
      return { ok: false, error: "La base no dejó cambiar esa cuenta." };
    }

    refrescar();
    return {
      ok: true,
      mensaje: activo ? "La cuenta vuelve al papel." : "La cuenta deja de imprimirse.",
    };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}
