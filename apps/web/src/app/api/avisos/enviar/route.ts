import { NextResponse, type NextRequest } from "next/server";
import { envOpcional } from "@rodatech/config";

import { llamadaDelCron } from "@/lib/cron";
import { enviarPendientes } from "@/modules/avisos/api/cola";
import { reintentarSunat } from "@/modules/sunat/api/reintentos";

/**
 * Vacía la cola de avisos hacia los celulares (162).
 *
 * La llama Vercel Cron (ver `vercel.json`) con `Authorization: Bearer
 * <CRON_SECRET>`, que es como Vercel firma sus llamadas. Sin sesión: el
 * middleware la deja pasar, y lo que la protege es este secreto, comparado en
 * tiempo constante.
 *
 * Sin `CRON_SECRET` en el entorno falla CERRADO: una ruta que manda avisos a
 * todo el personal no puede quedar abierta por un despliegue a medias.
 *
 * Y de paso reintenta lo que no llegó a SUNAT (183). Lo normal es que lo haga
 * el cron de Supabase cada 10 minutos; esto es la red de seguridad si el Vault
 * no está configurado, sin gastar un cron más de Vercel.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!envOpcional("CRON_SECRET")) {
    return NextResponse.json({ ok: false, error: "Falta CRON_SECRET en el servidor." }, { status: 503 });
  }
  if (!llamadaDelCron(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  try {
    const resumen = await enviarPendientes();
    // Un fallo de SUNAT no debe tumbar los avisos, que ya salieron.
    const sunat = await reintentarSunat().catch((e: unknown) => ({
      error: e instanceof Error ? e.message : "No se pudo reintentar.",
    }));
    return NextResponse.json({ ok: true, ...resumen, sunat });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar." },
      { status: 500 },
    );
  }
}
