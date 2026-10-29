"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteAdmin, exigirAdmin } from "@rodatech/db/admin";
import { clienteServidor } from "@rodatech/db/servidor";

import { ErrorCertificado, datosCertificado, type DatosCertificado } from "@rodatech/sunat/certificado";
import { cifrar, cifrarBinario, descifrar, descifrarBinario, hayLlaveMaestra } from "@/lib/cifrado";

import { conectoresDePrueba } from "../api/configuracion";
import { facturaDePrueba } from "../dominio/factura-de-prueba";
import { enMonedaDelDocumento } from "../dominio/moneda-documento";
import { comprobanteParaSunat, type EmisorSunat } from "../dominio/para-sunat";
import { revisarDatosCertificado, type RevisionCertificado } from "../dominio/certificado";

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
  // Las credenciales de API de la guía (126). Vacías = no tocar.
  gre_client_id: z.string().trim().max(100).regex(/^[A-Za-z0-9-]*$/, "El ID de API va con letras, números y guiones."),
  gre_client_secret: z.string().max(200),
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
      gre_client_id: formData.get("gre_client_id") ?? "",
      gre_client_secret: formData.get("gre_client_secret") ?? "",
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

    // ---------------------------------------------------- el certificado
    // Se abre ANTES de guardar nada (B2, 28/10): una clave equivocada o el
    // .pfx de otra empresa se descubrían al mandar la primera factura real.
    const revision = await revisarCertificado(admin, hayCertificado, datos.certificado_clave);
    if (!revision.ok) return { ok: false, error: revision.error };

    // ---------------------------------------------------- lo visible
    const visible: {
      ambiente: string;
      actualizado_en: string;
      usuario_sol?: string;
      certificado_nombre?: string;
      certificado_sujeto?: string;
      certificado_caduca_en?: string;
      gre_client_id?: string;
    } = {
      ambiente: datos.ambiente,
      actualizado_en: new Date().toISOString(),
    };
    if (datos.usuario_sol) visible.usuario_sol = datos.usuario_sol;
    if (datos.gre_client_id) visible.gre_client_id = datos.gre_client_id;
    if (hayCertificado) visible.certificado_nombre = hayCertificado.name;
    if (revision.datos) {
      // Lo que lee el aviso de caducidad de la 156/161, que hasta hoy no
      // escribía nadie y por eso no podía saltar.
      visible.certificado_sujeto = revision.datos.sujeto;
      visible.certificado_caduca_en = revision.datos.caducaEn;
    }

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
      gre_client_secret_cifrado?: string;
    } = {
      actualizado_en: new Date().toISOString(),
    };

    // Vacío significa «no lo toques», no «bórralo». Es lo que permite cambiar
    // el ambiente sin volver a teclear la clave.
    if (datos.clave_sol) secretos.clave_sol_cifrada = cifrar(datos.clave_sol);
    if (datos.certificado_clave) {
      secretos.certificado_clave_cifrada = cifrar(datos.certificado_clave);
    }
    if (datos.gre_client_secret) secretos.gre_client_secret_cifrado = cifrar(datos.gre_client_secret);
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

    revalidatePath("/configuracion/sunat");
    revalidatePath("/facturacion");

    const base =
      datos.ambiente === "produccion"
        ? "Guardado. Ojo: estás en PRODUCCIÓN, lo que se emita tiene valor fiscal."
        : "Guardado. Estás en homologación (beta): lo que se emita no tiene valor fiscal.";
    return {
      ok: true,
      mensaje: revision.datos ? `${base} ${revision.datos.frase}` : base,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar la configuración.",
    };
  }
}

/**
 * Abre el certificado con su contraseña y dice si sirve para esta empresa.
 *
 * Cubre los tres casos de la pantalla, donde la clave en blanco es «no la
 * toques»:
 *  · se sube un .pfx con su clave → se prueban los dos nuevos;
 *  · se sube un .pfx sin clave → con la clave guardada (renovación con la
 *    misma clave); si no hay ninguna, se pide;
 *  · se cambia solo la clave → contra el .pfx guardado.
 * Si no se toca ninguno de los dos, no hay nada que revisar (`datos: null`).
 */
async function revisarCertificado(
  admin: ReturnType<typeof clienteAdmin>,
  archivo: File | null,
  claveNueva: string,
): Promise<{ ok: true; datos: Extract<RevisionCertificado, { ok: true }> | null } | { ok: false; error: string }> {
  if (!archivo && !claveNueva) return { ok: true, datos: null };

  const { data: secretos } = await admin
    .from("config_sunat_secretos")
    .select("certificado_pfx_cifrado, certificado_clave_cifrada")
    .eq("id", 1)
    .maybeSingle();

  const pfx = archivo
    ? Buffer.from(await archivo.arrayBuffer())
    : secretos?.certificado_pfx_cifrado
      ? descifrarBinario(secretos.certificado_pfx_cifrado)
      : null;
  // Solo la clave, sin certificado todavía: no hay contra qué probarla. Se
  // guarda y se probará cuando llegue el .pfx.
  if (!pfx) return { ok: true, datos: null };

  const clave = claveNueva
    ? claveNueva
    : secretos?.certificado_clave_cifrada
      ? descifrar(secretos.certificado_clave_cifrada)
      : null;
  if (clave === null) {
    return { ok: false, error: "Escribe la clave del certificado junto con el archivo. No se guardó nada." };
  }

  let datos: DatosCertificado;
  try {
    datos = datosCertificado(pfx, clave);
  } catch (e) {
    if (e instanceof ErrorCertificado) {
      // La frase pedida tal cual, y que quede claro que no se tocó nada.
      return { ok: false, error: `${e.message} No se guardó nada.` };
    }
    return { ok: false, error: "No se pudo abrir el certificado. No se guardó nada." };
  }

  const { data: empresa } = await admin.from("empresa").select("ruc").eq("id", 1).maybeSingle();
  if (!empresa?.ruc) {
    return { ok: false, error: "Falta el RUC de la empresa en Datos de la empresa: sin él no se puede comprobar el certificado." };
  }

  const r = revisarDatosCertificado(datos, empresa.ruc, new Date());
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, datos: r };
}

/** Un paso de la prueba. `bien: null` = no se pudo probar (falta algo). */
export interface PasoPrueba {
  que: string;
  bien: boolean | null;
  detalle: string;
}

export type ResultadoPrueba =
  | { ok: true; pasos: PasoPrueba[]; todoBien: boolean }
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
 * «Probar con SUNAT»: lo que se puede comprobar sin emitir nada de verdad.
 *
 * Hasta el 29/10 solo autenticaba el usuario SOL, y contra el ambiente
 * configurado: en beta eso no dice casi nada. Luis, 29/10: *«si tú me dices
 * estoy 100 % seguro que funciona bien la integración de SUNAT para hacer
 * guías, facturas, notas…»*. No se puede decir sin probar las tres piezas que
 * son de Willy, y ahora se prueban:
 *
 *  1. **Usuario SOL**, contra PRODUCCIÓN: se manda un archivo que no es un
 *     comprobante y SUNAT lo rechaza antes de procesarlo; lo que se mide es
 *     si autentica. No deja documento ni gasta correlativo.
 *  2. **El certificado**, firmando una factura de mentira y mandándola a BETA
 *     con el usuario público de pruebas. Beta comprueba la firma de verdad.
 *  3. **Las credenciales de guías**, pidiendo el permiso (token) a
 *     PRODUCCIÓN. No se envía ninguna guía.
 *
 * Lo que sigue sin probarse es el primer documento real en producción.
 *
 * Ojo: varias claves SOL equivocadas seguidas bloquean el usuario en SUNAT.
 * Por eso el paso 1 se corta en cuanto dice «clave incorrecta» y no reintenta.
 */
export async function probarConexionSunat(): Promise<ResultadoPrueba> {
  try {
    await exigirAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sin permiso." };
  }

  const supabase = await clienteServidor();
  const { data: filaEmpresa } = await supabase
    .from("empresa")
    .select("ruc, razon_social, nombre_comercial, direccion, ubigeo_codigo, igv_porcentaje")
    .eq("id", 1)
    .maybeSingle();
  if (!filaEmpresa?.ruc) return { ok: false, error: "Falta el RUC de la empresa." };

  const conectores = await conectoresDePrueba(filaEmpresa.ruc);
  if (!conectores.ok) return { ok: false, error: conectores.error };
  const { real, firma, hayGuias } = conectores.datos;

  const pasos: PasoPrueba[] = [];

  // ------------------------------------------------ 1 · usuario SOL
  try {
    const r = await real.probarConexion(filaEmpresa.ruc);
    pasos.push({
      que: "Usuario SOL y su clave",
      bien: r.ok,
      detalle: r.ok ? "SUNAT lo reconoce y lo deja enviar comprobantes." : `${CAUSA[r.causa]} SUNAT dijo: ${r.mensajeSunat}`,
    });
  } catch (e) {
    pasos.push({ que: "Usuario SOL y su clave", bien: false, detalle: mensajeDe(e, "No se pudo contactar con SUNAT.") });
  }

  // ------------------------------------------------ 2 · el certificado
  try {
    const { data: lugar } = filaEmpresa.ubigeo_codigo
      ? await supabase
          .from("ubigeo")
          .select("departamento, provincia, distrito")
          .eq("codigo", filaEmpresa.ubigeo_codigo)
          .maybeSingle()
      : { data: null };
    const empresa = { ...filaEmpresa, ...(lugar ?? {}) } as EmisorSunat;
    const cdr = await firma.emitir(comprobanteParaSunat(enMonedaDelDocumento(facturaDePrueba(new Date())), empresa));
    pasos.push({
      que: "Certificado digital (la firma)",
      bien: cdr.aceptado,
      detalle: cdr.aceptado
        ? "SUNAT aceptó una factura de prueba firmada con él (en el ambiente de pruebas, sin valor)."
        : `SUNAT rechazó la firma: ${cdr.codigo} · ${cdr.descripcion}`,
    });
  } catch (e) {
    pasos.push({ que: "Certificado digital (la firma)", bien: false, detalle: mensajeDe(e, "No se pudo firmar ni enviar.") });
  }

  // ------------------------------------------------ 3 · guías
  if (!hayGuias) {
    pasos.push({
      que: "Credenciales de guías (API)",
      bien: null,
      detalle: "No están cargadas: sin ellas no se pueden mandar guías.",
    });
  } else {
    try {
      await real.probarGuias();
      pasos.push({
        que: "Credenciales de guías (API)",
        bien: true,
        detalle: "SUNAT dio el permiso para enviar guías. No se envió ninguna.",
      });
    } catch (e) {
      pasos.push({ que: "Credenciales de guías (API)", bien: false, detalle: mensajeDe(e, "SUNAT no dio el permiso.") });
    }
  }

  const todoBien = pasos.every((p) => p.bien === true);
  const resumen = pasos.map((p) => `${p.bien ? "✓" : p.bien === null ? "–" : "✗"} ${p.que}`).join(" · ");

  // Se guarda para poder decir «funcionaba el martes» sin repetir la prueba
  // cada vez que alguien abre la pantalla.
  await clienteAdmin()
    .from("config_sunat")
    .update({ probado_en: new Date().toISOString(), probado_ok: todoBien, probado_mensaje: resumen })
    .eq("id", 1);
  revalidatePath("/configuracion/sunat");

  return { ok: true, pasos, todoBien };
}

function mensajeDe(e: unknown, porDefecto: string): string {
  return e instanceof Error && e.message ? e.message : porDefecto;
}