/**
 * Prorrateo de los gastos de importación sobre el costo de cada línea.
 *
 * Réplica EXACTA de lo que hace `recepcionar_mercaderia()` en
 * 004_funciones.sql. No es un adorno de la pantalla: el costo que sale de aquí
 * es el que entra al kardex, y de ahí sale el costo promedio, y de ahí el
 * margen de todo lo que se venda después. Si esta cuenta y la de Postgres se
 * separan, el operador teclea un costo, ve otro y acaba grabado un tercero.
 *
 * Por eso vive en `dominio/`: sin React ni Supabase, y con pruebas que corren
 * en milisegundos contra los mismos números que devolvería la base.
 *
 * El reparto es SIMPLE por valor, no landed cost (§2.11 del plan). Willy
 * compra por DHL, envíos pequeños: *"hacemos compras por DHL, compras
 * pequeñas"* (30:01). No hay DUA, ni FOB, ni ad valorem.
 */

import { redondear2, redondear4, redondear6 } from "@rodatech/config";

/**
 * Los tres redondeos vienen de `@rodatech/config`, el nivel más bajo del
 * monorepo.
 *
 * Estuvieron duplicados aquí a propósito: el barrel de `cotizaciones`, que era
 * el otro sitio donde vivían, reexporta también sus páginas —Server
 * Components con `server-only`—, así que importarlos de ahí desde este
 * archivo, que consume el constructor en el navegador, rompía el build del
 * cliente. Quedó anotado para resolverlo al tercer módulo que los necesitara.
 * Compras fue el tercero, y `@rodatech/config` no arrastra nada.
 *
 * `redondear6` importa más de lo que parece: `v_factor` está declarado
 * `numeric(12,6)` en `recepcionar_mercaderia()`, así que Postgres redondea el
 * factor a 6 decimales ANTES de multiplicar. Calcular con la división en coma
 * flotante completa daría un costo distinto en el último decimal — un
 * descuadre invisible hasta que alguien sume una columna.
 */
export { redondear2, redondear4, redondear6 };

/** Lo mínimo que hace falta de una línea para costearla. */
export interface LineaCosteable {
  cantidad: number;
  costoUnitario: number;
  /** Peso por unidad, en kg (097). Solo cuenta si la compra reparte por kilo. */
  pesoKg?: number;
}

/**
 * Cómo reparte sus gastos la COMPRA enlazada (097).
 *
 * Desde la 094 el reparto no se hace sobre el valor de la entrega sino sobre
 * el de la compra entera, y desde la 097 parte de los gastos va por kilo. Las
 * dos bases salen de la compra, así que se calculan una vez —al cargarla— y
 * esta pantalla solo aplica el resultado a lo que se recibe.
 */
export interface RepartoCompra {
  /** Valor de la compra entera (`v_base`, numeric(14,2)). */
  base: number;
  /** Lo que va por valor. */
  gastosPorValor: number;
  /** $ por kilo (`v_por_kg`, numeric(16,6)). 0 si no se reparte por kilo. */
  porKg: number;
  /** Hay gastos por kilo pero a algún producto le falta el peso: todo por valor. */
  faltaPeso: boolean;
  /** Peso por unidad de cada producto: el de la compra o, si no, el de la ficha. */
  pesos: Record<string, number>;
}

/**
 * Réplica del bloque de gastos de `recepcionar_mercaderia` (097).
 *
 *   · Lo que va por kilo se reparte entre los kilos de la compra, salvo que
 *     a algún producto le falte el peso: entonces TODO va por valor.
 *   · Lo demás, por valor, sobre el valor de la compra entera (094).
 */
export function repartoDeCompra(
  lineas: readonly { producto_id: string; cantidad: number; costo_unitario: number; peso_kg: number }[],
  gastos: readonly { monto: number; reparto: "valor" | "peso" }[],
  totalGastos: number,
): RepartoCompra {
  const pesos: Record<string, number> = {};
  for (const l of lineas) pesos[l.producto_id] = l.peso_kg > 0 ? l.peso_kg : 0;

  let gastoPeso = redondear2(
    gastos.filter((g) => g.reparto === "peso").reduce((a, g) => a + g.monto, 0),
  );
  let porKg = 0;
  let faltaPeso = false;
  if (gastoPeso > 0) {
    const kilos = lineas.reduce((a, l) => a + l.cantidad * (l.peso_kg > 0 ? l.peso_kg : 0), 0);
    faltaPeso = lineas.some((l) => !(l.peso_kg > 0));
    if (faltaPeso || !(kilos > 0)) {
      gastoPeso = 0;
    } else {
      porKg = redondear6(gastoPeso / kilos);
    }
  }

  return {
    base: redondear2(lineas.reduce((a, l) => a + l.cantidad * l.costo_unitario, 0)),
    gastosPorValor: redondear2(totalGastos - gastoPeso),
    porKg,
    faltaPeso,
    pesos,
  };
}

/** Una línea ya costeada, con y sin gastos. */
export interface LineaCosteada {
  cantidad: number;
  /** Lo que tecleó el operador. Es lo que se graba en `recepcion_items`. */
  costoUnitario: number;
  importe: number;
  /** El costo que va a acabar en el kardex, con los gastos ya repartidos. */
  costoFinal: number;
  importeFinal: number;
}

export interface CosteoRecepcion {
  /** Suma de cantidad × costo. Es el divisor del reparto. */
  base: number;
  gastos: number;
  /** 1 cuando no hay gastos que repartir o no hay base sobre la que hacerlo. */
  factor: number;
  lineas: LineaCosteada[];
  /** Total sin gastos. */
  total: number;
  /** Total con los gastos ya dentro. */
  totalFinal: number;
  /** Cuántas unidades entran al almacén. */
  unidades: number;
}

/**
 * Base valorizada de la recepción.
 *
 * `v_base` es `numeric(14,2)` en la función, así que Postgres redondea la suma
 * a dos decimales al asignarla. Se replica el redondeo en el mismo sitio.
 */
export function baseValorizada(lineas: readonly LineaCosteable[]): number {
  return redondear2(
    lineas.reduce((suma, l) => suma + l.cantidad * l.costoUnitario, 0),
  );
}

/**
 * El factor por el que se multiplica cada costo.
 *
 * La función solo lo aplica cuando hay gastos Y hay base: `if v_gastos > 0 and
 * v_base > 0`. Con base cero el reparto sería una división por cero, y con
 * gastos cero multiplicar por 1 no cambia nada pero sí introduciría ruido de
 * redondeo en cada línea.
 */
export function factorGastos(base: number, gastos: number): number {
  if (!(gastos > 0) || !(base > 0)) return 1;
  return redondear6(1 + gastos / base);
}

/** Costea la recepción completa: lo que se teclea y lo que acaba en el kardex. */
export function costearRecepcion(
  lineas: readonly LineaCosteable[],
  gastos = 0,
  /**
   * Con compra enlazada, las bases de la COMPRA (094, 097). Sin compra no hay
   * gastos, y la base de la entrega es la única que hay.
   */
  reparto: RepartoCompra | null = null,
): CosteoRecepcion {
  // Con compra, la base es la de la compra entera; si la compra no tiene
  // importe, la función cae al valor de la entrega, y aquí también.
  const base = reparto && reparto.base > 0 ? reparto.base : baseValorizada(lineas);
  const factor = factorGastos(base, reparto ? reparto.gastosPorValor : gastos);
  const porKg = reparto ? reparto.porKg : 0;

  const costeadas: LineaCosteada[] = lineas.map((l) => {
    // `round(ri.costo_unitario * v_factor + v_por_kg * peso, 4)` en la
    // función. El redondeo va en el COSTO UNITARIO, no en el importe: es el
    // número que se graba en el movimiento de kardex, y el importe se deriva
    // de él.
    const costoFinal = redondear4(
      l.costoUnitario * factor + porKg * (l.pesoKg && l.pesoKg > 0 ? l.pesoKg : 0),
    );
    return {
      cantidad: l.cantidad,
      costoUnitario: l.costoUnitario,
      importe: redondear2(l.cantidad * l.costoUnitario),
      costoFinal,
      importeFinal: redondear2(l.cantidad * costoFinal),
    };
  });

  return {
    base,
    gastos: factor === 1 && porKg === 0 ? 0 : gastos,
    factor,
    lineas: costeadas,
    total: redondear2(costeadas.reduce((a, l) => a + l.importe, 0)),
    totalFinal: redondear2(costeadas.reduce((a, l) => a + l.importeFinal, 0)),
    unidades: redondear2(costeadas.reduce((a, l) => a + l.cantidad, 0)),
  };
}
