"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, toast } from "@rodatech/ui";
import { Building2, Check, MapPin, Trash2 } from "lucide-react";

import { direccionesDeCliente, quitarDireccionCliente, type DireccionCliente } from "../acciones/direcciones";
import { claveDireccion } from "../dominio/direccion";

/**
 * A dónde se entrega: la fiscal o un local que ya se usó (195).
 *
 * Moisés, 06/11: *«algunos sabemos que sale del RUC pero algunos se van a
 * enviar a otro local… que pueda seleccionar una dirección u otra… tiene que
 * ser dinámico con el ubigeo»*. Elegir una pone la dirección Y su distrito: el
 * fallo era que cambiar la dirección dejaba el distrito del RUC.
 *
 * Cada opción es un botón grande con la dirección entera y el distrito escrito
 * —no un desplegable: dos locales del mismo cliente se distinguen leyendo la
 * calle, y en un desplegable se cortan—.
 */
export function ElegirDireccion({
  clienteId,
  direccionActual,
  ubigeoActual,
  onElegir,
}: {
  clienteId: string | null;
  direccionActual: string;
  ubigeoActual: string;
  onElegir: (direccion: string, ubigeo: string) => void;
}) {
  const [lista, setLista] = useState<DireccionCliente[] | null>(null);
  const [quitando, empezar] = useTransition();

  useEffect(() => {
    if (!clienteId) {
      setLista(null);
      return;
    }
    let vigente = true;
    void direccionesDeCliente(clienteId).then((r) => {
      if (vigente) setLista(r.ok ? r.datos : null);
    });
    return () => {
      vigente = false;
    };
  }, [clienteId]);

  if (!lista || lista.length === 0) return null;
  const actual = claveDireccion(direccionActual);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">¿A dónde se entrega?</legend>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {lista.map((d) => {
          const elegida = claveDireccion(d.direccion) === actual && (d.ubigeo ?? "") === ubigeoActual;
          return (
            <div
              key={d.id ?? "fiscal"}
              className={`flex items-start gap-2 rounded-md border-2 p-2 ${
                elegida ? "border-brand-600 bg-brand-50 dark:bg-brand-950" : "border-[var(--border)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <button
                type="button"
                aria-pressed={elegida}
                onClick={() => onElegir(d.direccion, d.ubigeo ?? "")}
                className="flex min-w-0 flex-1 items-start gap-2 text-left"
              >
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    elegida ? "border-brand-600 bg-brand-600 text-white" : "border-[var(--border-strong)]"
                  }`}
                  aria-hidden
                >
                  {elegida ? <Check className="size-3.5" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {d.fiscal ? <Building2 className="size-4" aria-hidden /> : <MapPin className="size-4" aria-hidden />}
                    {d.fiscal ? "La del RUC (fiscal)" : "Otro local"}
                  </span>
                  <span className="block break-words text-sm">{d.direccion}</span>
                  <span className="block text-sm text-[var(--fg-muted)]">{d.lugar ?? "Sin distrito: elígelo abajo"}</span>
                </span>
              </button>
              {d.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={quitando}
                  aria-label={`Quitar ${d.direccion}`}
                  onClick={() =>
                    empezar(async () => {
                      const r = await quitarDireccionCliente(d.id!);
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      setLista((l) => (l ? l.filter((x) => x.id !== d.id) : l));
                      toast.success("Dirección quitada de la lista.");
                    })
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                  Quitar
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-sm text-[var(--fg-muted)]">
        ¿Va a otro sitio? Escríbelo abajo y elige su distrito: al guardar la guía queda en esta lista para la próxima.
      </p>
    </fieldset>
  );
}
