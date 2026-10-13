import { describe, expect, it } from "vitest";

import {
  alcanzaUmbral,
  conLeyendaSpot,
  LEYENDA_CON_RETENCION,
  LEYENDA_SIN_RETENCION,
  cuotasNetas,
  montoRetencion,
  netoAPagar,
  seRetiene,
} from "./retencion";

describe("la retención del IGV (14/10)", () => {
  it("el 3 % y lo que se cobra de verdad", () => {
    // El ejemplo de Willy: una factura de 100 se cobra 97.
    expect(montoRetencion(100)).toBe(3);
    expect(netoAPagar(100)).toBe(97);
    expect(montoRetencion(699.93)).toBe(21);
    expect(netoAPagar(699.93)).toBe(678.93);
  });

  it("solo desde S/ 700, al tipo de cambio del día", () => {
    expect(alcanzaUmbral(200, 3.5)).toBe(true); // S/ 700 justos
    expect(alcanzaUmbral(199.99, 3.5)).toBe(false);
    expect(alcanzaUmbral(200, null)).toBeNull();
  });

  it("la frase va arriba, se cambia sin duplicarse y respeta lo escrito", () => {
    expect(conLeyendaSpot("", true)).toBe(LEYENDA_CON_RETENCION);
    const con = conLeyendaSpot("Entregar en Chilca", true);
    expect(con).toBe(`${LEYENDA_CON_RETENCION}\nEntregar en Chilca`);
    expect(conLeyendaSpot(con, false)).toBe(`${LEYENDA_SIN_RETENCION}\nEntregar en Chilca`);
    expect(conLeyendaSpot("operación no sujeta spot\nhola", null)).toBe("hola");
    // La frase de antes (§BV) también se reconoce y se cambia.
    expect(conLeyendaSpot("OPERACIÓN SUJETA SPOT, RETENCIÓN 3%", false)).toBe(LEYENDA_SIN_RETENCION);
  });

  it("su F002-564: 242.21 con 7.27 retenidos deja una cuota de 234.94", () => {
    expect(montoRetencion(242.21)).toBe(7.27);
    expect(cuotasNetas([{ monto: 242.21 }], 7.27)).toEqual([{ monto: 234.94 }]);
    const dos = cuotasNetas([{ monto: 50 }, { monto: 50.01 }], 3);
    expect(dos.reduce((a, q) => a + q.monto, 0)).toBeCloseTo(97.01, 2);
    expect(cuotasNetas([{ monto: 10 }], 0)).toEqual([{ monto: 10 }]);
  });

  it("el interruptor: solo desde S/ 700, encendido por defecto, se puede apagar", () => {
    expect(seRetiene(true, null)).toBe(true);
    expect(seRetiene(true, "sin")).toBe(false);
    expect(seRetiene(false, null)).toBe(false);
    expect(seRetiene(false, "con")).toBe(false);
    expect(seRetiene(null, null)).toBe(false);
    expect(seRetiene(null, "con")).toBe(true);
  });
});
