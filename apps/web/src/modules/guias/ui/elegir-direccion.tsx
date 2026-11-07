"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Button,
  Combobox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from "@rodatech/ui";
import { Building2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";

import { SelectorUbigeoCascada } from "@/modules/clientes/ui/selector-ubigeo";
import { departamentosUbigeo, distritosUbigeo, provinciasUbigeo } from "@/modules/clientes/acciones/ubigeo";
import {
  crearDireccionCliente,
  direccionesDeCliente,
  editarDireccionCliente,
  quitarDireccionCliente,
  type DireccionCliente,
} from "../acciones/direcciones";
import { claveDireccion } from "../dominio/direccion";

/**
 * A dónde se entrega: un selector con las direcciones del cliente y una
 * ventana para darlas de alta, corregirlas o quitarlas (195, 06/11).
 *
 * Moisés, 06/11: *«si tiene varias direcciones se van a crear varias cards…
 * ¿por qué no lo sacamos en el mismo select… que pueda editar las
 * direcciones, que se abra un modal y guardar, editar o borrar?»*.
 *
 * Elegir una pone la dirección Y su distrito en la guía, que era el fallo de
 * partida: cambiar la dirección dejaba el distrito del RUC. La fiscal sale
 * de la ficha del cliente y aquí no se toca.
 */
export function ElegirDireccion({
  clienteId,
  direccionActual,
  onElegir,
}: {
  clienteId: string | null;
  direccionActual: string;
  onElegir: (direccion: string, ubigeo: string) => void;
}) {
  const [lista, setLista] = useState<DireccionCliente[] | null>(null);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    let vigente = true;
    if (!clienteId) {
      setLista(null);
      return;
    }
    void direccionesDeCliente(clienteId).then((r) => {
      if (vigente) setLista(r.ok ? r.datos : null);
    });
    return () => {
      vigente = false;
    };
  }, [clienteId]);

  if (!clienteId || !lista) return null;

  const valorDe = (d: DireccionCliente) => d.id ?? "fiscal";
  const actual = claveDireccion(direccionActual);
  const elegida = lista.find((d) => claveDireccion(d.direccion) === actual) ?? null;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="guia-direccion-guardada" className="text-sm font-medium">
        ¿A dónde se entrega?
      </label>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-72">
          <Combobox
            id="guia-direccion-guardada"
            opciones={lista.map((d) => ({
              valor: valorDe(d),
              etiqueta: `${d.fiscal ? "RUC · " : ""}${d.direccion}`,
              detalle: d.lugar ?? "Sin distrito",
              claves: `${d.direccion} ${d.lugar ?? ""}`,
            }))}
            valor={elegida ? valorDe(elegida) : null}
            onCambio={(v) => {
              const d = lista.find((x) => valorDe(x) === v);
              if (d) onElegir(d.direccion, d.ubigeo ?? "");
            }}
            placeholder={direccionActual ? "Escrita a mano (no está en la lista)" : "Elige una dirección"}
            placeholderBusqueda="Busca por calle o distrito"
            textoVacio="Ninguna coincide"
          />
        </div>
        <Button type="button" variant="outline" onClick={() => setAbierta(true)}>
          <MapPin className="size-4" aria-hidden />
          Direcciones ({lista.length})
        </Button>
      </div>
      <p className="text-sm text-[var(--fg-muted)]">
        Al elegirla se ponen la dirección y el distrito. En «Direcciones» se añaden, corrigen o quitan.
      </p>

      <VentanaDirecciones
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        clienteId={clienteId}
        lista={lista}
        alCambiar={setLista}
        onUsar={(d) => {
          onElegir(d.direccion, d.ubigeo ?? "");
          setAbierta(false);
        }}
      />
    </div>
  );
}

type Borrador = { id: string | null; direccion: string; ubigeo: string; departamento: string; provincia: string };
const VACIO: Borrador = { id: null, direccion: "", ubigeo: "", departamento: "", provincia: "" };

export function VentanaDirecciones({
  abierta,
  onCerrar,
  clienteId,
  lista,
  alCambiar,
  onUsar,
}: {
  abierta: boolean;
  onCerrar: () => void;
  clienteId: string;
  lista: DireccionCliente[];
  /** La lista tal como queda tras añadir, corregir o borrar. */
  alCambiar: (lista: DireccionCliente[]) => void;
  /** Solo dentro de una guía: en la ficha del cliente no hay a qué ponerla. */
  onUsar?: (d: { direccion: string; ubigeo: string | null }) => void;
}) {
  /** null: viendo la lista. Con datos: el formulario de añadir o corregir. */
  const [form, setForm] = useState<Borrador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();

  const cerrar = () => {
    setForm(null);
    setError(null);
    onCerrar();
  };

  const guardar = () => {
    if (!form) return;
    setError(null);
    empezar(async () => {
      const datos = { direccion: form.direccion, ubigeo: form.ubigeo || null };
      const r = form.id ? await editarDireccionCliente(form.id, datos) : await crearDireccionCliente(clienteId, datos);
      if (!r.ok) return setError(r.error);
      alCambiar(r.datos);
      toast.success(form.id ? "Dirección corregida." : "Dirección añadida.");
      setForm(null);
    });
  };

  const quitar = (d: DireccionCliente) =>
    empezar(async () => {
      const r = await quitarDireccionCliente(d.id!);
      if (!r.ok) return void toast.error(r.error);
      alCambiar(r.datos);
      toast.success("Dirección quitada. Las guías ya hechas no cambian.");
    });

  return (
    <Dialog open={abierta} onOpenChange={(o) => (o ? null : cerrar())}>
      <DialogContent ancho="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form ? (form.id ? "Corregir dirección" : "Nueva dirección") : "Direcciones de entrega"}</DialogTitle>
          <DialogDescription>
            {form
              ? "La calle y el distrito: los dos van a la guía y a SUNAT."
              : "La del RUC sale de la ficha del cliente. Las demás son sus otros locales."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {form ? (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Dirección</span>
                <Input
                  autoFocus
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                  placeholder="Calle, número, urbanización"
                />
              </label>
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-sm font-medium">Distrito</legend>
                <SelectorUbigeoCascada
                  id="direccion-nueva-ubigeo"
                  codigo={form.ubigeo}
                  departamento={form.departamento}
                  provincia={form.provincia}
                  ayudaDistrito={null}
                  onElegir={(v) =>
                    setForm({ ...form, ubigeo: v.codigo, departamento: v.departamento, provincia: v.provincia })
                  }
                  cargarDepartamentos={departamentosUbigeo}
                  cargarProvincias={provinciasUbigeo}
                  cargarDistritos={distritosUbigeo}
                />
              </fieldset>
              {error ? (
                <p role="alert" className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] px-3 py-2 text-sm">
                  {error}
                </p>
              ) : null}
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
              {lista.map((d) => (
                <li key={d.id ?? "fiscal"} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      {d.fiscal ? <Building2 className="size-4" aria-hidden /> : <MapPin className="size-4" aria-hidden />}
                      {d.fiscal ? "La del RUC (fiscal)" : "Otro local"}
                    </p>
                    <p className="break-words text-sm">{d.direccion}</p>
                    <p className="text-sm text-[var(--fg-muted)]">{d.lugar ?? "Sin distrito"}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {onUsar ? (
                      <Button type="button" onClick={() => onUsar(d)}>
                        Usar
                      </Button>
                    ) : null}
                    {d.id ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={ocupado}
                          onClick={() =>
                            setForm({
                              id: d.id,
                              direccion: d.direccion,
                              ubigeo: d.ubigeo ?? "",
                              departamento: d.departamento,
                              provincia: d.provincia,
                            })
                          }
                        >
                          <Pencil className="size-4" aria-hidden />
                          Editar
                        </Button>
                        <Button type="button" variant="outline" disabled={ocupado} onClick={() => quitar(d)}>
                          <Trash2 className="size-4" aria-hidden />
                          Borrar
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>

        <DialogFooter>
          {form ? (
            <>
              <Button type="button" variant="outline" disabled={ocupado} onClick={() => (setForm(null), setError(null))}>
                Volver a la lista
              </Button>
              <Button type="button" disabled={ocupado} onClick={guardar}>
                {ocupado ? "Guardando…" : "Guardar"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={cerrar}>
                Cerrar
              </Button>
              <Button type="button" onClick={() => setForm(VACIO)}>
                <Plus className="size-4" aria-hidden />
                Nueva dirección
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Las direcciones en la ficha del cliente (06/11). Moisés: *«si yo entro voy
 * a poder ver sus direcciones, editarlas, eliminarlas»*. Las mismas que
 * ofrece la guía, con la misma ventana.
 */
export function DireccionesDelCliente({ clienteId, puedeEditar }: { clienteId: string; puedeEditar: boolean }) {
  const [lista, setLista] = useState<DireccionCliente[] | null>(null);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    let vigente = true;
    void direccionesDeCliente(clienteId).then((r) => {
      if (vigente) setLista(r.ok ? r.datos : []);
    });
    return () => {
      vigente = false;
    };
  }, [clienteId]);

  return (
    <section className="card p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Direcciones de entrega
          {lista ? <span className="font-normal text-[var(--fg-muted)]"> · {lista.length}</span> : null}
        </h2>
        {puedeEditar && lista ? (
          <Button type="button" variant="outline" onClick={() => setAbierta(true)}>
            <Pencil className="size-4" aria-hidden />
            Añadir, editar o borrar
          </Button>
        ) : null}
      </header>
      {lista === null ? (
        <p className="text-sm text-[var(--fg-muted)]">Cargando…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((d) => (
            <li key={d.id ?? "fiscal"} className="flex items-start gap-2 text-sm">
              {d.fiscal ? (
                <Building2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="block break-words">
                  {d.fiscal ? <strong>RUC · </strong> : null}
                  {d.direccion}
                </span>
                <span className="block text-[var(--fg-muted)]">{d.lugar ?? "Sin distrito"}</span>
              </span>
            </li>
          ))}
          {lista.length <= 1 ? (
            <li className="text-sm text-[var(--fg-muted)]">
              Sin otros locales. Se añaden aquí o solos, al hacer una guía a otra dirección.
            </li>
          ) : null}
        </ul>
      )}
      {lista ? (
        <VentanaDirecciones
          abierta={abierta}
          onCerrar={() => setAbierta(false)}
          clienteId={clienteId}
          lista={lista}
          alCambiar={setLista}
        />
      ) : null}
    </section>
  );
}
