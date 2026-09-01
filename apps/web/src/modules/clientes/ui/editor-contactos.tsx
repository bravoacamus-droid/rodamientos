"use client";

// Cliente: mantiene la lista en pantalla y llama a Server Actions por cada
// contacto, sin recargar la ficha entera.

import * as React from "react";
import { Button } from "@rodatech/ui";
import { Check, Plus, Star, Trash2, X } from "lucide-react";

import { desactivarContacto, guardarContacto } from "../acciones/contactos";
import {
  CONTACTO_VACIO,
  CamposContacto,
  FilaContacto,
  type BorradorContacto,
} from "./contacto-campos";
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
 * `ContactosNuevos`, que los acumula en memoria y los manda dentro del payload
 * de la empresa.
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
  const [errorNombre, setErrorNombre] = React.useState<string | null>(null);
  const [ocupado, ejecutar] = React.useTransition();
  const refNombre = React.useRef<HTMLInputElement>(null);

  const [f, setF] = React.useState<BorradorContacto>(CONTACTO_VACIO);

  const cerrar = () => {
    setEditando(null);
    setCreando(false);
    setF(CONTACTO_VACIO);
    setError(null);
    setErrorNombre(null);
  };

  const abrirNuevo = () => {
    setCreando(true);
    setEditando(null);
    setF(CONTACTO_VACIO);
    setError(null);
    setErrorNombre(null);
  };

  const abrirEdicion = (c: ContactoCliente) => {
    setCreando(false);
    setEditando(c.id);
    setError(null);
    setErrorNombre(null);
    setF({
      nombre: c.nombre,
      cargo: c.cargo ?? "",
      area: c.area ?? "",
      email: c.email ?? "",
      telefono: c.telefono ?? "",
      whatsapp: c.whatsapp ?? "",
    });
  };

  /**
   * Guarda contra el servidor.
   *
   * `seguir` deja el bloque abierto y en blanco para el siguiente, que es lo
   * que se necesita cuando llegan tres nombres en el mismo correo. Sin él hay
   * que volver a buscar el botón «Añadir» después de cada uno.
   */
  const guardar = (principal: boolean, seguir = false) => {
    setError(null);
    setErrorNombre(null);
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
        // El nombre repetido se pinta en su campo y no en la banda de error de
        // abajo: es ahí donde hay que escribir para arreglarlo.
        if (r.campo === "nombre") setErrorNombre(r.error);
        else setError(r.error);
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

      if (seguir) {
        setEditando(null);
        setCreando(true);
        setF(CONTACTO_VACIO);
        refNombre.current?.focus();
        return;
      }
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
    <section className="card flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Contactos</h2>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            Las personas a las que se les cotiza en esta empresa. Al hacer una
            cotización se elige a cuál va dirigida.
          </p>
        </div>
        {!abierto ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 md:h-control-md"
            onClick={abrirNuevo}
          >
            <Plus aria-hidden="true" />
            {lista.length === 0 ? "Añadir contacto" : "Añadir otro"}
          </Button>
        ) : null}
      </div>

      {lista.length === 0 && !abierto ? (
        <p className="rounded-md border border-dashed border-[var(--border)] px-4 py-5 text-center text-sm text-[var(--fg-muted)]">
          Todavía no hay contactos. La cotización saldrá sin nombre de destinatario.
        </p>
      ) : null}

      {lista.length > 0 ? (
        <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
          {lista.map((c) => (
            <FilaContacto
              key={c.id}
              contacto={{
                nombre: c.nombre,
                cargo: c.cargo ?? "",
                area: c.area ?? "",
                email: c.email ?? "",
                telefono: c.telefono ?? "",
                whatsapp: c.whatsapp ?? "",
              }}
              principal={c.principal}
              /*
               * Botones CON TEXTO, no un lápiz y una papelera sueltos.
               *
               * Willy, 01/09: *«el lápiz no se ve mucho, para el cliente que
               * es corto de vista no ve bien»*. Eran `ghost` en tamaño `xs`
               * —24 px de alto, icono de 14 px, sin borde— con el significado
               * escondido en un `sr-only` que solo lee un lector de pantalla.
               * Quien ve poco no tiene forma de saber cuál es cuál sin
               * acercarse a la pantalla, y una de las dos da de baja al
               * contacto.
               */
              acciones={
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10"
                    disabled={ocupado}
                    onClick={() => abrirEdicion(c)}
                  >
                    Corregir
                    <span className="sr-only"> a {c.nombre}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10"
                    disabled={ocupado}
                    onClick={() => quitar(c)}
                  >
                    <Trash2 aria-hidden="true" />
                    Dar de baja
                    <span className="sr-only"> a {c.nombre}</span>
                  </Button>
                </>
              }
            />
          ))}
        </ul>
      ) : null}

      {abierto ? (
        <div className="flex flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-sm font-semibold">
            {editando ? "Corregir el contacto" : "Nuevo contacto"}
          </p>

          <CamposContacto
            idPrefijo="contacto-ficha"
            valor={f}
            onCambio={setF}
            errorNombre={errorNombre ?? undefined}
            refNombre={refNombre}
            autoFocus={lista.length > 0}
          />

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="h-11 md:h-control-md"
              onClick={cerrar}
              disabled={ocupado}
            >
              <X aria-hidden="true" />
              Cancelar
            </Button>

            {/* Dos intenciones distintas y no una casilla: «guardar» y
                «guardar y que sea el principal». Una casilla marcada por
                descuido le cambia el destinatario por defecto a todas las
                cotizaciones futuras de esa empresa. */}
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-control-md"
              onClick={() => guardar(true)}
              disabled={!puedeGuardar}
            >
              <Star aria-hidden="true" />
              Guardar como principal
            </Button>

            {/* Solo al crear: al corregir a alguien no hay «el siguiente». */}
            {!editando ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 md:h-control-md"
                onClick={() => guardar(lista.length === 0, true)}
                disabled={!puedeGuardar}
              >
                <Plus aria-hidden="true" />
                Guardar y añadir otro
              </Button>
            ) : null}

            <Button
              type="button"
              className="h-11 md:h-control-md"
              onClick={() => guardar(editando ? isPrincipal(lista, editando) : lista.length === 0)}
              disabled={!puedeGuardar}
              loading={ocupado}
            >
              {ocupado ? (
                "Guardando…"
              ) : (
                <>
                  <Check aria-hidden="true" />
                  {editando ? "Guardar cambios" : "Guardar"}
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * ¿Este contacto era ya el principal?
 *
 * Al corregir a alguien hay que reenviar su marca tal como estaba: el servidor
 * escribe `principal` con lo que llegue, así que mandar `false` porque el botón
 * se llama «Guardar cambios» le quitaría la estrella al principal cada vez que
 * se le corrige el teléfono, y la empresa se quedaría sin destinatario por
 * defecto sin que nadie lo pidiera.
 */
function isPrincipal(lista: ContactoCliente[], id: string): boolean {
  return lista.find((c) => c.id === id)?.principal ?? false;
}
