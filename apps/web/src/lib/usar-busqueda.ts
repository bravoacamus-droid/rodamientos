"use client";

// Cliente: es un hook con estado y temporizadores.

import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  estadoInicialBusqueda,
  reducirBusqueda,
  valeLaPenaBuscar,
  type RespuestaBusqueda,
} from "./busqueda";

/**
 * Una caja que consulta al servidor mientras se teclea, hecha bien.
 *
 * Envuelve el reducer de `busqueda.ts`, que es donde vive —y donde se prueba—
 * la parte delicada: que una respuesta tardía no pise a una nueva. Ver ahí el
 * porqué; aquí solo van los cables de React.
 *
 * Lo usan los cuatro constructores: cotizaciones (productos y clientes),
 * compras y recepciones. Antes cada uno tenía su copia y ninguna descartaba
 * las respuestas tardías.
 */
export function useBusqueda<T>({
  termino,
  buscar,
  minimo = 2,
  esperaMs = 250,
}: {
  termino: string;
  /**
   * La consulta. Tiene que ser ESTABLE entre renders —una Server Action lo es;
   * una función anónima creada en el render NO— o el efecto se relanza solo.
   */
  buscar: (termino: string) => Promise<RespuestaBusqueda<T>>;
  minimo?: number;
  esperaMs?: number;
}) {
  const [estado, despachar] = useReducer(reducirBusqueda<T>, undefined, estadoInicialBusqueda<T>);

  // EL contador, y solo este. Vive en un ref y no en el estado porque el
  // efecto necesita leerlo sin convertirlo en dependencia suya: si lo fuera,
  // cada respuesta relanzaría una consulta y la caja no pararía nunca.
  const peticion = useRef(0);
  const siguiente = () => (peticion.current += 1);

  useEffect(() => {
    const q = termino.trim();
    if (!valeLaPenaBuscar(q, minimo)) {
      despachar({ tipo: "limpiar", peticion: siguiente() });
      return;
    }

    // Se espera a que deje de teclear: sin esto, «6205-2RS1/C3» son doce
    // consultas y once se tiran.
    const t = setTimeout(() => {
      const mia = siguiente();
      despachar({ tipo: "lanzar", peticion: mia });
      void buscar(q)
        .then((respuesta) => despachar({ tipo: "responder", peticion: mia, respuesta }))
        .catch((e: unknown) =>
          despachar({
            tipo: "responder",
            peticion: mia,
            respuesta: {
              ok: false,
              error: e instanceof Error ? e.message : "No se pudo consultar.",
            },
          }),
        );
    }, esperaMs);

    return () => clearTimeout(t);
  }, [termino, buscar, minimo, esperaMs]);

  /** Para vaciar la lista al elegir, sin esperar a que el efecto se entere. */
  const limpiar = useCallback(() => {
    despachar({ tipo: "limpiar", peticion: (peticion.current += 1) });
  }, []);

  return {
    /** `null` = todavía no se ha buscado. `[]` = se buscó y no hay. */
    resultados: estado.resultados,
    error: estado.error,
    buscando: estado.buscando,
    limpiar,
  };
}
