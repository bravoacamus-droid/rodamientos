import { describe, expect, it } from "vitest";

import { armar, clave, distinto, leer } from "./borrador";

const ahora = new Date("2026-10-13T15:00:00Z");

describe("el borrador de un formulario", () => {
  it("una clave para el nuevo y otra por registro que se edita", () => {
    expect(clave("cliente")).toBe("rodatech:cliente:nuevo");
    expect(clave("cliente", "abc")).toBe("rodatech:cliente:editar:abc");
  });

  it("se guarda y se lee igual", () => {
    const b = leer<{ ruc: string }>(JSON.stringify(armar({ ruc: "20100005566" }, ahora)), ahora);
    expect(b?.datos.ruc).toBe("20100005566");
  });

  it("roto, de otra versión o de hace más de dos semanas, no se ofrece", () => {
    expect(leer("{no", ahora)).toBeNull();
    expect(leer(JSON.stringify({ ...armar({ a: 1 }, ahora), version: 7 }), ahora)).toBeNull();
    expect(leer(JSON.stringify(armar({ a: 1 }, new Date("2026-09-20T00:00:00Z"))), ahora)).toBeNull();
    expect(leer(null, ahora)).toBeNull();
  });

  it("distingue lo que cambió", () => {
    expect(distinto({ a: 1 }, { a: 1 })).toBe(false);
    expect(distinto({ a: 1 }, { a: 2 })).toBe(true);
  });
});
