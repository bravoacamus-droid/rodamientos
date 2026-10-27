import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { envOpcional } from "@rodatech/config";

import { enviarPendientes } from "@/modules/avisos/api/cola";

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
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function autorizado(request: NextRequest): boolean {
  const secreto = envOpcional("CRON_SECRET");
  if (!secreto) return false;
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

export async function GET(request: NextRequest) {
  if (!envOpcional("CRON_SECRET")) {
    return NextResponse.json({ ok: false, error: "Falta CRON_SECRET en el servidor." }, { status: 503 });
  }
  if (!autorizado(request)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  try {
    const resumen = await enviarPendientes();
    return NextResponse.json({ ok: true, ...resumen });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar." },
      { status: 500 },
    );
  }
}
