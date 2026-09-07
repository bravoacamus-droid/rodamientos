"use client";

import * as React from "react";
import {
  Button,
  Campo,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@rodatech/ui";

import { registrarAgencia, type AgenciaCreada } from "../acciones/agencia";

/**
 * Dar de alta una agencia sin salir de la guía.
 *
 * Luis: *«en guía falta poner en agencia un botón que abra un modal para
 * registrar una nueva agencia»*.
 *
 * El desplegable solo sabía ofrecer las tres que trajo la 029. Para una
 * cuarta —el cliente de Huancayo que manda por la suya— había que teclear el
 * RUC y la razón social a mano en cada envío, sin que quedara apuntada. Y
 * salir a otra pantalla a darla de alta pierde la guía a medio preparar, que
 * es lo mismo que pasaba con el teléfono del proveedor en «Pedir precio».
 *
 * El foco entra en el nombre corto y no en la razón social: «Shalom» es lo
 * que se sabe de memoria, la razón social se copia del papel.
 */
export function DialogoAgencia({
  abierto,
  onCerrar,
  onGuardada,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** La agencia ya guardada, para que quien llama la meta en su lista y la elija. */
  onGuardada: (agencia: AgenciaCreada, yaExistia: boolean) => void;
}) {
  const [nombre, setNombre] = React.useState("");
  const [razon, setRazon] = React.useState("");
  const [ruc, setRuc] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  React.useEffect(() => {
    if (!abierto) return;
    setNombre("");
    setRazon("");
    setRuc("");
    setTelefono("");
    setError(null);
  }, [abierto]);

  function guardar() {
    setError(null);

    if (razon.trim() === "") {
      setError("Falta la razón social: es la que sale impresa en la guía.");
      return;
    }
    if (ruc.trim() !== "" && !/^[0-9]{11}$/.test(ruc.trim())) {
      setError("El RUC son once dígitos, o déjalo vacío.");
      return;
    }

    empezar(async () => {
      const r = await registrarAgencia({
        razon_social: razon.trim(),
        nombre_corto: nombre.trim(),
        numero_documento: ruc.trim(),
        telefono: telefono.trim(),
        direccion: null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onGuardada(r.agencia, r.yaExistia);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva agencia</DialogTitle>
          <DialogDescription>
            Queda en la lista para las próximas guías. No se pierde nada de lo
            que llevas escrito aquí.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          <Campo
            id="ag-nombre"
            label="Nombre corto"
            ayuda="Como la llamas: «Shalom», «Olva». Es lo que verás en la lista."
          >
            <Input
              id="ag-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Shalom"
              autoFocus
            />
          </Campo>

          <Campo
            id="ag-razon"
            label="Razón social"
            requerido
            ayuda="La que sale impresa en la guía. Cópiala tal cual del papel."
          >
            <Input
              id="ag-razon"
              value={razon}
              onChange={(e) => setRazon(e.target.value)}
              placeholder="SHALOM EMPRESARIAL S.A.C."
            />
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              id="ag-ruc"
              label="RUC"
              /*
                Sin RUC la guía se prepara, pero no se emite: SUNAT lo exige
                para el transportista público. Decirlo aquí evita descubrirlo
                al final, con el camión esperando.
              */
              ayuda="Sin él la guía se guarda, pero no se puede emitir."
            >
              <Input
                id="ag-ruc"
                value={ruc}
                onChange={(e) => setRuc(e.target.value.replace(/\D/g, "").slice(0, 11))}
                className="tabular"
                inputMode="numeric"
                placeholder="20601226310"
              />
            </Campo>
            <Campo id="ag-tel" label="Teléfono">
              <Input
                id="ag-tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                inputMode="tel"
                placeholder="01 XXX XXXX"
              />
            </Campo>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm"
            >
              {error}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          {/* `type="button"` en los dos: esto vive dentro del formulario de la
              guía y sin eso lo enviarían a medias. */}
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar agencia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
