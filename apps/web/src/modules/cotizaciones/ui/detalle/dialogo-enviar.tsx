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
  DialogHeader,
  DialogTitle,
  Input,
} from "@rodatech/ui";

import { ponerContactoCliente } from "@/modules/clientes/acciones/contacto-directo";

import {
  enlaceCorreoCotizacion,
  enlaceWhatsapp,
  type DatosMensaje,
} from "../../dominio/whatsapp";

/**
 * Mandar la cotización, todo en un sitio.
 *
 * ---------------------------------------------------------------------------
 * Lo que había, y por qué no servía
 * ---------------------------------------------------------------------------
 * Tres botones sueltos en la fila de acciones —«WhatsApp», «Correo» y «¿A
 * dónde se la mando?»— y ninguno visible a la vez que los otros: los dos
 * primeros solo salían si el cliente tenía el dato, y el tercero solo si no
 * tenía ninguno. Así que mandar una cotización se veía distinto según el
 * cliente, y el diálogo que había era de APUNTAR UN TELÉFONO, no de enviar:
 * se rellenaba, se guardaba, se cerraba… y había que buscar el botón de
 * mandar.
 *
 * Luis, 08/09: *«ese modal nada que ver, sería un modal de enviar, donde me
 * traiga el número del contacto para enviar, con PDF o al correo, también con
 * enviar o digitar si trae»*.
 *
 * Ahora hay un botón, **Enviar**, y este diálogo hace las tres cosas: trae lo
 * que el cliente ya tiene, deja escribirlo si falta —y lo guarda en su ficha—
 * y manda por el canal que se elija.
 *
 * ---------------------------------------------------------------------------
 * El PDF no viaja, y eso hay que decirlo aquí
 * ---------------------------------------------------------------------------
 * Ni `wa.me` ni `mailto:` pueden adjuntar un archivo: no es una limitación de
 * este ERP, es que ningún navegador lo permite. Fingir lo contrario sería peor
 * que decirlo.
 *
 * Así que el PDF se descarga aquí mismo y se arrastra al chat o al correo. Lo
 * que esto ahorra es escribir el mensaje, que es lo que de verdad cuesta.
 *
 * Queda pendiente lo que propuso Luis y es la solución de verdad: una página
 * pública de la cotización, con token largo en la URL y su propio botón de
 * descargar, para poder mandar un enlace en vez del archivo. Necesita que el
 * ERP esté desplegado —un enlace a `localhost` no le sirve a nadie— así que va
 * con el despliegue.
 */
export function DialogoEnviar({
  abierto,
  onCerrar,
  clienteId,
  cliente,
  telefono = "",
  whatsapp = "",
  email = "",
  datos,
  onImprimir,
}: {
  abierto: boolean;
  onCerrar: () => void;
  clienteId: string;
  cliente: string;
  telefono?: string;
  whatsapp?: string;
  email?: string;
  /** Con qué se arma el texto del mensaje. Lo mismo para los dos canales. */
  datos: DatosMensaje;
  onImprimir: () => void;
}) {
  const router = useRouter();

  const [wsp, setWsp] = React.useState(whatsapp || telefono);
  const [correo, setCorreo] = React.useState(email);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  React.useEffect(() => {
    if (!abierto) return;
    // El WhatsApp cae al fijo si no hay móvil apuntado: es lo que suele pasar
    // en estas fichas, y `normalizarTelefono` ya decide si sirve.
    setWsp(whatsapp || telefono);
    setCorreo(email);
    setError(null);
  }, [abierto, whatsapp, telefono, email]);

  /*
    Los enlaces se arman AQUÍ y no en el servidor.

    Antes venían montados desde la página, con el número que estuviera
    guardado. Eso obliga a guardar y recargar para poder mandar a un número
    que se acaba de escribir — y el caso más normal hoy es justamente ese: de
    los 97 clientes activos, ninguno tiene teléfono y solo uno tiene correo.

    Las dos funciones son del dominio y no tocan ni red ni reloj, así que dan
    lo mismo en el servidor que en el navegador.
  */
  const aWhatsapp = enlaceWhatsapp(wsp, datos);
  const aCorreo = enlaceCorreoCotizacion(correo, datos);

  /** Guarda en la ficha lo que se haya escrito, y luego abre el canal. */
  const mandar = (destino: string) => {
    const cambio =
      wsp.trim() !== (whatsapp || telefono).trim() || correo.trim() !== email.trim();

    // Se abre SIEMPRE, haya guardado o no. Que el teléfono no se pudiera
    // apuntar en la ficha no es motivo para no mandar la cotización: son dos
    // cosas distintas y solo una la está esperando el cliente.
    window.open(destino, "_blank", "noopener,noreferrer");

    if (!cambio) return onCerrar();

    empezar(async () => {
      const r = await ponerContactoCliente({
        id: clienteId,
        whatsapp: wsp.trim(),
        telefono: telefono.trim(),
        email: correo.trim(),
      });
      if (!r.ok) {
        setError(`Se mandó, pero no se pudo guardar el contacto: ${r.error}`);
        return;
      }
      onCerrar();
      router.refresh();
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar {datos.numero}</DialogTitle>
          <DialogDescription>
            A {cliente}. Lo que escribas se guarda en su ficha, así que la
            próxima vez ya sale puesto.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {/* -------------------------------------------------- WhatsApp */}
          <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-3">
            <Campo
              id="env-wsp"
              label="WhatsApp"
              ayuda="Con el código de país o sin él, da igual."
            >
              <Input
                id="env-wsp"
                value={wsp}
                onChange={(e) => setWsp(e.target.value)}
                placeholder="9XX XXX XXX"
                inputMode="tel"
                autoFocus
              />
            </Campo>
            <Button
              type="button"
              disabled={!aWhatsapp || guardando}
              onClick={() => aWhatsapp && mandar(aWhatsapp)}
              className="w-full"
            >
              <IconoWhatsapp />
              {aWhatsapp ? "Enviar por WhatsApp" : "Escribe un número"}
            </Button>
          </div>

          {/* ---------------------------------------------------- Correo */}
          <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-3">
            <Campo id="env-mail" label="Correo">
              <Input
                id="env-mail"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="compras@cliente.com"
                inputMode="email"
              />
            </Campo>
            <Button
              type="button"
              variant="outline"
              disabled={!aCorreo || guardando}
              onClick={() => aCorreo && mandar(aCorreo)}
              className="w-full"
            >
              <IconoSobre />
              {aCorreo ? "Enviar por correo" : "Escribe un correo"}
            </Button>
          </div>

          {/* ------------------------------------------------------- PDF */}
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <p className="text-sm font-medium">El PDF va aparte</p>
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
              Ni WhatsApp ni el correo dejan adjuntar un archivo desde el
              navegador. Descárgalo y arrástralo al chat: el mensaje ya va
              escrito.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onImprimir}
              className="mt-2 w-full"
            >
              <IconoDescargar />
              Descargar la cotización
            </Button>
            <p className="mt-1.5 text-xs text-[var(--fg-subtle)]">
              Se abre la ventana de imprimir: elige «Guardar como PDF».
            </p>
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
      </DialogContent>
    </Dialog>
  );
}

function IconoWhatsapp() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.2-5.6A8.4 8.4 0 1 1 21 11.5Z" />
    </svg>
  );
}

function IconoSobre() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function IconoDescargar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M4 19h16" />
    </svg>
  );
}
