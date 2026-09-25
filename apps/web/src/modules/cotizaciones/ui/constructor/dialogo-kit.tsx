"use client";

import * as React from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  toast,
} from "@rodatech/ui";
import { Package, Pencil } from "lucide-react";

import { leerKit } from "@/modules/productos/acciones/kits";
import type { KitDetalle } from "@/modules/productos/api/kits";
import { FormularioKit } from "@/modules/productos/ui/kits/formulario";

import { buscarParaCotizar } from "../../acciones/buscar";
import type { LineaConstructor, ProductoParaCotizar } from "../../dominio/constructor";

const dolar = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

/**
 * El kit, visto y editado DESDE LA COTIZACIÓN.
 *
 * Luis, 25/09: *«en cotización, cuando agregue un kit, solo si es un kit, en
 * los tres puntos ver detalle de kit; y si es editar, ¿regresar a editar kit,
 * o es un nuevo modal ahí mismo? Así es dinámico en la misma cotización, para
 * no regresar a la otra ventana, todo ahí en vivo. Recuerda que un kit no es
 * un producto»*.
 *
 * Y cierra lo que Willy tropezó en la reunión del 24/09 (8:09): quiso ver el
 * kit desde la cotización y lo único que había era «Editar artículo», que es
 * para la copia impresa de la línea, no para lo que el kit lleva dentro.
 *
 * ---------------------------------------------------------------------------
 * Dos modos, un solo diálogo
 * ---------------------------------------------------------------------------
 * Se abre VIENDO: qué lleva, a cuánto, cuántos se pueden armar. Quien puede
 * tocar el catálogo tiene además «Editar kit», que cambia el contenido del
 * diálogo por EL MISMO editor de la pantalla de kits — no una copia.
 *
 * Al guardar, la línea de la cotización se refresca sola (`refrescarKit`), y
 * con la regla de siempre: lo propuesto sigue al kit, lo tecleado se queda. Si
 * alguien ya había negociado el precio del kit en esta cotización, eso no se
 * pisa (Willy, 8:25: el precio del kit en la cotización vale solo para ella).
 *
 * Editar aquí cambia el KIT —el maestro—, no solo esta cotización. Se dice
 * con todas las letras antes de tocar, porque es la diferencia importante.
 */
export function DialogoKit({
  linea,
  puedeEditarKit,
  onCerrar,
  onKitGuardado,
}: {
  linea: LineaConstructor;
  /** Gerencia, admin y compras: los mismos que `guardarKit` deja pasar. */
  puedeEditarKit: boolean;
  onCerrar: () => void;
  onKitGuardado: (
    producto: ProductoParaCotizar,
    anterior: { codigo: string; descripcion: string },
  ) => void;
}) {
  const [modo, setModo] = React.useState<"ver" | "editar">("ver");
  const [kit, setKit] = React.useState<KitDetalle | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refrescando, empezar] = React.useTransition();

  const cargar = React.useCallback((id: string) => {
    empezar(async () => {
      const r = await leerKit(id);
      if (r.ok) {
        setKit(r.datos);
        setError(null);
      } else {
        setError(r.error);
      }
    });
  }, []);

  // Una sola vez al abrir: el diálogo se monta solo cuando se abre, así que
  // esto no se repite ni depende de nada que el propio efecto cambie.
  React.useEffect(() => {
    if (linea.productoId) cargar(linea.productoId);
  }, [linea.productoId, cargar]);

  async function alGuardar(r: { id: string; codigo: string }) {
    const anterior = { codigo: kit?.codigo ?? linea.codigo, descripcion: kit?.descripcion ?? linea.descripcion };
    // Se vuelve a buscar el kit tal como lo devuelve el buscador de la
    // cotización, que es la forma que la línea sabe leer: precio, costo, piso
    // y stock armable, ya recalculados por la base.
    const b = await buscarParaCotizar(r.codigo);
    const producto = b.ok ? b.datos.find((p) => p.id === r.id) : undefined;
    if (producto) {
      onKitGuardado(producto as ProductoParaCotizar, anterior);
    } else {
      toast.error("El kit se guardó, pero no se pudo refrescar la línea. Vuelve a añadirlo.");
    }
    setModo("ver");
    cargar(r.id);
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent ancho={modo === "editar" ? "max-w-4xl" : "max-w-2xl"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5" aria-hidden />
            {modo === "editar" ? `Editar ${kit?.codigo ?? linea.codigo}` : (kit?.codigo ?? linea.codigo)}
          </DialogTitle>
          <DialogDescription>{kit?.descripcion ?? linea.descripcion}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {error ? (
            <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : !kit ? (
            <Skeleton className="h-48 w-full" />
          ) : modo === "editar" ? (
            <>
              <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
                <strong>Estás cambiando el kit, no solo esta cotización.</strong> Lo que
                guardes aquí vale para las cotizaciones que se hagan desde ahora. El precio
                que ya negociaste en esta línea no se toca.
              </p>
              <FormularioKit
                kit={kit}
                enModal
                alGuardar={alGuardar}
                alCancelar={() => setModo("ver")}
              />
            </>
          ) : (
            <VistaKit
              kit={kit}
              linea={linea}
              refrescando={refrescando}
              puedeEditarKit={puedeEditarKit}
              onEditar={() => setModo("editar")}
              onCerrar={onCerrar}
            />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function VistaKit({
  kit,
  linea,
  refrescando,
  puedeEditarKit,
  onEditar,
  onCerrar,
}: {
  kit: KitDetalle;
  linea: LineaConstructor;
  refrescando: boolean;
  puedeEditarKit: boolean;
  onEditar: () => void;
  onCerrar: () => void;
}) {
  const negociado = linea.valorUnitario !== kit.precioVenta;

  return (
    <div className={`flex flex-col gap-4 ${refrescando ? "opacity-60" : ""}`}>
      {/* En el teléfono, una pieza por renglón con la cuenta a la vista: en la
          tabla, el precio y el subtotal quedaban fuera del modal, a la
          derecha, y eran justo lo que se abre esto para mirar. */}
      <ul className="flex flex-col divide-y divide-[var(--border-soft)] md:hidden">
        {kit.componentes.map((c) => (
          <li key={c.producto_id} className="py-2 text-sm">
            <p className="font-mono font-semibold">{c.codigo}</p>
            <p>{c.descripcion}</p>
            {c.marca ? <p className="text-[var(--fg-subtle)]">{c.marca}</p> : null}
            <p className="mt-1 flex items-baseline justify-between gap-3">
              <span className="tabular text-[var(--fg-muted)]">
                {c.cantidad} × {dolar(c.precioNeto)}
                {c.descuentoPct > 0 ? ` (−${c.descuentoPct}%)` : ""}
              </span>
              <span className="tabular font-medium">{dolar(c.precioNeto * c.cantidad)}</span>
            </p>
          </li>
        ))}
      </ul>

      <div className="scroll-x hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="py-2 pr-3 font-medium">Código</th>
              <th className="py-2 pr-3 font-medium">Descripción</th>
              <th className="py-2 pr-3 text-right font-medium">Cant.</th>
              <th className="py-2 pr-3 text-right font-medium">Precio</th>
              <th className="py-2 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {kit.componentes.map((c) => (
              <tr key={c.producto_id} className="border-b border-[var(--border-soft)]">
                <td className="whitespace-nowrap py-2 pr-3 font-mono">{c.codigo}</td>
                <td className="py-2 pr-3">
                  {c.descripcion}
                  {c.marca ? (
                    <span className="block text-[var(--fg-subtle)]">{c.marca}</span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-right tabular">{c.cantidad}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right tabular">
                  {dolar(c.precioNeto)}
                  {c.descuentoPct > 0 ? (
                    <span className="block text-[var(--fg-subtle)]">−{c.descuentoPct}%</span>
                  ) : null}
                </td>
                <td className="py-2 text-right tabular font-medium">
                  {dolar(c.precioNeto * c.cantidad)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 rounded-md bg-[var(--surface-2)] p-3 text-sm sm:grid-cols-2">
        <p>
          <span className="text-[var(--fg-muted)]">Precio del kit </span>
          <span className="tabular font-semibold">{dolar(kit.precioVenta)}</span>
        </p>
        <p>
          <span className="text-[var(--fg-muted)]">Con el stock de hoy se arman </span>
          <span className="tabular font-semibold">{kit.armable}</span>
        </p>
        {/* Si en esta cotización va a otro precio, se dice: es la diferencia
            entre lo que vale el kit y lo que se negoció aquí (Willy, 8:25). */}
        {negociado ? (
          <p className="sm:col-span-2">
            <span className="text-[var(--fg-muted)]">En esta cotización va a </span>
            <span className="tabular font-semibold">{dolar(linea.valorUnitario)}</span>
            <span className="text-[var(--fg-muted)]"> — negociado aquí, no cambia el kit.</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {puedeEditarKit ? (
          <span className="text-sm text-[var(--fg-muted)]">
            ¿Lleva algo más, o algo menos? Se cambia aquí mismo.
          </span>
        ) : (
          <span className="text-sm text-[var(--fg-muted)]">
            Para cambiar lo que lleva, pídeselo a Compras o a Gerencia.
          </span>
        )}
        <span className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
          {puedeEditarKit ? (
            <Button type="button" onClick={onEditar}>
              <Pencil className="size-4" aria-hidden />
              Editar kit
            </Button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
