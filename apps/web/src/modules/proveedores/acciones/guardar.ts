"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { codigoDeProveedor, revisarDocumento, variante } from "../dominio/documento";
import type { ProveedorEditable, ResultadoProveedor, TipoDocumento } from "../dominio/tipos";

/**
 * Alta y edición de un proveedor del maestro.
 *
 * Alta rápida: tipo de documento, número y razón social. Nada más. Es la misma
 * lección que dejó la ficha de cliente —*"a las justas me dan correo"*—, y
 * aquí aprieta todavía más: un proveedor nuevo aparece cuando su mercadería
 * está en el mostrador, no cuando alguien se sienta a rellenar una ficha.
 */

/** Quién mantiene el maestro. La que manda es la de RLS en Postgres. */
const ROLES = ["gerencia", "admin", "compras"] as const;

/** Cuántos códigos alternativos se prueban antes de rendirse. */
const MAX_INTENTOS_CODIGO = 25;

const TIPOS_DOCUMENTO = ["RUC", "DNI", "CE", "PAS", "SIN_DOC"] as const;

/**
 * Texto opcional.
 *
 * La cadena vacía se guarda como `null` y no como "". Un "" en `email` pasa
 * cualquier validación pero luego no se distingue de un correo real al
 * filtrar, y un "" en `ubigeo_codigo` rompería la clave foránea.
 */
function opcional(max: number, etiqueta: string) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const t = typeof v === "string" ? v.trim() : "";
      return t === "" ? null : t;
    })
    .refine((v) => v === null || v.length <= max, `${etiqueta} es demasiado largo.`);
}

function entero(max: number, etiqueta: string) {
  return z.coerce
    .number()
    .int(`${etiqueta} tiene que ser un número entero.`)
    .nonnegative(`${etiqueta} no puede ser negativo.`)
    .max(max, `${etiqueta} es demasiado grande.`)
    .default(0);
}

const esquema = z.object({
  id: z.string().uuid().optional(),

  // --- Lo único obligatorio ------------------------------------------------
  tipo_documento: z.enum(TIPOS_DOCUMENTO, {
    errorMap: () => ({ message: "Elige un tipo de documento." }),
  }),
  numero_documento: opcional(40, "El número de documento"),
  razon_social: z
    .string()
    .trim()
    .min(2, "Falta la razón social.")
    .max(200, "La razón social es demasiado larga."),

  // --- Todo lo de «más datos» ----------------------------------------------
  tipo: z.enum(["local", "importacion"]).default("local"),
  pais: z.string().trim().min(2).max(60).default("Perú"),
  direccion: opcional(300, "La dirección"),
  ubigeo_codigo: opcional(6, "El ubigeo").refine(
    (v) => v === null || /^\d{6}$/.test(v),
    "El ubigeo debe tener 6 dígitos. Elígelo de la lista.",
  ),
  contacto: opcional(120, "El contacto"),
  email: opcional(160, "El correo").refine(
    (v) => v === null || z.string().email().safeParse(v).success,
    "El correo no tiene un formato válido.",
  ),
  telefono: opcional(40, "El teléfono"),
  whatsapp: opcional(40, "El WhatsApp"),
  // 365 y no más: `dias_pago` mayor que un año no es una condición de pago,
  // es un error de tecleo.
  dias_pago: entero(365, "Los días de pago"),
  lead_time_dias: entero(365, "El lead time"),
  notas: opcional(2000, "Las notas"),
  marca_ids: z.array(z.string().uuid()).max(50).default([]),
});

function esDuplicado(error: { code?: string }): boolean {
  return error.code === "23505";
}

/** Qué índice único saltó. El mensaje de Postgres lo lleva dentro. */
function indiceQueSalto(error: { message?: string; details?: string }): string {
  return `${error.message ?? ""} ${error.details ?? ""}`;
}

export async function guardarProveedor(
  _previo: ResultadoProveedor | null,
  formData: FormData,
): Promise<ResultadoProveedor> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede mantener el maestro de proveedores." };
  }

  const crudo = formData.get("proveedor");
  if (typeof crudo !== "string") return { ok: false, error: "Faltan los datos." };

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    if (e instanceof z.ZodError) {
      const primero = e.issues[0];
      return {
        ok: false,
        error: primero?.message ?? "Los datos no son válidos.",
        campo: primero?.path[0] as keyof ProveedorEditable | undefined,
      };
    }
    return { ok: false, error: "Los datos no son válidos." };
  }

  // El documento se valida con las mismas reglas que usaría la consulta a
  // SUNAT, y el error de aquí es legible; el de la restricción de Postgres no.
  const revision = revisarDocumento(datos.tipo_documento, datos.numero_documento);
  if (!revision.ok) {
    return { ok: false, error: revision.error, campo: "numero_documento" };
  }
  const numeroDocumento = revision.numero;

  const campos = {
    tipo_documento: datos.tipo_documento,
    numero_documento: numeroDocumento,
    razon_social: datos.razon_social,
    tipo: datos.tipo,
    pais: datos.pais,
    direccion: datos.direccion,
    ubigeo_codigo: datos.ubigeo_codigo,
    contacto: datos.contacto,
    email: datos.email,
    telefono: datos.telefono,
    whatsapp: datos.whatsapp,
    dias_pago: datos.dias_pago,
    lead_time_dias: datos.lead_time_dias,
    notas: datos.notas,
  };

  const revalidar = (id: string) => {
    revalidatePath("/proveedores");
    revalidatePath(`/proveedores/${id}`);
    // Las tres pantallas que leen el desplegable de proveedores. Sin esto, dar
    // de alta un proveedor y entrar a comprar enseña «todavía no hay
    // proveedores», que es exactamente lo contrario de lo que acaba de pasar.
    revalidatePath("/recepciones/nueva");
    revalidatePath("/compras");
    revalidatePath("/compras/nueva");
  };

  try {
    const supabase = await clienteServidor();

    // ---------------------------------------------------------------- Edición
    if (datos.id) {
      const { data, error } = await supabase
        .from("proveedores")
        .update({ ...campos, actualizado_en: new Date().toISOString() })
        .eq("id", datos.id)
        .select("id, codigo, razon_social")
        .maybeSingle();

      if (error) {
        if (esDuplicado(error) && numeroDocumento) {
          return {
            ok: false,
            campo: "numero_documento",
            error: await mensajeDeDuplicado(supabase, datos.tipo_documento, numeroDocumento),
          };
        }
        return { ok: false, error: error.message };
      }
      if (!data) return { ok: false, error: "No se encontró el proveedor." };

      const marcas = await sincronizarMarcas(supabase, data.id, datos.marca_ids);
      if (marcas) return marcas;

      revalidar(data.id);
      return { ok: true, id: data.id, codigo: data.codigo, razonSocial: data.razon_social };
    }

    // ------------------------------------------------------------------- Alta
    // El código lo genera el servidor: es NOT NULL, único por expresión, y el
    // usuario no debería tener que inventarlo.
    const base = codigoDeProveedor(datos.tipo_documento, numeroDocumento, datos.razon_social);

    for (let intento = 0; intento <= MAX_INTENTOS_CODIGO; intento++) {
      const codigo = intento === 0 ? base : variante(base, intento + 1);

      const { data, error } = await supabase
        .from("proveedores")
        .insert({ ...campos, codigo })
        .select("id, codigo, razon_social")
        .maybeSingle();

      if (!error && data) {
        const marcas = await sincronizarMarcas(supabase, data.id, datos.marca_ids);
        if (marcas) return marcas;

        revalidar(data.id);
        return { ok: true, id: data.id, codigo: data.codigo, razonSocial: data.razon_social };
      }

      if (error && esDuplicado(error)) {
        const indice = indiceQueSalto(error);

        // Documento repetido: es el mismo proveedor otra vez. Reintentar con
        // otro código solo crearía el duplicado que el índice está evitando.
        if (indice.includes("ux_proveedores_documento") && numeroDocumento) {
          return {
            ok: false,
            campo: "numero_documento",
            error: await mensajeDeDuplicado(supabase, datos.tipo_documento, numeroDocumento),
          };
        }

        // Código repetido: es cosa nuestra, no del usuario. Se prueba el
        // siguiente candidato sin que nadie se entere.
        if (indice.includes("ux_proveedores_codigo")) continue;

        return { ok: false, error: error.message };
      }

      if (error) return { ok: false, error: error.message };
      return { ok: false, error: "No se pudo guardar el proveedor." };
    }

    return {
      ok: false,
      error: `No se pudo generar un código libre a partir de "${base}". Avisa a sistemas.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar el proveedor.",
    };
  }
}

/**
 * Deja `proveedor_marcas` con exactamente las marcas indicadas.
 *
 * Se borra lo que sobra y se inserta lo que falta, en vez de vaciar y volver a
 * escribir: así una marca que ya estaba no genera un borrado y un alta, y la
 * tabla no acumula churn. Devuelve un error solo si falla; `null` si fue bien.
 */
async function sincronizarMarcas(
  supabase: Awaited<ReturnType<typeof clienteServidor>>,
  proveedorId: string,
  deseadas: string[],
): Promise<ResultadoProveedor | null> {
  const { data: actuales, error: eLee } = await supabase
    .from("proveedor_marcas")
    .select("marca_id")
    .eq("proveedor_id", proveedorId);
  if (eLee) return { ok: false, error: eLee.message };

  const hay = new Set((actuales ?? []).map((m) => m.marca_id));
  const quiere = new Set(deseadas);

  const sobran = [...hay].filter((m) => !quiere.has(m));
  const faltan = [...quiere].filter((m) => !hay.has(m));

  if (sobran.length > 0) {
    const { error } = await supabase
      .from("proveedor_marcas")
      .delete()
      .eq("proveedor_id", proveedorId)
      .in("marca_id", sobran);
    if (error) return { ok: false, error: error.message };
  }

  if (faltan.length > 0) {
    const { error } = await supabase
      .from("proveedor_marcas")
      .insert(faltan.map((marca_id) => ({ proveedor_id: proveedorId, marca_id })));
    if (error) return { ok: false, error: error.message };
  }

  return null;
}

/**
 * «Ese RUC ya es de X» en vez de «duplicate key value violates unique
 * constraint». El nombre del proveedor que ya lo tiene es lo único que le
 * sirve a quien está dando de alta.
 */
async function mensajeDeDuplicado(
  supabase: Awaited<ReturnType<typeof clienteServidor>>,
  tipo: TipoDocumento,
  numeroDocumento: string,
): Promise<string> {
  const { data } = await supabase
    .from("proveedores")
    .select("codigo, razon_social, activo")
    .eq("tipo_documento", tipo)
    .eq("numero_documento", numeroDocumento)
    .maybeSingle();

  if (!data) {
    return `El ${tipo} ${numeroDocumento} ya está registrado en otro proveedor.`;
  }
  const desactivado = data.activo ? "" : " (dado de baja)";
  return `El ${tipo} ${numeroDocumento} ya es de ${data.razon_social}, código ${data.codigo}${desactivado}.`;
}
