"use client";

// Cliente: el menú, los avisos (toast) y el diálogo de anular.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  ClipboardList,
  EllipsisVertical,
  FileSearch,
  FileText,
  Receipt,
  Repeat,
  Truck,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "@rodatech/ui";

import { OpcionMenu, TONO_OPCION } from "@/componentes/opcion-menu";

import { anularPedido } from "../acciones/gestionar";

/** Lo que el menú necesita saber de un pedido, venga de la lista o de la ficha. */
export interface PedidoParaAcciones {
  id: string;
  numero: string;
  cotizacionId: string;
  cotizacion: string;
  /** El último de su cotización: solo ahí se hace guía, factura u otro pedido. */
  vigente: boolean;
  guia: { id: string; emitida: boolean } | null;
  facturado: boolean;
  /** Órdenes de compra vivas: con alguna, no se elimina. */
  conCompras: boolean;
  /**
   * Con una guía ya emitida, queda algo por despachar: se ofrece otra
   * (revisión del 15/10). Solo lo sabe la ficha; en la lista no se calcula.
   */
  otraGuia?: boolean;
  /** Anulado (188): no tiene acciones. */
  anulado?: boolean;
}

const AVISO = { richColors: true, position: "top-center" as const, duration: 6000 };

/**
 * El menú «Acciones» del pedido (15/10), en la lista y en la ficha.
 *
 * Luis: *«en pedidos también hay que poner un botón de acciones así como en
 * cotización… hacer factura (no debería dejar si no está una guía, o que le
 * aparezca un aviso toast moderno, “primero haz la guía”), hacer guía
 * también, repetir pedido… ver también vista previa… eliminar pedido; todo
 * con colores, emoticones y moderno»*.
 *
 * Lo que todavía no se puede hacer se VE igual —apagado—, y al pulsarlo
 * dice qué falta y ofrece el paso que sí toca. Esconderlo enseñaría que la
 * factura «no existe»; dejarlo pulsar y rebotar en otra pantalla, peor.
 */
export function AccionesPedido({
  p,
  enFicha = false,
  ancho = false,
}: {
  p: PedidoParaAcciones;
  enFicha?: boolean;
  ancho?: boolean;
}) {
  const router = useRouter();
  const [borrando, setBorrando] = React.useState(false);

  // Un pedido anulado ya no se toca (188).
  if (p.anulado) return null;

  const urlGuia =
    p.guia && !p.guia.emitida ? `/guias/${p.guia.id}` : `/guias/nueva?cotizacion=${p.cotizacionId}`;
  const guiaEmitida = Boolean(p.guia?.emitida);
  const noVigente = () =>
    toast.info(`${p.numero} ya no es el pedido en curso`, {
      ...AVISO,
      description: `Lo nuevo de ${p.cotizacion} se hace en su último pedido.`,
    });

  const facturar = () => {
    if (!p.vigente) return noVigente();
    if (!guiaEmitida) {
      return toast.warning("Primero haz la guía", {
        ...AVISO,
        description: "Sin una guía emitida no se factura: la factura se apoya en la guía sellada por el cliente.",
        action: { label: p.guia ? "Seguir con la guía" : "Hacer la guía", onClick: () => router.push(urlGuia) },
      });
    }
    router.push(`/facturacion/nueva?cotizacion=${p.cotizacionId}&guia=${p.guia!.id}`);
  };

  const repetir = () => {
    if (!p.vigente) return noVigente();
    if (!p.facturado) {
      return toast.info("Primero termina este pedido", {
        ...AVISO,
        description: "Cuando esté despachado y facturado, lo repites con las mismas condiciones.",
      });
    }
    router.push(`/pedidos/${p.id}?repetir=1`);
  };

  const eliminar = () => {
    const motivo = !p.vigente
      ? "Solo se anula el último pedido de la cotización."
      : p.facturado
        ? "Ya está facturado: se corrige con una nota de crédito."
        : p.guia
          ? "Tiene guía: anúlala o bórrala antes."
          : p.conCompras
            ? "Tiene órdenes de compra: anúlalas antes."
            : null;
    if (motivo) return toast.error(`No se puede anular ${p.numero}`, { ...AVISO, description: motivo });
    setBorrando(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          aria-label={`Acciones de ${p.numero}`}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${enFicha ? "h-control-md text-base" : "h-9 text-sm"} ${ancho ? "w-full" : ""}`}
        >
          <EllipsisVertical className="size-4" aria-hidden="true" />
          Acciones
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72 p-1.5">
          {enFicha ? null : (
            <OpcionMenu icono={ClipboardList} tono="marca" titulo="Ver pedido" onSelect={() => router.push(`/pedidos/${p.id}`)} />
          )}
          <OpcionMenu
            icono={FileSearch}
            tono="azul"
            titulo="Hoja de pedido"
            onSelect={() => router.push(`/pedidos/${p.id}?hoja=1`)}
          />
          <OpcionMenu
            icono={FileText}
            tono="gris"
            titulo={`Ver cotización ${p.cotizacion}`}
            onSelect={() => router.push(`/cotizaciones/${p.cotizacionId}`)}
          />

          {p.vigente && !p.facturado ? (
            <>
              <DropdownMenuSeparator />
              {guiaEmitida && p.otraGuia ? (
                <OpcionMenu
                  icono={Truck}
                  tono="marca"
                  titulo="Hacer otra guía"
                  detalle="Queda algo por despachar"
                  onSelect={() => router.push(`/guias/nueva?cotizacion=${p.cotizacionId}`)}
                />
              ) : null}
              {guiaEmitida ? null : (
                <OpcionMenu
                  icono={Truck}
                  tono="marca"
                  titulo={p.guia ? "Seguir con la guía" : "Hacer la guía"}
                  detalle={p.guia ? "Está en borrador" : undefined}
                  onSelect={() => router.push(urlGuia)}
                />
              )}
              <OpcionMenu
                icono={Receipt}
                tono={guiaEmitida ? "verde" : "ambar"}
                titulo="Facturar"
                detalle={guiaEmitida ? undefined : "Primero hay que emitir la guía"}
                apagada={!guiaEmitida}
                destacada={guiaEmitida}
                onSelect={facturar}
              />
            </>
          ) : null}

          {p.vigente ? (
            <>
              <DropdownMenuSeparator />
              <OpcionMenu
                icono={Repeat}
                tono="violeta"
                titulo="Repetir pedido"
                detalle={p.facturado ? undefined : "Cuando este esté facturado"}
                apagada={!p.facturado}
                onSelect={repetir}
              />
            </>
          ) : null}

          <DropdownMenuSeparator />
          <OpcionMenu icono={Ban} tono="rojo" titulo="Anular pedido" peligro onSelect={eliminar} />
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogoAnular p={p} abierto={borrando} onCerrar={() => setBorrando(false)} enFicha={enFicha} />
    </>
  );
}

function DialogoAnular({
  p,
  abierto,
  onCerrar,
}: {
  p: PedidoParaAcciones;
  abierto: boolean;
  onCerrar: () => void;
  /** La ficha se queda: el anulado sigue ahí (188). */
  enFicha?: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [motivo, setMotivo] = React.useState("");

  React.useEffect(() => {
    if (abierto) {
      setError(null);
      setMotivo("");
    }
  }, [abierto]);

  const confirmar = () =>
    iniciar(async () => {
      const r = await anularPedido({ id: p.id, motivo });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCerrar();
      toast.success(`Pedido ${r.numero} anulado`, {
        ...AVISO,
        description: `Se queda en la lista como anulado. La cotización ${p.cotizacion} queda como estaba antes de este pedido.`,
      });
      router.refresh();
    });

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`grid size-9 place-items-center rounded-lg ${TONO_OPCION.rojo} text-white`}>
              <Ban className="size-5" aria-hidden="true" />
            </span>
            Anular {p.numero}
          </DialogTitle>
          <DialogDescription className="text-base">
            Se queda en la lista como <strong>anulado</strong>, con lo que pedía y el motivo. Si es el único pedido de{" "}
            {p.cotizacion}, la cotización vuelve a «Enviada»: al aprobarla otra vez sale un pedido nuevo, con el número
            siguiente.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">¿Por qué se anula?</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Ej.: el cliente cambió las cantidades; se aprueba otra vez."
              className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-base"
            />
          </label>
          {error ? <p className="text-base text-[var(--danger)]">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente} className="h-11 w-full sm:w-auto md:h-control-md">
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={confirmar}
            disabled={pendiente || motivo.trim().length < 3}
            className="h-11 w-full sm:w-auto md:h-control-md"
          >
            <Ban className="size-4" aria-hidden="true" />
            {pendiente ? "Anulando…" : "Anular pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
