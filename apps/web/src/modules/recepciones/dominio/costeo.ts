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

/**
 * Los tres redondeos, definidos aquí y no importados de `cotizaciones`.
 *
 * `redondear2` y `redondear4` son idénticos a los que `cotizaciones` publica
 * en su barrel, y duplicarlos no gusta. El motivo es de empaquetado: ese
 * barrel también reexporta sus páginas, que son Server Components y arrastran
 * `server-only`. Este archivo lo consume el constructor, que corre en el
 * navegador, así que importarlo de ahí rompería el build del cliente.
 *
 * La salida correcta sería un paquete compartido de aritmética de dinero. No
 * se hace aquí para no meter un refactor de `cotizaciones` dentro del módulo
 * de recepciones; queda anotado en PENDIENTES.
 *
 * `redondear6` sí es propio: `v_factor` está declarado `numeric(12,6)` en la
 * función, así que Postgres redondea el factor a 6 decimales ANTES de
 * multiplicar. Calcular con la división en coma flotante completa daría un
 * costo distinto en el último decimal — un descuadre invisible hasta que
 * alguien sume una columna.
 */
export const redondear2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export const redondear4 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 10_000) / 10_000;

export const redondear6 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;

/** Lo mínimo que hace falta de una línea para costearla. */
export interface LineaCosteable {
  cantidad: number;
  costoUnitario: number;
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
): CosteoRecepcion {
  const base = baseValorizada(lineas);
  const factor = factorGastos(base, gastos);

  const costeadas: LineaCosteada[] = lineas.map((l) => {
    // `round(ri.costo_unitario * v_factor, 4)` en la función. El redondeo va
    // en el COSTO UNITARIO, no en el importe: es el número que se graba en el
    // movimiento de kardex, y el importe se deriva de él.
    const costoFinal = redondear4(l.costoUnitario * factor);
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
    gastos: factor === 1 ? 0 : gastos,
    factor,
    lineas: costeadas,
    total: redondear2(costeadas.reduce((a, l) => a + l.importe, 0)),
    totalFinal: redondear2(costeadas.reduce((a, l) => a + l.importeFinal, 0)),
    unidades: redondear2(costeadas.reduce((a, l) => a + l.cantidad, 0)),
  };
}
