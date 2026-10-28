/**
 * El número de ítem de una cotización: 1, 1.1, 1.2, 2, 2.1… (169).
 *
 * Luis, 28/10: *«la idea es que se añada como ítem pero no con el número
 * siguiente: ítem 1 AS202; si tiene una alternativa, me deja agregarla, pero
 * sería ítem 1.1, no 2. Si tiene más alternativas va creciendo: 1.2… Solo si
 * es producto nuevo sí es 2, y si tiene alternativas, 2.1»*.
 *
 * Una alternativa es una línea normal en todo lo demás —suma, se aprueba, se
 * despacha y se factura—, así que esto es lo ÚNICO que la distingue. Por eso
 * vive en una sola función: el constructor, la ficha, el papel, /ver, el Excel
 * y la hoja de pedido numeran con ella, y no pueden decir dos cosas distintas.
 *
 * La guía y la factura NO la usan: SUNAT exige ítems enteros y correlativos.
 *
 * Reglas, para lo que llegue raro:
 *   - una alternativa cuyo principal no está en la lista (se quitó, o el papel
 *     lo filtró porque el cliente no lo quiso) se numera como un ítem normal;
 *   - una alternativa de una alternativa cuelga del mismo principal (un nivel);
 *   - el orden lo da la lista: se numera en el orden en que llegan.
 */

export interface LineaNumerable {
  /** Lo que identifica la línea: la key del constructor, el id o el orden. */
  id: string | number;
  /** De qué línea es alternativa (su `id`), o null si es principal. */
  alternativaDe: string | number | null | undefined;
}

export function numerosDeItem(lineas: readonly LineaNumerable[]): string[] {
  /** Para cada línea ya numerada, de qué principal cuelga (ella misma si lo es). */
  const raiz = new Map<string | number, string | number>();
  const numeroDe = new Map<string | number, number>();
  const subDe = new Map<string | number, number>();
  let principales = 0;

  return lineas.map((l) => {
    const padre = l.alternativaDe ?? null;
    const r = padre !== null ? raiz.get(padre) : undefined;
    if (r !== undefined) {
      const sub = (subDe.get(r) ?? 0) + 1;
      subDe.set(r, sub);
      raiz.set(l.id, r);
      return `${numeroDe.get(r)}.${sub}`;
    }
    principales += 1;
    raiz.set(l.id, l.id);
    numeroDe.set(l.id, principales);
    return String(principales);
  });
}

/** ¿Este número es de una alternativa? «1.2» sí; «3» no. */
export function esSubitem(numero: string): boolean {
  return numero.includes(".");
}
