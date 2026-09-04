import {
  diasEntre,
  repartirStock,
  urgenciaDe,
  type LineaComprometida,
  type LineaRepartida,
  type Urgencia,
} from "./por-comprar";

/**
 * El camino de vuelta al cliente.
 *
 * ---------------------------------------------------------------------------
 * El eslabón que faltaba
 * ---------------------------------------------------------------------------
 * La cadena llegaba hasta el almacén y ahí se paraba: cotización → pedido →
 * bandeja → precios → compra → recepción → stock. Y entonces nadie avisaba a
 * nadie. El ERP sabía que ahora hay veinte 6205 en el estante; no decía que
 * esos veinte eran para el pedido de INDUSTRIAL TECHNOLOGY, que lleva desde el
 * día 20 esperándolos y que ya se le puede facturar.
 *
 * Eso vivía en la cabeza de Willy, que es justo lo que este ERP viene a
 * sacarle de ahí.
 *
 * ---------------------------------------------------------------------------
 * Las dos preguntas, y por qué son la misma cuenta
 * ---------------------------------------------------------------------------
 * 1. **¿A quién puedo entregarle ya?** — `pedidosListos`.
 * 2. **Esto que compré, ¿para quién es y alcanza?** — `quienEspera`.
 *
 * Las dos salen de repartir el stock que hay entre los pedidos que lo esperan,
 * y ese reparto es el MISMO que usa la bandeja «Por comprar» —`repartirStock`,
 * importado de ahí y no reescrito—. Si cada pantalla repartiera por su lado,
 * una podría decir que sobra mientras la otra dice que falta, las dos con la
 * misma base delante y sin que nada fallara.
 *
 * **Mientras `stock.reservado` siga sin escribirlo nadie** (§G.2, pendiente de
 * que Willy conteste si confirmar un pedido aparta la mercadería), el orden de
 * confirmación es lo único que decide quién se queda con las unidades. Por eso
 * esta pantalla dice «lo esperan» y nunca «es suyo»: lo primero es un hecho,
 * lo segundo sería una decisión que nadie ha tomado.
 */

/** Un pedido al que ya se le puede entregar algo. */
export interface PedidoListo {
  cotizacion_id: string;
  cotizacion: string;
  cliente_id: string;
  cliente: string;
  /** La de la cotización. Es el reloj de la espera. */
  fecha: string;
  /** Líneas suyas que siguen sin entregar. */
  lineas: number;
  /** De esas, las que el almacén ya cubre enteras. */
  cubiertas: number;
  /** Unidades que se pueden sacar hoy del almacén para este pedido. */
  unidades: number;
  /**
   * Y de cuántas en total.
   *
   * Va junto a la anterior porque «1 unidad» sola no dice nada: 1 de 1 es un
   * pedido resuelto y 1 de 300 es un cliente que sigue esperando casi todo.
   */
  pendientes: number;
  /**
   * `completo` — se puede cerrar el pedido entero.
   * `parcial`  — hay algo que entregar, pero no todo. Se factura por partes
   *              desde la 047, así que también sirve.
   */
  estado: "completo" | "parcial";
  /** El día prometido más antiguo entre sus líneas pendientes. */
  prometida: string;
  dias: number;
  urgencia: Urgencia;
}

/**
 * A quién se le puede entregar ya, del más antiguo al más nuevo.
 *
 * Los completos van primero: cerrar un pedido entero libera al cliente, al
 * almacén y a la cobranza de una vez, y un parcial deja las tres cosas a
 * medias. Dentro de cada grupo manda quien lleva más tiempo esperando.
 *
 * Un pedido sin NADA cubierto no sale: ese sigue siendo trabajo de compras y ya
 * tiene su sitio en la bandeja. Aquí solo entra lo que se puede mover hoy.
 */
export function pedidosListos(
  lineas: readonly LineaComprometida[],
  hoy: string,
  sumar: (fecha: string, dias: number) => string,
): PedidoListo[] {
  const repartido = repartirStock(lineas, hoy, sumar);

  const porPedido = new Map<string, LineaRepartida[]>();
  for (const delProducto of repartido.values()) {
    for (const l of delProducto) {
      const previas = porPedido.get(l.cotizacion_id);
      if (previas) previas.push(l);
      else porPedido.set(l.cotizacion_id, [l]);
    }
  }

  const salida: PedidoListo[] = [];

  for (const [cotizacion_id, suyas] of porPedido) {
    const cabecera = suyas[0];
    if (!cabecera) continue;

    const cubiertas = suyas.filter((l) => l.descubierto <= 0).length;

    /*
      El corte es «hay algo que sacar del almacén», no «hay una línea entera».

      Un pedido de 10 con 4 en stock no tiene ninguna línea completa, y sin
      embargo esas 4 se pueden entregar y facturar hoy —por partes, desde la
      047—. Cortando por líneas enteras ese pedido no salía en ninguna
      pantalla: ni aquí, porque no tenía ninguna completa, ni resuelto en la
      bandeja, porque seguía faltando. Se quedaba en tierra de nadie.
    */
    const unidades = dos(suyas.reduce((a, l) => a + l.cubierto, 0));
    if (unidades <= 0) continue;

    // La más apretada de las que siguen pendientes. Si está todo cubierto, la
    // referencia es la del pedido entero: lo que importa entonces es cuánto
    // lleva esperando, no qué línea.
    const prometida = suyas.reduce(
      (min, l) => (l.prometida < min ? l.prometida : min),
      "9999-12-31",
    );
    const dias = diasEntre(hoy, prometida);

    salida.push({
      cotizacion_id,
      cotizacion: cabecera.cotizacion,
      cliente_id: cabecera.cliente_id,
      cliente: cabecera.cliente,
      fecha: cabecera.fecha,
      lineas: suyas.length,
      cubiertas,
      unidades,
      pendientes: dos(suyas.reduce((a, l) => a + l.comprometido, 0)),
      estado: cubiertas === suyas.length ? "completo" : "parcial",
      prometida,
      dias,
      urgencia: urgenciaDe(dias),
    });
  }

  return salida.sort(
    (a, b) =>
      (a.estado === b.estado ? 0 : a.estado === "completo" ? -1 : 1) ||
      a.fecha.localeCompare(b.fecha) ||
      a.cotizacion.localeCompare(b.cotizacion),
  );
}

/** Un pedido esperando un producto concreto. */
export interface Esperando {
  cotizacion_id: string;
  cotizacion: string;
  cliente_id: string;
  cliente: string;
  fecha: string;
  /** Lo que le falta de ESTE producto, ya descontado el stock que le tocó. */
  esperando: number;
  prometida: string;
  dias: number;
  urgencia: Urgencia;
}

export interface QuienEsperaProducto {
  producto_id: string;
  pedidos: Esperando[];
  /** Todo lo que se espera de este producto y el almacén no cubre. */
  total: number;
}

/**
 * Esto que estoy comprando, ¿para quién es?
 *
 * Se pregunta con la compra delante, y lo que hace falta saber es dos cosas:
 * a quién le corre prisa, y **si lo que traes alcanza**. Por eso devuelve el
 * total además de la lista: una compra de 30 para 35 unidades esperadas es una
 * compra que deja a alguien fuera, y eso hay que verlo antes de recibirla, no
 * cuando llame el cliente.
 *
 * Solo salen los pedidos con algo DESCUBIERTO. A quien ya se le puede servir
 * del almacén no está esperando esta compra: contarlo aquí haría parecer que
 * la mercadería no alcanza cuando sí alcanza.
 */
export function quienEspera(
  productoIds: readonly string[],
  lineas: readonly LineaComprometida[],
  hoy: string,
  sumar: (fecha: string, dias: number) => string,
): Map<string, QuienEsperaProducto> {
  const repartido = repartirStock(lineas, hoy, sumar);
  const salida = new Map<string, QuienEsperaProducto>();

  for (const producto_id of new Set(productoIds)) {
    const delProducto = (repartido.get(producto_id) ?? []).filter(
      (l) => l.descubierto > 0,
    );
    if (delProducto.length === 0) continue;

    const pedidos: Esperando[] = delProducto
      .map((l) => ({
        cotizacion_id: l.cotizacion_id,
        cotizacion: l.cotizacion,
        cliente_id: l.cliente_id,
        cliente: l.cliente,
        fecha: l.fecha,
        esperando: l.descubierto,
        prometida: l.prometida,
        dias: diasEntre(hoy, l.prometida),
        urgencia: urgenciaDe(diasEntre(hoy, l.prometida)),
      }))
      // Por lo prometido, no por la fecha del pedido: uno de ayer con entrega
      // inmediata aprieta más que uno de hace un mes con quince días de plazo.
      .sort((a, b) => a.prometida.localeCompare(b.prometida));

    salida.set(producto_id, {
      producto_id,
      pedidos,
      total: dos(pedidos.reduce((a, p) => a + p.esperando, 0)),
    });
  }

  return salida;
}

/**
 * ¿Alcanza lo que trae la compra?
 *
 * Tres respuestas y no dos. `nadie` es distinto de `alcanza`: comprar algo que
 * no espera ningún cliente es perfectamente normal —se repone stock— y decir
 * «alcanza» ahí daría a entender que hay alguien a quien avisar.
 */
export type Alcance = "nadie" | "alcanza" | "no_alcanza";

export function alcanzaPara(traes: number, espera: QuienEsperaProducto | undefined): Alcance {
  if (espera === undefined || espera.total <= 0) return "nadie";
  return traes >= espera.total ? "alcanza" : "no_alcanza";
}

/** Dos decimales, los mismos que guardan las columnas `numeric(14,2)`. */
const dos = (n: number): number => Math.round(n * 100) / 100;
