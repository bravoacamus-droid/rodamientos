"use client";

// Cliente: acumula contactos en memoria hasta que el formulario de la empresa
// se envíe. No habla con el servidor: todavía no hay cliente al que colgarlos.

import * as React from "react";
import { Button } from "@rodatech/ui";
import { Check, Plus, Star, Trash2, X } from "lucide-react";

import { mismoNombre } from "../dominio/contactos";
import {
  CONTACTO_VACIO,
  CamposContacto,
  FilaContacto,
  type BorradorContacto,
} from "./contacto-campos";

/**
 * Los contactos que se crean JUNTO CON la empresa.
 *
 * Willy, 01/09: *«recuerda que puede tener uno o varios contactos, entonces
 * esos datos se guardan con la empresa; falta un botón que guarde y añada más
 * contactos»*. Hasta ahora el alta aceptaba UNO, y para el segundo había que
 * guardar la empresa, entrar en su ficha y volver a escribir — justo cuando la
 * persona tiene los tres nombres delante, en el correo que acaba de llegar.
 *
 * ---------------------------------------------------------------------------
 * Por qué en memoria y no guardando de uno en uno
 * ---------------------------------------------------------------------------
 * Porque el cliente todavía no existe: `cliente_contactos.cliente_id` es NOT
 * NULL con clave foránea. La alternativa sería crear la empresa al vuelo con
 * el primer contacto, y entonces cancelar el alta dejaría un cliente a medias
 * en el maestro. Se acumulan aquí y viajan dentro del mismo payload; el
 * servidor los inserta después de crear la ficha.
 *
 * En la EDICIÓN no se usa: allí manda `EditorContactos`, que sí guarda contra
 * el servidor contacto a contacto.
 */

export interface ContactoNuevo extends BorradorContacto {
  /** Identidad en la lista mientras no exista fila en la base. */
  clave: string;
  /** A quién se dirige la cotización si nadie elige. Uno como mucho. */
  principal: boolean;
}

export function ContactosNuevos({
  lista,
  onCambio,
}: {
  lista: ContactoNuevo[];
  onCambio: (lista: ContactoNuevo[]) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [editando, setEditando] = React.useState<string | null>(null);
  const [borrador, setBorrador] = React.useState<BorradorContacto>(CONTACTO_VACIO);
  const [error, setError] = React.useState<string | null>(null);
  const refNombre = React.useRef<HTMLInputElement>(null);

  const cerrar = () => {
    setAbierto(false);
    setEditando(null);
    setBorrador(CONTACTO_VACIO);
    setError(null);
  };

  const abrirNuevo = () => {
    setEditando(null);
    setBorrador(CONTACTO_VACIO);
    setError(null);
    setAbierto(true);
  };

  const abrirEdicion = (c: ContactoNuevo) => {
    setEditando(c.clave);
    setBorrador({ ...c });
    setError(null);
    setAbierto(true);
  };

  /**
   * Mete el borrador en la lista. Devuelve si pudo.
   *
   * El nombre repetido se corta AQUÍ y no en el servidor a propósito: allí lo
   * pararía `ux_cliente_contactos_nombre` con un 23505, después de que la
   * empresa ya se creó, y el segundo contacto se perdería sin que nadie se
   * enterase.
   */
  const meter = (): boolean => {
    const nombre = borrador.nombre.trim();
    if (nombre === "") {
      setError("Escribe al menos el nombre.");
      return false;
    }
    const repetido = lista.some(
      (c) => c.clave !== editando && mismoNombre(c.nombre, nombre),
    );
    if (repetido) {
      setError(`Ya añadiste a «${nombre}» a esta empresa.`);
      return false;
    }

    const limpio: BorradorContacto = {
      nombre,
      cargo: borrador.cargo.trim(),
      area: borrador.area.trim(),
      email: borrador.email.trim(),
      telefono: borrador.telefono.trim(),
      whatsapp: borrador.whatsapp.trim(),
    };

    if (editando) {
      onCambio(lista.map((c) => (c.clave === editando ? { ...c, ...limpio } : c)));
    } else {
      onCambio([
        ...lista,
        {
          ...limpio,
          clave: crypto.randomUUID(),
          // El primero es el principal sin preguntar: si solo hay uno, es a él
          // a quien van las cotizaciones, y obligar a marcarlo sería un clic
          // para confirmar lo evidente.
          principal: lista.length === 0,
        },
      ]);
    }
    setError(null);
    return true;
  };

  const guardarYCerrar = () => {
    if (meter()) cerrar();
  };

  /** El botón que pidió Willy: deja el bloque abierto y en blanco para el siguiente. */
  const guardarYSeguir = () => {
    if (!meter()) return;
    setEditando(null);
    setBorrador(CONTACTO_VACIO);
    // El cursor vuelve al nombre. Sin esto hay que ir a buscarlo con el ratón
    // entre seis campos, que es la mitad de lo que cuesta escribir el contacto.
    refNombre.current?.focus();
  };

  const quitar = (clave: string) => {
    const resto = lista.filter((c) => c.clave !== clave);
    // Si se fue el principal, hereda el primero que quede: una empresa con
    // contactos y sin principal haría que la cotización saliera sin nombre.
    const huerfanos = resto.length > 0 && !resto.some((c) => c.principal);
    onCambio(huerfanos ? resto.map((c, i) => ({ ...c, principal: i === 0 })) : resto);
    if (editando === clave) cerrar();
  };

  const hacerPrincipal = (clave: string) => {
    onCambio(lista.map((c) => ({ ...c, principal: c.clave === clave })));
  };

  return (
    <section className="card flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">¿Con quién hablas ahí?</h2>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            Las personas de esta empresa a las que se les cotiza. Pueden ser
            varias: el de compras, el de logística, el de mantenimiento. Se
            guardan junto con la empresa.
          </p>
        </div>
        {!abierto ? (
          <Button type="button" variant="outline" className="h-11 md:h-control-md" onClick={abrirNuevo}>
            <Plus aria-hidden="true" />
            {lista.length === 0 ? "Añadir contacto" : "Añadir otro"}
          </Button>
        ) : null}
      </div>

      {lista.length > 0 ? (
        <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
          {lista.map((c) => (
            <FilaContacto
              key={c.clave}
              contacto={c}
              principal={c.principal}
              acciones={
                <>
                  {!c.principal ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10"
                      onClick={() => hacerPrincipal(c.clave)}
                    >
                      <Star aria-hidden="true" />
                      Hacer principal
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10"
                    onClick={() => abrirEdicion(c)}
                  >
                    Corregir
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10"
                    onClick={() => quitar(c.clave)}
                  >
                    <Trash2 aria-hidden="true" />
                    Quitar
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
            {editando ? "Corregir el contacto" : `Contacto ${lista.length + 1}`}
          </p>

          <CamposContacto
            idPrefijo="contacto-nuevo"
            valor={borrador}
            onCambio={setBorrador}
            errorNombre={error ?? undefined}
            refNombre={refNombre}
            autoFocus
          />

          {/* Los tres botones a tamaño completo y con texto. El de «añadir
              otro» va primero porque es el que se repite: escribir tres
              contactos son tres pulsaciones ahí y una en «Listo». */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="h-11 md:h-control-md"
              onClick={cerrar}
            >
              <X aria-hidden="true" />
              Cancelar
            </Button>
            {!editando ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 md:h-control-md"
                onClick={guardarYSeguir}
              >
                <Plus aria-hidden="true" />
                Guardar y añadir otro
              </Button>
            ) : null}
            <Button type="button" className="h-11 md:h-control-md" onClick={guardarYCerrar}>
              <Check aria-hidden="true" />
              {editando ? "Guardar cambios" : "Listo"}
            </Button>
          </div>
        </div>
      ) : null}

      {lista.length === 0 && !abierto ? (
        <p className="rounded-md border border-dashed border-[var(--border)] px-4 py-5 text-center text-sm text-[var(--fg-muted)]">
          Todavía no hay ninguno. Se puede guardar la empresa sin contactos y
          añadirlos después.
        </p>
      ) : null}

      {lista.length > 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">
          {lista.length === 1
            ? "1 contacto se guardará con la empresa."
            : `${lista.length} contactos se guardarán con la empresa.`}
        </p>
      ) : null}
    </section>
  );
}
