"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteAdmin, exigirAdmin } from "@rodatech/db/admin";
import { clienteServidor } from "@rodatech/db/servidor";

import { cifrar, cifrarBinario, hayLlaveMaestra } from "@/lib/cifrado";

import { conectorSunat } from "../api/configuracion";

/**
 * Configuración fiscal: credenciales SOL y certificado.
 *
 * Todo pasa por `exigirAdmin()`, que es la única puerta a `clienteAdmin()`.
 * Con service_role un fallo de autorización no es parcial, es total: se salta
 * RLS entero.
 *
 * Las claves nunca vuelven a la pantalla. El formulario las manda, se cifran y
 * se guardan; lo que se lee después es si están puestas o no, nunca su valor.
 * Un campo que enseña la clave guardada es un campo del que alguien acaba
 * haciendo una captura.
 */

const esquema = z.object({
  ambiente: z.enum(["beta", "produccion"]),
  usuario_sol: z
    .string()
    .trim()
    .regex(
      /^[0-9]{11}[A-Za-z0-9]{3,}$/,
      "El usuario SOL va en formato RUC + usuario, por ejemplo 20601234567MODDATOS.",
    )
    .or(z.literal("")),
  clave_sol: z.string().max(200),
  certificado_clave: z.string().max(200),
  serie_factura: z.string().regex(/^F[A-Z0-9]{3}$/, "La serie de factura empieza por F."),
  serie_boleta: z.string().regex(/^B[A-Z0-9]{3}$/, "La serie de boleta empieza por B."),
});

export type ResultadoConfig =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

/** Guarda la configuración. Los campos de clave vacíos NO borran lo guardado. */
export async function guardarConfigSunat(
  _previo: ResultadoConfig | null,
  formData: FormData,
): Promise<ResultadoConfig> {
  try {
    await exigirAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sin permiso." };
  }

  if (!hayLlaveMaestra()) {
    return {
      ok: false,
      error:
        "Falta SUNAT_ENCRYPTION_KEY en el entorno. Sin ella no se pueden guardar " +
        "las claves cifradas. Está explicado en .env.example.",
    };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse({
      ambiente: formData.get("ambiente"),
      usuario_sol: formData.get("usuario_sol") ?? "",
      clave_sol: formData.get("clave_sol") ?? "",
      certificado_clave: formData.get("certificado_clave") ?? "",
      serie_factura: formData.get("serie_factura") ?? "F001",
      serie_boleta: formData.get("serie_boleta") ?? "B001",
    });
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: detalle ?? "Los datos no son válidos." };
  }

  const certificado = formData.get("certificado");
  const hayCertificado =
    certificado instanceof File && certificado.size > 0 ? certificado : null;

  // Un .pfx de 3 MB no es un .pfx: es alguien subiendo el archivo equivocado.
  if (hayCertificado && hayCertificado.size > 512 * 1024) {
    return {
      ok: false,
      error: `El certificado pesa ${Math.round(hayCertificado.size / 1024)} kB. Un .pfx real ronda los 3-5 kB: comprueba que sea el archivo correcto.`,
    };
  }

  try {
    const admin = clienteAdmin();

    // ---------------------------------------------------- lo visible
    const visible: {
      ambiente: string;
      serie_factura: string;
      serie_boleta: string;
      actualizado_en: string;
      usuario_sol?: string;
      certificado_nombre?: string;
    } = {
      ambiente: datos.ambiente,
      serie_factura: datos.serie_factura,
      serie_boleta: datos.serie_boleta,
      actualizado_en: new Date().toISOString(),
    };
    if (datos.usuario_sol) visible.usuario_sol = datos.usuario_sol;
    if (hayCertificado) visible.certificado_nombre = hayCertificado.name;

    const { error: errorVisible } = await admin
      .from("config_sunat")
      .update(visible)
      .eq("id", 1);
    if (errorVisible) return { ok: false, error: errorVisible.message };

    // ---------------------------------------------------- los secretos
    const secretos: {
      actualizado_en: string;
      clave_sol_cifrada?: string;
      certificado_clave_cifrada?: string;
      certificado_pfx_cifrado?: string;
    } = {
      actualizado_en: new Date().toISOString(),
    };

    // Vacío significa «no lo toques», no «bórralo». Es lo que permite cambiar
    // el ambiente sin volver a teclear la clave.
    if (datos.clave_sol) secretos.clave_sol_cifrada = cifrar(datos.clave_sol);
    if (datos.certificado_clave) {
      secretos.certificado_clave_cifrada = cifrar(datos.certificado_clave);
    }
    if (hayCertificado) {
      const bytes = Buffer.from(await hayCertificado.arrayBuffer());
      secretos.certificado_pfx_cifrado = cifrarBinario(bytes);
    }

    if (Object.keys(secretos).length > 1) {
      const { error: errorSecretos } = await admin
        .from("config_sunat_secretos")
        .update(secretos)
        .eq("id", 1);
      if (errorSecretos) return { ok: false, error: errorSecretos.message };
    }

    revalidatePath("/facturacion/configuracion");
    revalidatePath("/facturacion");

    return {
      ok: true,
      mensaje:
        datos.ambiente === "produccion"
          ? "Guardado. Ojo: estás en PRODUCCIÓN, lo que se emita tiene valor fiscal."
          : "Guardado. Estás en homologación (beta): lo que se emita no tiene valor fiscal.",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar la configuración.",
    };
  }
}

export type ResultadoPrueba =
  | { ok: true; funciona: boolean; mensaje: string }
  | { ok: false; error: string };

/**
 * Qué hacer ante cada causa de fallo.
 *
 * El mensaje literal de SUNAT es críptico («Client.0102») y no dice qué
 * arreglar. Estas frases sí, y son las tres cosas que de verdad pasan al
 * configurar por primera vez.
 */
const CAUSA: Record<
  "ok" | "clave_incorrecta" | "usuario_no_existe" | "usuario_no_habilitado" | "desconocido",
  string
> = {
  ok: "Todo correcto.",
  clave_incorrecta: "La clave del usuario SOL no es la que espera SUNAT.",
  usuario_no_existe:
    "Ese usuario SOL no existe. Comprueba que lleve el RUC delante (20601234567MODDATOS) y que sea el SECUNDARIO, no el principal.",
  usuario_no_habilitado:
    "El usuario existe pero no tiene el permiso de facturación electrónica. Se habilita desde SOL, en la gestión de usuarios secundarios.",
  desconocido: "SUNAT rechazó la conexión y no dijo por qué.",
};

/**
 * Prueba las credenciales contra SUNAT sin emitir nada.
 *
 * Es lo primero que hay que pulsar cuando algo falla, y por eso existe: sin
 * esto, la única forma de saber si las credenciales sirven es emitir un
 * comprobante real y quemar un correlativo.
 */
export async function probarConexionSunat(): Promise<ResultadoPrueba> {
  try {
    await exigirAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sin permiso." };
  }

  const conector = await conectorSunat();
  if (!conector.ok) return { ok: false, error: conector.error };

  const supabase = await clienteServidor();
  const { data: empresa } = await supabase
    .from("empresa")
    .select("ruc")
    .eq("id", 1)
    .maybeSingle();

  if (!empresa?.ruc) return { ok: false, error: "Falta el RUC de la empresa." };

  try {
    const resultado = await conector.datos.probarConexion(empresa.ruc);

    // `causa` es lo accionable —clave mal, usuario no habilitado, no
    // existe—; el mensaje de SUNAT se conserva al lado porque a veces dice
    // algo que la clasificación no recoge.
    const mensaje = resultado.ok
      ? "Las credenciales funcionan."
      : `${CAUSA[resultado.causa]} SUNAT dijo: ${resultado.mensajeSunat}`;

    // Se guarda para poder decir «funcionaba el martes» sin repetir la prueba
    // cada vez que alguien abre la pantalla.
    await clienteAdmin()
      .from("config_sunat")
      .update({
        probado_en: new Date().toISOString(),
        probado_ok: resultado.ok,
        probado_mensaje: mensaje,
      })
      .eq("id", 1);

    revalidatePath("/facturacion/configuracion");

    return { ok: true, funciona: resultado.ok, mensaje };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo contactar con SUNAT.",
    };
  }
}
