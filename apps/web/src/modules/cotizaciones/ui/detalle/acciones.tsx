"use client";

// Cliente por tres motivos concretos: `window.print()`, el estado de "en curso"
// mientras la acción va y viene, y la confirmación antes de anular. Nada más
// de esta pantalla necesita JavaScript.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rodatech/ui";

import { cambiarEstado, clonar } from "../../acciones/gestionar";
import type { EstadoCotizacion } from "../../dominio/tipos";
import { DialogoComoMandarla } from "./dialogo-como-mandarla";
import { DialogoConfirmar, type LineaParaConfirmar } from "./confirmar";

/**
 * Acciones de una cotización.
 *
 * Antes eran hasta ocho botones en fila: en un teléfono se desbordaban y en
 * escritorio no se distinguía cuál era EL siguiente paso.
 *
 * Ahora hay una sola acción principal —la que corresponde al estado— y el
 * resto vive en el menú de tres puntos, igual que en el catálogo. Que el botón
 * destacado cambie con el estado es la mitad del valor: en un borrador dice
 * «Aprobar», en una aprobada dice «Generar guía», y no hay que pensar.
 */
export function AccionesCotizacion({
  id,
  estado,
  enlaceWhatsapp,
  enlaceCorreo,
  cliente,
  lineas,
  facturable,
}: {
  id: string;
  estado: EstadoCotizacion;
  enlaceWhatsapp: string | null;
  /** `mailto:` con el mismo texto. `null` si el cliente no tiene correo. */
  enlaceCorreo: string | null;
  /** Para poder apuntarle el número si no lo tiene, sin salir de aquí. */
  cliente: { id: string; nombre: string; telefono: string; whatsapp: string; email: string };
  /** Para poder preguntar qué confirmó el cliente antes de aprobar. */
  lineas: LineaParaConfirmar[];
  /**
   * Queda algo confirmado y sin facturar.
   *
   * Hasta hoy no había forma de facturar un pedido desde el pedido: había que
   * ir a Facturación y buscarlo entre los de todos los clientes. La pantalla
   * de destino ya aceptaba `?cotizacion=`, o sea que la pieza estaba y lo que
   * faltaba era el camino.
   */
  facturable: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pidiendoContacto, setPidiendoContacto] = useState(false);

  const correr = (f: () => Promise<{ ok: boolean; error?: string; id?: string }>) => {
    setError(null);
    iniciar(async () => {
      const r = await f();
      if (!r.ok) setError(r.error ?? "No se pudo completar la acción.");
      else if (r.id) router.push(`/cotizaciones/${r.id}`);
      else router.refresh();
    });
  };

  const enCurso = estado === "borrador" || estado === "enviada";
  const viva = enCurso || estado === "aprobada";

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end print:hidden">
      <DialogoComoMandarla
        abierto={pidiendoContacto}
        clienteId={cliente.id}
        cliente={cliente.nombre}
        telefono={cliente.telefono}
        whatsapp={cliente.whatsapp}
        email={cliente.email}
        onCerrar={() => setPidiendoContacto(false)}
      />

      <DialogoConfirmar
        cotizacionId={id}
        lineas={lineas}
        abierto={confirmando}
        onCerrar={() => setConfirmando(false)}
        corrigiendo={estado === "aprobada"}
      />

      <div className="flex items-center justify-end gap-2">
        {/* El siguiente paso, según dónde esté el documento. */}
        {enCurso ? (
          // Ya no aprueba directo: pregunta QUÉ confirmó el cliente.
          // Aprobar la cotización entera daba por vendidas las seis líneas
          // siempre, y de esa cuenta sale después lo que hay que comprar.
          <Button disabled={pendiente} onClick={() => setConfirmando(true)}>
            Confirmar pedido
          </Button>
        ) : estado === "aprobada" ? (
          <>
            {/*
              Corregir lo confirmado, mientras no se facture.

              Willy, 15:58: *«una vez que ya fue aceptada la cotización, ¿ya no
              se puede modificar?»* — *«mientras que no se facture se puede
              manejar»*. Y por qué le importa: *«en sí la mayoría que va a
              cambiar es la cantidad»*.

              Desaparece en cuanto se factura algo: a partir de ahí el pedido
              ya no se corrige bajando cantidades, se arregla con una nota de
              crédito.
            */}
            <Button variant="outline" onClick={() => setConfirmando(true)}>
              Corregir cantidades
            </Button>
            {/* Facturar delante de la guía, y no al revés.

                La guía es el traslado; la factura es la que cobra y la que
                cierra el pedido —`cantidad_atendida` sale de ahí—. Un pedido
                que se despacha sin facturar deja al cliente servido y la
                cobranza sin empezar. */}
            {facturable ? (
              <Button onClick={() => router.push(`/facturacion/nueva?cotizacion=${id}`)}>
                Facturar
              </Button>
            ) : null}
            <Button
              variant={facturable ? "outline" : "primary"}
              onClick={() => router.push(`/guias/nueva?cotizacion=${id}`)}
            >
              Generar guía
            </Button>
          </>
        ) : null}

        {/*
          Mandarla, como BOTÓN y no escondido en los tres puntos.

          Willy, 13:00: *«le doy acá un botón que dice enviar a WhatsApp»*. Y
          el 07/09 (13:21) añadió el correo: *«correo y WhatsApp»*. Estaba lo
          de WhatsApp, dentro del menú, donde no lo iba a encontrar: mandar la
          cotización es lo que se hace justo después de guardarla, no una
          rareza que se busca en un desplegable.

          El PDF se arrastra al chat a mano. Ni `wa.me` ni `mailto:` pueden
          adjuntar un archivo -ningún navegador lo permite- y fingir que sí
          sería peor: lo que esto ahorra es escribir el mensaje, que es lo que
          de verdad cuesta.
        */}
        {enlaceWhatsapp ? (
          <Button asChild variant="outline">
            <a href={enlaceWhatsapp} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          </Button>
        ) : null}
        {enlaceCorreo ? (
          <Button asChild variant="outline">
            <a href={enlaceCorreo}>Correo</a>
          </Button>
        ) : null}

        {/*
          Sin WhatsApp ni correo no se puede mandar, y con los datos de hoy es
          el caso NORMAL: de los 97 clientes activos, ninguno tiene teléfono y
          solo uno tiene correo. Entraron del Excel sin esa columna.

          Un botón deshabilitado diría «no puedes» sin decir qué hacer. Este
          lo arregla en el sitio, y al cerrarlo ya están los de mandar.
        */}
        {!enlaceWhatsapp && !enlaceCorreo ? (
          <Button variant="outline" onClick={() => setPidiendoContacto(true)}>
            ¿A dónde se la mando?
          </Button>
        ) : null}

        <Button variant="outline" onClick={() => window.print()}>
          Imprimir
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Más acciones"
            className="flex size-11 items-center justify-center rounded-md border border-[var(--border)] text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] md:size-9"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
              <circle cx="12" cy="5" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="19" r="1.8" fill="currentColor" />
            </svg>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              disabled={pendiente}
              onSelect={() => correr(() => clonar(id))}
            >
              Clonar
              <span className="ml-auto text-xs text-[var(--fg-subtle)]">
                precios de hoy
              </span>
            </DropdownMenuItem>

            {estado === "borrador" ? (
              <DropdownMenuItem
                disabled={pendiente}
                onSelect={() => correr(() => cambiarEstado(id, "enviada"))}
              >
                Marcar como enviada
              </DropdownMenuItem>
            ) : null}

            {enCurso ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={pendiente}
                  onSelect={() => correr(() => cambiarEstado(id, "rechazada"))}
                >
                  El cliente la rechazó
                </DropdownMenuItem>
              </>
            ) : null}

            {viva ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={pendiente}
                  className="text-[var(--danger)]"
                  onSelect={() => {
                    // Anular no se deshace: si no se pregunta, se anula por error.
                    if (window.confirm("¿Anular esta cotización? No se puede deshacer.")) {
                      correr(() => cambiarEstado(id, "anulada"));
                    }
                  }}
                >
                  Anular
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {pendiente ? (
        <span className="text-right text-sm text-[var(--fg-muted)]">Procesando…</span>
      ) : null}
      {error ? (
        <span className="text-right text-sm text-[var(--danger)]">{error}</span>
      ) : null}
    </div>
  );
}
