"use client";

// Cliente: son campos controlados. Sin estado propio —lo lleva quien los usa—,
// pero necesitan `onChange`, así que no pueden renderizarse en el servidor.

import * as React from "react";
import { Badge, Campo, Input } from "@rodatech/ui";
import { Star } from "lucide-react";

/**
 * Los seis campos de un contacto, en un solo sitio.
 *
 * Existen aquí porque se escriben en TRES pantallas distintas —el alta de
 * cliente, la ficha del cliente y el alta rápida desde una cotización— y hasta
 * hoy estaban copiados en cada una. Con tres copias, la lista de cargos que
 * propone el desplegable ya empezaba a no coincidir entre ellas.
 *
 * No guardan nada: quien los usa decide si eso va a la base ahora (la ficha) o
 * junto con la empresa al pulsar «Crear cliente» (el alta).
 */

/** Un contacto a medio escribir. Todo texto: viene de inputs. */
export interface BorradorContacto {
  nombre: string;
  cargo: string;
  area: string;
  email: string;
  telefono: string;
  whatsapp: string;
}

export const CONTACTO_VACIO: BorradorContacto = {
  nombre: "",
  cargo: "",
  area: "",
  email: "",
  telefono: "",
  whatsapp: "",
};

/**
 * 44 px de alto en móvil, la altura de control del ERP a partir de `md`.
 *
 * Los 38 px de `h-control-md` están bien con ratón. En el almacén se opera con
 * el pulgar, y ahí 38 px se falla.
 */
export const ALTO_TACTIL = "h-11 md:h-control-md";

/** Los cargos y áreas que nombró Willy. Sugerencias, no una lista cerrada. */
const CARGOS = ["Jefe de compras", "Asistente de logística", "Jefe de mantenimiento", "Gerente"];
const AREAS = ["Compras", "Logística", "Mantenimiento", "Almacén", "Gerencia"];

export function CamposContacto({
  idPrefijo,
  valor,
  onCambio,
  errorNombre,
  autoFocus,
  refNombre,
}: {
  /** Prefijo de los `id`, para que dos formularios en la misma página no choquen. */
  idPrefijo: string;
  valor: BorradorContacto;
  onCambio: (v: BorradorContacto) => void;
  errorNombre?: string;
  autoFocus?: boolean;
  /** Para devolver el cursor al nombre después de «Guardar y añadir otro». */
  refNombre?: React.Ref<HTMLInputElement>;
}) {
  const set = (k: keyof BorradorContacto, v: string) => onCambio({ ...valor, [k]: v });
  const id = (k: string) => `${idPrefijo}-${k}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Nombre y cargo son lo que de verdad se sabe cuando llaman por
          teléfono. Van arriba y a media pantalla cada uno. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={id("nombre")} label="Nombre" requerido error={errorNombre}>
          <Input
            id={id("nombre")}
            ref={refNombre}
            className={ALTO_TACTIL}
            value={valor.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            aria-invalid={errorNombre ? true : undefined}
            aria-describedby={errorNombre ? `${id("nombre")}-error` : undefined}
            placeholder="Juan Pérez"
            autoComplete="off"
            autoFocus={autoFocus}
          />
        </Campo>

        <Campo id={id("cargo")} label="Cargo">
          <Input
            id={id("cargo")}
            className={ALTO_TACTIL}
            value={valor.cargo}
            onChange={(e) => set("cargo", e.target.value)}
            list={`${idPrefijo}-cargos`}
            placeholder="Jefe de compras"
            autoComplete="off"
          />
          <datalist id={`${idPrefijo}-cargos`}>
            {CARGOS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Campo>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo id={id("area")} label="Área">
          <Input
            id={id("area")}
            className={ALTO_TACTIL}
            value={valor.area}
            onChange={(e) => set("area", e.target.value)}
            list={`${idPrefijo}-areas`}
            placeholder="Compras"
            autoComplete="off"
          />
          <datalist id={`${idPrefijo}-areas`}>
            {AREAS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Campo>

        <Campo id={id("email")} label="Su correo">
          <Input
            id={id("email")}
            type="email"
            inputMode="email"
            className={ALTO_TACTIL}
            value={valor.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="jperez@empresa.com"
            autoComplete="off"
          />
        </Campo>

        <Campo id={id("telefono")} label="Su teléfono">
          <Input
            id={id("telefono")}
            type="tel"
            inputMode="tel"
            className={ALTO_TACTIL}
            value={valor.telefono}
            onChange={(e) => set("telefono", e.target.value)}
            autoComplete="off"
          />
        </Campo>

        <Campo id={id("whatsapp")} label="Su WhatsApp">
          <Input
            id={id("whatsapp")}
            type="tel"
            inputMode="tel"
            className={ALTO_TACTIL}
            value={valor.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
            placeholder="9XX XXX XXX"
            autoComplete="off"
          />
        </Campo>
      </div>
    </div>
  );
}

/**
 * Una persona en la lista.
 *
 * Los botones los pone quien la usa —en la ficha guardan contra el servidor,
 * en el alta solo tocan memoria— pero la fila se ve igual en los dos sitios,
 * que es de lo que se trata.
 *
 * El texto va en `text-sm` y no en `text-xs`. Willy no ve bien de cerca y lo
 * dijo él: los 12 px de la línea secundaria eran ilegibles para él.
 */
export function FilaContacto({
  contacto,
  principal,
  acciones,
}: {
  contacto: BorradorContacto;
  principal: boolean;
  acciones: React.ReactNode;
}) {
  const detalle = [contacto.cargo, contacto.area, contacto.email, contacto.telefono].filter(
    (x) => x && x.trim() !== "",
  );

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
          <span className="truncate">{contacto.nombre}</span>
          {principal ? (
            <Badge tone="brand" size="xs">
              <Star aria-hidden="true" className="size-3" />
              Principal
            </Badge>
          ) : null}
        </p>
        {detalle.length > 0 ? (
          <p className="mt-1 text-sm text-[var(--fg-muted)]">{detalle.join(" · ")}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>
    </li>
  );
}
