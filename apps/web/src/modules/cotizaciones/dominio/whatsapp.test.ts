import { describe, expect, it } from "vitest";

import {
  enlaceWhatsapp,
  formatoFecha,
  mensajeCotizacion,
  normalizarTelefono,
} from "./whatsapp";

const DATOS = {
  numero: "COT1-000012",
  cliente: "MINERA LOS ANDES S.A.C.",
  total: 158.12,
  validaHasta: "2026-09-05",
  emisor: "RODATECH",
};

describe("normalizarTelefono", () => {
  it("móvil peruano de nueve dígitos", () => {
    expect(normalizarTelefono("999888777")).toBe("51999888777");
  });

  it("aguanta espacios, guiones y paréntesis", () => {
    expect(normalizarTelefono("999 888 777")).toBe("51999888777");
    expect(normalizarTelefono("999-888-777")).toBe("51999888777");
    expect(normalizarTelefono("(999) 888 777")).toBe("51999888777");
  });

  it("ya con código de país lo deja igual", () => {
    expect(normalizarTelefono("+51 999 888 777")).toBe("51999888777");
    expect(normalizarTelefono("51999888777")).toBe("51999888777");
  });

  it("quita el 00 del prefijo internacional viejo", () => {
    expect(normalizarTelefono("0051999888777")).toBe("51999888777");
  });

  it("fijo de Lima con su cero de tránsito", () => {
    expect(normalizarTelefono("01 4567890")).toBe("5114567890");
  });

  it("fijo de Lima sin el cero", () => {
    expect(normalizarTelefono("14567890")).toBe("5114567890");
  });

  it("fijo de provincia", () => {
    expect(normalizarTelefono("084 234567")).toBe("5184234567");
  });

  it("respeta un número extranjero", () => {
    expect(normalizarTelefono("+1 305 555 1234")).toBe("13055551234");
  });

  it("devuelve null en vez de inventar un número", () => {
    // Un enlace mal formado no falla: abre WhatsApp con un número que no
    // existe, y el vendedor cree que lo mandó.
    expect(normalizarTelefono(null)).toBeNull();
    expect(normalizarTelefono("")).toBeNull();
    expect(normalizarTelefono("   ")).toBeNull();
    expect(normalizarTelefono("no tiene")).toBeNull();
    expect(normalizarTelefono("123")).toBeNull();
    expect(normalizarTelefono("12345678901234567890")).toBeNull();
  });
});

describe("formatoFecha", () => {
  it("pasa a la forma que se lee en Perú", () => {
    expect(formatoFecha("2026-09-05")).toBe("05/09/2026");
  });

  it("lo que no es una fecha ISO se devuelve tal cual", () => {
    expect(formatoFecha("mañana")).toBe("mañana");
  });
});

describe("mensajeCotizacion", () => {
  it("lleva el número, el monto y hasta cuándo vale", () => {
    const m = mensajeCotizacion(DATOS);
    expect(m).toContain("COT1-000012");
    expect(m).toContain("158.12");
    expect(m).toContain("05/09/2026");
    expect(m).toContain("MINERA LOS ANDES S.A.C.");
  });

  it("dice que el monto incluye IGV, para que nadie sume dos veces", () => {
    expect(mensajeCotizacion(DATOS)).toContain("incluye IGV");
  });

  it("incluye el enlace solo si se le pasa uno", () => {
    expect(mensajeCotizacion(DATOS)).not.toContain("http");
    expect(
      mensajeCotizacion({ ...DATOS, enlace: "https://x.pe/c/1" }),
    ).toContain("https://x.pe/c/1");
  });
});

describe("enlaceWhatsapp", () => {
  it("arma la URL con el texto ya codificado", () => {
    const url = enlaceWhatsapp("999888777", DATOS);
    expect(url).toMatch(/^https:\/\/wa\.me\/51999888777\?text=/);
    expect(url).not.toContain(" ");
    expect(url).not.toContain("\n");
  });

  it("el texto sobrevive al viaje de ida y vuelta", () => {
    const url = enlaceWhatsapp("999888777", DATOS) as string;
    const texto = decodeURIComponent(url.split("?text=")[1] as string);
    expect(texto).toBe(mensajeCotizacion(DATOS));
  });

  it("sin teléfono usable devuelve null, para no ofrecer el botón", () => {
    expect(enlaceWhatsapp(null, DATOS)).toBeNull();
    expect(enlaceWhatsapp("no tiene", DATOS)).toBeNull();
  });
});
