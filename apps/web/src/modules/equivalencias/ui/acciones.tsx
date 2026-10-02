"use client";

/*
 * "use client" OBLIGATORIO: diálogo con estado y llamadas a Server Actions.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
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
import {
  AYUDA_CLASE,
  CLASES,
  ETIQUETA_CLASE,
  type ClaseEquivalencia,
} from "../dominio/tipos";
import { SelectorProducto } from "./selector";

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
  const [abierto, setAbierto] = React.useState(false);

  return (
    <DialogoDeclarar
      abierto={abierto}
      setAbierto={setAbierto}
      productoId={productoId}
      equivalenteId={equivalenteId}
      codigoEquivalente={codigoEquivalente}
      claseSugerida={claseSugerida}
      disparador={
        // «Marcar como equivalente» y no «Declarar», que es palabra nuestra
        // (revisión por módulos del 02/10).
        <Button variant="outline" size="sm">
          <Link2 />
          Marcar como equivalente
        </Button>
      }
    />
  );
}

/**
 * Marcar como equivalente un producto CUALQUIERA del catálogo.
 *
 * Revisión por módulos del 02/10: la pantalla decía «se puede declarar una
 * equivalencia a mano» cuando no salía ningún equivalente… y no había por
 * dónde. Solo se podía marcar uno de los que la base ya proponía por la
 * medida, que es justo el caso en que menos falta hace. `SelectorProducto`
 * tenía su `onElegir` desde el principio y nadie se lo pasaba.
 *
 * Se busca el otro producto, y al elegirlo se abre el mismo diálogo de la
 * fila.
 */
export function DeclararOtro({ productoId }: { productoId: string }) {
  const [elegido, setElegido] = React.useState<{ id: string; codigo: string } | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        ¿Conoces uno que no sale aquí? Búscalo y márcalo como equivalente
      </span>
      <div className="max-w-xl">
        <SelectorProducto
          id="buscador-equivalente-otro"
          excluir={productoId}
          placeholder="Buscar el otro producto…"
          onElegir={(p) => setElegido({ id: p.id, codigo: p.sku })}
        />
      </div>
      {elegido ? (
        <DialogoDeclarar
          // Uno nuevo por producto elegido: la clase y la nota no se arrastran
          // de un intento al siguiente.
          key={elegido.id}
          abierto
          setAbierto={(v) => {
            if (!v) setElegido(null);
          }}
          productoId={productoId}
          equivalenteId={elegido.id}
          codigoEquivalente={elegido.codigo}
          claseSugerida="sustituto"
        />
      ) : null}
    </div>
  );
}

function DialogoDeclarar({
  abierto,
  setAbierto,
  productoId,
  equivalenteId,
  codigoEquivalente,
  claseSugerida,
  disparador,
}: {
  abierto: boolean;
  setAbierto: (v: boolean) => void;
  productoId: string;
  equivalenteId: string;
  codigoEquivalente: string;
  claseSugerida: ClaseEquivalencia;
  disparador?: React.ReactNode;
}) {
  const { ocupado, correr } = useAccion();
  const [clase, setClase] = React.useState<ClaseEquivalencia>(claseSugerida);
  const [nota, setNota] = React.useState("");

  // Hay un botón por fila, así que un id fijo se repetiría en la página y el
  // `htmlFor` de la etiqueta apuntaría al radio de otra fila.
  const idBase = React.useId();

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      {disparador ? <DialogTrigger asChild>{disparador}</DialogTrigger> : null}

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como equivalente</DialogTitle>
          {/* Sin «peldaño» ni «cascada», que eran palabras del código. */}
          <DialogDescription>
            Con <span className="font-mono">{codigoEquivalente}</span>. Vale en
            los dos sentidos, y desde ahora sale el primero cuando se busquen
            equivalentes de cualquiera de los dos.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
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
              <span className="text-sm font-medium text-[var(--fg-muted)]">
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
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={ocupado}
            onClick={async () => {
              const bien = await correr(() =>
                declararEquivalencia(
                  productoId,
                  equivalenteId,
                  clase,
                  nota || null,
                ),
              );
              if (bien) {
                setAbierto(false);
                setNota("");
              }
            }}
          >
            {ocupado ? "Guardando…" : "Guardar"}
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
    // Con borde: en «ghost» era un texto suelto junto a la fecha (02/10).
    <Button
      variant="outline"
      size="sm"
      disabled={ocupado}
      title="Quitar la equivalencia"
      onClick={() =>
        correr(() => quitarEquivalencia(productoId, equivalenteId))
      }
    >
      <Link2Off />
      Quitar
    </Button>
  );
}
