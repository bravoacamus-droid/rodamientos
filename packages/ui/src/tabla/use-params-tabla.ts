"use client";
/*
 * "use client" OBLIGATORIO: usa `useRouter`, `useSearchParams` y
 * `useTransition`. Es la pieza que sincroniza tabla ↔ URL.
 *
 * NOTA para quien lo monte: cualquier componente que use `useSearchParams`
 * tiene que estar dentro de un `<Suspense>` si la ruta se prerenderiza.
 * En el ERP las páginas son dinámicas, así que en la práctica no molesta,
 * pero conviene saberlo.
 */
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { escribirOrden, leerOrden, PARAMS, type Direccion, type OrdenTabla } from "./tipos";

export interface ParamsTabla {
  /** Lee un search param. */
  obtener: (clave: string) => string | null;
  /**
   * Escribe varios search params de una vez. `null` borra la clave.
   * Por defecto REINICIA la paginación: si cambias un filtro y conservas el
   * cursor, el cursor apunta a una fila que quizá ya no está en el resultado.
   */
  fijar: (cambios: Record<string, string | null>, opciones?: { conservarCursor?: boolean }) => void;
  /** Orden actual leído de la URL. */
  orden: OrdenTabla | null;
  /** Alterna asc → desc → sin orden sobre un campo. */
  alternarOrden: (campo: string) => void;
  /** Mueve el cursor de keyset. */
  irACursor: (cursor: string | null, direccion: Direccion) => void;
  /** `true` mientras la navegación está en vuelo: pinta el estado de carga. */
  pendiente: boolean;
  /** Cuántos filtros hay activos, para el botón "limpiar". */
  filtrosActivos: number;
  limpiarFiltros: () => void;
}

/** Claves que no cuentan como "filtro" al contar filtros activos. */
const NO_SON_FILTRO = new Set<string>([PARAMS.cursor, PARAMS.direccion, PARAMS.orden, PARAMS.tamano]);

export function useParamsTabla(): ParamsTabla {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, iniciarTransicion] = React.useTransition();

  const obtener = React.useCallback((clave: string) => searchParams.get(clave), [searchParams]);

  const fijar = React.useCallback<ParamsTabla["fijar"]>(
    (cambios, opciones) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === "") sp.delete(clave);
        else sp.set(clave, valor);
      }
      if (!opciones?.conservarCursor) {
        sp.delete(PARAMS.cursor);
        sp.delete(PARAMS.direccion);
      }
      const consulta = sp.toString();
      // `replace` y no `push`: teclear en un filtro no debe llenar el historial
      // de entradas intermedias. `scroll: false` mantiene la vista donde está.
      iniciarTransicion(() => {
        router.replace(consulta ? `${pathname}?${consulta}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const orden = React.useMemo(() => leerOrden(searchParams.get(PARAMS.orden)), [searchParams]);

  const alternarOrden = React.useCallback(
    (campo: string) => {
      // asc → desc → sin orden. El tercer clic devuelve el orden natural del
      // listado (normalmente fecha de creación), que es lo que espera el
      // operador cuando "deshace" una ordenación.
      if (!orden || orden.campo !== campo) fijar({ [PARAMS.orden]: escribirOrden({ campo, descendente: false }) });
      else if (!orden.descendente) fijar({ [PARAMS.orden]: escribirOrden({ campo, descendente: true }) });
      else fijar({ [PARAMS.orden]: null });
    },
    [fijar, orden],
  );

  const irACursor = React.useCallback(
    (cursor: string | null, direccion: Direccion) => {
      if (!cursor) return;
      fijar({ [PARAMS.cursor]: cursor, [PARAMS.direccion]: direccion }, { conservarCursor: true });
    },
    [fijar],
  );

  const filtrosActivos = React.useMemo(() => {
    let n = 0;
    for (const [clave, valor] of searchParams.entries()) {
      if (!NO_SON_FILTRO.has(clave) && valor) n += 1;
    }
    return n;
  }, [searchParams]);

  const limpiarFiltros = React.useCallback(() => {
    const sp = new URLSearchParams();
    const ordenActual = searchParams.get(PARAMS.orden);
    // El orden es una preferencia de lectura, no un filtro: se conserva.
    if (ordenActual) sp.set(PARAMS.orden, ordenActual);
    const consulta = sp.toString();
    iniciarTransicion(() => {
      router.replace(consulta ? `${pathname}?${consulta}` : pathname, { scroll: false });
    });
  }, [pathname, router, searchParams]);

  return { obtener, fijar, orden, alternarOrden, irACursor, pendiente, filtrosActivos, limpiarFiltros };
}
