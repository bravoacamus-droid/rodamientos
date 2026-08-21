import { describe, it, expect } from "vitest";
import { clasificarRechazo, sePuedeReenviar } from "./rechazos";

/**
 * Lo que se prueba aquí es una decisión, no un texto: si el sistema ofrece
 * reenviar un comprobante que SUNAT nunca va a aceptar, el vendedor se queda
 * pulsando contra un muro y la venta no se factura.
 */

describe("1033 · el número ya está usado en SUNAT", () => {
  // Tal como llegó en producción el 4 de agosto de 2026.
  const real = "soap-env:Client.1033";

  it("no se reenvía", () => {
    expect(sePuedeReenviar(real)).toBe(false);
  });

  it("dice que hay que emitir uno nuevo", () => {
    expect(clasificarRechazo(real).queHacer).toMatch(/nuevo/i);
  });

  it("lo reconoce venga con prefijo o sin él", () => {
    for (const c of ["1033", "Client.1033", "soap-env:Client.1033"]) {
      expect(clasificarRechazo(c).motivo).toMatch(/ya está registrado/i);
    }
  });
});

describe("credenciales · el comprobante está bien, falla el acceso", () => {
  it("0103 se reenvía después de corregir el usuario SOL", () => {
    const r = clasificarRechazo("a:Client.0103");
    expect(r.reintentable).toBe(true);
    expect(r.queHacer).toMatch(/SOL/);
  });

  it("cualquier código de la familia 01xx se puede reintentar", () => {
    for (const c of ["0100", "0101", "0111", "0199"]) {
      expect(sePuedeReenviar(c)).toBe(true);
    }
  });
});

describe("rechazos por contenido", () => {
  it("no se reenvían: los datos de un comprobante emitido están congelados", () => {
    for (const c of ["1032", "2109", "2800", "3206"]) {
      expect(sePuedeReenviar(c)).toBe(false);
    }
  });
});

describe("observaciones (4000+)", () => {
  it("no son rechazo: el comprobante está aceptado", () => {
    const r = clasificarRechazo("4000");
    expect(r.reintentable).toBe(false);
    expect(r.motivo).toMatch(/aceptó/i);
    expect(r.queHacer).toMatch(/no hace falta/i);
  });
});

describe("sin código", () => {
  it("un fallo de red se puede reintentar", () => {
    for (const c of [null, undefined, "", "timeout", "ECONNRESET"]) {
      expect(sePuedeReenviar(c)).toBe(true);
    }
  });
});
