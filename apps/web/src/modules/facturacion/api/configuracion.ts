import "server-only";

import { clienteAdmin } from "@rodatech/db/admin";
import { clienteServidor } from "@rodatech/db/servidor";
import { envOpcional } from "@rodatech/config";
import { crearConector, type ConectorSunat } from "@rodatech/sunat";

import { descifrar, descifrarBinario, hayLlaveMaestra } from "@/lib/cifrado";
import { fallo } from "@/lib/errores";
// La validación del RUC es dominio puro y ya está probada en proveedores. El
// emisor tiene el mismo requisito que cualquier otro contribuyente.
import { revisarDocumento } from "@/modules/proveedores/dominio/documento";

import type { ConfigFiscal, EstadoConfiguracion } from "../dominio/tipos";

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/**
 * Carga de la configuración fiscal y construcción del conector SUNAT.
 *
 * Hay dos consultas distintas y no es duplicación:
 *
 *   · `configFiscal()` lee lo que se puede enseñar, con la sesión del usuario
 *     y pasando por RLS — que solo deja mirar a gerencia.
 *   · `conectorSunat()` lee los secretos con `service_role`, que se salta RLS,
 *     y NUNCA devuelve nada descifrado: devuelve el conector ya montado.
 *
 * Esa segunda función es la única del proyecto que toca los secretos, y no
 * tiene forma de filtrarlos: su valor de retorno es un objeto con métodos.
 */

/** Lo visible de la configuración, para la pantalla. */
export async function configFiscal(): Promise<Resultado<ConfigFiscal>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("config_sunat")
      .select(
        `ambiente, usuario_sol, certificado_nombre, certificado_sujeto,
         certificado_caduca_en, serie_factura, serie_boleta,
         probado_en, probado_ok, probado_mensaje, actualizado_en`,
      )
      .eq("id", 1)
      .maybeSingle();

    if (error) return fallo(error);

    // RLS devuelve cero filas a quien no es gerencia. No es un error: es que
    // no le toca verlo.
    if (!data) {
      return {
        ok: false,
        error: "Solo Gerencia puede ver la configuración de facturación.",
      };
    }

    return {
      ok: true,
      datos: {
        ambiente: (data.ambiente as "beta" | "produccion") ?? "beta",
        usuario_sol: data.usuario_sol ?? null,
        certificado_nombre: data.certificado_nombre ?? null,
        certificado_sujeto: data.certificado_sujeto ?? null,
        certificado_caduca_en: data.certificado_caduca_en ?? null,
        serie_factura: data.serie_factura ?? "F001",
        serie_boleta: data.serie_boleta ?? "B001",
        probado_en: data.probado_en ?? null,
        probado_ok: data.probado_ok ?? null,
        probado_mensaje: data.probado_mensaje ?? null,
        actualizado_en: data.actualizado_en ?? null,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Qué falta para poder emitir.
 *
 * Devuelve la lista de lo que hay que resolver, no un booleano: «no se puede
 * emitir» sin decir por qué es lo que hace que alguien abra un ticket.
 */
export async function estadoConfiguracion(): Promise<EstadoConfiguracion> {
  const faltan: string[] = [];

  if (!hayLlaveMaestra()) {
    faltan.push(
      "La llave de cifrado (SUNAT_ENCRYPTION_KEY) no está en el entorno.",
    );
  }

  let ambiente: "beta" | "produccion" = "beta";
  let caduca: string | null = null;

  try {
    const admin = clienteAdmin();

    // QUIÉN EMITE, antes que con qué se firma.
    //
    // El certificado y la clave SOL se comprobaban desde el principio, pero no
    // los datos del emisor — y esos son los que viajan dentro del XML. La base
    // arrancó con un RUC de relleno, `20601234567`, cuyo dígito verificador ni
    // siquiera cuadra: SUNAT lo habría rechazado DESPUÉS de quemar el
    // correlativo, que es un número fiscal que no vuelve.
    //
    // Y la dirección estuvo pisada tres días con el texto de una plantilla de
    // WhatsApp sin que nada lo dijera (§S).
    const { data: emisor } = await admin
      .from("empresa")
      .select("razon_social, ruc, direccion")
      .eq("id", 1)
      .maybeSingle();

    if (!emisor?.razon_social?.trim()) {
      faltan.push("Falta la razón social de la empresa.");
    }
    const ruc = revisarDocumento("RUC", emisor?.ruc);
    if (!ruc.ok) {
      faltan.push(`El RUC de la empresa no es válido: ${emisor?.ruc ?? "(vacío)"}. Es el que va dentro de cada comprobante.`);
    }
    if (!emisor?.direccion?.trim()) {
      faltan.push("Falta la dirección fiscal de la empresa.");
    } else if (/{[a-zA-Z]+}/.test(emisor.direccion)) {
      // Una llave sin sustituir en la dirección solo puede venir de haber
      // pegado ahí una plantilla de mensaje. Pasó, y salió impreso en todo.
      faltan.push(
        `La dirección de la empresa tiene texto de una plantilla dentro: «${emisor.direccion}».`,
      );
    }

    const [{ data: visible }, { data: secretos }] = await Promise.all([
      admin
        .from("config_sunat")
        .select("ambiente, usuario_sol, certificado_caduca_en")
        .eq("id", 1)
        .maybeSingle(),
      admin
        .from("config_sunat_secretos")
        .select("clave_sol_cifrada, certificado_pfx_cifrado, certificado_clave_cifrada")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    ambiente = (visible?.ambiente as "beta" | "produccion") ?? "beta";
    caduca = visible?.certificado_caduca_en ?? null;

    if (!visible?.usuario_sol && !envOpcional("SUNAT_USUARIO_SOL")) {
      faltan.push("Falta el usuario SOL secundario (RUC + usuario).");
    }
    if (!secretos?.clave_sol_cifrada && !envOpcional("SUNAT_CLAVE_SOL")) {
      faltan.push("Falta la clave del usuario SOL.");
    }
    if (!secretos?.certificado_pfx_cifrado && !envOpcional("SUNAT_CERT_PFX_BASE64")) {
      faltan.push("Falta el certificado digital (.pfx).");
    }
    if (!secretos?.certificado_clave_cifrada && !envOpcional("SUNAT_CERT_CLAVE")) {
      faltan.push("Falta la clave del certificado.");
    }
  } catch (e) {
    faltan.push(e instanceof Error ? e.message : "No se pudo leer la configuración.");
  }

  // Un certificado caducado no da un error claro: SUNAT rechaza la firma con
  // un código genérico. Avisar antes ahorra una tarde de depuración.
  let avisoCaducidad: string | null = null;
  if (caduca) {
    const dias = Math.ceil(
      (new Date(caduca).getTime() - Date.now()) / 86_400_000,
    );
    if (dias < 0) {
      avisoCaducidad = `El certificado caducó el ${caduca}. No se puede emitir con él.`;
    } else if (dias <= 30) {
      avisoCaducidad = `El certificado caduca en ${dias} días (${caduca}). Conviene renovarlo ya.`;
    }
  }

  return {
    listo: faltan.length === 0,
    faltan,
    ambiente,
    avisoCaducidad,
  };
}

/**
 * Construye el conector con las credenciales descifradas.
 *
 * ES LA ÚNICA FUNCIÓN QUE TOCA LOS SECRETOS. No los devuelve: devuelve el
 * conector, que solo sabe firmar y enviar. Quien la llame no puede filtrar una
 * clave aunque quiera.
 *
 * Si la base no tiene configuración, cae a las variables de entorno. Eso
 * permite arrancar en un entorno de pruebas sin pasar por el panel, que es lo
 * que hace falta mientras el cliente no entrega el certificado.
 */
export async function conectorSunat(): Promise<Resultado<ConectorSunat>> {
  try {
    const admin = clienteAdmin();

    const [{ data: visible }, { data: secretos }] = await Promise.all([
      admin.from("config_sunat").select("ambiente, usuario_sol").eq("id", 1).maybeSingle(),
      admin
        .from("config_sunat_secretos")
        .select("clave_sol_cifrada, certificado_pfx_cifrado, certificado_clave_cifrada")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    const usuarioSol = visible?.usuario_sol ?? envOpcional("SUNAT_USUARIO_SOL");

    const claveSol = secretos?.clave_sol_cifrada
      ? descifrar(secretos.clave_sol_cifrada)
      : envOpcional("SUNAT_CLAVE_SOL");

    const pfxBase64 = envOpcional("SUNAT_CERT_PFX_BASE64");
    const certificadoPfx = secretos?.certificado_pfx_cifrado
      ? descifrarBinario(secretos.certificado_pfx_cifrado)
      : pfxBase64
        ? Buffer.from(pfxBase64, "base64")
        : null;

    const certificadoClave = secretos?.certificado_clave_cifrada
      ? descifrar(secretos.certificado_clave_cifrada)
      : envOpcional("SUNAT_CERT_CLAVE");

    if (!usuarioSol || !claveSol || !certificadoPfx || !certificadoClave) {
      return {
        ok: false,
        error:
          "La facturación electrónica no está configurada del todo. " +
          "Revisa Configuración → Facturación.",
      };
    }

    const ambienteEnv = envOpcional("SUNAT_AMBIENTE");
    const ambiente =
      (visible?.ambiente as "beta" | "produccion" | undefined) ??
      (ambienteEnv === "produccion" ? "produccion" : "beta");

    return {
      ok: true,
      datos: crearConector({
        ambiente,
        certificadoPfx,
        certificadoClave,
        usuarioSol,
        claveSol,
      }),
    };
  } catch (e) {
    return fallo(e);
  }
}
