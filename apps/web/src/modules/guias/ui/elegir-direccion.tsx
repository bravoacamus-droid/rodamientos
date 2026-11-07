"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  onOrigen,
}: {
  clienteId: string | null;
  direccionActual: string;
  ubigeoActual: string;
  onElegir: (direccion: string, ubigeo: string) => void;
  /**
   * El local guardado del que se parte (null si la fiscal o ninguno). Si se
   * corrige el texto o el distrito, al guardar la guía se corrige ESE local
   * y no se añade otro (Moisés, 06/11: «¿cómo hago para editar esa
   * dirección?»).
   */
  onOrigen: (id: string | null) => void;
}) {
  const [lista, setLista] = useState<DireccionCliente[] | null>(null);
  const [quitando, empezar] = useTransition();
  /** «fiscal», el id de un local guardado, o null si no se partió de ninguno. */
  const [origen, setOrigenLocal] = useState<string | null>(null);
  const setOrigen = (o: string | null) => {
    setOrigenLocal(o);
    onOrigen(o && o !== "fiscal" ? o : null);
  };
  // La dirección con la que se abrió, para saber de qué local se parte al
  // cargar la lista sin que la carga dependa de cada tecla.
  const direccionInicial = useRef(direccionActual);
  direccionInicial.current = lista === null ? direccionActual : direccionInicial.current;

  useEffect(() => {
    if (!clienteId) {
      setLista(null);
      return;
    }
    let vigente = true;
    void direccionesDeCliente(clienteId).then((r) => {
      if (!vigente) return;
      const datos = r.ok ? r.datos : null;
      setLista(datos);
      const inicial = claveDireccion(direccionInicial.current);
      const igual = datos?.find((d) => claveDireccion(d.direccion) === inicial);
      setOrigenLocal(igual ? (igual.id ?? "fiscal") : null);
      onOrigen(igual?.id ?? null);
    });
    return () => {
      vigente = false;
    };
    // onOrigen es un setState del padre: estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  if (!lista || lista.length === 0) return null;
  const actual = claveDireccion(direccionActual);
  const deOrigen = lista.find((d) => (d.id ?? "fiscal") === origen) ?? null;
  // Se partió de un local guardado y se le cambió algo: al guardar, se corrige.
  const corrigiendo =
    deOrigen !== null &&
    deOrigen.id !== null &&
    actual.length > 0 &&
    (claveDireccion(deOrigen.direccion) !== actual || (deOrigen.ubigeo ?? "") !== ubigeoActual);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">¿A dónde se entrega?</legend>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {lista.map((d) => {
          const elegida = (d.id ?? "fiscal") === origen;
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
                onClick={() => {
                  setOrigen(d.id ?? "fiscal");
                  onElegir(d.direccion, d.ubigeo ?? "");
                }}
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
                    {elegida && corrigiendo ? (
                      <span className="rounded-sm bg-[var(--warn-bg)] px-1.5 text-sm font-medium">se corregirá</span>
                    ) : null}
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
                      if (origen === d.id) setOrigen(null);
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
      {corrigiendo ? (
        <p className="rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] px-3 py-2 text-sm">
          Al guardar la guía, este local se <strong>corrige</strong> con la dirección y el distrito de abajo. Si es
          un local distinto, elige primero «La del RUC» y escribe el nuevo: así se guarda aparte.
        </p>
      ) : (
        <p className="text-sm text-[var(--fg-muted)]">
          Para corregir un local, elígelo y cambia la dirección o el distrito de abajo. ¿Va a otro sitio? Elige «La
          del RUC», escribe el nuevo y su distrito: al guardar la guía queda en esta lista.
        </p>
      )}
    </fieldset>
  );
}
