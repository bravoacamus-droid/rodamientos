import { describe, expect, it } from "vitest";

import {
  alcanzaUmbral,
  conLeyendaSpot,
  LEYENDA_CON_RETENCION,
  LEYENDA_SIN_RETENCION,
  montoRetencion,
  netoAPagar,
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
  });
});
