"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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

import { ponerContactoCliente } from "@/modules/clientes/acciones/contacto-directo";

/**
 * «¿A dónde se la mando?»
 *
 * Willy pidió mandar la cotización por WhatsApp y por correo. Los dos botones
 * existen, y con los datos de hoy no aparecía ninguno: de los 97 clientes
 * activos, **ninguno tiene teléfono y solo uno tiene correo**. Entraron del
 * Excel sin esa columna.
 *
 * Un botón que no se puede pulsar es peor que ninguno, y mandar a la ficha del
 * cliente a apuntar el número pierde la cotización que se está mirando. Así que
 * se apunta aquí, se guarda en la ficha para siempre, y al cerrar ya está el
 * botón de mandar.
 *
 * Es el mismo diálogo que el del proveedor en «Pedir precio», por el mismo
 * motivo y con la misma forma.
 */
export function DialogoComoMandarla({
  abierto,
  clienteId,
  cliente,
  telefono = "",
  whatsapp = "",
  email = "",
  onCerrar,
}: {
  abierto: boolean;
  clienteId: string;
  cliente: string;
  telefono?: string;
  whatsapp?: string;
  email?: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [wsp, setWsp] = React.useState(whatsapp);
  const [tel, setTel] = React.useState(telefono);
  const [correo, setCorreo] = React.useState(email);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  React.useEffect(() => {
    if (!abierto) return;
    setWsp(whatsapp);
    setTel(telefono);
    setCorreo(email);
    setError(null);
  }, [abierto, whatsapp, telefono, email]);

  function guardar() {
    setError(null);
    if (wsp.trim() === "" && tel.trim() === "" && correo.trim() === "") {
      setError("Pon al menos un WhatsApp o un correo, que es por donde se manda.");
      return;
    }
    empezar(async () => {
      const r = await ponerContactoCliente({
        id: clienteId,
        whatsapp: wsp.trim(),
        telefono: tel.trim(),
        email: correo.trim(),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCerrar();
      // Sin esto los botones de mandar no aparecen hasta recargar a mano, y
      // parecería que no se guardó.
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>¿A dónde se la mando?</DialogTitle>
          <DialogDescription>
            Se guarda en la ficha de {cliente} y queda para siempre. No se
            pierde nada de esta pantalla.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          <Campo
            id="cli-wsp"
            label="WhatsApp"
            ayuda="Es el que hace que aparezca el botón de mandar."
          >
            <Input
              id="cli-wsp"
              value={wsp}
              onChange={(e) => setWsp(e.target.value)}
              placeholder="9XX XXX XXX"
              inputMode="tel"
              autoFocus
            />
          </Campo>

          <Campo id="cli-mail" label="Correo">
            <Input
              id="cli-mail"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="compras@cliente.com"
              inputMode="email"
            />
          </Campo>

          <Campo id="cli-tel" label="Teléfono fijo">
            <Input
              id="cli-tel"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              placeholder="01 XXX XXXX"
              inputMode="tel"
            />
          </Campo>

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
