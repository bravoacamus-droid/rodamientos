import "server-only";

import { clienteAdmin } from "@rodatech/db/admin";

import {
  type AlertaPorAvisar,
  type Destino,
  esSeveridad,
  planDeEnvio,
  seDaPorAvisada,
} from "../dominio/envio";
import { mandar, pushConfigurado, type ResultadoEnvio } from "./push";

/**
 * Vacía la cola de `alertas` hacia los celulares (162).
 *
 * La llama `/api/avisos/enviar`, que la protege con `CRON_SECRET`; nadie con
 * sesión llega aquí. Usa la llave de servicio porque necesita leer los
 * aparatos de TODOS — RLS deja a cada uno ver solo los suyos — y marcar
 * `notificado_en`, que ningún rol escribe.
 *
 * El orden importa, y es lo que impide mandar dos veces lo mismo si dos
 * pasadas se cruzan (el cron y una llamada a mano): primero se RESERVAN las
 * alertas poniéndoles `notificado_en` solo donde sigue en null, y se manda
 * únicamente lo que esta pasada consiguió reservar. Si todo falla por algo
 * pasajero, se devuelven a la cola.
 */

/** Cuántas se toman por pasada. Más que suficiente: la mañana normal son diez. */
const POR_PASADA = 200;

export interface ResumenPasada {
  alertas: number;
  aparatos: number;
  enviadas: number;
  fallidas: number;
  dadosDeBaja: number;
  devueltasALaCola: boolean;
  motivo?: string;
}

export async function enviarPendientes(): Promise<ResumenPasada> {
  const vacio: ResumenPasada = {
    alertas: 0,
    aparatos: 0,
    enviadas: 0,
    fallidas: 0,
    dadosDeBaja: 0,
    devueltasALaCola: false,
  };
  if (!pushConfigurado()) {
    // Sin claves no se toca la cola: el día que se pongan, lo pendiente sale.
    return { ...vacio, motivo: "Faltan las claves VAPID: no se mandó nada." };
  }

  const db = clienteAdmin();

  const { data: candidatas, error: e1 } = await db
    .from("alertas")
    .select("id")
    .is("notificado_en", null)
    .eq("archivada", false)
    .order("generada_en", { ascending: true })
    .limit(POR_PASADA);
  if (e1) throw new Error(`No se pudo leer la cola: ${e1.message}`);
  if (!candidatas || candidatas.length === 0) return vacio;

  const marca = new Date().toISOString();
  const { data: reservadas, error: e2 } = await db
    .from("alertas")
    .update({ notificado_en: marca })
    .in(
      "id",
      candidatas.map((c) => c.id),
    )
    .is("notificado_en", null)
    .select("id, titulo, mensaje, severidad, accion_url, generada_en");
  if (e2) throw new Error(`No se pudo reservar la cola: ${e2.message}`);
  if (!reservadas || reservadas.length === 0) return vacio;

  const alertas: AlertaPorAvisar[] = reservadas.map((a) => ({
    id: a.id,
    titulo: a.titulo,
    mensaje: a.mensaje,
    severidad: esSeveridad(a.severidad) ? a.severidad : "media",
    accion_url: a.accion_url,
    generada_en: a.generada_en,
  }));

  // Solo los aparatos de cuentas activas: a quien se dio de baja no le
  // llegan avisos de la empresa aunque su celular siga suscrito.
  const { data: aparatos, error: e3 } = await db
    .from("suscripciones_push")
    .select("id, endpoint, p256dh, auth, severidad_minima, perfiles!inner(activo)")
    .eq("activa", true)
    .eq("perfiles.activo", true);
  if (e3) {
    await devolverALaCola(db, alertas, marca);
    throw new Error(`No se pudieron leer los aparatos: ${e3.message}`);
  }

  const porId = new Map((aparatos ?? []).map((a) => [a.id, a]));
  const destinos: Destino[] = (aparatos ?? []).map((a) => ({
    id: a.id,
    severidad_minima: esSeveridad(a.severidad_minima) ? a.severidad_minima : "media",
  }));
  const plan = planDeEnvio(alertas, destinos);

  const resultados: ResultadoEnvio[] = [];
  let enviadas = 0;
  let fallidas = 0;
  let dadosDeBaja = 0;

  await Promise.all(
    plan.map(async ({ destino, notificaciones }) => {
      const aparato = porId.get(destino.id)!;
      let ultimo: ResultadoEnvio = { ok: true, definitivo: false, error: null };
      // Una a una dentro del mismo aparato, para que lleguen en orden.
      for (const n of notificaciones) {
        ultimo = await mandar(aparato, n);
        resultados.push(ultimo);
        if (ultimo.ok) enviadas += 1;
        else fallidas += 1;
        if (ultimo.definitivo) break;
      }
      const ahora = new Date().toISOString();
      if (ultimo.definitivo) dadosDeBaja += 1;
      await db
        .from("suscripciones_push")
        .update(
          ultimo.ok
            ? { ultimo_envio: ahora, ultima_vez: ahora, ultimo_error: null }
            : { ultimo_error: ultimo.error, activa: !ultimo.definitivo },
        )
        .eq("id", destino.id);
    }),
  );

  let devueltas = false;
  if (!seDaPorAvisada(resultados)) {
    await devolverALaCola(db, alertas, marca);
    devueltas = true;
  }

  return {
    alertas: alertas.length,
    aparatos: plan.length,
    enviadas,
    fallidas,
    dadosDeBaja,
    devueltasALaCola: devueltas,
  };
}

/** Quita la reserva de ESTA pasada, y solo la suya: la marca de hora es su firma. */
async function devolverALaCola(
  db: ReturnType<typeof clienteAdmin>,
  alertas: AlertaPorAvisar[],
  marca: string,
) {
  await db
    .from("alertas")
    .update({ notificado_en: null })
    .in(
      "id",
      alertas.map((a) => a.id),
    )
    .eq("notificado_en", marca);
}
