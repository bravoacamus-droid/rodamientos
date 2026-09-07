"use client";

import * as React from "react";
import {
  Button,
  CheckboxCampo,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@rodatech/ui";

import { guardarContacto } from "../acciones/contactos";
import { CamposContacto, CONTACTO_VACIO, type BorradorContacto } from "./contacto-campos";
import type { ContactoCliente } from "../dominio/tipos";

/**
 * Dar de alta un contacto sin salir de donde estás.
 *
 * ---------------------------------------------------------------------------
 * El agujero que tapa
 * ---------------------------------------------------------------------------
 * Cotizando a un cliente sin contactos, el selector deja escribir el nombre a
 * mano y avisa: *«lo que escribas se imprime igual»*. Y así era — se imprimía y
 * **se perdía**. La siguiente cotización a esa misma empresa volvía a pedirlo,
 * y la ficha del cliente seguía sin nadie.
 *
 * Para guardarlo había que abandonar la cotización a medio escribir, ir a la
 * ficha del cliente, añadirlo y volver. Nadie hace eso: se escribe a mano otra
 * vez, y otra.
 *
 * La acción (`guardarContacto`) y los campos (`CamposContacto`) ya existían y
 * se usaban en las otras tres pantallas. Lo único que faltaba era esta puerta.
 *
 * ---------------------------------------------------------------------------
 * Se usa desde el cotizador, así que no puede tragarse el Enter
 * ---------------------------------------------------------------------------
 * Vive DENTRO del formulario de la cotización. Un `<form>` anidado no existe en
 * HTML y un botón sin `type="button"` lo enviaría, así que aquí no hay
 * formulario: el guardado va por un `onClick` y la acción recibe un `FormData`
 * armado a mano. Es el mismo motivo por el que los 13 diálogos del ERP se
 * revisaron el 03/09 (§T).
 */
export function DialogoContacto({
  abierto,
  clienteId,
  cliente,
  nombreInicial = "",
  /** Ya hay otros: entonces «principal» arranca sin marcar. */
  hayOtros,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  clienteId: string;
  /** Para que el título diga a qué empresa se le está añadiendo. */
  cliente?: string | null;
  nombreInicial?: string;
  hayOtros: boolean;
  onCerrar: () => void;
  onGuardado: (contacto: ContactoCliente) => void;
}) {
  const [valor, setValor] = React.useState<BorradorContacto>(CONTACTO_VACIO);
  const [principal, setPrincipal] = React.useState(!hayOtros);
  const [error, setError] = React.useState<string | null>(null);
  const [errorNombre, setErrorNombre] = React.useState<string | undefined>();
  const [guardando, empezar] = React.useTransition();

  // Al abrir se arranca con lo que ya estaba escrito en «A quién va dirigida».
  // Hacerle teclear otra vez el nombre que acaba de escribir sería el tipo de
  // roce que hace que se deje de usar el botón.
  React.useEffect(() => {
    if (!abierto) return;
    setValor({ ...CONTACTO_VACIO, nombre: nombreInicial.trim() });
    setPrincipal(!hayOtros);
    setError(null);
    setErrorNombre(undefined);
  }, [abierto, nombreInicial, hayOtros]);

  function guardar() {
    setError(null);
    setErrorNombre(undefined);

    if (valor.nombre.trim() === "") {
      setErrorNombre("Pon al menos el nombre.");
      return;
    }

    empezar(async () => {
      /*
        Un solo campo con el JSON dentro, que es lo que `guardarContacto`
        espera. Mandar los campos sueltos —lo primero que se intentó— devuelve
        «No llegó el contacto», que suena a fallo de red y es un formato mal
        armado. Es el mismo sobre que usan el alta de cliente y la ficha.
      */
      const fd = new FormData();
      fd.set(
        "contacto",
        JSON.stringify({
          cliente_id: clienteId,
          nombre: valor.nombre.trim(),
          cargo: valor.cargo.trim(),
          area: valor.area.trim(),
          email: valor.email.trim(),
          telefono: valor.telefono.trim(),
          whatsapp: valor.whatsapp.trim(),
          principal,
        }),
      );

      const r = await guardarContacto(fd);
      if (!r.ok) {
        if (r.campo === "nombre") setErrorNombre(r.error);
        else setError(r.error);
        return;
      }

      // Se devuelve armado y no se recarga la lista desde el servidor: quien
      // llama lo necesita YA para dejarlo elegido, y una recarga en vuelo
      // dejaría el desplegable un instante sin él.
      onGuardado({
        id: r.id,
        nombre: valor.nombre.trim(),
        cargo: valor.cargo.trim() || null,
        area: valor.area.trim() || null,
        email: valor.email.trim() || null,
        telefono: valor.telefono.trim() || null,
        whatsapp: valor.whatsapp.trim() || null,
        principal,
      });
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo contacto</DialogTitle>
          <DialogDescription>
            Se guarda en la ficha de {cliente ?? "este cliente"} y queda para las
            próximas cotizaciones.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <CamposContacto
            idPrefijo="dlg-contacto"
            valor={valor}
            onCambio={setValor}
            errorNombre={errorNombre}
            autoFocus
          />

          <CheckboxCampo
            id="dlg-contacto-principal"
            checked={principal}
            onCheckedChange={(v) => setPrincipal(Boolean(v))}
            label="Es el contacto principal"
            ayuda={
              hayOtros
                ? "Pasará a ser el que se proponga por defecto, en lugar del actual."
                : "Es el primero, así que se propondrá por defecto."
            }
          />

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
              cotización y sin eso lo enviarían. */}
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar contacto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
