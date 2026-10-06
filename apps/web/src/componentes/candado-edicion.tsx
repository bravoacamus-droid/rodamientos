"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Lock, RefreshCw, TriangleAlert } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@rodatech/ui";

/**
 * El candado de una pantalla de edición (106).
 *
 * Willy, 06/10: *«para que no se crucen los datos»*. Envuelve el formulario:
 *
 *  · Al abrir, toma el bloqueo. Si lo tiene otra persona, en lugar del
 *    formulario sale QUIÉN lo está editando y desde qué hora, y la pantalla
 *    vuelve a probar sola cada 15 s: en cuanto el otro sale, entra.
 *  · Mientras se edita, late cada 30 s (solo con la pestaña a la vista: una
 *    pestaña escondida no está editando).
 *  · Al salir —volver, cerrar la pestaña— lo suelta. Si eso no llega a
 *    salir, caduca solo a los 2 minutos.
 *
 * Es el aviso. La puerta de verdad está al guardar: la Server Action pregunta
 * `bloqueo_ajeno` y no guarda si lo tiene otro.
 */

type Entidad = "producto" | "cotizacion";

type Fase =
  | { tipo: "tomando" }
  | { tipo: "mio" }
  | { tipo: "ajeno"; usuario: string; desde: string }
  | { tipo: "perdido"; usuario: string }
  | { tipo: "error"; mensaje: string };

const LATIDO_MS = 30_000;
const REINTENTO_MS = 15_000;

async function llamar(
  cuerpo: { accion: "tomar" | "soltar"; entidad: Entidad; registro: string; forzar?: boolean },
  keepalive = false,
): Promise<{ ok: boolean; usuario?: string; desde?: string; error?: string }> {
  const r = await fetch("/bloqueo-edicion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
    keepalive,
  });
  return r.json();
}

function hora(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    // «16:32» y no «04:32 p. m.»: con el punto final de la frase quedaba
    // «p. m..», y la hora de 24 no se confunde.
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function CandadoEdicion({
  entidad,
  registroId,
  que,
  volverHref,
  esGerencia,
  children,
}: {
  entidad: Entidad;
  registroId: string;
  /** «este producto», «esta cotización»: para las frases. */
  que: string;
  volverHref: string;
  esGerencia: boolean;
  children: React.ReactNode;
}) {
  const [fase, setFase] = React.useState<Fase>({ tipo: "tomando" });
  const tengo = React.useRef(false);
  const [confirmar, setConfirmar] = React.useState(false);

  const tomar = React.useCallback(
    async (forzar = false) => {
      try {
        const r = await llamar({ accion: "tomar", entidad, registro: registroId, forzar });
        if (r.ok) {
          tengo.current = true;
          setFase({ tipo: "mio" });
        } else if (r.usuario) {
          // Si lo tenía y ahora lo tiene otro, es que Gerencia lo quitó: no
          // se esconde el formulario —perdería lo escrito—, se avisa.
          if (tengo.current) {
            tengo.current = false;
            setFase({ tipo: "perdido", usuario: r.usuario });
          } else {
            setFase({ tipo: "ajeno", usuario: r.usuario, desde: r.desde ?? new Date().toISOString() });
          }
        } else {
          setFase({ tipo: "error", mensaje: r.error ?? "No se pudo comprobar." });
        }
      } catch {
        // Sin red no se bloquea a nadie: se deja editar y al guardar decide
        // la base. Dejar la pantalla colgada por un corte sería peor.
        if (!tengo.current) setFase({ tipo: "mio" });
      }
    },
    [entidad, registroId],
  );

  // Al entrar, tomar; al salir, soltar.
  React.useEffect(() => {
    void tomar();
    const soltar = () => {
      if (!tengo.current) return;
      tengo.current = false;
      void llamar({ accion: "soltar", entidad, registro: registroId }, true).catch(() => {});
    };
    window.addEventListener("pagehide", soltar);
    return () => {
      window.removeEventListener("pagehide", soltar);
      soltar();
    };
  }, [tomar, entidad, registroId]);

  // El latido mientras es mío; el reintento mientras es de otro.
  React.useEffect(() => {
    if (fase.tipo !== "mio" && fase.tipo !== "ajeno") return;
    const cada = fase.tipo === "mio" ? LATIDO_MS : REINTENTO_MS;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void tomar();
    }, cada);
    const alVolver = () => {
      if (document.visibilityState === "visible") void tomar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [fase.tipo, tomar]);

  if (fase.tipo === "tomando") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <p className="text-base text-[var(--fg-muted)]">Comprobando que nadie más lo está editando…</p>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (fase.tipo === "ajeno") {
    return (
      <section className="card flex flex-col gap-4 border-2 border-[var(--warn)] p-5" role="status">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--warn-bg)] text-[var(--warn)]">
            <Lock className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">
              {fase.usuario} está editando {que}
            </h2>
            <p className="mt-1 text-base text-[var(--fg-muted)]">
              Lo abrió a las {hora(fase.desde)}. Para no pisar sus cambios, espera a que termine: esta
              pantalla vuelve a probar sola y se abre en cuanto lo deje libre.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={volverHref}
            className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base font-semibold hover:bg-[var(--surface-2)]"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
            Volver
          </Link>
          <button
            type="button"
            onClick={() => void tomar()}
            className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base font-semibold hover:bg-[var(--surface-2)]"
          >
            <RefreshCw className="size-5" aria-hidden="true" />
            Probar ahora
          </button>
          {esGerencia ? (
            <button
              type="button"
              onClick={() => setConfirmar(true)}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-[var(--danger)] px-4 text-base font-semibold text-white hover:opacity-90"
            >
              <Lock className="size-5" aria-hidden="true" />
              Quitarle la edición y entrar
            </button>
          ) : null}
        </div>

        <Dialog open={confirmar} onOpenChange={setConfirmar}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>¿Quitarle la edición a {fase.usuario}?</DialogTitle>
              <DialogDescription className="text-base">
                Lo que tenga escrito sin guardar ya no se podrá guardar. Úsalo si dejó la pantalla
                abierta y no está.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmar(false)}>
                No, esperar
              </Button>
              <Button
                type="button"
                className="bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90"
                onClick={() => {
                  setConfirmar(false);
                  void tomar(true);
                }}
              >
                Sí, quitársela
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    );
  }

  return (
    <>
      {fase.tipo === "perdido" ? (
        <p className="flex items-start gap-2 rounded-lg border-2 border-[var(--danger)] bg-[var(--danger-bg)] p-4 text-base">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
          <span>
            <strong>{fase.usuario} tomó la edición de {que}.</strong> Lo que cambies aquí ya no se
            podrá guardar. Copia lo que necesites y vuelve a abrirlo cuando lo deje libre.
          </span>
        </p>
      ) : null}
      {fase.tipo === "error" ? (
        <p className="rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-base">
          No se pudo comprobar si alguien más lo está editando ({fase.mensaje}). Puedes seguir; al
          guardar se vuelve a comprobar.
        </p>
      ) : null}
      {children}
    </>
  );
}
