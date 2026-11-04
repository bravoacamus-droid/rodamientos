"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, ExternalLink } from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  buttonVariants,
  cn,
} from "@rodatech/ui";

import { marcarBajaSunat } from "../acciones/anular";

/**
 * La baja en SUNAT de una guía anulada (190).
 *
 * Willy, 04/11 (53:58), sobre su sistema anterior: *«se anula la guía número
 * tal en el sistema, pero para anular toda la guía definitivamente tiene que
 * darle de baja en SUNAT»*. Para la guía electrónica no hay baja por servicio
 * —sí para la factura (125)—: se hace en SUNAT Operaciones en Línea, y él se
 * la pasaba a su contador. Aquí se dice cómo, y se apunta cuando ya está.
 */

/** SUNAT Operaciones en Línea (SOL), donde se da de baja la guía. */
export const URL_SOL = "https://e-menu.sunat.gob.pe/cl-ti-itmenu/MenuInternet.htm";

/** Los pasos, iguales en el diálogo de anular y en la ficha. */
export function PasosBajaSunat({ numero }: { numero: string }) {
  return (
    <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm">
      <li>
        Entra a <strong>SUNAT Operaciones en Línea</strong> con el usuario SOL de la empresa.
      </li>
      <li>
        Ve a <strong>Guía de Remisión Electrónica</strong> y busca la opción <strong>dar de baja</strong>.
      </li>
      <li>
        Pon la guía <strong className="font-mono">{numero}</strong> y confirma la baja.
      </li>
      <li>
        Vuelve aquí y pulsa <strong>«Ya la di de baja en SUNAT»</strong>.
      </li>
    </ol>
  );
}

export function BotonAbrirSunat() {
  return (
    <a
      href={URL_SOL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
    >
      Abrir SUNAT
      <ExternalLink className="size-4" aria-hidden="true" />
    </a>
  );
}

/**
 * En la ficha de la guía anulada: lo que falta, o cuándo se hizo.
 * Solo sale si la guía estuvo viva en SUNAT (`baja_solicitada` o `baja_aceptada`).
 */
export function BajaSunatGuia({
  id,
  numero,
  estadoSunat,
  baja,
  puede,
}: {
  id: string;
  numero: string;
  estadoSunat: string;
  baja: { en: string | null; por: string | null; nota: string | null };
  puede: boolean;
}) {
  if (estadoSunat === "baja_aceptada") {
    return (
      <div className="anim-entrada flex items-start gap-2 rounded-md border border-[var(--ok)] bg-[var(--surface-2)] p-3 text-sm">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-[var(--ok)]" aria-hidden="true" />
        <p>
          <strong>Dada de baja en SUNAT</strong>
          {baja.en ? ` el ${new Date(baja.en).toLocaleDateString("es-PE", { timeZone: "America/Lima" })}` : ""}
          {baja.por ? ` (lo marcó ${baja.por})` : ""}.{baja.nota ? ` ${baja.nota}` : ""} La guía quedó anulada del
          todo: en el sistema y en SUNAT.
        </p>
      </div>
    );
  }
  if (estadoSunat !== "baja_solicitada") return null;

  return (
    <div className="anim-entrada rounded-md border-2 border-[var(--warn)] bg-[var(--warn-bg)] p-4">
      <p className="flex items-center gap-2 text-base font-semibold">
        <CircleAlert className="size-5 shrink-0 text-[var(--warn)]" aria-hidden="true" />
        Falta darla de baja en SUNAT
      </p>
      <p className="mt-1 text-sm">
        En el sistema ya está anulada y la mercadería volvió al almacén. Pero SUNAT la aceptó, y para SUNAT
        sigue viva hasta que se le dé de baja. Eso se hace en su página: el sistema no puede hacerlo solo.
        También se lo puedes pasar a tu contador.
      </p>
      <PasosBajaSunat numero={numero} />
      <div className="mt-3 flex flex-wrap gap-2">
        <BotonAbrirSunat />
        {puede ? <MarcarBaja id={id} numero={numero} /> : null}
      </div>
    </div>
  );
}

function MarcarBaja({ id, numero }: { id: string; numero: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [nota, setNota] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [enviando, enviar] = React.useTransition();

  const confirmar = () =>
    enviar(async () => {
      setError(null);
      const r = await marcarBajaSunat({ id, nota });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAbierto(false);
      router.refresh();
    });

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={cn(buttonVariants(), "gap-1.5")}>
        <CircleCheck className="size-4" aria-hidden="true" />
        Ya la di de baja en SUNAT
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>¿Ya está dada de baja en SUNAT?</DialogTitle>
          <DialogDescription>
            Confírmalo solo si la guía {numero} ya sale de baja en SUNAT. Queda apuntado quién lo marcó y cuándo.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-sm font-medium">Nota (opcional)</span>
            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Por ejemplo: la dio de baja el contador"
              maxLength={200}
            />
          </label>
          {error ? (
            <p className="mt-3 rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            Todavía no
          </Button>
          <Button type="button" onClick={confirmar} disabled={enviando}>
            {enviando ? "Guardando…" : "Sí, ya está de baja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
