"use client";

// Cliente: son campos controlados. Sin estado propio —lo lleva quien los usa—,
// pero necesitan `onChange`, así que no pueden renderizarse en el servidor.

import * as React from "react";
import { Badge, Campo, Input } from "@rodatech/ui";
import { Star } from "lucide-react";

import { InputSugerencias } from "@/componentes/input-sugerencias";

import { ErrorUbicacion, nombreUbicacion, SelectorDistritoZona, useUbicacion } from "./ubicacion";

// Vivía aquí hasta el 21/10; se reexporta para quien ya lo importaba de aquí.
export { InputSugerencias };

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
  /** El celular. Se llamaba «teléfono» y es el que ya estaba lleno. */
  telefono: string;
  whatsapp: string;
  /** 205: el fijo con su anexo, y el distrito y la zona donde trabaja. */
  telefono_fijo: string;
  zona_id: string;
  subzona_id: string;
}

export const CONTACTO_VACIO: BorradorContacto = {
  nombre: "",
  cargo: "",
  area: "",
  email: "",
  telefono: "",
  whatsapp: "",
  telefono_fijo: "",
  zona_id: "",
  subzona_id: "",
};

/** Un contacto guardado, de vuelta a borrador para corregirlo. */
export function aBorrador(c: {
  nombre: string;
  cargo: string | null;
  area: string | null;
  email: string | null;
  telefono: string | null;
  whatsapp: string | null;
  telefono_fijo?: string | null;
  zona_id?: string | null;
  subzona_id?: string | null;
}): BorradorContacto {
  return {
    nombre: c.nombre,
    cargo: c.cargo ?? "",
    area: c.area ?? "",
    email: c.email ?? "",
    telefono: c.telefono ?? "",
    whatsapp: c.whatsapp ?? "",
    telefono_fijo: c.telefono_fijo ?? "",
    zona_id: c.zona_id ?? "",
    subzona_id: c.subzona_id ?? "",
  };
}

/** Lo que viaja a `guardarContacto`, recortado. */
export function cargaContacto(v: BorradorContacto, conUbicacion: boolean) {
  return {
    nombre: v.nombre.trim(),
    cargo: v.cargo.trim(),
    area: v.area.trim(),
    email: v.email.trim(),
    telefono: v.telefono.trim(),
    whatsapp: v.whatsapp.trim(),
    telefono_fijo: v.telefono_fijo.trim(),
    // Sin los selectores en pantalla no se mandan: la acción no toca lo que
    // no llega, y así no se borra la planta de nadie.
    ...(conUbicacion ? { zona_id: v.zona_id, subzona_id: v.subzona_id } : {}),
  };
}

/**
 * 44 px de alto en móvil, la altura de control del ERP a partir de `md`.
 *
 * Los 38 px de `h-control-md` están bien con ratón. En el almacén se opera con
 * el pulgar, y ahí 38 px se falla.
 */
export const ALTO_TACTIL = "h-11 md:h-control-md";

/** Los cargos y áreas que nombró Willy. Sugerencias, no una lista cerrada. */
export const CARGOS = ["Jefe de compras", "Asistente de logística", "Jefe de mantenimiento", "Gerente"];
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
  const ubicacion = useUbicacion();

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
            placeholder="Ej.: Juan Pérez"
            autoComplete="off"
            autoFocus={autoFocus}
          />
        </Campo>

        <Campo id={id("cargo")} label="Cargo">
          <InputSugerencias
            id={id("cargo")}
            className={ALTO_TACTIL}
            valor={valor.cargo}
            onCambio={(v) => set("cargo", v)}
            sugerencias={CARGOS}
            placeholder="Ej.: Jefe de compras"
          />
        </Campo>
      </div>

      {/* Como en el directorio de Willy (205): celular, fijo y correo,
          que es por donde se le llama. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id={id("telefono")} label="Celular">
          <Input
            id={id("telefono")}
            type="tel"
            inputMode="tel"
            className={ALTO_TACTIL}
            value={valor.telefono}
            onChange={(e) => set("telefono", e.target.value)}
            placeholder="9XX XXX XXX"
            autoComplete="off"
          />
        </Campo>

        <Campo id={id("fijo")} label="Fijo y anexo">
          <Input
            id={id("fijo")}
            type="tel"
            className={ALTO_TACTIL}
            value={valor.telefono_fijo}
            onChange={(e) => set("telefono_fijo", e.target.value)}
            placeholder="Ej.: 4595152 - 207"
            autoComplete="off"
          />
        </Campo>

        <Campo id={id("email")} label="Correo">
          <Input
            id={id("email")}
            type="email"
            inputMode="email"
            className={ALTO_TACTIL}
            value={valor.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="Ej.: jperez@empresa.com"
            autoComplete="off"
          />
        </Campo>
      </div>

      {ubicacion ? (
        <div className="flex flex-col gap-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectorDistritoZona
              idPrefijo={id("ubicacion")}
              distrito={valor.zona_id}
              zona={valor.subzona_id}
              onCambio={(d, z) => onCambio({ ...valor, zona_id: d, subzona_id: z })}
              ayudaDistrito="Dónde trabaja. Sale el del cliente; cámbialo si está en otra planta."
            />
          </div>
          <ErrorUbicacion />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={id("area")} label="Área">
          <InputSugerencias
            id={id("area")}
            className={ALTO_TACTIL}
            valor={valor.area}
            onCambio={(v) => set("area", v)}
            sugerencias={AREAS}
            placeholder="Ej.: Compras"
          />
        </Campo>

        <Campo id={id("whatsapp")} label="WhatsApp, si es otro número">
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
 * El texto va en `text-sm` y no en `text-sm`. Willy no ve bien de cerca y lo
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
  // El WhatsApp también, y dicho: se pedía en el alta y luego no salía en la
  // lista, justo el dato «por donde de verdad se les escribe» (revisión por
  // módulos del 02/10).
  const ubicacion = nombreUbicacion(useUbicacion(), contacto.zona_id, contacto.subzona_id);
  const detalle = [
    contacto.cargo,
    contacto.area,
    ubicacion,
    contacto.telefono ? `Cel. ${contacto.telefono}` : null,
    contacto.telefono_fijo ? `Fijo ${contacto.telefono_fijo}` : null,
    contacto.email,
    contacto.whatsapp && contacto.whatsapp.trim() !== "" ? `WhatsApp ${contacto.whatsapp}` : null,
  ].filter((x): x is string => Boolean(x && x.trim() !== ""));

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
          {/* Entero, sin puntos suspensivos: es el dato que se viene a
              buscar, y en el teléfono un nombre de cuatro palabras se cortaba
              a la mitad (revisión por módulos del 02/10). */}
          <span className="min-w-0 [overflow-wrap:anywhere]">{contacto.nombre}</span>
          {principal ? (
            <Badge tone="brand" size="xs">
              <Star aria-hidden="true" className="size-3" />
              Principal
            </Badge>
          ) : null}
        </p>
        {detalle.length > 0 ? (
          // `anywhere`: un correo largo es una sola «palabra» y se salía de
          // la tarjeta por la derecha a 390 px.
          <p className="mt-1 text-sm text-[var(--fg-muted)] [overflow-wrap:anywhere]">
            {detalle.join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>
    </li>
  );
}
