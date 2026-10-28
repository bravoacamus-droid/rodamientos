import { describe, expect, it } from "vitest";

import { revisarDatosCertificado } from "./certificado";

const RUC = "20562681206";
const AHORA = new Date("2026-10-28T15:00:00Z");

const datos = {
  titular: "INVERSIONES RODATECH E.I.R.L.",
  rucs: [RUC],
  emisor: "LLAMA.PE",
  validoDesde: new Date("2026-10-01T00:00:00Z"),
  // 03:00 UTC del 29/10 son las 22:00 del 28/10 en Lima: vence el 28.
  validoHasta: new Date("2027-10-29T03:00:00Z"),
  sujeto: "CN=INVERSIONES RODATECH E.I.R.L., OU=20562681206",
};

describe("revisarDatosCertificado", () => {
  it("el bueno: sujeto, caducidad en hora de Lima y la frase de la pantalla", () => {
    expect(revisarDatosCertificado(datos, RUC, AHORA)).toEqual({
      ok: true,
      sujeto: `INVERSIONES RODATECH E.I.R.L. · RUC ${RUC}`,
      caducaEn: "2027-10-28",
      frase: `Certificado de INVERSIONES RODATECH E.I.R.L. · RUC ${RUC} · vence el 28/10/2027.`,
    });
  });

  it("de otro RUC no se guarda", () => {
    const r = revisarDatosCertificado({ ...datos, rucs: ["20553510661"] }, RUC, AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^No se guardó nada\. El certificado es del RUC 20553510661/);
  });

  it("vencido no se guarda", () => {
    const r = revisarDatosCertificado({ ...datos, validoHasta: new Date("2026-10-01T12:00:00Z") }, RUC, AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("venció el 01/10/2026");
  });

  it("sin RUC dentro: se guarda, pero lo avisa", () => {
    const r = revisarDatosCertificado({ ...datos, rucs: [] }, RUC, AHORA);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sujeto).toBe("INVERSIONES RODATECH E.I.R.L.");
      expect(r.frase).toContain("no se encontró el RUC");
    }
  });
});
