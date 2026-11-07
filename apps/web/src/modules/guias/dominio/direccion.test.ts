import { describe, expect, it } from "vitest";

import { claveDireccion } from "./direccion";

describe("claveDireccion (195)", () => {
  it("la misma dirección escrita de otra forma es la misma", () => {
    expect(claveDireccion("AV. SAN GENARO NRO. 222")).toBe(claveDireccion("Av. San Genaro Nro 222"));
  });
  it("otro número es otra dirección", () => {
    expect(claveDireccion("AV. SAN GENARO 222")).not.toBe(claveDireccion("AV. SAN GENARO 223"));
  });
  it("conserva la Ñ y las tildes", () => {
    expect(claveDireccion("Jr. Ñaña 10")).toBe("JRÑAÑA10");
  });
});
