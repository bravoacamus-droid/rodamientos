/**
 * Cuándo puede entregarse cada ítem de una cotización.
 *
 * Willy, 01/09 (9:26): *«Yo creo que sería bueno colocar una columna donde se
 * coloque la disponibilidad»*. Y los tres valores los nombró él (13:00):
 * *«inmediato, exterior y fabricación»*.
 *
 * Vive en `dominio/` y no dentro del constructor porque lo necesitan cuatro
 * sitios que no se hablan entre sí: la línea de la pantalla, el PDF, la acción
 * que guarda y —la que viene— la bandeja «Por comprar». Con la lógica repartida,
 * el día que el plazo del exterior deje de ser 15 días habría que acordarse de
 * cambiarlo en cuatro.
 */

/** El enum `disponibilidad_item` de Postgres (migración 040). */
export type Disponibilidad = "inmediata" | "exterior" | "fabricacion";

export const DISPONIBILIDADES: readonly Disponibilidad[] = [
  "inmediata",
  "exterior",
  "fabricacion",
] as const;

/** Lo que se lee en la pantalla. */
export const ETIQUETA_DISPONIBILIDAD: Record<Disponibilidad, string> = {
  inmediata: "Inmediata",
  exterior: "Exterior",
  fabricacion: "Fabricación",
};

/** Lo que ayuda a elegir bien la primera vez. */
export const AYUDA_DISPONIBILIDAD: Record<Disponibilidad, string> = {
  inmediata: "Lo tengo en almacén o lo consigo aquí mismo.",
  exterior: "Hay que importarlo.",
  fabricacion: "Lo fabrica el proveedor bajo pedido.",
};

/**
 * Los plazos habituales, en días.
 *
 * **Tiene que decir lo mismo que `public.dias_por_defecto()` de la 040.** Están
 * los dos porque los dos hacen falta —la pantalla no puede ir a la base por
 * cada tecla, y la bandeja de compras no puede depender del navegador— y la
 * prueba de este módulo deja constancia de los números para que una diferencia
 * salte aquí y no en un PDF que ya salió.
 *
 * `inmediata` no tiene plazo: es lo que significa inmediata.
 *
 * El de la compra LOCAL no está porque Willy no lo dio. Dio 15 para exterior
 * (12:02) y 2–4 para fabricación (12:37). Está preguntado en PENDIENTES §G.
 */
export const DIAS_POR_DEFECTO: Record<Disponibilidad, number | null> = {
  inmediata: null,
  exterior: 15,
  fabricacion: 3,
};

/**
 * Los días que de verdad aplican a una línea.
 *
 * `dias` es lo que se escribió a mano para ESTA línea, cuando el proveedor dio
 * un plazo distinto del habitual. Null —lo normal— significa «el de su tipo».
 */
export function diasDe(disponibilidad: Disponibilidad, dias: number | null): number | null {
  if (disponibilidad === "inmediata") return null;
  if (dias !== null && Number.isFinite(dias) && dias > 0) return Math.round(dias);
  return DIAS_POR_DEFECTO[disponibilidad];
}

/**
 * Lo que sale impreso en la columna del PDF.
 *
 * Se escribe entero —«15 días · exterior»— y no solo el número: el cliente que
 * lo lee no tiene por qué saber qué significan nuestras etiquetas, y «15 días»
 * a secas no dice si el retraso es porque viene de fuera o porque hay que
 * fabricarlo. Eso cambia lo que el cliente decide.
 */
export function textoEntrega(disponibilidad: Disponibilidad, dias: number | null): string {
  if (disponibilidad === "inmediata") return "Inmediata";
  const d = diasDe(disponibilidad, dias);
  const etiqueta = ETIQUETA_DISPONIBILIDAD[disponibilidad].toLowerCase();
  if (d === null) return ETIQUETA_DISPONIBILIDAD[disponibilidad];
  return `${d} ${d === 1 ? "día" : "días"} · ${etiqueta}`;
}

/**
 * ¿La línea promete algo que no se puede cumplir?
 *
 * Marcar «inmediata» sin tener stock no es un error del sistema —puede que lo
 * consiga hoy mismo en la tienda de al lado, que es lo que Willy hace— así que
 * NO se bloquea. Pero sí se dice, porque lo que salga en esa columna es una
 * promesa impresa que el cliente va a leer.
 *
 * Al revés no se avisa: marcar «exterior» teniendo stock es raro pero puede ser
 * deliberado —reservar lo que hay para otro cliente— y no promete de menos.
 */
export function prometeDeMas(
  disponibilidad: Disponibilidad,
  cantidad: number,
  stock: number,
): boolean {
  return disponibilidad === "inmediata" && stock < cantidad;
}

/**
 * Lo que hay que salir a comprar de una línea.
 *
 * Es la resta que alimenta la bandeja «Por comprar», y la razón por la que la
 * disponibilidad tenía que ser un enum y no el texto libre que había: se puede
 * preguntar «¿qué falta?» sin interpretar lo que alguien escribió.
 */
export function faltaComprar(cantidad: number, stock: number): number {
  const falta = cantidad - stock;
  return falta > 0 ? falta : 0;
}
