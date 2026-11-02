import { NextResponse, type NextRequest } from "next/server";
import { envOpcional } from "@rodatech/config";

import { llamadaDelCron } from "@/lib/cron";
import { reintentarSunat } from "@/modules/sunat/api/reintentos";

/**
 * Reenvía a SUNAT lo que no llegó (183).
 *
 * La llama el cron de Supabase cada 10 minutos, y SOLO cuando
 * `sunat_por_reintentar()` tiene algo: un día en que todo llega a la primera
 * son cero llamadas a Vercel. Sin sesión: la protege `CRON_SECRET`.
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
    return NextResponse.json({ ok: true, ...(await reintentarSunat()) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo reintentar." },
      { status: 500 },
    );
  }
}
