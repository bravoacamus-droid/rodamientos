/**
 * Tipos del módulo de equivalencias.
 *
 * El cross-reference entre marcas es el gesto que define a un distribuidor de
 * rodamientos: el cliente pide un 6205-2RS de SKF, no hay, y hay que saber en
 * treinta segundos que el de FAG es el mismo rodamiento.
 *
 * La cascada la resuelve `sustitutos_de()` en la base, y tiene cuatro peldaños
 * de menos a más suposición:
 *
 *   1. `equivalencia`  — alguien la declaró a mano. Es la única que sabe algo
 *                        que no está en el código: que un 6205 de una marca
 *                        rara sirve para lo mismo.
 *   2. `misma_medida`  — mismo `designacion_base`, o sea el mismo núcleo ISO.
 *                        No necesita banda de precio: la medida ya garantiza
 *                        que es el mismo rodamiento en otra marca.
 *   3. `tipo`          — mismo tipo constructivo y precio parecido. Aquí ya se
 *                        supone: un 6205 y un 6320 comparten tipo y NO son
 *                        intercambiables; lo que los separa es el precio.
 *   4. `subfamilia`    — el último recurso.
 *
 * Esta pantalla existe para alimentar el peldaño 1, que es el único que la
 * base no puede deducir sola.
 */

/** De dónde salió el sustituto. Es el `origen` que devuelve `sustitutos_de()`. */
export type OrigenSustituto = "equivalencia" | "misma_medida" | "tipo" | "subfamilia";

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
  misma_medida: "Misma medida",
  tipo: "Mismo tipo",
  subfamilia: "Misma subfamilia",
};

/**
 * Por qué aparece cada uno. Se enseña en la pantalla porque la diferencia
 * entre «lo dice el catálogo ISO» y «se parece en el precio» es exactamente lo
 * que decide si se despacha o se llama al cliente.
 */
export const EXPLICACION_ORIGEN: Record<OrigenSustituto, string> = {
  equivalencia: "Alguien de la casa declaró que sirve.",
  misma_medida: "Mismo núcleo ISO en el código: es el mismo rodamiento en otra marca.",
  tipo: "Mismo tipo constructivo y precio parecido. Hay que comprobarlo.",
  subfamilia: "Solo comparten familia y rango de precio. Es una pista, no una respuesta.",
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
