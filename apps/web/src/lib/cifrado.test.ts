import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ErrorCifrado,
  cifrar,
  cifrarBinario,
  descifrar,
  descifrarBinario,
  hayLlaveMaestra,
  igualSeguro,
} from "./cifrado";

// Llave de prueba, fija para que los tests sean deterministas. NO es la de
// producción: esa vive solo en el entorno.
const LLAVE = Buffer.alloc(32, 7).toString("base64");
const OTRA_LLAVE = Buffer.alloc(32, 9).toString("base64");

let original: string | undefined;

beforeEach(() => {
  original = process.env.SUNAT_ENCRYPTION_KEY;
  process.env.SUNAT_ENCRYPTION_KEY = LLAVE;
});

afterEach(() => {
  if (original === undefined) delete process.env.SUNAT_ENCRYPTION_KEY;
  else process.env.SUNAT_ENCRYPTION_KEY = original;
});

describe("cifrar / descifrar", () => {
  it("lo que entra es lo que sale", () => {
    const secreto = "MiClaveSOL2026";
    expect(descifrar(cifrar(secreto))).toBe(secreto);
  });

  it("aguanta acentos y símbolos", () => {
    const secreto = "ñÑáéíóú·@#$%&/()=?¿ 漢字";
    expect(descifrar(cifrar(secreto))).toBe(secreto);
  });

  it("aguanta una cadena vacía", () => {
    expect(descifrar(cifrar(""))).toBe("");
  });

  /**
   * Con GCM, repetir el IV rompe el cifrado entero y no solo ese mensaje. Que
   * dos cifrados del mismo texto sean distintos es la prueba de que el IV se
   * genera cada vez.
   */
  it("cifrar dos veces lo mismo da blobs distintos", () => {
    const a = cifrar("igual");
    const b = cifrar("igual");
    expect(a).not.toBe(b);
    expect(descifrar(a)).toBe(descifrar(b));
  });

  it("el binario del certificado sobrevive intacto", () => {
    // Bytes que no son texto válido: es lo que de verdad tiene un .pfx.
    const pfx = Buffer.from([0x30, 0x82, 0x0a, 0x00, 0xff, 0xfe, 0x00, 0x01]);
    expect(descifrarBinario(cifrarBinario(pfx)).equals(pfx)).toBe(true);
  });
});

describe("cuando algo va mal", () => {
  it("con otra llave no descifra, y lo dice", () => {
    const blob = cifrar("secreto");
    process.env.SUNAT_ENCRYPTION_KEY = OTRA_LLAVE;
    expect(() => descifrar(blob)).toThrow(ErrorCifrado);
    expect(() => descifrar(blob)).toThrow(/no sea la misma/i);
  });

  /**
   * Lo que aporta GCM sobre CBC: un byte cambiado se detecta. Sin esto, una
   * fila corrupta devolvería basura silenciosamente y el fallo aparecería más
   * tarde, al autenticarse contra SUNAT, sin pista de dónde vino.
   */
  it("detecta un blob manipulado", () => {
    const blob = cifrar("secreto");
    const crudo = Buffer.from(blob, "base64");
    // Se cambia el último byte del texto cifrado. `writeUInt8` en vez del
    // índice para que TypeScript no tenga que suponer que el acceso existe.
    crudo.writeUInt8(crudo.readUInt8(crudo.length - 1) ^ 0xff, crudo.length - 1);
    expect(() => descifrar(crudo.toString("base64"))).toThrow(ErrorCifrado);
  });

  it("detecta un blob truncado", () => {
    expect(() => descifrar(Buffer.alloc(4).toString("base64"))).toThrow(/truncado/i);
  });

  it("sin llave dice cómo generarla", () => {
    delete process.env.SUNAT_ENCRYPTION_KEY;
    expect(() => cifrar("x")).toThrow(/SUNAT_ENCRYPTION_KEY/);
    expect(() => cifrar("x")).toThrow(/randomBytes\(32\)/);
  });

  it("con una llave del tamaño equivocado dice cuántos bytes tiene", () => {
    process.env.SUNAT_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => cifrar("x")).toThrow(/16 bytes y AES-256 necesita 32/);
  });

  it("hayLlaveMaestra no lanza, solo informa", () => {
    expect(hayLlaveMaestra()).toBe(true);
    delete process.env.SUNAT_ENCRYPTION_KEY;
    expect(hayLlaveMaestra()).toBe(false);
  });
});

describe("igualSeguro", () => {
  it("compara bien", () => {
    expect(igualSeguro("abc", "abc")).toBe(true);
    expect(igualSeguro("abc", "abd")).toBe(false);
  });

  it("largos distintos no revientan", () => {
    expect(igualSeguro("abc", "abcdef")).toBe(false);
    expect(igualSeguro("", "x")).toBe(false);
  });
});
