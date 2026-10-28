import { describe, expect, it } from "vitest";

import { esSubitem, numerosDeItem } from "./numeracion";

const l = (id: string, alternativaDe: string | null = null) => ({ id, alternativaDe });

describe("numerosDeItem (169)", () => {
  it("sin alternativas, 1, 2, 3", () => {
    expect(numerosDeItem([l("a"), l("b"), l("c")])).toEqual(["1", "2", "3"]);
  });

  it("el ejemplo de Luis: 1, 1.1, 1.2, 2, 2.1", () => {
    expect(
      numerosDeItem([l("a"), l("a1", "a"), l("a2", "a"), l("b"), l("b1", "b")]),
    ).toEqual(["1", "1.1", "1.2", "2", "2.1"]);
  });

  it("una alternativa de una alternativa cuelga del mismo principal", () => {
    expect(numerosDeItem([l("a"), l("a1", "a"), l("a2", "a1")])).toEqual(["1", "1.1", "1.2"]);
  });

  it("sin su principal en la lista, la alternativa es un ítem normal", () => {
    expect(numerosDeItem([l("a1", "a"), l("b"), l("b1", "b")])).toEqual(["1", "2", "2.1"]);
  });

  it("el principal después de su alternativa: la alternativa no se cuelga hacia delante", () => {
    expect(numerosDeItem([l("a1", "a"), l("a")])).toEqual(["1", "2"]);
  });

  it("funciona con números (el orden de la base) como identificador", () => {
    expect(
      numerosDeItem([
        { id: 1, alternativaDe: null },
        { id: 2, alternativaDe: 1 },
        { id: 3, alternativaDe: undefined },
      ]),
    ).toEqual(["1", "1.1", "2"]);
  });

  it("esSubitem", () => {
    expect(esSubitem("1.1")).toBe(true);
    expect(esSubitem("12")).toBe(false);
  });
});
