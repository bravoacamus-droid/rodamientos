"use client";

// Cliente: el menú, los avisos (toast) y el diálogo de eliminar.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  EllipsisVertical,
  FileSearch,
  FileText,
  Receipt,
  Repeat,
  Trash2,
  Truck,
  type LucideIcon,
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "@rodatech/ui";

import { eliminarPedido } from "../acciones/gestionar";

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
}

/** Cada opción con su color: el icono en una pastilla, como un emoticono. */
const TONO = {
  azul: "bg-sky-600 text-white",
  gris: "bg-slate-500 text-white",
  marca: "bg-brand-600 text-white",
  verde: "bg-emerald-600 text-white",
  ambar: "bg-amber-500 text-white",
  violeta: "bg-violet-600 text-white",
  rojo: "bg-red-600 text-white",
} as const;

function Opcion({
  icono: Icono,
  tono,
  titulo,
  detalle,
  onSelect,
  peligro = false,
  apagada = false,
}: {
  icono: LucideIcon;
  tono: keyof typeof TONO;
  titulo: string;
  detalle?: string;
  onSelect: () => void;
  peligro?: boolean;
  /** Se ve, pero al pulsarla avisa de qué falta en vez de llevar a nada. */
  apagada?: boolean;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className={`items-start gap-2.5 py-1.5 ${apagada ? "opacity-70" : ""}`}>
      <span className={`grid size-6 shrink-0 place-items-center rounded-md ${TONO[tono]}`}>
        <Icono className="size-3.5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={`text-sm font-medium leading-6 ${peligro ? "text-[var(--danger)]" : ""}`}>{titulo}</span>
        {detalle ? <span className="text-sm text-[var(--fg-muted)]">{detalle}</span> : null}
      </span>
    </DropdownMenuItem>
  );
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
      ? "Solo se elimina el último pedido de la cotización."
      : p.facturado
        ? "Ya está facturado: se corrige con una nota de crédito."
        : p.guia
          ? "Tiene guía: anúlala o bórrala antes."
          : p.conCompras
            ? "Tiene órdenes de compra: anúlalas antes."
            : null;
    if (motivo) return toast.error(`No se puede eliminar ${p.numero}`, { ...AVISO, description: motivo });
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

        <DropdownMenuContent align="end" className="w-64">
          {enFicha ? null : (
            <Opcion icono={ClipboardList} tono="marca" titulo="Ver pedido" onSelect={() => router.push(`/pedidos/${p.id}`)} />
          )}
          <Opcion
            icono={FileSearch}
            tono="azul"
            titulo="Hoja de pedido"
            onSelect={() => router.push(`/pedidos/${p.id}?hoja=1`)}
          />
          <Opcion
            icono={FileText}
            tono="gris"
            titulo={`Ver cotización ${p.cotizacion}`}
            onSelect={() => router.push(`/cotizaciones/${p.cotizacionId}`)}
          />

          {p.vigente && !p.facturado ? (
            <>
              <DropdownMenuSeparator />
              {guiaEmitida ? null : (
                <Opcion
                  icono={Truck}
                  tono="marca"
                  titulo={p.guia ? "Seguir con la guía" : "Hacer la guía"}
                  detalle={p.guia ? "Está en borrador" : undefined}
                  onSelect={() => router.push(urlGuia)}
                />
              )}
              <Opcion
                icono={Receipt}
                tono={guiaEmitida ? "verde" : "ambar"}
                titulo="Facturar"
                detalle={guiaEmitida ? undefined : "Primero hay que emitir la guía"}
                apagada={!guiaEmitida}
                onSelect={facturar}
              />
            </>
          ) : null}

          {p.vigente ? (
            <>
              <DropdownMenuSeparator />
              <Opcion
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
          <Opcion icono={Trash2} tono="rojo" titulo="Eliminar pedido" peligro onSelect={eliminar} />
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogoEliminar p={p} abierto={borrando} onCerrar={() => setBorrando(false)} enFicha={enFicha} />
    </>
  );
}

function DialogoEliminar({
  p,
  abierto,
  onCerrar,
  enFicha,
}: {
  p: PedidoParaAcciones;
  abierto: boolean;
  onCerrar: () => void;
  enFicha: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (abierto) setError(null);
  }, [abierto]);

  const confirmar = () =>
    iniciar(async () => {
      const r = await eliminarPedido(p.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCerrar();
      toast.success(`Pedido ${r.numero} eliminado`, {
        ...AVISO,
        description: `La cotización ${p.cotizacion} queda como estaba antes de este pedido.`,
      });
      if (enFicha) router.push("/pedidos");
      else router.refresh();
    });

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`grid size-9 place-items-center rounded-lg ${TONO.rojo}`}>
              <Trash2 className="size-5" aria-hidden="true" />
            </span>
            Eliminar {p.numero}
          </DialogTitle>
          <DialogDescription>
            No tiene compras, guía ni factura, así que se puede deshacer entero. Si es el único pedido de{" "}
            {p.cotizacion}, la cotización vuelve a «Enviada» y la puedes aprobar otra vez.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente} className="h-11 w-full sm:w-auto md:h-control-md">
            Cancelar
          </Button>
          <Button type="button" variant="danger" onClick={confirmar} disabled={pendiente} className="h-11 w-full sm:w-auto md:h-control-md">
            <Trash2 className="size-4" aria-hidden="true" />
            {pendiente ? "Eliminando…" : "Eliminar pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
