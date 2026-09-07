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

/** Lo mínimo de una línea para saber qué promete el documento entero. */
export interface LineaConEntrega {
  disponibilidad: Disponibilidad;
  diasEntrega: number | null;
}

/**
 * Qué promete la cotización ENTERA, sacado de sus líneas.
 *
 * ---------------------------------------------------------------------------
 * Por qué esto tiene que salir de las líneas y no de una caja de texto
 * ---------------------------------------------------------------------------
 * El «tiempo de entrega» de la cabecera nació antes que la disponibilidad por
 * línea (040) y se quedó como texto libre con «Stock inmediato» de arranque.
 * Desde entonces el mismo papel podía decir dos cosas y decirlas a la vez:
 *
 *     Entrega: Stock inmediato          ← cabecera, sin tocar
 *     50X68X8TC ... 15 días · exterior  ← su propia línea
 *
 * Pasó de verdad, en la COT1-000004. Y el cliente lee las dos.
 *
 * La cabecera es una PROMESA GENERAL, así que manda la línea más lenta: decir
 * «inmediato» porque cinco de seis lo son deja al cliente esperando en la
 * puerta por la sexta.
 *
 * Sigue siendo editable —hay acuerdos que no caben en una fórmula, «entregas
 * parciales según llegue»— pero se PROPONE bien.
 */
export function entregaDelDocumento(lineas: readonly LineaConEntrega[]): string {
  if (lineas.length === 0) return "Stock inmediato";

  const conPlazo = lineas
    .map((l) => ({ d: l.disponibilidad, dias: diasDe(l.disponibilidad, l.diasEntrega) }))
    .filter((x) => x.d !== "inmediata");

  if (conPlazo.length === 0) return "Stock inmediato";

  const mayor = conPlazo.reduce(
    (max, x) => (x.dias !== null && x.dias > max ? x.dias : max),
    0,
  );
  if (mayor <= 0) return "Stock inmediato";

  // «Parte inmediato» no es un adorno: cambia lo que el cliente hace. Si sabe
  // que la mitad sale hoy puede pedir que se le mande ya y esperar el resto.
  const hayInmediatas = lineas.some((l) => l.disponibilidad === "inmediata");
  return hayInmediatas
    ? `Parte inmediato, el resto hasta ${mayor} días`
    : `Hasta ${mayor} días`;
}

/**
 * ¿Lo escrito a mano promete algo que las líneas desmienten?
 *
 * No se intenta entender el texto libre —no se puede— sino el único caso que
 * de verdad se da y que de verdad hace daño: la cabecera dice «inmediato» y
 * hay líneas que tardan. Es lo que pasaba por defecto, sin que nadie tocara
 * nada, y es la promesa que el cliente reclama por teléfono.
 *
 * Al revés no se avisa: prometer más despacio de lo que se puede entregar no
 * rompe nada.
 */
export function entregaSeContradice(
  texto: string | null,
  lineas: readonly LineaConEntrega[],
): boolean {
  if (texto === null) return false;
  const dice = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!dice.includes("inmediat")) return false;
  // «Parte inmediato, el resto…» ya dice que hay algo que tarda.
  if (dice.includes("resto") || dice.includes("parte")) return false;
  return lineas.some((l) => l.disponibilidad !== "inmediata");
}
