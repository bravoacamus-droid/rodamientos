"use client";

// Cliente: mantiene la lista en pantalla y llama a Server Actions por cada
// contacto, sin recargar la ficha entera.

import * as React from "react";
import { Badge, Button, Input } from "@rodatech/ui";
import { Pencil, Plus, Star, Trash2, X } from "lucide-react";

import { desactivarContacto, guardarContacto } from "../acciones/contactos";
import type { ContactoCliente } from "../dominio/tipos";

/**
 * Las personas de una empresa cliente.
 *
 * Willy, 31/08 (4:02): *«Cuando hago la cotización debo tener la opción para
 * elegir a qué contacto de los ya creados va dirigido el presupuesto»*. Y antes
 * (2:36) explicó por qué son varios: el de compras, el asistente de logística,
 * y a veces el de mantenimiento, que es quien pidió el repuesto.
 *
 * ---------------------------------------------------------------------------
 * Por qué guarda de uno en uno y no con el resto de la ficha
 * ---------------------------------------------------------------------------
 * Porque se editan en momentos distintos. Añadir el nombre que el cliente
 * acaba de dar por teléfono no debería obligar a reenviar la ficha comercial
 * entera —con su línea de crédito y sus condiciones— ni a arriesgarse a pisar
 * un cambio que hizo otra persona mientras tanto.
 *
 * En el ALTA no se usa: no hay todavía cliente al que colgarlos. Allí va
 * `ContactoInicial`, que manda uno dentro del payload del cliente.
 */
export function EditorContactos({
  clienteId,
  iniciales,
}: {
  clienteId: string;
  iniciales: ContactoCliente[];
}) {
  const [lista, setLista] = React.useState(iniciales);
  const [editando, setEditando] = React.useState<string | null>(null);
  const [creando, setCreando] = React.useState(iniciales.length === 0);
  const [error, setError] = React.useState<string | null>(null);
  const [ocupado, ejecutar] = React.useTransition();

  const vacio = { nombre: "", cargo: "", area: "", email: "", telefono: "", whatsapp: "" };
  const [f, setF] = React.useState(vacio);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const cerrar = () => {
    setEditando(null);
    setCreando(false);
    setF(vacio);
    setError(null);
  };

  const abrirEdicion = (c: ContactoCliente) => {
    setCreando(false);
    setEditando(c.id);
    setError(null);
    setF({
      nombre: c.nombre,
      cargo: c.cargo ?? "",
      area: c.area ?? "",
      email: c.email ?? "",
      telefono: c.telefono ?? "",
      whatsapp: c.whatsapp ?? "",
    });
  };

  const guardar = (principal: boolean) => {
    setError(null);
    ejecutar(async () => {
      const fd = new FormData();
      fd.set(
        "contacto",
        JSON.stringify({
          ...(editando ? { id: editando } : {}),
          cliente_id: clienteId,
          nombre: f.nombre.trim(),
          cargo: f.cargo.trim(),
          area: f.area.trim(),
          email: f.email.trim(),
          telefono: f.telefono.trim(),
          whatsapp: f.whatsapp.trim(),
          principal,
        }),
      );

      const r = await guardarContacto(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }

      const guardado: ContactoCliente = {
        id: r.id,
        nombre: f.nombre.trim(),
        cargo: f.cargo.trim() || null,
        area: f.area.trim() || null,
        email: f.email.trim() || null,
        telefono: f.telefono.trim() || null,
        whatsapp: f.whatsapp.trim() || null,
        principal,
      };

      setLista((previa) => {
        const sinEste = previa.filter((c) => c.id !== r.id);
        // Marcar a uno como principal se lo quita a los demás, igual que hizo
        // el servidor. Sin esto la pantalla enseñaría dos estrellas hasta que
        // alguien recargara.
        const resto = principal ? sinEste.map((c) => ({ ...c, principal: false })) : sinEste;
        return [...resto, guardado].sort((a, b) =>
          a.principal === b.principal
            ? a.nombre.localeCompare(b.nombre, "es")
            : a.principal
              ? -1
              : 1,
        );
      });
      cerrar();
    });
  };

  const quitar = (c: ContactoCliente) => {
    setError(null);
    ejecutar(async () => {
      const r = await desactivarContacto(c.id, clienteId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLista((previa) => previa.filter((x) => x.id !== c.id));
    });
  };

  const puedeGuardar = f.nombre.trim() !== "" && !ocupado;
  const abierto = creando || editando !== null;

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Contactos</h2>
          <p className="text-xs text-[var(--fg-muted)]">
            Las personas a las que se les cotiza en esta empresa. Al hacer una
            cotización se elige a cuál va dirigida.
          </p>
        </div>
        {!abierto ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCreando(true);
              setEditando(null);
              setF(vacio);
              setError(null);
            }}
          >
            <Plus aria-hidden="true" />
            Añadir
          </Button>
        ) : null}
      </div>

      {lista.length === 0 && !abierto ? (
        <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--fg-muted)]">
          Todavía no hay contactos. La cotización saldrá sin nombre de destinatario.
        </p>
      ) : null}

      {lista.length > 0 ? (
        <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
          {lista.map((c) => (
            <li key={c.id} className="flex items-start gap-3 py-2 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{c.nombre}</span>
                  {c.principal ? (
                    <Badge tone="brand" size="xs">
                      <Star aria-hidden="true" className="size-3" />
                      Principal
                    </Badge>
                  ) : null}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--fg-muted)]">
                  {c.cargo ? <span>{c.cargo}</span> : null}
                  {c.cargo && c.area ? <span aria-hidden="true">·</span> : null}
                  {c.area ? <span>{c.area}</span> : null}
                  {(c.cargo || c.area) && c.email ? <span aria-hidden="true">·</span> : null}
                  {c.email ? <span className="truncate">{c.email}</span> : null}
                  {c.telefono ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular">{c.telefono}</span>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={ocupado}
                  onClick={() => abrirEdicion(c)}
                >
                  <Pencil aria-hidden="true" />
                  <span className="sr-only">Editar a {c.nombre}</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={ocupado}
                  onClick={() => quitar(c)}
                >
                  <Trash2 aria-hidden="true" />
                  <span className="sr-only">Dar de baja a {c.nombre}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {abierto ? (
        <div className="flex flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Nombre <span className="text-[var(--danger)]">*</span>
              </span>
              <Input
                value={f.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="Juan Pérez"
                autoComplete="off"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Cargo</span>
              <Input
                value={f.cargo}
                onChange={(e) => set("cargo", e.target.value)}
                placeholder="Jefe de compras"
                autoComplete="off"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Área</span>
              {/* Lista con las tres que nombró Willy, y hueco para escribir
                  otra: la lista real la sabe él, no nosotros. */}
              <Input
                value={f.area}
                onChange={(e) => set("area", e.target.value)}
                list="areas-contacto"
                placeholder="Compras"
                autoComplete="off"
              />
              <datalist id="areas-contacto">
                <option value="Compras" />
                <option value="Logística" />
                <option value="Mantenimiento" />
                <option value="Almacén" />
                <option value="Gerencia" />
              </datalist>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Correo</span>
              <Input
                type="email"
                value={f.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="jperez@empresa.com"
                autoComplete="off"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Teléfono</span>
              <Input
                value={f.telefono}
                onChange={(e) => set("telefono", e.target.value)}
                autoComplete="off"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">WhatsApp</span>
              <Input
                value={f.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)}
                autoComplete="off"
              />
            </label>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2 text-xs text-[var(--danger)]"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={cerrar} disabled={ocupado}>
              <X aria-hidden="true" />
              Cancelar
            </Button>
            {/* Dos botones y no una casilla: «guardar» y «guardar y que sea el
                principal» son dos intenciones distintas, y una casilla marcada
                por descuido le cambia el destinatario por defecto a todas las
                cotizaciones futuras de esa empresa. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => guardar(true)}
              disabled={!puedeGuardar}
            >
              <Star aria-hidden="true" />
              Guardar como principal
            </Button>
            <Button type="button" size="sm" onClick={() => guardar(false)} disabled={!puedeGuardar}>
              {ocupado ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
