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
         certificado_caduca_en,
         probado_en, probado_ok, probado_mensaje, actualizado_en, gre_client_id`,
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
        probado_en: data.probado_en ?? null,
        probado_ok: data.probado_ok ?? null,
        gre_client_id: data.gre_client_id ?? null,
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
  const faltanGuias: string[] = [];

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
        .select("ambiente, usuario_sol, certificado_caduca_en, gre_client_id")
        .eq("id", 1)
        .maybeSingle(),
      admin
        .from("config_sunat_secretos")
        .select("clave_sol_cifrada, certificado_pfx_cifrado, certificado_clave_cifrada, gre_client_secret_cifrado")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (!visible?.gre_client_id && !envOpcional("SUNAT_GRE_CLIENT_ID")) {
      faltanGuias.push("Falta el código de acceso de SUNAT para guías (se genera en SOL).");
    }
    if (!secretos?.gre_client_secret_cifrado && !envOpcional("SUNAT_GRE_CLIENT_SECRET")) {
      faltanGuias.push("Falta la clave de acceso de SUNAT para guías (se genera en SOL).");
    }

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

  // Una guía necesita todo lo de la factura MÁS sus credenciales de API.
  const todasGuias = [...faltan, ...faltanGuias];
  return {
    listo: faltan.length === 0,
    faltan,
    ambiente,
    avisoCaducidad,
    guias: { listo: todasGuias.length === 0, faltan: todasGuias },
  };
}

/**
 * ¿Se puede mandar a SUNAT un documento de esta serie? (auditoría 15/10)
 *
 * En producción, NUNCA uno de serie de prueba (`es_prueba`, 093): la 093
 * impide numerar con ellas, pero lo ya numerado —la F001 y la T001 de las
 * pruebas— seguía en la bandeja, y «Enviar todas» lo habría declarado ante
 * SUNAT de verdad. Devuelve el motivo para no mandarlo, o null.
 */
export async function bloqueoPorSeriePrueba(serie: string): Promise<string | null> {
  const admin = clienteAdmin();
  const [{ data: cfg }, { data: series }] = await Promise.all([
    admin.from("config_sunat").select("ambiente").eq("id", 1).maybeSingle(),
    admin.from("series_documento").select("serie").eq("serie", serie).eq("es_prueba", true).limit(1),
  ]);
  if (cfg?.ambiente !== "produccion" || !series || series.length === 0) return null;
  return `${serie} es una serie de PRUEBA: no se manda a SUNAT de verdad. Si el documento no vale, anúlalo.`;
}

/**
 * Cómo se mandan las guías (auditoría 15/10). SUNAT no tiene ambiente de
 * pruebas para la GRE, así que:
 *
 *  · **producción**: a SUNAT, con las credenciales guardadas. Las variables
 *    del emulador se IGNORAN: si se quedan puestas en el despliegue, las
 *    guías reales no pueden acabar «aceptadas» en un emulador.
 *  · **beta**: solo a un emulador, y solo con las DOS direcciones y
 *    credenciales PROPIAS del emulador (`SUNAT_GRE_PRUEBA_*`). Nunca las
 *    reales: mandar el client_secret de Willy a un tercero es regalarlo.
 *  · Si no, no se manda.
 */
export type ModoGuias =
  | { modo: "produccion" }
  | { modo: "emulador"; urlToken: string; hostEnvio: string; clientId: string; clientSecret: string }
  | { modo: "bloqueado"; motivo: string };

export async function modoGuias(): Promise<ModoGuias> {
  const { data: cfg } = await clienteAdmin().from("config_sunat").select("ambiente").eq("id", 1).maybeSingle();
  if ((cfg?.ambiente ?? envOpcional("SUNAT_AMBIENTE") ?? "beta") === "produccion") return { modo: "produccion" };
  const urlToken = envOpcional("SUNAT_GRE_URL_TOKEN");
  const hostEnvio = envOpcional("SUNAT_GRE_HOST");
  const clientId = envOpcional("SUNAT_GRE_PRUEBA_CLIENT_ID");
  const clientSecret = envOpcional("SUNAT_GRE_PRUEBA_CLIENT_SECRET");
  if (urlToken && hostEnvio && clientId && clientSecret) {
    return { modo: "emulador", urlToken, hostEnvio, clientId, clientSecret };
  }
  return {
    modo: "bloqueado",
    motivo:
      "Estás en modo de pruebas, y SUNAT no tiene pruebas para guías: se mandaría a SUNAT de verdad. " +
      "Las guías se envían al pasar a producción.",
  };
}

/** Las credenciales ya descifradas. Nunca salen de este archivo. */
interface Credenciales {
  ambiente: "beta" | "produccion";
  usuarioSol: string;
  claveSol: string;
  certificadoPfx: Buffer;
  certificadoClave: string;
  greClientId: string | null;
  greClientSecret: string | null;
}

/**
 * ES LA ÚNICA FUNCIÓN QUE TOCA LOS SECRETOS, y no se exporta: los de fuera
 * reciben un conector, que solo sabe firmar y enviar. Quien lo use no puede
 * filtrar una clave aunque quiera.
 *
 * Si la base no tiene configuración, cae a las variables de entorno. Eso
 * permite arrancar en un entorno de pruebas sin pasar por el panel, que es lo
 * que hace falta mientras el cliente no entrega el certificado.
 */
async function credenciales(): Promise<Resultado<Credenciales>> {
  // Sin try: quien llama ya lo envuelve, y un fallo al descifrar tiene que
  // llegarle con su mensaje («la llave no es la misma que cifró…»).
  {
    const admin = clienteAdmin();

    const [{ data: visible }, { data: secretos }] = await Promise.all([
      admin.from("config_sunat").select("ambiente, usuario_sol, gre_client_id").eq("id", 1).maybeSingle(),
      admin
        .from("config_sunat_secretos")
        .select("clave_sol_cifrada, certificado_pfx_cifrado, certificado_clave_cifrada, gre_client_secret_cifrado")
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

    // Las de la guía son opcionales aquí: sin ellas se factura igual, y es
    // `emitirGuia` quien dice que faltan.
    const greClientId = visible?.gre_client_id || envOpcional("SUNAT_GRE_CLIENT_ID") || null;
    const greClientSecret = secretos?.gre_client_secret_cifrado
      ? descifrar(secretos.gre_client_secret_cifrado)
      : (envOpcional("SUNAT_GRE_CLIENT_SECRET") ?? null);

    const ambienteEnv = envOpcional("SUNAT_AMBIENTE");
    const ambiente =
      (visible?.ambiente as "beta" | "produccion" | undefined) ??
      (ambienteEnv === "produccion" ? "produccion" : "beta");

    return {
      ok: true,
      datos: { ambiente, usuarioSol, claveSol, certificadoPfx, certificadoClave, greClientId, greClientSecret },
    };
  }
}

/** El conector con el que se emite, en el ambiente configurado. */
export async function conectorSunat(): Promise<Resultado<ConectorSunat>> {
  try {
    const c = await credenciales();
    if (!c.ok) return c;
    const { ambiente, certificadoPfx, certificadoClave, usuarioSol, claveSol, greClientId, greClientSecret } = c.datos;

    return {
      ok: true,
      datos: crearConector({
        ambiente,
        certificadoPfx,
        certificadoClave,
        usuarioSol,
        claveSol,
        // En producción, las reales contra SUNAT; en beta, solo el emulador
        // con SUS credenciales (`modoGuias`); si no, ninguna.
        gre: await (async () => {
          const m = await modoGuias();
          if (m.modo === "emulador") {
            return { clientId: m.clientId, clientSecret: m.clientSecret, urlToken: m.urlToken, hostEnvio: m.hostEnvio };
          }
          if (m.modo === "produccion" && greClientId && greClientSecret) {
            return { clientId: greClientId, clientSecret: greClientSecret };
          }
          return undefined;
        })(),
      }),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Los dos conectores de «Probar con SUNAT» (29/10), sea cual sea el ambiente.
 *
 *  · `real`: producción, con TODO lo de Willy. Solo se le pide autenticar
 *    —`probarConexion` y `probarGuias`—, que no deja ningún documento.
 *  · `firma`: beta, con el certificado REAL y el usuario público de pruebas.
 *    Lo que se emite ahí no tiene valor, y prueba que SUNAT acepta la firma de
 *    ese certificado: lo único que en producción no se puede probar sin
 *    emitir de verdad.
 *
 * Luis, 29/10: «si tú me dices estoy 100 % seguro que funciona bien la
 * integración de SUNAT…». Esto es lo que se puede comprobar sin gastar un
 * número; lo que queda es el primer documento real.
 */
export async function conectoresDePrueba(
  ruc: string,
): Promise<Resultado<{ real: ConectorSunat; firma: ConectorSunat; hayGuias: boolean }>> {
  try {
    const c = await credenciales();
    if (!c.ok) return c;
    const { certificadoPfx, certificadoClave, usuarioSol, claveSol, greClientId, greClientSecret } = c.datos;
    const gre =
      greClientId && greClientSecret ? { clientId: greClientId, clientSecret: greClientSecret } : undefined;
    return {
      ok: true,
      datos: {
        real: crearConector({ ambiente: "produccion", certificadoPfx, certificadoClave, usuarioSol, claveSol, gre }),
        firma: crearConector({
          ambiente: "beta",
          certificadoPfx,
          certificadoClave,
          usuarioSol: `${ruc}MODDATOS`,
          claveSol: "moddatos",
        }),
        hayGuias: Boolean(gre),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}
