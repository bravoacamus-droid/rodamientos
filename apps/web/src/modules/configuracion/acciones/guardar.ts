"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { clienteAdmin, hayClaveAdmin } from "@rodatech/db/admin";
import { mensajeDeError } from "@/lib/errores";

import { sinPermiso } from "@/lib/permisos";

import type { Rol, TipoDocumento } from "../dominio/tipos";

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


/**
 * El rol tiene que existir en `roles` (143). Ya no es una lista fija: los
 * crea gerencia en Configuración › Roles y permisos.
 */
async function rolExiste(clave: string): Promise<boolean> {
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(clave)) return false;
  const supabase = await clienteServidor();
  const { data } = await supabase.from("roles").select("clave").eq("clave", clave).maybeSingle();
  return Boolean(data);
}

async function exigirGerencia(): Promise<
  { ok: true; id: string; rol: string } | { ok: false; error: string }
> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  // Datos de la empresa y series: «Configuración · editar» en la matriz (143).
  const no = await sinPermiso("configuracion", "editar");
  if (no) return { ok: false, error: no };
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
  // Seis dígitos o nada. La base tiene clave foránea contra `ubigeo`, así
  // que un código inventado lo rechaza ella; esto solo da un mensaje que se
  // entiende antes de llegar allí.
  ubigeo_codigo: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, "El ubigeo son seis dígitos.")
    .nullable()
    .or(z.literal("").transform(() => null))
    .default(null),
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
  // La meta del mes (140). Vacía o cero: sin meta, Informes usa el promedio.
  meta_venta_mensual: z
    .number()
    .finite()
    .min(0)
    .max(100_000_000)
    .nullable()
    .default(null)
    .transform((n) => (n && n > 0 ? Math.round(n * 100) / 100 : null)),

  // La cuenta a la que cobra. Distinta de la de detracción, que es del Banco
  // de la Nación y no sirve para que el cliente transfiera.
  banco: textoOpcional,
  cuenta_corriente: textoOpcional,
  cci: textoOpcional,
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

    revalidatePath("/configuracion/empresa");
    // El pie de la cotización y de la factura salen de aquí.
    revalidatePath("/cotizaciones", "layout");
    revalidatePath("/facturacion", "layout");
    revalidatePath("/reportes");
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

    revalidatePath("/configuracion/empresa");
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

    revalidatePath("/configuracion/empresa");
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
    rol: z.string().min(2).max(41).optional(),
    activo: z.boolean().optional(),
  });

  const datos = esquema.safeParse(cambios);
  if (!datos.success || Object.keys(datos.data).length === 0) {
    return { ok: false, error: "No había nada que cambiar." };
  }
  if (datos.data.rol !== undefined && !(await rolExiste(datos.data.rol))) {
    return { ok: false, error: "Ese rol no existe. Elígelo de la lista." };
  }

  /*
    Desactivar también cierra la puerta en Supabase Auth (revisión del
    15/10): solo con `perfiles.activo` la cuenta seguía iniciando sesión y
    veía un ERP vacío. Con la cuenta bloqueada no entra, y las sesiones
    abiertas no pueden renovar su token.

    Desde el 21/10 (auditoría, M5) una baja a medias no se da por hecha: sin
    la clave de servicio antes salía un «Ojo» en verde y la persona seguía
    entrando. Ahora no se toca nada y se dice por qué. Y el bloqueo va ANTES
    que el perfil: si falla, no queda nadie «de baja» en la pantalla que en
    realidad sigue entrando.
  */
  const cambiaAcceso = datos.data.activo !== undefined;
  if (cambiaAcceso && !hayClaveAdmin()) {
    return {
      ok: false,
      error:
        "No se pudo cambiarle el acceso: falta una configuración del servidor. Avise a quien mantiene el sistema.",
    };
  }
  const bloquear = async (si: boolean) =>
    (await clienteAdmin().auth.admin.updateUserById(id, { ban_duration: si ? "876000h" : "none" })).error;

  try {
    if (cambiaAcceso && datos.data.activo === false && (await bloquear(true))) {
      return {
        ok: false,
        error: "No se pudo cerrarle el acceso. No se cambió nada: vuelva a intentarlo en un momento.",
      };
    }

    const supabase = await clienteServidor();
    // `as never`: el rol ya se comprobó contra `roles`, y puede ser uno creado
    // después de generar los tipos (143), que el enum de TypeScript no conoce.
    const { error } = await supabase.from("perfiles").update(datos.data as never).eq("id", id);
    if (error) {
      // El perfil no cambió: se le devuelve el acceso que se le acababa de quitar.
      if (cambiaAcceso && datos.data.activo === false) await bloquear(false);
      return { ok: false, error: mensajeDeError(error) };
    }

    let aviso = "";
    if (cambiaAcceso && datos.data.activo === true && (await bloquear(false))) {
      aviso =
        " Pero no se pudo abrirle el acceso todavía: si no puede entrar, vuelva a pulsar «Activar» en un momento.";
    }

    revalidatePath("/configuracion/usuarios");
    return { ok: true, mensaje: `Usuario actualizado.${aviso}` };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}
