"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";

import { ROLES, type Rol, type TipoDocumento } from "../dominio/tipos";

/**
 * Guardar la configuración.
 *
 * Las tres tablas de aquí (`empresa`, `series_documento`, `perfiles`) tienen
 * RLS y sus políticas ya deciden quién escribe, pero se valida el rol también
 * en el servidor porque estas Server Actions son endpoints públicos y el
 * mensaje de error de una política es «new row violates row-level security»,
 * que no le dice nada a nadie.
 */

export type ResultadoConfig =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

/** `empresa` y `series_documento` son de gerencia y administración. */
const ROLES_CONFIG = ["gerencia", "admin"] as const;

async function exigirGerencia(): Promise<
  { ok: true; id: string; rol: string } | { ok: false; error: string }
> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES_CONFIG.includes(perfil.rol as (typeof ROLES_CONFIG)[number])) {
    return { ok: false, error: "Solo gerencia y administración cambian la configuración." };
  }
  return { ok: true, id: perfil.id, rol: perfil.rol };
}

// ---------------------------------------------------------------------------
// Empresa
// ---------------------------------------------------------------------------

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .transform((v) => (v ? v : null));

const esquemaEmpresa = z.object({
  razon_social: z.string().trim().min(3, "La razón social es obligatoria.").max(200),
  nombre_comercial: z.string().trim().min(1, "El nombre comercial es obligatorio.").max(200),
  ruc: z.string().regex(/^[0-9]{11}$/, "El RUC son 11 dígitos."),
  direccion: textoOpcional,
  telefono: textoOpcional,
  celular: textoOpcional,
  email: textoOpcional,
  email_ventas: textoOpcional,
  web: textoOpcional,
  eslogan: textoOpcional,
  igv_porcentaje: z.number().min(0).max(100),
  detraccion_monto_minimo: z.number().min(0),
  detraccion_porcentaje: z.number().min(0).max(100),
  retencion_porcentaje: z.number().min(0).max(100),
  cuenta_detraccion: textoOpcional,
  agente_retencion: z.boolean(),
});

/**
 * Guarda los datos fiscales del emisor.
 *
 * Van en cada comprobante que se emite, así que un dedazo en el RUC no se
 * queda en esta pantalla: viaja a SUNAT. Por eso el formato se comprueba aquí
 * además de en `empresa_ruc_valido`.
 */
export async function guardarEmpresa(
  _previo: ResultadoConfig | null,
  formData: FormData,
): Promise<ResultadoConfig> {
  const quien = await exigirGerencia();
  if (!quien.ok) return quien;

  const crudo = formData.get("empresa");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos de la empresa." };
  }

  let datos: z.infer<typeof esquemaEmpresa>;
  try {
    datos = esquemaEmpresa.parse(JSON.parse(crudo));
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}` };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("empresa")
      .update({ ...datos, actualizado_en: new Date().toISOString() })
      .eq("id", 1);

    if (error) return { ok: false, error: mensajeDeError(error) };

    revalidatePath("/configuracion");
    // El pie de la cotización y de la factura salen de aquí.
    revalidatePath("/cotizaciones", "layout");
    revalidatePath("/facturacion", "layout");
    return { ok: true, mensaje: "Datos de la empresa guardados." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/**
 * Cambia el correlativo de partida de una serie.
 *
 * Es LO que hace falta el día de la puesta en marcha: *«los correlativos van a
 * iniciar desde el número que usted se quedó»* (06:08). Hasta ahora se hacía
 * con un `update` a mano contra producción.
 *
 * No se toca `correlativo_actual`, y no es un descuido: esa columna es el
 * registro de lo que YA se emitió, y reescribirla haría que el siguiente
 * documento repitiera un número ya usado. `siguiente_correlativo()` toma el
 * mayor de los dos, así que subir el inicial es suficiente para saltar hacia
 * delante — y bajarlo, correctamente, no hace nada.
 */
export async function guardarSerie(
  id: string,
  cambios: {
    correlativo_inicial?: number;
    longitud?: number;
    activo?: boolean;
    predeterminada?: boolean;
    descripcion?: string | null;
  },
): Promise<ResultadoConfig> {
  const quien = await exigirGerencia();
  if (!quien.ok) return quien;

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "La serie no es válida." };
  }

  const esquema = z.object({
    correlativo_inicial: z.number().int().min(1).max(999_999_999).optional(),
    longitud: z.number().int().min(4).max(10).optional(),
    activo: z.boolean().optional(),
    predeterminada: z.boolean().optional(),
    descripcion: z.string().trim().max(200).nullable().optional(),
  });

  const datos = esquema.safeParse(cambios);
  if (!datos.success) {
    return {
      ok: false,
      error: `Los datos no son válidos: ${datos.error.issues[0]?.message ?? "formato inesperado"}.`,
    };
  }
  if (Object.keys(datos.data).length === 0) {
    return { ok: false, error: "No había nada que cambiar." };
  }

  try {
    const supabase = await clienteServidor();

    // `ux_series_predeterminada` es un único parcial por tipo: hay que bajar la
    // anterior ANTES de subir esta, o el índice rechaza el update.
    if (datos.data.predeterminada === true) {
      const { data: fila } = await supabase
        .from("series_documento")
        .select("tipo")
        .eq("id", id)
        .maybeSingle();

      if (fila?.tipo) {
        await supabase
          .from("series_documento")
          .update({ predeterminada: false })
          .eq("tipo", fila.tipo)
          .neq("id", id);
      }
    }

    const { error } = await supabase
      .from("series_documento")
      .update(datos.data)
      .eq("id", id);

    if (error) return { ok: false, error: mensajeDeError(error) };

    revalidatePath("/configuracion");
    return { ok: true, mensaje: "Serie guardada." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

const TIPOS: readonly TipoDocumento[] = [
  "cotizacion",
  "guia_remision",
  "factura",
  "boleta",
  "nota_credito",
  "nota_debito",
  "compra",
  "recepcion",
  "ajuste_inventario",
];

/** Da de alta una serie nueva. */
export async function crearSerie(entrada: {
  tipo: string;
  serie: string;
  correlativo_inicial: number;
  longitud: number;
  descripcion: string | null;
}): Promise<ResultadoConfig> {
  const quien = await exigirGerencia();
  if (!quien.ok) return quien;

  const esquema = z.object({
    tipo: z.enum(TIPOS as unknown as [TipoDocumento, ...TipoDocumento[]]),
    serie: z
      .string()
      .trim()
      .regex(/^[A-Z0-9]{2,6}$/, "La serie son de 2 a 6 letras mayúsculas o dígitos."),
    correlativo_inicial: z.number().int().min(1),
    longitud: z.number().int().min(4).max(10),
    descripcion: z.string().trim().max(200).nullable(),
  });

  const datos = esquema.safeParse(entrada);
  if (!datos.success) {
    return {
      ok: false,
      error: `Los datos no son válidos: ${datos.error.issues[0]?.message ?? "formato inesperado"}.`,
    };
  }

  if (String(datos.data.correlativo_inicial).length > datos.data.longitud) {
    return {
      ok: false,
      error: `${datos.data.correlativo_inicial} no cabe en ${datos.data.longitud} dígitos.`,
    };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.from("series_documento").insert({
      ...datos.data,
      correlativo_actual: 0,
      // La nueva nunca entra como predeterminada: cambiar por dónde numera un
      // tipo de documento es una decisión aparte, y se hace con su interruptor.
      predeterminada: false,
      activo: true,
    });

    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Esa serie ya existe para ese tipo de documento." };
      }
      return { ok: false, error: mensajeDeError(error) };
    }

    revalidatePath("/configuracion");
    return { ok: true, mensaje: `Serie ${datos.data.serie} creada.` };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

/**
 * Cambia el rol o el estado de un usuario.
 *
 * Dos cosas que NO se pueden hacer, y las dos por el mismo motivo —dejar el
 * ERP sin nadie que pueda entrar a arreglarlo—:
 *
 *   · cambiarse el rol a uno mismo, y
 *   · desactivarse a uno mismo.
 *
 * RLS no puede impedirlo: la política de `perfiles` deja a gerencia escribir
 * cualquier fila, incluida la suya. Si el único gerente se pone «almacén», ya
 * no hay quien lo devuelva sin entrar por SQL.
 *
 * Dar de ALTA a alguien no se hace aquí: el usuario nace en Supabase Auth y el
 * trigger `trg_usuario_nuevo` le crea el perfil. Esta pantalla solo cambia lo
 * que ya existe.
 */
export async function cambiarUsuario(
  id: string,
  cambios: { rol?: Rol; activo?: boolean },
): Promise<ResultadoConfig> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (perfil.rol !== "gerencia") {
    return { ok: false, error: "Solo gerencia cambia usuarios." };
  }

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "El usuario no es válido." };
  }

  if (id === perfil.id) {
    return {
      ok: false,
      error:
        "No puedes cambiarte el rol ni desactivarte a ti mismo: si te quitas gerencia, ya nadie puede devolvértela desde la aplicación.",
    };
  }

  const esquema = z.object({
    rol: z.enum(ROLES as unknown as [Rol, ...Rol[]]).optional(),
    activo: z.boolean().optional(),
  });

  const datos = esquema.safeParse(cambios);
  if (!datos.success || Object.keys(datos.data).length === 0) {
    return { ok: false, error: "No había nada que cambiar." };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.from("perfiles").update(datos.data).eq("id", id);
    if (error) return { ok: false, error: mensajeDeError(error) };

    revalidatePath("/configuracion");
    return { ok: true, mensaje: "Usuario actualizado." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}
