import type { TipoCompra } from "./tipos";

/**
 * Los gastos de una compra, y las tres modalidades que los deciden.
 *
 * Willy, 24/09 (§AO.4): *«yo quiero registrar todos los gastos que he
 * incurrido para que me llegue esa mercadería acá, para así poder establecer
 * cuál es mi costo real puesto acá»*. Y cada modalidad lleva gastos distintos,
 * que es por lo que pidió separarlas.
 *
 * ---------------------------------------------------------------------------
 * Tres modalidades en pantalla, dos tipos en la base
 * ---------------------------------------------------------------------------
 * La base guarda `tipo` —local o importación— y, si es importación, la VÍA
 * (095). Es como lo dijo él (32:28): *«compra local, compra importación, y la
 * importación se subdivide en aéreo y marítimo»*. La pantalla junta las dos
 * cosas en un solo selector de tres, porque quien registra piensa en «esto
 * vino por avión», no en «tipo importación, vía aérea».
 */

export type Modalidad = "local" | "aerea" | "maritima";
export type ViaImportacion = "aerea" | "maritima";

export const MODALIDADES: readonly Modalidad[] = ["local", "aerea", "maritima"];

export const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  local: "Compra local",
  aerea: "Importación aérea",
  maritima: "Importación marítima",
};

/** Lo que distingue a cada una, en una frase y con sus palabras. */
export const AYUDA_MODALIDAD: Record<Modalidad, string> = {
  local: "A un proveedor de aquí, con su factura. Si pagaste transporte, apúntalo abajo.",
  // Willy, 01/10 (§AP): *«el desaduanaje es un gasto adicional que me
  // confirman acá cuando arriba mi pedido a aduanas […] no lo puedo saber
  // antes»*. Por eso se dice que puede quedar en blanco.
  aerea:
    "El courier va por kilo, como en tu Excel. El desaduanaje llega después: si aún no lo sabes, déjalo en blanco y lo añades desde la ficha de la compra.",
  maritima:
    "Flete, aduana, almacén, levante, traslado… Apunta cada gasto: todos entran al costo.",
};

/**
 * Los gastos que se proponen al elegir la modalidad.
 *
 * Son PROPUESTAS, no una lista cerrada: el concepto es texto libre en la base
 * (`gastos_importacion.concepto`) y se puede escribir otro o añadir filas.
 * Salen de la reunión del 24/09:
 *
 *   · Aérea (26:00): *«yo no pago el courier, yo pago a mi proveedor […] y él
 *     hace el pago al courier»* — por eso el courier va como gasto de la
 *     factura del proveedor, y el desaduanaje aparte, que es lo único que
 *     cobra DHL directamente.
 *   · Marítima (27:xx): *«hay que pagar los ajustes de valor, el almacén, el
 *     levante, el traslado…»*.
 */
export const CONCEPTOS_SUGERIDOS: Record<Modalidad, readonly string[]> = {
  local: ["Transporte"],
  aerea: ["Courier", "Desaduanaje"],
  maritima: [
    "Flete marítimo",
    "Derechos de aduana",
    "Ajuste de valor",
    "Almacenaje",
    "Levante",
    "Agente de aduanas",
    "Traslado al almacén",
  ],
};

/** El courier se elige de una lista que crece sola (ver `api/couriers`). */
export const COURIERS_DE_SIEMPRE: readonly string[] = ["DHL", "FedEx", "UPS"];

/**
 * Cómo se reparte un gasto sobre el costo de cada producto al recibir (097).
 *
 * Willy, 01/10 (§AP): *«el costo de DHL que me cotiza mi proveedor en origen
 * lo divido entre el peso total calculado y me sale un factor $/kg»*. DHL
 * cobra por kilo, así que el courier va por PESO. Lo que va sobre la factura
 * —impuestos, desaduanaje, agente— va por VALOR.
 */
export type Reparto = "valor" | "peso";

export const ETIQUETA_REPARTO: Record<Reparto, string> = {
  peso: "Por kilo",
  valor: "Por valor",
};

/**
 * El reparto que se propone según el concepto.
 *
 * Por kilo lo que se paga por mover la carga: courier, flete, el nombre del
 * courier. Todo lo demás por valor, que es como funcionaba hasta la 097 y es
 * lo correcto para impuestos y comisiones. El transporte LOCAL va por valor:
 * casi ningún producto tiene peso, y repartir por kilo sin pesos acabaría
 * repartido por valor igual.
 */
export function repartoSugerido(concepto: string): Reparto {
  return /courier|flete|dhl|fedex|ups|env[ií]o|a[eé]reo/i.test(concepto) ? "peso" : "valor";
}

/** Un gasto tal como se edita en pantalla. */
export interface GastoEditable {
  key: string;
  concepto: string;
  monto: number;
  reparto: Reparto;
  /**
   * Alguien eligió el reparto a mano. Lo propuesto sigue al concepto; lo
   * elegido se queda aunque se cambie el concepto — la regla de siempre.
   */
  repartoAMano?: boolean;
}

export function modalidadDe(tipo: TipoCompra, via: ViaImportacion): Modalidad {
  return tipo === "local" ? "local" : via;
}

export function tipoYVia(m: Modalidad): { tipo: TipoCompra; via: ViaImportacion | null } {
  return m === "local" ? { tipo: "local", via: null } : { tipo: "importacion", via: m };
}

/** Redondeo a céntimos, sin la trampa de la coma flotante en las sumas. */
const centimos = (n: number) => Math.round(n * 100) / 100;

export function totalGastos(gastos: readonly GastoEditable[]): number {
  return centimos(gastos.reduce((a, g) => a + (g.monto > 0 ? g.monto : 0), 0));
}

/**
 * Lo que viaja a la base: solo las filas con concepto Y con dinero.
 *
 * Las propuestas vacías («Almacenaje», 0) están para que se vea qué suele
 * haber, no para guardar ceros: un gasto de cero en la ficha de la compra
 * diría que se pagó almacén y fue gratis, que no es lo mismo que no haberlo.
 */
export function gastosParaEnviar(
  gastos: readonly GastoEditable[],
): { concepto: string; monto: number; reparto: Reparto }[] {
  return gastos
    .filter((g) => g.monto > 0 && g.concepto.trim() !== "")
    .map((g) => ({ concepto: g.concepto.trim(), monto: centimos(g.monto), reparto: g.reparto }));
}

/**
 * El costo PUESTO de cada línea, como lo va a calcular la recepción (097).
 *
 * Es la cuenta del Excel de Willy hecha en pantalla mientras se registra:
 *
 *     unidad = costo × (1 + gastos_por_valor ÷ valor_compra)
 *            + peso × (gastos_por_kilo ÷ kilos_compra)
 *
 * Réplica de `recepcionar_mercaderia`, regla incluida: si a alguna línea le
 * falta el peso, TODO se reparte por valor — repartir por kilo le regalaría
 * el flete a la pieza sin peso. Por eso devuelve también quién falta: la
 * pantalla lo avisa antes de guardar.
 */
export interface CosteoEstimado {
  /** Costo por unidad puesto en almacén, por clave de línea. */
  porLinea: Record<string, number>;
  gastosPorPeso: number;
  gastosPorValor: number;
  kilos: number;
  /** $ por kilo, si de verdad se reparte por kilo. */
  porKg: number;
  /** Hay gastos por kilo y se pueden repartir así. */
  repartePorPeso: boolean;
  /** Claves de las líneas sin peso, cuando hay gastos por kilo. */
  faltaPeso: string[];
}

export function costeoEstimado(
  lineas: readonly { key: string; cantidad: number; costoUnitario: number; pesoKg: number }[],
  gastos: readonly GastoEditable[],
): CosteoEstimado {
  const conDinero = gastos.filter((g) => g.monto > 0);
  const gastosPorPeso = centimos(
    conDinero.filter((g) => g.reparto === "peso").reduce((a, g) => a + g.monto, 0),
  );
  const total = totalGastos(gastos);
  const kilos = lineas.reduce((a, l) => a + l.cantidad * (l.pesoKg > 0 ? l.pesoKg : 0), 0);
  const faltaPeso = gastosPorPeso > 0 ? lineas.filter((l) => !(l.pesoKg > 0)).map((l) => l.key) : [];

  const repartePorPeso = gastosPorPeso > 0 && faltaPeso.length === 0 && kilos > 0;
  const porKg = repartePorPeso ? gastosPorPeso / kilos : 0;
  const gastosPorValor = centimos(total - (repartePorPeso ? gastosPorPeso : 0));

  const valor = lineas.reduce((a, l) => a + l.cantidad * l.costoUnitario, 0);
  const factor = valor > 0 ? 1 + gastosPorValor / valor : 1;

  const porLinea: Record<string, number> = {};
  for (const l of lineas) {
    porLinea[l.key] =
      Math.round((l.costoUnitario * factor + porKg * (l.pesoKg > 0 ? l.pesoKg : 0)) * 1e4) / 1e4;
  }

  return { porLinea, gastosPorPeso, gastosPorValor, kilos, porKg, repartePorPeso, faltaPeso };
}

/** ¿Alguien ha escrito ya dinero en algún gasto? */
export function hayGastosEscritos(gastos: readonly GastoEditable[]): boolean {
  return gastos.some((g) => g.monto > 0);
}

/**
 * El reparto que de verdad vale en ESTA compra.
 *
 * Willy, 02/10, registrando la compra: *«en la compra no va peso […] precios
 * nomás»*. Su papel de compra —la proforma de FORUN— trae artículo, marca,
 * cantidad, precio, el DHL y el total: ningún peso. Así que la compra no los
 * pide, y un gasto «por kilo» sin pesos se guardaría diciendo algo que no
 * pasó (la base lo reparte por valor igual, regla de la 097).
 *
 * La excepción es la compra que sale de un ANÁLISIS: ahí los pesos vienen
 * escritos en todas las líneas, y el courier se reparte por kilo como en el
 * análisis, para que el costo puesto coincida con el PU LIMA que se analizó.
 */
export function gastosSegunPesos<G extends { reparto: Reparto }>(
  lineas: readonly { pesoKg: number }[],
  gastos: readonly G[],
): G[] {
  const todasConPeso = lineas.length > 0 && lineas.every((l) => l.pesoKg > 0);
  return todasConPeso ? [...gastos] : gastos.map((g) => ({ ...g, reparto: "valor" as const }));
}
