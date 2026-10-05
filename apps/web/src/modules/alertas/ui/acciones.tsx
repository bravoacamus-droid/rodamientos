"use client";

/*
 * "use client" OBLIGATORIO: son botones con estado pendiente y avisos.
 *
 * Todos comparten la misma forma: llaman a la Server Action, enseñan el
 * resultado en un aviso y refrescan la ruta. El refresco lo pide el servidor
 * con `revalidatePath`, pero hace falta `router.refresh()` para que el
 * componente de servidor se vuelva a pintar sin recargar la página entera.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, toast } from "@rodatech/ui";
import { Archive, Check, RefreshCw, Undo2 } from "lucide-react";

import {
  archivar,
  marcarLeida,
  marcarTodasLeidas,
  refrescar,
  type ResultadoAccion,
} from "../acciones/bandeja";

/** Ejecuta la acción, avisa y refresca. El patrón de los cinco botones. */
function useAccion() {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState(false);

  const correr = React.useCallback(
    async (fn: () => Promise<ResultadoAccion>) => {
      setOcupado(true);
      try {
        const r = await fn();
        if (r.ok) {
          toast.success(r.mensaje);
          router.refresh();
        } else {
          toast.error(r.error);
        }
      } finally {
        setOcupado(false);
      }
    },
    [router],
  );

  return { ocupado, correr };
}

/**
 * Volver a calcular las alertas.
 *
 * Enseña cuántas nuevas salieron, incluido el cero. «Nada nuevo» es una
 * respuesta útil: significa que la bandeja ya estaba al día, no que el botón
 * no funcionó.
 */
export function BotonRefrescar() {
  const { ocupado, correr } = useAccion();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={ocupado}
      onClick={() => correr(refrescar)}
    >
      <RefreshCw className={ocupado ? "animate-spin" : undefined} />
      {ocupado ? "Revisando…" : "Actualizar"}
    </Button>
  );
}

export function BotonMarcarTodas({ sinLeer }: { sinLeer: number }) {
  const { ocupado, correr } = useAccion();
  if (sinLeer === 0) return null;

  return (
    // Con borde, como los demás: en «ghost» era texto gris sin caja.
    <Button
      variant="outline"
      size="sm"
      disabled={ocupado}
      onClick={() => correr(marcarTodasLeidas)}
    >
      <Check />
      Marcar {sinLeer} como leídas
    </Button>
  );
}

/** Leer / devolver a no leída, y archivar. Van juntos en cada fila. */
export function AccionesAlerta({ id, leida }: { id: string; leida: boolean }) {
  const { ocupado, correr } = useAccion();

  return (
    // Con su palabra y con borde (revisión de diseño del 02/10): dos iconos
    // sueltos y grises no se reconocen como botones (CLAUDE.md §1).
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        disabled={ocupado}
        onClick={() => correr(() => marcarLeida(id, !leida))}
      >
        {leida ? <Undo2 /> : <Check />}
        {leida ? "No leída" : "Leída"}
      </Button>

      <Button variant="outline" size="sm" disabled={ocupado} onClick={() => correr(() => archivar(id))}>
        <Archive />
        Archivar
      </Button>
    </div>
  );
}
