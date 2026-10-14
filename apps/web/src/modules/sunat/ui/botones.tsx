"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, RefreshCw, Send } from "lucide-react";
import { Button } from "@rodatech/ui";

import { comunicarBaja, consultarBaja } from "../acciones/baja";
import { enviarVarios, type ResultadoUno } from "../acciones/enviar";

/**
 * Enviar uno o varios a SUNAT. Con varios, uno detrás de otro, y al terminar
 * dice cuál entró y cuál no, con su porqué: un «listo» sin detalle escondería
 * justo la que hay que mirar.
 */
export function BotonEnviar({
  ids,
  etiqueta,
  principal = false,
  deshabilitado = false,
}: {
  ids: string[];
  etiqueta: string;
  principal?: boolean;
  deshabilitado?: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = React.useTransition();
  const [resultados, setResultados] = React.useState<ResultadoUno[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [quedan, setQuedan] = React.useState(0);

  const enviar = () =>
    iniciar(async () => {
      setError(null);
      setResultados(null);
      const r = await enviarVarios(ids);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResultados(r.resultados);
      setQuedan(r.quedan);
      router.refresh();
    });

  // Una sola: el resultado ya lo dice la lista al recargarse, salvo el error.
  const varios = ids.length > 1;

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={principal ? "primary" : "outline"}
        onClick={enviar}
        disabled={pendiente || deshabilitado || ids.length === 0}
        className={principal ? "h-11 px-5 text-base" : undefined}
      >
        <Send className="size-4" aria-hidden="true" />
        {pendiente ? (varios ? `Enviando ${ids.length}…` : "Enviando…") : etiqueta}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {resultados && (varios || resultados.some((x) => !x.aceptado)) ? (
        <ul className="flex flex-col gap-1 rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-sm">
          {resultados.map((x) => (
            <li key={x.id} className="flex items-start gap-2">
              {x.aceptado ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-[var(--ok)]" aria-hidden="true" />
              ) : (
                <CircleX className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" aria-hidden="true" />
              )}
              <span>
                <strong className="font-mono">{x.numero}</strong> · {x.aceptado ? "aceptado" : x.mensaje}
              </span>
            </li>
          ))}
          {quedan > 0 ? <li className="font-medium">Quedan {quedan}: pulsa otra vez para seguir.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

/** Mandar la comunicación de baja de una fecha, o preguntar por una enviada. */
export function BotonBaja({ fecha, bajaId }: { fecha?: string; bajaId?: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = React.useTransition();
  const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null);

  const correr = () =>
    iniciar(async () => {
      setAviso(null);
      const r = bajaId ? await consultarBaja(bajaId) : await comunicarBaja(fecha ?? "");
      setAviso(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
      router.refresh();
    });

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button type="button" variant={bajaId ? "outline" : "primary"} onClick={correr} disabled={pendiente}>
        {bajaId ? <RefreshCw className="size-4" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        {pendiente ? (bajaId ? "Preguntando…" : "Enviando…") : bajaId ? "Preguntar a SUNAT" : "Comunicar la baja"}
      </Button>
      {aviso ? (
        <p role={aviso.ok ? "status" : "alert"} className={`text-sm ${aviso.ok ? "text-[var(--fg-muted)]" : "text-[var(--danger)]"}`}>
          {aviso.texto}
        </p>
      ) : null}
    </div>
  );
}
