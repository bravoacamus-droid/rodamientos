"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filtros que viven en la URL, sin perder el cambio anterior (07/10).
 *
 * Las barras de filtros leían `useSearchParams()` para armar la siguiente URL.
 * Pero esa lectura no cambia hasta que la página nueva TERMINA de cargar —un
 * reporte tarda uno o dos segundos—, así que al poner «Desde» y enseguida
 * «Hasta», el segundo cambio partía de la URL vieja y borraba el primero.
 * Visto el 07/10 probando que el Excel siguiera a los filtros: se descargaba
 * con el «Desde» de antes.
 *
 * La última URL pedida se guarda aquí, a nivel de módulo y no en cada
 * componente: en los reportes las fechas y el cliente son dos componentes, y
 * con una memoria cada uno, elegir el cliente borraba las fechas recién
 * puestas. Se olvida en cuanto la URL la alcanza, o al cambiar de pantalla.
 *
 * Y se olvida en un efecto, nunca al pintar: escribir en un buscador
 * interrumpe la carga de la página pedida, React tira ese render a medias, y
 * si ese render ya había borrado la memoria, el buscador partía de la URL
 * vieja. Pasó en cotizaciones con «Mes pasado» y enseguida una búsqueda.
 */
let pedida: { ruta: string; q: string; antes: Set<string> } | null = null;

/** Lo que hay que tomar como URL: lo pedido mientras no llegue. Sin efectos. */
function baseDe(ruta: string, actual: string): string {
  return pedida && pedida.ruta === ruta ? pedida.q : actual;
}

/**
 * Tras pintar con la URL nueva se olvida lo pedido si ya llegó, si es otra
 * pantalla, o si la URL es una que nadie pidió desde aquí (el botón «atrás»).
 * Si es una de las pedidas antes, se sigue esperando a la última.
 */
function useOlvidarAlLlegar(ruta: string, actual: string) {
  React.useEffect(() => {
    if (!pedida) return;
    if (pedida.ruta !== ruta || pedida.q === actual || !pedida.antes.has(actual)) pedida = null;
  }, [ruta, actual]);
}

function pedir(ruta: string, q: string, desde: string) {
  const antes = pedida && pedida.ruta === ruta ? pedida.antes : new Set<string>();
  antes.add(desde);
  if (pedida && pedida.ruta === ruta) antes.add(pedida.q);
  pedida = { ruta, q, antes };
}

export function useFiltrosUrl() {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [, iniciar] = React.useTransition();
  // Solo para volver a pintar con lo pedido; el dato vive en `pedida`.
  const [, setVersion] = React.useState(0);

  useOlvidarAlLlegar(ruta, params.toString());
  const base = baseDe(ruta, params.toString());
  const actual = React.useRef(params.toString());
  actual.current = params.toString();

  const aplicar = React.useCallback(
    (cambios: Record<string, string | null>, borrar: readonly string[] = []) => {
      const s = new URLSearchParams(baseDe(ruta, actual.current));
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor) s.set(clave, valor);
        else s.delete(clave);
      }
      for (const clave of borrar) s.delete(clave);
      const q = s.toString();
      pedir(ruta, q, actual.current);
      setVersion((v) => v + 1);
      iniciar(() => router.replace(q ? `${ruta}?${q}` : ruta, { scroll: false }));
    },
    [ruta, router],
  );

  const valores = React.useMemo(() => new URLSearchParams(base), [base]);
  return { valores, aplicar, pendiente: base !== params.toString() };
}

/**
 * La misma idea para las barras de filtros que ya armaban la URL a mano.
 *
 * Devuelve un ref con los parámetros que la barra debe tomar como base, y
 * quien aplica un filtro le escribe lo que acaba de pedir. El ref lee y
 * escribe la misma memoria que `useFiltrosUrl`, así que las dos clases de
 * barra se respetan entre sí en la misma pantalla.
 */
export function useParamsVigentes() {
  const ruta = usePathname();
  const params = useSearchParams();
  const actual = params.toString();
  useOlvidarAlLlegar(ruta, actual);
  return React.useMemo(
    () => ({
      get current(): URLSearchParams {
        // Los de React y no `window.location`: Next cambia la barra de
        // direcciones DESPUÉS de pintar, y leerla ahí daba la URL de antes.
        return new URLSearchParams(baseDe(ruta, actual));
      },
      set current(s: URLSearchParams) {
        pedir(ruta, s.toString(), actual);
      },
    }),
    [ruta, actual],
  );
}
