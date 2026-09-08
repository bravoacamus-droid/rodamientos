import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "./errores";

/**
 * Cuántas cosas esperan en cada sitio, para el contador del menú.
 *
 * ---------------------------------------------------------------------------
 * Por qué solo dos
 * ---------------------------------------------------------------------------
 * Un contador en cada entrada del menú no informa: cuando todo lleva número,
 * ninguno destaca y se dejan de mirar. Van los dos sitios donde algo espera
 * una acción y donde el número se puede contar **de verdad y barato**:
 *
 *   · **Cotizaciones enviadas** — mandadas y sin respuesta. Es a quién hay que
 *     llamar; una que se enfría es una venta perdida en silencio.
 *   · **Alertas sin leer** — lo que el sistema ya detectó y nadie ha mirado.
 *
 * «Listos para entregar» y «Por comprar» se quedaron FUERA a propósito, y no
 * por pereza: no salen de una vista. Se calculan repartiendo el stock entre
 * los pedidos que lo esperan (`repartirStock`, en el dominio de compras), y
 * eso es una consulta pesada más el reparto entero. El menú se pinta en CADA
 * navegación: pagar eso por dos números sería cambiar velocidad en todas las
 * pantallas por una cifra en dos.
 *
 * Facturación y Cobranzas tampoco: sus números viven en el tablero, con el
 * importe al lado. «3» sin saber si son 3 mil o 30 mil no ayuda a decidir por
 * dónde empezar.
 *
 * ---------------------------------------------------------------------------
 * Nunca rompe el menú
 * ---------------------------------------------------------------------------
 * Cae a cero si algo falla. El menú es la forma de moverse por el ERP: dejarlo
 * sin pintar porque una cuenta falló sería cambiar un número que falta por una
 * aplicación que no se puede usar.
 */

export interface PendientesDelMenu {
  /** Cotizaciones mandadas y sin respuesta del cliente. */
  "/cotizaciones": number;
  /** Alertas que nadie ha abierto. */
  "/alertas": number;
}

const VACIO: PendientesDelMenu = { "/cotizaciones": 0, "/alertas": 0 };

/** Un número que siempre es un número, venga lo que venga. */
const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) && x > 0 ? Math.trunc(x) : 0;
};

export async function pendientesDelMenu(): Promise<PendientesDelMenu> {
  try {
    const supabase = await clienteServidor();

    const [cotizaciones, alertas] = await Promise.all([
      // `head: true`: solo se quiere el número, no las filas.
      supabase
        .from("cotizaciones")
        .select("id", { count: "exact", head: true })
        .eq("estado", "enviada"),
      supabase.from("v_resumen_alertas").select("sin_leer").maybeSingle(),
    ]);

    return {
      "/cotizaciones": n(cotizaciones.count),
      "/alertas": n(alertas.data?.sin_leer),
    };
  } catch (e) {
    fallo(e, "lib/pendientesDelMenu");
    return VACIO;
  }
}
