import { describe, expect, it } from "vitest";

import { armarListadoPdf } from "./pdf-listado";

describe("listado en PDF (19/11)", () => {
  it("se arma en Node —el kardex lo genera el servidor— y pagina solo", async () => {
    const filas = Array.from({ length: 120 }, (_, i) => [`6205-${i}`, "Rodamiento rígido de bolas", "−3", "$ 1.00"]);
    const doc = await armarListadoPdf({
      titulo: "Kardex",
      empresa: "Inversiones Rodatech E.I.R.L.",
      subtitulo: "Todo el historial",
      resumen: [{ etiqueta: "Entradas", valor: "120" }],
      columnas: [{ titulo: "Código" }, { titulo: "Descripción" }, { titulo: "Saldo", derecha: true }, { titulo: "Costo", derecha: true }],
      filas,
      pie: ["Total", "", "", ""],
      nota: "Nota de prueba",
    });
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});
