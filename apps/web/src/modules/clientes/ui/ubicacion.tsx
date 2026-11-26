"use client";

import * as React from "react";

import { SelectorCatalogo, type OpcionCatalogo } from "@/modules/cotizaciones/ui/constructor/selector-catalogo";

import {
  crearSubzona,
  crearZona,
  eliminarSubzona,
  eliminarZona,
  renombrarSubzona,
  renombrarZona,
} from "../acciones/rubros";
import type { SubzonaCliente, ZonaCliente } from "../dominio/tipos";

/**
 * El DISTRITO y la ZONA, en un solo par de selectores (205, 26/11).
 *
 * Luis, con el directorio de Willy delante: *«tiene que ser un CRUD
 * inteligente ese select, ya que van a registrar así: no escribe a cada rato,
 * busca y ya»*. Así que los dos se buscan escribiendo, crean lo que no está y
 * se corrigen o borran desde el mismo desplegable (el patrón de la 142).
 *
 * Y «inteligente» quiere decir dos cosas más:
 *   · Con un distrito elegido, la zona propone primero las de ese distrito
 *     (en SJL: celima, no cajamarquilla).
 *   · Al elegir una zona que ya sabe su distrito, el distrito se pone solo.
 *     Y una zona creada con un distrito elegido queda enlazada a él.
 *
 * Las listas viven en un contexto y no en cada selector: el cliente y cada
 * uno de sus contactos usan los mismos catálogos, y lo que se crea en un
 * contacto tiene que aparecer en el siguiente sin recargar.
 */

interface ContextoUbicacion {
  zonas: ZonaCliente[];
  subzonas: SubzonaCliente[];
  crearDistrito: (nombre: string) => Promise<ZonaCliente | null>;
  renombrarDistrito: (id: string, nombre: string) => Promise<ZonaCliente | null>;
  eliminarDistrito: (id: string) => Promise<boolean>;
  crearZonaEn: (nombre: string, distrito: string | null) => Promise<SubzonaCliente | null>;
  renombrarZonaDe: (id: string, nombre: string) => Promise<SubzonaCliente | null>;
  eliminarZonaDe: (id: string) => Promise<boolean>;
  error: string | null;
}

const Contexto = React.createContext<ContextoUbicacion | null>(null);

/** Los catálogos, o null fuera del formulario del cliente (el alta rápida de la cotización). */
export function useUbicacion(): ContextoUbicacion | null {
  return React.useContext(Contexto);
}

const porNombre = <T extends { nombre: string }>(xs: T[]) =>
  [...xs].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

export function ProveedorUbicacion({
  zonas: zonasIniciales,
  subzonas: subzonasIniciales,
  children,
}: {
  zonas: ZonaCliente[];
  subzonas: SubzonaCliente[];
  children: React.ReactNode;
}) {
  const [zonas, setZonas] = React.useState(zonasIniciales);
  const [subzonas, setSubzonas] = React.useState(subzonasIniciales);
  const [error, setError] = React.useState<string | null>(null);

  const valor = React.useMemo<ContextoUbicacion>(
    () => ({
      zonas,
      subzonas,
      error,
      crearDistrito: async (nombre) => {
        const r = await crearZona(nombre);
        if (!r.ok) return (setError(r.error), null);
        setError(null);
        setZonas((l) => (l.some((x) => x.id === r.datos.id) ? l : porNombre([...l, r.datos])));
        return r.datos;
      },
      renombrarDistrito: async (id, nombre) => {
        const r = await renombrarZona(id, nombre);
        if (!r.ok) return (setError(r.error), null);
        setError(null);
        setZonas((l) => porNombre(l.map((x) => (x.id === id ? r.datos : x))));
        return r.datos;
      },
      eliminarDistrito: async (id) => {
        const r = await eliminarZona(id);
        if (!r.ok) return (setError(r.error), false);
        setError(null);
        setZonas((l) => l.filter((x) => x.id !== id));
        return true;
      },
      crearZonaEn: async (nombre, distrito) => {
        const r = await crearSubzona(nombre, distrito);
        if (!r.ok) return (setError(r.error), null);
        setError(null);
        setSubzonas((l) => porNombre([...l.filter((x) => x.id !== r.datos.id), r.datos]));
        return r.datos;
      },
      renombrarZonaDe: async (id, nombre) => {
        const r = await renombrarSubzona(id, nombre);
        if (!r.ok) return (setError(r.error), null);
        setError(null);
        setSubzonas((l) => porNombre(l.map((x) => (x.id === id ? r.datos : x))));
        return r.datos;
      },
      eliminarZonaDe: async (id) => {
        const r = await eliminarSubzona(id);
        if (!r.ok) return (setError(r.error), false);
        setError(null);
        setSubzonas((l) => l.filter((x) => x.id !== id));
        return true;
      },
    }),
    [zonas, subzonas, error],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** «SJL · celima», o lo que haya. Para la fila de un contacto. */
export function nombreUbicacion(
  ctx: ContextoUbicacion | null,
  distrito: string | null | undefined,
  zona: string | null | undefined,
): string | null {
  if (!ctx) return null;
  const d = distrito ? ctx.zonas.find((z) => z.id === distrito)?.nombre : null;
  const z = zona ? ctx.subzonas.find((s) => s.id === zona)?.nombre : null;
  const partes = [d, z].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/**
 * Los dos selectores, lado a lado. Fuera de `ProveedorUbicacion` no pinta
 * nada: el alta rápida desde la cotización no carga los catálogos, y allí el
 * contacto conserva lo que tuviera (la acción no toca lo que no llega).
 */
export function SelectorDistritoZona({
  idPrefijo,
  distrito,
  zona,
  onCambio,
  ayudaDistrito,
  ayudaZona,
}: {
  idPrefijo: string;
  distrito: string;
  zona: string;
  onCambio: (distrito: string, zona: string) => void;
  ayudaDistrito?: string;
  ayudaZona?: string;
}) {
  const ctx = useUbicacion();
  if (!ctx) return null;

  // Con distrito: las suyas primero, luego las que no saben su distrito, y el
  // resto al final —una planta puede estar en el límite, y no se esconde—.
  const opcionesZona: OpcionCatalogo[] = distrito
    ? [
        ...ctx.subzonas.filter((s) => s.zona_id === distrito),
        ...ctx.subzonas.filter((s) => s.zona_id === null),
        ...ctx.subzonas.filter((s) => s.zona_id !== null && s.zona_id !== distrito),
      ]
    : ctx.subzonas;

  return (
    <>
      <SelectorCatalogo
        id={`${idPrefijo}-distrito`}
        label="Distrito"
        masculino
        ayuda={ayudaDistrito}
        opciones={ctx.zonas}
        valor={distrito}
        onElegir={(o) => {
          const nuevo = o?.id ?? "";
          // Si la zona elegida es de OTRO distrito, ya no cuadra: se suelta.
          const z = ctx.subzonas.find((s) => s.id === zona);
          const sigue = !z || !z.zona_id || z.zona_id === nuevo;
          onCambio(nuevo, sigue ? zona : "");
        }}
        placeholder="Busca: SJL, Ate, Callao…"
        // El selector elige la nueva él solo (onElegir) al crearla.
        onCrear={ctx.crearDistrito}
        onRenombrar={ctx.renombrarDistrito}
        onEliminar={ctx.eliminarDistrito}
      />
      <SelectorCatalogo
        id={`${idPrefijo}-zona`}
        label="Zona"
        ayuda={ayudaZona}
        opciones={opcionesZona}
        valor={zona}
        onElegir={(o) => {
          const z = o ? ctx.subzonas.find((s) => s.id === o.id) : null;
          // La zona sabe su distrito: si no había uno, se pone solo.
          onCambio(distrito || z?.zona_id || "", o?.id ?? "");
        }}
        placeholder="Busca: celima, cajamarquilla…"
        onCrear={(n) => ctx.crearZonaEn(n, distrito || null)}
        onRenombrar={ctx.renombrarZonaDe}
        onEliminar={ctx.eliminarZonaDe}
      />
    </>
  );
}

/** El mensaje del último fallo de los catálogos (nombre repetido, en uso…). */
export function ErrorUbicacion() {
  const ctx = useUbicacion();
  if (!ctx?.error) return null;
  return <p className="text-sm font-medium text-[var(--danger)]">{ctx.error}</p>;
}
