"use client";

/*
 * "use client" OBLIGATORIO: diálogo con estado y llamadas a Server Actions.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  RadioCampo,
  RadioGroup,
  Textarea,
  toast,
} from "@rodatech/ui";
import { Link2, Link2Off } from "lucide-react";

import {
  declararEquivalencia,
  quitarEquivalencia,
  type ResultadoEquivalencia,
} from "../acciones/declarar";
import { AYUDA_CLASE, CLASES, ETIQUETA_CLASE, type ClaseEquivalencia } from "../dominio/tipos";

function useAccion() {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState(false);

  const correr = React.useCallback(
    async (fn: () => Promise<ResultadoEquivalencia>): Promise<boolean> => {
      setOcupado(true);
      try {
        const r = await fn();
        if (r.ok) {
          toast.success(r.mensaje);
          router.refresh();
          return true;
        }
        toast.error(r.error);
        return false;
      } finally {
        setOcupado(false);
      }
    },
    [router],
  );

  return { ocupado, correr };
}

/**
 * Declarar que dos productos son equivalentes.
 *
 * Pide la CLASE antes de guardar, y no la da por supuesta. La diferencia entre
 * «intercambiable» y «sirve con criterio técnico» es la que decide si el de
 * almacén puede despachar el otro sin llamar a nadie, y esa decisión se toma
 * aquí, con el catálogo delante, no tres meses después en el mostrador.
 */
export function BotonDeclarar({
  productoId,
  equivalenteId,
  codigoEquivalente,
  claseSugerida = "exacta",
}: {
  productoId: string;
  equivalenteId: string;
  codigoEquivalente: string;
  claseSugerida?: ClaseEquivalencia;
}) {
  const { ocupado, correr } = useAccion();
  const [abierto, setAbierto] = React.useState(false);
  const [clase, setClase] = React.useState<ClaseEquivalencia>(claseSugerida);
  const [nota, setNota] = React.useState("");

  // Hay un botón por fila, así que un id fijo se repetiría en la página y el
  // `htmlFor` de la etiqueta apuntaría al radio de otra fila.
  const idBase = React.useId();

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 />
          Declarar
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogTitle>Declarar equivalencia</DialogTitle>
        <DialogDescription>
          Con <span className="font-mono">{codigoEquivalente}</span>. Queda
          guardada en los dos sentidos y sube al primer peldaño de la cascada:
          desde ahora sale antes que cualquier coincidencia deducida.
        </DialogDescription>

        <div className="flex flex-col gap-3 py-2">
          <RadioGroup
            value={clase}
            onValueChange={(v) => setClase(v as ClaseEquivalencia)}
            className="flex flex-col gap-2"
          >
            {CLASES.map((c) => (
              <RadioCampo
                key={c}
                id={`${idBase}-${c}`}
                value={c}
                label={ETIQUETA_CLASE[c]}
                ayuda={AYUDA_CLASE[c]}
              />
            ))}
          </RadioGroup>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--fg-muted)]">
              Nota (opcional)
            </span>
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="«El de FAG viene con jaula de poliamida», por ejemplo."
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={ocupado}
            onClick={async () => {
              const bien = await correr(() =>
                declararEquivalencia(productoId, equivalenteId, clase, nota || null),
              );
              if (bien) {
                setAbierto(false);
                setNota("");
              }
            }}
          >
            {ocupado ? "Guardando…" : "Declarar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Quita una equivalencia declarada. No borra productos, solo el vínculo. */
export function BotonQuitar({
  productoId,
  equivalenteId,
}: {
  productoId: string;
  equivalenteId: string;
}) {
  const { ocupado, correr } = useAccion();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={ocupado}
      title="Quitar la equivalencia"
      onClick={() => correr(() => quitarEquivalencia(productoId, equivalenteId))}
    >
      <Link2Off />
      Quitar
    </Button>
  );
}
