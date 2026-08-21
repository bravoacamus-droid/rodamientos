import { redondear2, redondear4 } from "./totales";

/**
 * El piso de venta (columna P.M. del maestro).
 *
 * Willy, 21/08/2026: *"es el precio mínimo que se puede vender para cotizar al
 * cliente, no puede vender menos de eso porque si no no es rentable"*.
 *
 * La regla vive en la base como el check `cotiz_item_respeta_piso`, que es
 * quien de verdad la hace cumplir. Esto de aquí NO la reemplaza: la duplica
 * para poder avisarle al vendedor mientras escribe, con un mensaje que se
 * entienda, en vez de dejar que la base le devuelva un error de constraint al
 * guardar.
 *
 * Por eso las dos fórmulas tienen que dar EXACTAMENTE lo mismo. La base
 * compara `round(valor_unitario * (1 - descuento_pct/100), 4) >= piso`, así
 * que aquí se redondea a 4 decimales igual. Si se separan, la pantalla diría
 * que está bien y el guardado fallaría.
 */

export interface LineaConPiso {
  cantidad: number;
  valorUnitario: number;
  /** Porcentaje, de 0 a 100. */
  descuentoPct?: number;
  /** Piso del producto. 0 o ausente = el producto todavía no tiene P.M. */
  precioMinimo?: number;
}

export interface RevisionPiso {
  /** Si es false, la base va a rechazar la línea. */
  ok: boolean;
  /** Precio unitario ya con el descuento aplicado. */
  precioNeto: number;
  /** El piso que aplica. 0 = el producto no tiene P.M. cargado. */
  piso: number;
  /** Cuánto falta por unidad para llegar al piso. 0 cuando cumple. */
  faltantePorUnidad: number;
  /** Lo que se deja de ganar en toda la línea. 0 cuando cumple. */
  faltanteEnLinea: number;
  /**
   * Descuento máximo que todavía respeta el piso, en porcentaje.
   * null cuando el producto no tiene piso; 0 cuando ya no cabe descuento.
   */
  descuentoMaximoPct: number | null;
  /**
   * Valor unitario más bajo que se puede negociar SIN tocar el descuento que
   * ya está puesto. 0 cuando no hay piso; null si con ese descuento no hay
   * precio posible.
   */
  valorUnitarioMinimo: number | null;
}

/** Precio unitario después del descuento, con el redondeo de la base. */
export function precioNeto(linea: LineaConPiso): number {
  const descuento = linea.descuentoPct ?? 0;
  return redondear4(linea.valorUnitario * (1 - descuento / 100));
}

/**
 * Descuento máximo que respeta el piso.
 *
 * Se TRUNCA hacia abajo a 2 decimales (que es la precisión de
 * `descuento_pct`), nunca se redondea: redondear hacia arriba daría un
 * descuento un pelo mayor que el permitido y la línea rebotaría contra el
 * check justo después de que la pantalla dijo que estaba bien.
 */
export function descuentoMaximoPct(
  valorUnitario: number,
  piso: number,
): number | null {
  if (piso <= 0) return null;
  if (valorUnitario <= 0) return 0;
  if (piso >= valorUnitario) return 0;

  const exacto = (1 - piso / valorUnitario) * 100;
  return Math.floor(exacto * 100) / 100;
}

/**
 * El otro lado de la negociación.
 *
 * `descuentoMaximoPct` responde "con este precio, cuánto puedo descontar".
 * Esta responde "con este descuento puesto, hasta dónde puedo bajar el
 * precio", que es la otra mitad de cómo se negocia de verdad: primero se
 * regatea el unitario y encima queda el campo de descuento.
 *
 * Se redondea hacia ARRIBA a 4 decimales, al revés que el descuento máximo:
 * en las dos el redondeo va del lado que protege el piso.
 *
 * Devuelve null si con ese descuento no hay precio que alcance (100 %).
 */
export function valorUnitarioMinimo(
  piso: number,
  descuentoPct = 0,
): number | null {
  if (piso <= 0) return 0;
  if (descuentoPct >= 100) return null;
  if (descuentoPct <= 0) return piso;

  const exacto = piso / (1 - descuentoPct / 100);
  return Math.ceil(exacto * 10000) / 10000;
}

/** Revisa una línea contra su piso. */
export function revisarPiso(linea: LineaConPiso): RevisionPiso {
  const piso = linea.precioMinimo ?? 0;
  const neto = precioNeto(linea);

  if (piso <= 0) {
    return {
      ok: true,
      precioNeto: neto,
      piso: 0,
      faltantePorUnidad: 0,
      faltanteEnLinea: 0,
      descuentoMaximoPct: null,
      valorUnitarioMinimo: 0,
    };
  }

  const cumple = neto >= piso;
  const faltantePorUnidad = cumple ? 0 : redondear4(piso - neto);

  return {
    ok: cumple,
    precioNeto: neto,
    piso,
    faltantePorUnidad,
    faltanteEnLinea: cumple ? 0 : redondear2(faltantePorUnidad * linea.cantidad),
    descuentoMaximoPct: descuentoMaximoPct(linea.valorUnitario, piso),
    valorUnitarioMinimo: valorUnitarioMinimo(piso, linea.descuentoPct ?? 0),
  };
}

export interface LineaBajoPiso extends RevisionPiso {
  /** Posición de la línea en la cotización, empezando en 0. */
  indice: number;
}

/**
 * Revisa la cotización completa y devuelve SOLO las líneas que no llegan al
 * piso. Un array vacío significa que se puede guardar.
 */
export function lineasBajoPiso(
  lineas: readonly LineaConPiso[],
): LineaBajoPiso[] {
  const malas: LineaBajoPiso[] = [];
  for (const [indice, linea] of lineas.entries()) {
    const revision = revisarPiso(linea);
    if (!revision.ok) malas.push({ ...revision, indice });
  }
  return malas;
}
