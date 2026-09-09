"use client";

// Cliente por tres motivos concretos: `window.print()`, el estado de "en curso"
// mientras la acción va y viene, y la confirmación antes de anular. Nada más
// de esta pantalla necesita JavaScript.

import type * as React from "react";
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
import type { DatosMensaje } from "../../dominio/whatsapp";
import { DialogoEnviar } from "./dialogo-enviar";
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
  datosMensaje,
  cliente,
  lineas,
  facturable,
  editable,
  vistaPrevia,
}: {
  id: string;
  estado: EstadoCotizacion;
  /**
   * Con qué se arma el mensaje que se manda.
   *
   * Antes llegaban los DOS ENLACES ya montados desde el servidor, con el
   * número que hubiera guardado. Eso obligaba a guardar el contacto y
   * recargar antes de poder mandar nada — y el caso normal hoy es un cliente
   * sin teléfono. Con los datos crudos, el diálogo arma el enlace con lo que
   * se acaba de teclear.
   */
  datosMensaje: DatosMensaje;
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
  /**
   * El documento todavía no compromete a nadie: ni guía emitida ni nada
   * facturado, así que se puede reescribir entero (070).
   *
   * Va como dato y no se deduce del estado a propósito. Desde la 070 el
   * estado ya no dice si se puede editar —una `aprobada` se edita, y deja de
   * poder editarse en cuanto sale la mercadería—, y esos dos hechos solo los
   * sabe el servidor.
   */
  editable: boolean;
  /**
   * El botón de vista previa, ya montado.
   *
   * Llega hecho desde el servidor y no se construye aquí porque lleva dentro
   * el `<Documento>`, que se pinta en el servidor con todos sus datos. Pasarlo
   * como elemento evita traerse esa maquetación al bundle del cliente.
   */
  vistaPrevia?: React.ReactNode;
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
      <DialogoEnviar
        abierto={pidiendoContacto}
        clienteId={cliente.id}
        cliente={cliente.nombre}
        telefono={cliente.telefono}
        whatsapp={cliente.whatsapp}
        email={cliente.email}
        datos={datosMensaje}
        // Imprimir vive aquí y no dentro del diálogo: `window.print()` saca
        // por la impresora LA PÁGINA, y la página es la ficha con el
        // documento dentro. Llamarlo desde el diálogo abierto imprimiría el
        // diálogo encima. Se cierra primero y luego se imprime.
        onImprimir={() => {
          setPidiendoContacto(false);
          // Un latido para que el diálogo termine de desmontarse: sin esto,
          // el navegador captura la página con el velo gris por encima.
          setTimeout(() => window.print(), 150);
        }}
        onCerrar={() => setPidiendoContacto(false)}
      />

      <DialogoConfirmar
        cotizacionId={id}
        lineas={lineas}
        abierto={confirmando}
        onCerrar={() => setConfirmando(false)}
        corrigiendo={estado === "aprobada"}
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {/*
          Editar, mientras el cliente no la haya aceptado.

          Willy, 15:49: *«ya sería editar la cotización, esa es otra opción»*.
          Hasta hoy solo se podía CLONAR, que deja la vieja viva y le da un
          número nuevo al cliente por corregir una coma.

          Va DELANTE de aprobar, y ese orden es el arreglo del 08/09: estaba el
          séptimo de la fila, en gris, detrás de WhatsApp y de Correo, y Luis
          lo dio por inexistente —*«falta ahí editar cotización»*—. Entre siete
          botones iguales no destaca ninguno; el orden es el que dice cuál es
          el importante.

          Sale también en las APROBADAS desde la 070, y ese fue el arreglo del
          08/09. Antes desaparecía al aprobar —«una aprobada es lo que el
          cliente aceptó»—, y eso dejaba fuera el caso normal: entre el sí del
          cliente y la salida de la mercadería pueden pasar semanas, y en ese
          hueco llama para añadir dos rodamientos. La única salida era clonar,
          o sea darle un número nuevo por añadir una línea.

          Luis, 08/09: *«si la cotización fue aprobada puede seguir editando
          siempre y cuando todavía no se haga las compras o se hizo la guía»*.

          Desaparece cuando el documento ya compromete a alguien: con guía
          emitida o con algo facturado. Eso lo decide la función en la base
          —`actualizar_cotizacion`, que vuelve a comprobarlo— y no este botón.
        */}
        {viva && editable ? (
          <Button
            variant="outline"
            onClick={() => router.push(`/cotizaciones/${id}/editar`)}
          >
            <IconoEditar />
            Editar cotización
          </Button>
        ) : null}

        {/* El siguiente paso, según dónde esté el documento. */}
        {enCurso ? (
          // Ya no aprueba directo: pregunta QUÉ confirmó el cliente.
          // Aprobar la cotización entera daba por vendidas las seis líneas
          // siempre, y de esa cuenta sale después lo que hay que comprar.
          //
          // Dice «Aprobar», no «Confirmar pedido», desde el 08/09: el estado
          // al que lleva se llama `aprobada`, la pastilla de la lista dice
          // «Aprobada» y Luis la pide por ese nombre. Tres palabras para una
          // sola cosa hacían que el botón que sí existe no se encontrara.
          <Button disabled={pendiente} onClick={() => setConfirmando(true)}>
            <IconoAprobar />
            Aprobar cotización
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
        {/*
          Un botón, y siempre el mismo.

          Eran tres —«WhatsApp», «Correo» y «¿A dónde se la mando?»— y nunca
          se veían juntos: los dos primeros salían solo si el cliente tenía el
          dato y el tercero solo si no tenía ninguno. Mandar una cotización se
          veía distinto según a quién, que es lo peor que le puedes hacer a
          una acción que se repite todos los días.

          Con los datos de hoy el caso NORMAL era el tercero: de los 97
          clientes activos, ninguno tiene teléfono y solo uno tiene correo.
          Entraron del Excel sin esa columna.
        */}
        <Button variant="outline" onClick={() => setPidiendoContacto(true)}>
          <IconoEnviar />
          Enviar
        </Button>

        {/*
          «Vista previa» en lugar de «Imprimir» a secas.

          Imprimir sin mirar era barato cuando la ficha ERA el papel: se veía
          antes de pulsar. Ahora la ficha son tarjetas y tabla, así que el
          documento hay que abrirlo — y dentro de la previa está el botón de
          imprimir, que es el orden natural: primero se comprueba y luego sale.
        */}
        {vistaPrevia}

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

/*
  Los iconos de las dos acciones que deciden el documento.

  Solo esas dos. Ponerle un dibujo a los ocho botones los volvería a igualar,
  que es exactamente el problema que este cambio viene a arreglar.
*/

function IconoEditar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconoEnviar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />
    </svg>
  );
}

function IconoAprobar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}
