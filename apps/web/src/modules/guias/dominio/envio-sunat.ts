import { ErrorGre, MENSAJE_SIN_CONEXION, esErrorDeRed, type ResultadoCdr } from "@rodatech/sunat";

/**
 * El viaje de una guía a SUNAT, sin base ni red: las dos van por puertos.
 *
 * Auditoría SUNAT del 28/10 (M4 y M5). La Server Action hacía esto en línea
 * y tenía dos agujeros:
 *
 *   · M4 · El CDR —la constancia firmada de SUNAT— se leía y se tiraba.
 *     Ahora cada respuesta se guarda entera (168).
 *   · M5 · Si la red se caía DESPUÉS de que SUNAT recibiera la guía, al
 *     reintentar se mandaba otra vez el mismo número; SUNAT contestaba que ya
 *     lo tenía, y la guía se marcaba RECHAZADA estando aceptada. Con el
 *     camión parado, «rechazada» es lo peor que puede decir la pantalla.
 *
 * Lo que dice el manual de la GRE (Manual de Servicios Web — Plataforma
 * Nueva GRE, SUNAT; resumido en docs/INVESTIGACION-GRE.md §2.3): el envío
 * devuelve un TICKET, y el resultado se pide con ese ticket —98 en proceso,
 * 0 listo con su CDR, 99 error—. La API de la GRE no tiene consulta por
 * número. Así que, por orden:
 *
 *   1. Si ya hay un ticket guardado, se pregunta por él ANTES de reenviar.
 *      Aceptada → se guarda y no se reenvía. En proceso → no se reenvía.
 *      Sin poder preguntar (red) → no se reenvía: mandar a ciegas es
 *      justo lo que crea el duplicado. Solo si el ticket dice «rechazada»
 *      (o SUNAT no lo conoce) se vuelve a mandar.
 *   2. Si no hay ticket —el corte fue en el mismo envío— no hay a quién
 *      preguntar. Se reenvía, y si SUNAT dice que ese número ya lo tiene y
 *      nosotros ya lo habíamos mandado, NO se marca rechazada: queda
 *      pendiente, con un mensaje que manda a comprobarla en SOL. Si nunca se
 *      había mandado, el duplicado sí es un rechazo de verdad (el número lo
 *      usó otro sistema, como la F002-00000001 del 04/08).
 */

export type EstadoSunatGuia = "pendiente" | "enviado" | "aceptado" | "observado" | "rechazado";

export type Desenlace =
  | { ok: true; estado: "aceptada" | "rechazada" | "en_proceso"; mensaje: string }
  | { ok: false; error: string };

/** Lo que el viaje necesita de SUNAT. Lo implementa el conector. */
export interface PuertoSunat {
  enviar(): Promise<{ ticket: string }>;
  consultar(ticket: string): Promise<ResultadoCdr | { enProceso: true }>;
}

/** Lo que el viaje escribe en la guía. */
export interface CambiosGuia {
  estado_sunat?: EstadoSunatGuia;
  sunat_ticket?: string;
  sunat_codigo_respuesta?: string | null;
  sunat_mensaje?: string | null;
  /** El `ResultadoCdr` entero, con `cdrXml`: la constancia (168). */
  sunat_respuesta?: ResultadoCdr | null;
}

export interface PuertoGuia {
  guardar(cambios: CambiosGuia): Promise<void>;
}

export interface Previo {
  /** El ticket del envío anterior, si lo hubo y se llegó a guardar. */
  ticket: string | null;
  /** ¿Salió ya alguna vez hacia SUNAT? (`sunat_enviado_en` antes de este intento). */
  yaSeMando: boolean;
}

/** Los códigos con los que SUNAT dice «ese número ya lo tengo». */
const CODIGOS_DUPLICADO = new Set(["1032", "1033"]);

/**
 * ¿Dice SUNAT que esa guía ya la tiene?
 *
 * El código se mira primero (1033 «registrado previamente», 1032 «ya
 * informado», los de la factura, que la GRE comparte). El texto, por si la
 * GRE contesta con otro número: no está confirmado contra el SUNAT real,
 * porque no tiene ambiente de pruebas.
 */
export function esDuplicadoGre(codigo: string | null | undefined, mensaje: string | null | undefined): boolean {
  const num = String(codigo ?? "").match(/(\d{3,4})(?!.*\d)/)?.[1];
  if (num && CODIGOS_DUPLICADO.has(num)) return true;
  return /(registrad|presentad|informad|enviad)[oa]s? previamente|ya (ha sido|fue|está|esta|se encuentra) (registrad|presentad|informad|enviad)|ya existe|duplicad/i.test(
    String(mensaje ?? ""),
  );
}

/**
 * El mensaje de una guía que SUNAT dice tener, sin poder confirmar cómo.
 *
 * `seguro`: sabemos que este mismo número ya había salido desde aquí. Si no
 * se sabe —al preguntar por un ticket más tarde no queda dicho si aquel
 * envío fue el primero o un reintento—, el mensaje dice las dos salidas.
 */
export function mensajeDuplicadoSinConfirmar(numero: string, seguro: boolean): string {
  const comprobar =
    "Compruébala en SUNAT Operaciones en Línea (Consulta de guías de remisión electrónicas) antes de mover la mercadería.";
  return seguro
    ? `SUNAT dice que la guía ${numero} ya la tiene: el primer envío sí llegó, pero se cortó antes de recibir su respuesta. ` +
        `NO emitas otra guía por lo mismo. ${comprobar}`
    : `SUNAT dice que ya tiene una guía con el número ${numero}. Si esta ya se había mandado antes, es ella y NO hay que emitir otra; ` +
        `si no, ese número lo usó otro sistema y hay que anular esta y emitir una nueva. ${comprobar}`;
}

function estadoDe(r: ResultadoCdr): EstadoSunatGuia {
  if (!r.aceptado) return "rechazado";
  return r.observaciones.length > 0 ? "observado" : "aceptado";
}

/**
 * Qué se sabe de envíos anteriores cuando SUNAT dice «ya la tengo»:
 *   · `ya_mandada`: había salido antes → no es un rechazo.
 *   · `nueva`: es el primer envío → el número lo tiene otro; rechazo de verdad.
 *   · `no_se_sabe`: no es un rechazo (no se arriesga a marcar rechazada una
 *     guía aceptada), y el mensaje dice las dos salidas.
 */
type Antecedente = "ya_mandada" | "nueva" | "no_se_sabe";

/**
 * Guarda una respuesta con CDR (o un «0» sin él) y la traduce. Un rechazo
 * por duplicado de algo que ya se había mandado no se guarda como rechazo.
 */
async function registrar(guia: PuertoGuia, numero: string, antecedente: Antecedente, r: ResultadoCdr): Promise<Desenlace> {
  if (!r.aceptado && antecedente !== "nueva" && esDuplicadoGre(r.codigo, r.descripcion)) {
    const mensaje = mensajeDuplicadoSinConfirmar(numero, antecedente === "ya_mandada");
    await guia.guardar({
      estado_sunat: "pendiente",
      sunat_codigo_respuesta: r.codigo ?? null,
      sunat_mensaje: mensaje,
      sunat_respuesta: r,
    });
    return { ok: false, error: mensaje };
  }
  await guia.guardar({
    estado_sunat: estadoDe(r),
    sunat_codigo_respuesta: r.codigo ?? null,
    sunat_mensaje: r.descripcion ?? null,
    sunat_respuesta: r,
  });
  return r.aceptado
    ? { ok: true, estado: "aceptada", mensaje: `SUNAT aceptó la guía ${numero}. Ya puede salir la mercadería.` }
    : { ok: true, estado: "rechazada", mensaje: `SUNAT rechazó la guía ${numero}: ${r.descripcion}` };
}

const EN_PROCESO = (numero: string): Desenlace => ({
  ok: true,
  estado: "en_proceso",
  mensaje: `SUNAT todavía está revisando la guía ${numero}: pulsa «Preguntar a SUNAT» en un momento.`,
});

/**
 * Manda la guía, o averigua qué pasó con el envío anterior antes de hacerlo.
 *
 * Quien la llama ya puso el candado («enviado») y comprobó permisos y datos.
 * `pausas` son las esperas entre preguntas tras enviar: SUNAT suele contestar
 * en segundos.
 */
export async function mandarGuia(opciones: {
  numero: string;
  previo: Previo;
  sunat: PuertoSunat;
  guia: PuertoGuia;
  esperar: (ms: number) => Promise<void>;
  pausas?: number[];
}): Promise<Desenlace> {
  const { numero, previo, sunat, guia, esperar, pausas = [1500, 2500, 4000] } = opciones;

  // 1. Con ticket guardado, primero se pregunta.
  if (previo.ticket) {
    try {
      const r = await sunat.consultar(previo.ticket);
      if ("enProceso" in r) {
        await guia.guardar({ estado_sunat: "enviado", sunat_mensaje: null });
        return EN_PROCESO(numero);
      }
      if (r.aceptado) return registrar(guia, numero, "ya_mandada", r);
      // Rechazada por su ticket: se puede volver a mandar, y se sigue.
    } catch (e) {
      if (!(e instanceof ErrorGre)) {
        // Sin saber qué pasó con el envío anterior, no se manda otro.
        const mensaje = esErrorDeRed(e)
          ? "No se pudo preguntar a SUNAT por el envío anterior de esta guía (sin internet o SUNAT caído), y no se vuelve a mandar sin saberlo. Inténtalo en unos minutos."
          : e instanceof Error
            ? e.message
            : "No se pudo preguntar a SUNAT por el envío anterior.";
        await guia.guardar({ estado_sunat: "enviado", sunat_mensaje: mensaje });
        return { ok: false, error: mensaje };
      }
      // SUNAT contestó, pero no conoce el ticket o no da el resultado: se manda.
    }
  }

  // 2. El envío.
  let ticket: string;
  try {
    ticket = (await sunat.enviar()).ticket;
    await guia.guardar({ sunat_ticket: ticket });
  } catch (e) {
    const mensaje = esErrorDeRed(e)
      ? MENSAJE_SIN_CONEXION
      : e instanceof Error
        ? e.message
        : "No se pudo hablar con SUNAT.";
    const http422 = e instanceof ErrorGre && e.http === 422;
    const codigo = e instanceof ErrorGre ? e.codigo : null;

    if (http422 && previo.yaSeMando && esDuplicadoGre(codigo, mensaje)) {
      const aviso = mensajeDuplicadoSinConfirmar(numero, true);
      await guia.guardar({ estado_sunat: "pendiente", sunat_codigo_respuesta: codigo, sunat_mensaje: aviso });
      return { ok: false, error: aviso };
    }
    // Un 422 es un rechazo del documento; lo demás (red, credenciales, 5xx)
    // la deja pendiente para volver a intentarlo.
    await guia.guardar({
      estado_sunat: http422 ? "rechazado" : "pendiente",
      sunat_codigo_respuesta: codigo,
      sunat_mensaje: mensaje,
    });
    return http422
      ? { ok: true, estado: "rechazada", mensaje: `SUNAT rechazó la guía ${numero}: ${mensaje}` }
      : { ok: false, error: mensaje };
  }

  // 3. SUNAT suele contestar en segundos: se pregunta aquí unas veces. Si
  // ahora dice «duplicado», cuenta lo de ANTES de este envío: si ya se había
  // mandado, es aquel; si no, el número lo tiene otro y es un rechazo.
  for (const pausa of pausas) {
    await esperar(pausa);
    try {
      const r = await sunat.consultar(ticket);
      if (!("enProceso" in r)) return registrar(guia, numero, previo.yaSeMando ? "ya_mandada" : "nueva", r);
    } catch {
      break;
    }
  }
  return {
    ok: true,
    estado: "en_proceso",
    mensaje: `Enviada. SUNAT todavía la está revisando: pulsa «Preguntar a SUNAT» en un momento.`,
  };
}

/**
 * Pregunta por el ticket guardado (el botón «Preguntar a SUNAT»).
 */
export async function preguntarGuia(opciones: {
  numero: string;
  ticket: string;
  sunat: Pick<PuertoSunat, "consultar">;
  guia: PuertoGuia;
}): Promise<Desenlace> {
  const r = await opciones.sunat.consultar(opciones.ticket);
  if ("enProceso" in r) {
    return { ok: true, estado: "en_proceso", mensaje: "SUNAT todavía la está revisando. Pregunta otra vez en un momento." };
  }
  return registrar(opciones.guia, opciones.numero, "no_se_sabe", r);
}
