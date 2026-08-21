import { describe, it, expect } from "vitest";
import { rucValido, dniValido, redondear, desglosarConIgv, usuarioSolCompleto } from "./validaciones";

/**
 * Reglas tributarias que no cambian, y por eso conviene fijarlas: si alguien
 * "simplifica" el dígito verificador o el redondeo, el error no se ve en
 * pantalla — aparece como un rechazo de SUNAT dos días después.
 */

describe("rucValido", () => {
  it("acepta RUC reales con su dígito verificador", () => {
    expect(rucValido("20609715732")).toBe(true); // persona jurídica
    expect(rucValido("10456789012")).toBe(false); // dígito verificador falso
  });

  it("rechaza lo que no es un RUC", () => {
    expect(rucValido("")).toBe(false);
    expect(rucValido("2060971573")).toBe(false); // 10 dígitos
    expect(rucValido("206097157321")).toBe(false); // 12 dígitos
    expect(rucValido("20 60971573 2")).toBe(false);
    // Un RUC no empieza por cualquier cosa: solo 10, 15, 17 o 20.
    expect(rucValido("30609715732")).toBe(false);
  });
});

describe("dniValido", () => {
  it("son exactamente ocho dígitos", () => {
    expect(dniValido("12345678")).toBe(true);
    expect(dniValido("1234567")).toBe(false);
    expect(dniValido("1234567a")).toBe(false);
  });
});

describe("redondeo y desglose del IGV", () => {
  it("redondea hacia arriba en el medio céntimo, como espera SUNAT", () => {
    expect(redondear(1.005)).toBe(1.01);
    expect(redondear(2.675)).toBe(2.68); // el clásico que el redondeo binario deja en 2.67
    expect(redondear(0.1 + 0.2)).toBe(0.3);
  });

  it("desglosa un precio que ya trae el IGV dentro", () => {
    // Es el caso de todo el retail peruano: el precio de lista lleva IGV.
    expect(desglosarConIgv(118, 18)).toEqual({ base: 100, igv: 18 });
    expect(desglosarConIgv(85, 18)).toEqual({ base: 72.03, igv: 12.97 });
  });

  it("base + IGV devuelve siempre el total, sin céntimos perdidos", () => {
    for (const total of [1, 0.1, 85, 1899, 33.33, 0.03]) {
      const { base, igv } = desglosarConIgv(total, 18);
      expect(redondear(base + igv)).toBe(redondear(total));
    }
  });
});

describe("usuarioSolCompleto", () => {
  it("antepone el RUC cuando falta", () => {
    // Sin el RUC delante, SUNAT contesta "El Usuario ingresado no existe", que
    // no apunta a la causa real y cuesta una tarde entenderlo.
    expect(usuarioSolCompleto("20609715732", "MODDATOS")).toBe("20609715732MODDATOS");
  });

  it("no lo duplica si ya viene completo", () => {
    expect(usuarioSolCompleto("20609715732", "20609715732MODDATOS")).toBe("20609715732MODDATOS");
  });
});
