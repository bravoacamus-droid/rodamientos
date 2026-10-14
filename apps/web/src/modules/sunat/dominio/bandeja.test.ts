import { describe, expect, it } from "vitest";

import { bajasPorFecha, diasEntre, ordenDeEnvio, plazoDeEnvio, siguienteCorrelativoBaja, tipoSunatDe } from "./bandeja";

describe("bandeja de SUNAT", () => {
  it("cuenta días entre fechas, cruzando meses", () => {
    expect(diasEntre("2026-10-14", "2026-10-14")).toBe(0);
    expect(diasEntre("2026-09-30", "2026-10-02")).toBe(2);
  });

  it("el plazo se pone en rojo el último día y después", () => {
    expect(plazoDeEnvio("2026-10-14", "2026-10-14").tono).toBe("ok");
    expect(plazoDeEnvio("2026-10-12", "2026-10-14")).toEqual({ tono: "aviso", texto: "Lleva 2 días sin enviar; quedan 1" });
    expect(plazoDeEnvio("2026-10-11", "2026-10-14").texto).toBe("Hoy es el último día para enviarla");
    expect(plazoDeEnvio("2026-10-01", "2026-10-14").texto).toMatch(/^Fuera de plazo/);
  });

  it("manda primero las facturas y luego las notas", () => {
    const orden = ordenDeEnvio([
      { tipo: "nota_credito" as const, fecha_emision: "2026-10-01", numero: "FC02-1" },
      { tipo: "factura" as const, fecha_emision: "2026-10-03", numero: "F002-9" },
      { tipo: "factura" as const, fecha_emision: "2026-10-02", numero: "F002-8" },
    ]);
    expect(orden.map((d) => d.numero)).toEqual(["F002-8", "F002-9", "FC02-1"]);
  });

  it("agrupa las bajas por fecha de emisión", () => {
    const g = bajasPorFecha([
      { fecha_emision: "2026-10-05", n: 1 },
      { fecha_emision: "2026-10-03", n: 2 },
      { fecha_emision: "2026-10-05", n: 3 },
    ]);
    expect(g.map((x) => [x.fecha, x.documentos.length])).toEqual([
      ["2026-10-03", 1],
      ["2026-10-05", 2],
    ]);
  });

  it("numera la comunicación del día y traduce el tipo", () => {
    expect(siguienteCorrelativoBaja([])).toBe(1);
    expect(siguienteCorrelativoBaja([1, 3])).toBe(4);
    expect(tipoSunatDe("nota_credito")).toBe("07");
  });
});
