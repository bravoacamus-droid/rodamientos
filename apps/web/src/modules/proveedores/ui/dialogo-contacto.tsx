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

import { ponerContactoProveedor } from "../acciones/contacto";

/**
 * Apuntarle el número al proveedor sin salir de la pantalla.
 *
 * En «Pedir precio», el proveedor sin WhatsApp ni correo traía un enlace a su
 * ficha. Pulsarlo **te sacaba y al volver habías perdido todo** el trabajo de
 * esa pantalla: los proveedores marcados, las cantidades, el reparto. Y es el
 * caso normal, no una rareza: los 97 proveedores entraron del Excel sin un
 * solo teléfono, así que ese enlace aparece SIEMPRE.
 *
 * Sale con el foco en WhatsApp a propósito: es el que decide si el botón de
 * mandar existe, y es el que Willy va a tener a mano cuando cuelgue.
 */
export function DialogoContactoProveedor({
  abierto,
  proveedorId,
  proveedor,
  telefono = "",
  whatsapp = "",
  email = "",
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  proveedorId: string;
  proveedor: string;
  telefono?: string;
  whatsapp?: string;
  email?: string;
  onCerrar: () => void;
  /** Los tres valores ya limpios, para que quien llama repinte sin recargar. */
  onGuardado: (v: { telefono: string; whatsapp: string; email: string }) => void;
}) {
  const [tel, setTel] = React.useState(telefono);
  const [wsp, setWsp] = React.useState(whatsapp);
  const [correo, setCorreo] = React.useState(email);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  React.useEffect(() => {
    if (!abierto) return;
    setTel(telefono);
    setWsp(whatsapp);
    setCorreo(email);
    setError(null);
  }, [abierto, telefono, whatsapp, email]);

  function guardar() {
    setError(null);

    if (tel.trim() === "" && wsp.trim() === "" && correo.trim() === "") {
      setError("Pon al menos una forma de contactarle.");
      return;
    }

    empezar(async () => {
      const r = await ponerContactoProveedor({
        id: proveedorId,
        telefono: tel.trim(),
        whatsapp: wsp.trim(),
        email: correo.trim(),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onGuardado({ telefono: tel.trim(), whatsapp: wsp.trim(), email: correo.trim() });
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ponerle el número</DialogTitle>
          <DialogDescription>
            Se guarda en la ficha de {proveedor} y queda para siempre. No se
            pierde nada de lo que llevas en esta pantalla.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          <Campo
            id="prov-wsp"
            label="WhatsApp"
            ayuda="Es el que hace que aparezca el botón de mandar."
          >
            <Input
              id="prov-wsp"
              value={wsp}
              onChange={(e) => setWsp(e.target.value)}
              placeholder="9XX XXX XXX"
              inputMode="tel"
              autoFocus
            />
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="prov-tel" label="Teléfono">
              <Input
                id="prov-tel"
                value={tel}
                onChange={(e) => setTel(e.target.value)}
                placeholder="01 XXX XXXX"
                inputMode="tel"
              />
            </Campo>
            <Campo id="prov-mail" label="Correo">
              <Input
                id="prov-mail"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="ventas@proveedor.com"
                inputMode="email"
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
          {/* `type="button"` en los dos: esto puede vivir dentro de un
              formulario y sin eso lo enviarían a medias. */}
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
