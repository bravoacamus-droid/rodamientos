import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { dniValido, rucValido } from "./validacion";

/**
 * Los validadores, y la garantía de que siguen siendo puros.
 *
 * La segunda parte importa tanto como la primera: estas funciones las llama un
 * componente de NAVEGADOR para no gastar cuota con un documento mal tecleado.
 * El día que alguien añada aquí un import de `./proveedor` —o de cualquier
 * cosa que arrastre `node:crypto`— el build del navegador revienta con un
 * `UnhandledSchemeError` que no dice de dónde viene. Ya pasó una vez.
 */

describe("rucValido", () => {
  it("acepta RUC reales", () => {
    // SUNAT, BCP, Backus. Verificados contra el módulo 11.
    expect(rucValido("20131312955")).toBe(true);
    expect(rucValido("20100047218")).toBe(true);
    expect(rucValido("20100128056")).toBe(true);
  });

  it("rechaza el dígito verificador equivocado", () => {
    // El mismo RUC de SUNAT con el último dígito cambiado.
    expect(rucValido("20131312954")).toBe(false);
    expect(rucValido("20131312956")).toBe(false);
  });

  it("rechaza prefijos que SUNAT no emite", () => {
    // 11..14, 16, 18, 19, 21+ no existen como tipo de contribuyente.
    expect(rucValido("11131312955")).toBe(false);
    expect(rucValido("30131312955")).toBe(false);
  });

  it("rechaza longitudes que no son once", () => {
    expect(rucValido("2013131295")).toBe(false);
    expect(rucValido("201313129550")).toBe(false);
    expect(rucValido("")).toBe(false);
  });

  it("rechaza lo que no son dígitos", () => {
    expect(rucValido("2013131295A")).toBe(false);
    expect(rucValido("20-13131295")).toBe(false);
    expect(rucValido(" 20131312955")).toBe(false);
  });
});

describe("dniValido", () => {
  it("acepta ocho dígitos", () => {
    expect(dniValido("46027897")).toBe(true);
    expect(dniValido("00000001")).toBe(true);
  });

  it("rechaza cualquier otra cosa", () => {
    expect(dniValido("4602789")).toBe(false);
    expect(dniValido("460278971")).toBe(false);
    expect(dniValido("4602789A")).toBe(false);
    expect(dniValido("")).toBe(false);
  });
});

describe("pureza del módulo", () => {
  it("no importa absolutamente nada", () => {
    // Sin imports no hay forma de arrastrar Node al bundle del navegador.
    const fuente = readFileSync(resolve(__dirname, "validacion.ts"), "utf8");
    const imports = [
      ...fuente.matchAll(/^\s*import\s/gm),
      ...fuente.matchAll(/\brequire\s*\(/g),
      ...fuente.matchAll(/\bimport\s*\(/g),
    ];
    expect(imports.map((m) => m[0].trim())).toEqual([]);
  });

  it("las subrutas de I/O reexportan estas mismas funciones", () => {
    // Dos copias divergirían: la interfaz aceptaría un documento que el
    // paquete rechaza justo antes de salir a la red.
    for (const archivo of ["ruc.ts", "dni.ts"]) {
      const fuente = readFileSync(resolve(__dirname, archivo), "utf8");
      expect(fuente, archivo).toContain('from "./validacion"');
    }
  });
});
