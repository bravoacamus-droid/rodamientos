/**
 * Tipos del módulo de equivalencias.
 *
 * El cross-reference entre marcas es el gesto que define a un distribuidor de
 * rodamientos: el cliente pide un 6205-2RS de SKF, no hay, y hay que saber en
 * treinta segundos que el de FAG es el mismo rodamiento.
 *
 * Lo resuelve `sustitutos_de()` en la base, y desde la 061 son solo DOS, los
 * dos afirmando lo mismo: que la pieza entra.
 *
 *   1. `equivalencia`  — alguien la declaró a mano. Es la única que sabe algo
 *                        que no está en el código: que un 6205 de una marca
 *                        rara sirve para lo mismo.
 *   2. `mismo_basico`  — mismo `designacion_base`, el núcleo ISO. Fija el
 *                        diámetro interior, el exterior y la altura, así que
 *                        6309-2ZC3 y 6309-2RS entran en el mismo eje: cambian
 *                        el sellado y el juego, que es lo que se elige a ojo.
 *
 * Había dos peldaños más —`tipo` y `subfamilia`— y se quitaron. Willy, 07/09:
 * *«no puedo reemplazar un 6309 por un 6307 o un 08, porque ya tienen
 * diferentes medidas»*. Los dos son de la serie 60 y cuestan parecido, así que
 * la banda de precio que hacía de red los dejaba pasar. **Una alternativa
 * equivocada es peor que ninguna**: aquí no se adivina un texto, se afirma que
 * dos piezas son intercambiables.
 *
 * Esta pantalla existe para alimentar el peldaño 1, que es el único que la
 * base no puede deducir sola — y ahora pesa más, porque es el único camino
 * para todo lo que no es rodamiento (o-rings, pines, fajas: la mitad del
 * catálogo no tiene código básico que extraer).
 */

/** De dónde salió el sustituto. Es el `origen` que devuelve `sustitutos_de()`. */
export type OrigenSustituto = "equivalencia" | "mismo_basico";

/** Qué tan intercambiable es. Son los tres valores de `equiv_clase`. */
export type ClaseEquivalencia = "exacta" | "similar" | "sustituto";

export const CLASES: readonly ClaseEquivalencia[] = ["exacta", "similar", "sustituto"];

export const ETIQUETA_CLASE: Record<ClaseEquivalencia, string> = {
  exacta: "Exacta",
  similar: "Similar",
  sustituto: "Sustituto",
};

/** Lo que significa cada clase, dicho para quien la va a elegir. */
export const AYUDA_CLASE: Record<ClaseEquivalencia, string> = {
  exacta: "Intercambiable sin criterio: se puede despachar uno por otro.",
  similar: "Misma medida, otra serie. Conviene avisar al cliente.",
  sustituto: "Sirve, pero hay que valorarlo técnicamente antes de despacharlo.",
};

export const ETIQUETA_ORIGEN: Record<OrigenSustituto, string> = {
  equivalencia: "Declarada",
  mismo_basico: "Misma medida",
};

/**
 * Por qué aparece cada uno. Se enseña en la pantalla porque la diferencia
 * entre «lo dice el catálogo ISO» y «se parece en el precio» es exactamente lo
 * que decide si se despacha o se llama al cliente.
 */
export const EXPLICACION_ORIGEN: Record<OrigenSustituto, string> = {
  equivalencia: "Alguien de la casa declaró que sirve.",
  mismo_basico:
    "Mismo código básico: el núcleo ISO fija el diámetro interior, el exterior y la altura, así que entra en el mismo eje. Cambia el sellado o el juego.",
};

/** Una fila de `sustitutos_de()`. */
export interface Sustituto {
  id: string;
  codigo: string;
  descripcion: string;
  marca: string;
  stock: number;
  precio_venta: number;
  precio_minimo: number;
  /** Diferencia de precio contra el producto de partida, en porcentaje. */
  diferencia_pct: number;
  origen: OrigenSustituto;
  prioridad: number;
  /** Hay stock y es más barato. */
  mejor_oferta: boolean;
}

/** El producto del que se parte. */
export interface ProductoBase {
  id: string;
  codigo: string;
  codigo_fabricante: string | null;
  descripcion: string;
  marca: string;
  /** El núcleo ISO del código. Sin él, el peldaño 2 no funciona. */
  designacion_base: string | null;
  stock: number;
  precio_venta: number;
}

/** Una equivalencia ya declarada, vista desde uno de sus dos lados. */
export interface EquivalenciaDeclarada {
  id: string;
  /** El otro producto del par. */
  otro_id: string;
  otro_codigo: string;
  otro_descripcion: string;
  otro_marca: string;
  clase: ClaseEquivalencia;
  nota: string | null;
  creado_en: string;
  creado_por: string | null;
}
