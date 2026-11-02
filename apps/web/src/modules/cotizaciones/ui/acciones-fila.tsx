"use client";

// Cliente: el menú se abre y navega con el router.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ClipboardList,
  EllipsisVertical,
  Eye,
  Lock,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "@rodatech/ui";

import type { CotizacionLista } from "../dominio/tipos";
import { DialogoEliminarCotizacion } from "./dialogo-eliminar";
import { OpcionMenu } from "@/componentes/opcion-menu";

/**
 * Las acciones de una cotización en la lista: TODO dentro de un solo menú.
 *
 * Luis, 15/10, al ver «Ver» y «Aprobar» fuera y los tres puntos al lado:
 * *«la idea es que esté adentro todo»*. Y dentro, solo lo que es de la
 * cotización y de sus pedidos: *«duplicar, facturar no sería ahí, porque eso
 * está en pedido»*. La guía, la factura, las compras y repetir el pedido se
 * hacen en la ficha del pedido.
 *
 * El botón lleva su palabra, «Acciones», con borde: tres puntos sueltos no
 * dicen que ahí hay algo que pulsar (revisión por módulos del 02/10).
 */
export function AccionesFilaCotizacion({
  c,
  ancho = false,
  eliminar = { puede: false, aviso: "" },
}: {
  c: CotizacionLista;
  ancho?: boolean;
  /** «Eliminar» en Cotizaciones (164): sin él, la opción sale con candado y dice por qué. */
  eliminar?: { puede: boolean; aviso: string };
}) {
  const router = useRouter();
  const [eliminando, setEliminando] = React.useState(false);
  const viva = c.estado === "borrador" || c.estado === "enviada";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          aria-label={`Acciones de ${c.numero}`}
          className={`inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${ancho ? "w-full" : "ml-auto"}`}
        >
          <EllipsisVertical className="size-4" aria-hidden="true" />
          Acciones
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72 p-1.5">
          {/* Aprobar, PRIMERO y en verde (Luis, 15/10): es lo que se viene a
            hacer aquí. Aprobar es pasar a pedidos: abre la ficha con «¿Qué te
            confirmó el cliente?» y, al aprobar, lleva al pedido. Las opciones
            con su pastilla de color, como en pedidos (02/11). */}
          {viva ? (
            <OpcionMenu
              icono={Check}
              tono="verde"
              titulo="Aprobar cotización"
              destacada
              onSelect={() => router.push(`/cotizaciones/${c.id}?aprobar=1`)}
            />
          ) : null}
          <OpcionMenu icono={Eye} tono="marca" titulo="Ver cotización" onSelect={() => router.push(`/cotizaciones/${c.id}`)} />
          {viva ? (
            <OpcionMenu
              icono={Pencil}
              tono="azul"
              titulo="Editar cotización"
              onSelect={() => router.push(`/cotizaciones/${c.id}/editar`)}
            />
          ) : null}

          {/* Un pedido: directo a él. Varios: una sola opción que abre Pedidos
            filtrado por ESTA cotización, no una lista dentro del menú (Luis,
            15/10: «no va a ser un select de varios… solo quiero filtrar los
            pedidos de esa cotización»). */}
          {c.pedidos.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <OpcionMenu
                icono={ClipboardList}
                tono="violeta"
                titulo={c.pedidos.length === 1 ? `Ver pedido ${c.pedidos[0]!.numero}` : `Ver sus ${c.pedidos.length} pedidos`}
                onSelect={() =>
                  router.push(
                    c.pedidos.length === 1 ? `/pedidos/${c.pedidos[0]!.id}` : `/pedidos?cotizacion=${c.id}`,
                  )
                }
              />
            </>
          ) : null}

          {/* Eliminar (164), al final y en rojo, como en la ficha. Si no se
            puede —tiene pedido, guía o compras—, se ve apagado y dice por qué. */}
          <DropdownMenuSeparator />
          {eliminar.puede ? (
            <OpcionMenu icono={Trash2} tono="rojo" titulo="Eliminar cotización" peligro onSelect={() => setEliminando(true)} />
          ) : (
            <OpcionMenu
              icono={Lock}
              tono="gris"
              titulo="Eliminar cotización"
              detalle="No se puede: pulsa para ver por qué"
              apagada
              onSelect={() => toast.info(eliminar.aviso, { duration: 8000 })}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {eliminando ? (
        <DialogoEliminarCotizacion
          id={c.id}
          numero={c.numero}
          onCerrar={() => setEliminando(false)}
        />
      ) : null}
    </>
  );
}
