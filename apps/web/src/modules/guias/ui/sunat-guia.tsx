"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CircleCheck, RefreshCw, Send } from "lucide-react";
import { Button, buttonVariants, cn } from "@rodatech/ui";

import { consultarGuiaSunat, enviarGuiaASunat } from "../acciones/sunat";

/**
 * La guía ante SUNAT, en su ficha (15/10): en qué estado está y el botón
 * que toca. Aceptada es lo único que deja salir la mercadería tranquilo.
 */
export function SunatGuia({
  id,
  estado,
  estadoSunat,
  mensaje,
  configurado,
  faltaConfig,
  faltaGuia,
  puede,
}: {
  id: string;
  estado: string;
  estadoSunat: string;
  mensaje: string | null;
  configurado: boolean;
  faltaConfig: string[];
  faltaGuia: string[];
  puede: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = React.useTransition();
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null);

  const correr = (accion: (id: string) => ReturnType<typeof enviarGuiaASunat>) =>
    iniciar(async () => {
      setAviso(null);
      const r = await accion(id);
      setAviso(r.ok ? { ok: r.estado !== "rechazada", texto: r.mensaje } : { ok: false, texto: r.error });
      router.refresh();
    });

  if (estado === "borrador") {
    return <p className="text-sm text-[var(--fg-muted)]">Se manda a SUNAT después de emitirla.</p>;
  }
  if (estado === "anulada") {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        Anulada. Si SUNAT ya la había aceptado, la baja se hace en SUNAT Operaciones en Línea: para guías no hay
        envío de baja automático.
      </p>
    );
  }

  const aceptada = estadoSunat === "aceptado" || estadoSunat === "observado";
  const enviada = estadoSunat === "enviado";

  /*
    Qué falta para mandarla Y dónde se arregla (UI1-01, 27/10).

    Antes era una lista en gris, fuera del recuadro y sin camino: decía «Falta
    el ID de las credenciales de API» y no adónde ir. Facturación y /sunat ya
    llevaban su botón a la configuración; la guía era la única hermana sin él.
    Ahora va dentro del mismo recuadro de aviso, en el color de leer, con el
    botón al final.
  */
  const faltaConfigurar = (
    <div className="text-[var(--fg)]">
      <p className="font-medium">Para mandarla falta configurar el envío:</p>
      <ul className="mt-1 list-inside list-disc">
        {faltaConfig.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <Link
        href="/configuracion/sunat"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 gap-1.5 text-sm")}
      >
        Completar en SUNAT y numeración
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );

  return (
    <div className="flex flex-col gap-2 text-sm">
      {aceptada ? (
        <p className="flex items-center gap-1.5 rounded-sm border border-[var(--ok)] bg-[var(--surface-2)] p-2.5 font-medium">
          <CircleCheck className="size-5 shrink-0 text-[var(--ok)]" aria-hidden="true" />
          Aceptada por SUNAT. Puede salir la mercadería.
        </p>
      ) : estadoSunat === "rechazado" ? (
        <p className="rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-[var(--danger)]">
          <strong>Rechazada por SUNAT.</strong> {mensaje}
        </p>
      ) : enviada ? (
        <p className="rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5">
          <strong>Enviada:</strong> SUNAT la está revisando.
        </p>
      ) : (
        <div className="rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5">
          <p>
            <strong>Todavía no está en SUNAT.</strong> Tiene que estar aceptada antes de que salga la mercadería.
          </p>
          {mensaje ? <p className="mt-1 text-[var(--fg-muted)]">Último intento: {mensaje}</p> : null}
          {configurado ? null : <div className="mt-2 border-t border-[var(--warn)] pt-2">{faltaConfigurar}</div>}
        </div>
      )}

      {!aceptada && !configurado && (estadoSunat === "rechazado" || enviada) ? (
        <div className="rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5">{faltaConfigurar}</div>
      ) : null}
      {!aceptada && configurado && faltaGuia.length > 0 ? (
        <div className="text-[var(--danger)]">
          <p>A la guía le falta:</p>
          <ul className="list-inside list-disc">
            {faltaGuia.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {puede && !aceptada ? (
        <div className="flex flex-wrap gap-2">
          {enviada ? (
            <Button type="button" variant="outline" onClick={() => correr(consultarGuiaSunat)} disabled={pendiente}>
              <RefreshCw className="size-4" aria-hidden="true" />
              {pendiente ? "Preguntando…" : "Preguntar a SUNAT"}
            </Button>
          ) : null}
          {/* Una enviada se PREGUNTA, no se reenvía: mandarla otra vez la
              duplicaría y perdería el ticket de la primera (auditoría 15/10). */}
          {enviada ? null : (
            <Button
              type="button"
              onClick={() => correr(enviarGuiaASunat)}
              disabled={pendiente || !configurado || faltaGuia.length > 0}
            >
              <Send className="size-4" aria-hidden="true" />
              {pendiente ? "Enviando…" : estadoSunat === "rechazado" ? "Enviar otra vez" : "Enviar a SUNAT"}
            </Button>
          )}
        </div>
      ) : null}

      {aviso ? (
        <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "font-medium" : "text-[var(--danger)]"}>
          {aviso.texto}
        </p>
      ) : null}
    </div>
  );
}
