"use server";

import { perfilActual } from "@rodatech/db/servidor";
import { rucValido } from "@rodatech/consultas/validacion";

import { consultarDocumentoSunat, type ResultadoSunat } from "@/lib/documento-sunat";

/**
 * Traer de SUNAT la razón social de una agencia por su RUC.
 *
 * Luis, 21/09: *«en registrar una nueva agencia, primero podemos poner el RUC
 * con un botón de traer datos: así buscan por RUC y trae la razón social, y le
 * pone un nombre corto»*.
 *
 * Y tiene sentido en este orden y no en otro: la razón social es lo que sale
 * IMPRESO en la guía, así que teclearla a mano es la forma más fácil de que un
 * documento fiscal lleve «SHALOM EMPRESARIAL SAC» donde el padrón dice
 * «SHALOM EMPRESARIAL S.A.C.». El nombre corto, en cambio, es de uso interno y
 * no lo sabe SUNAT: ese sí se pone a mano, y después.
 *
 * ---------------------------------------------------------------------------
 * Por qué una acción de guías y no la de clientes
 * ---------------------------------------------------------------------------
 * El trabajo de verdad —cuota, caché, traducción de fallos— ya vive en
 * `@/lib/documento-sunat`, que es la pieza compartida. Lo que cambia por
 * módulo es **quién puede gastar cuota**, y aquí no es la misma lista:
 * `buscarPorDocumento` de clientes deja fuera a `almacen`, que es justo el rol
 * que prepara guías. Reutilizarla dejaría al almacenero mirando un botón que
 * le contesta «tu rol no puede consultar documentos».
 */

/** La misma lista que `permisos_rol` tiene para `guias_remision`. */
const ROLES = ["gerencia", "admin", "ventas", "almacen"] as const;

export async function consultarRucAgencia(numero: string): Promise<ResultadoSunat> {
  // 1 · Identidad y rol. Cada llamada gasta cuota COMPARTIDA de la empresa
  // —son 100 al mes—, así que no puede quedar abierta a cualquiera con sesión.
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede consultar documentos." };
  }

  // 2 · Entrada. Los argumentos de una Server Action llegan del navegador:
  // `numero` podría ser un texto arbitrariamente largo.
  if (typeof numero !== "string" || numero.length > 40) {
    return { ok: false, error: "El RUC no es válido." };
  }

  /*
    3 · Validación local ANTES de gastar nada.

    El dígito verificador se comprueba aquí, sin salir a la red. Es el error de
    tecleo más común y el más caro: sin esto, cada RUC mal copiado se lleva por
    delante una de las 100 consultas del mes.
  */
  const limpio = numero.replace(/\D/g, "");
  if (!rucValido(limpio)) {
    return {
      ok: false,
      error: "Ese RUC no es válido: son once dígitos y el último no cuadra.",
    };
  }

  return consultarDocumentoSunat("RUC", limpio);
}
