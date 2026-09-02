import { describe, expect, it } from "vitest";

import { canalesDisponibles, enlaceCorreo, enlaceWhatsapp } from "./enlaces";

/**
 * Un enlace mal formado no falla: abre WhatsApp con un número que no existe, o
 * el cliente de correo en blanco, y quien lo pulsó cree que lo mandó. Por eso
 * lo que se comprueba es cuándo se devuelve NULL —o sea, cuándo NO hay que
 * ofrecer el botón.
 */

describe("enlaceWhatsapp", () => {
  it("arma el enlace con el número normalizado y el texto codificado", () => {
    const u = enlaceWhatsapp("999 888 777", "Hola, ¿me cotiza?");
    expect(u).toBe("https://wa.me/51999888777?text=Hola%2C%20%C2%BFme%20cotiza%3F");
  });

  it("sin teléfono no hay enlace", () => {
    expect(enlaceWhatsapp(null, "x")).toBeNull();
    expect(enlaceWhatsapp("", "x")).toBeNull();
    expect(enlaceWhatsapp("no tengo", "x")).toBeNull();
  });

  it("los saltos de línea sobreviven codificados", () => {
    // El mensaje va con la lista de códigos en líneas separadas: si los saltos
    // se perdieran, llegaría todo en un párrafo ilegible.
    expect(enlaceWhatsapp("999888777", "a\nb")).toContain("a%0Ab");
  });

  it("un texto larguísimo se recorta al tope de WhatsApp", () => {
    const u = enlaceWhatsapp("999888777", "x".repeat(5000)) ?? "";
    // 4.096 equis codificadas son 4.096 caracteres: la `x` no se escapa.
    expect(u.split("text=")[1]?.length).toBe(4096);
  });
});

describe("enlaceCorreo", () => {
  it("mete asunto y cuerpo", () => {
    const u = enlaceCorreo("ventas@skf.pe", "Cotización", "Hola:\nGracias");
    expect(u).toBe("mailto:ventas@skf.pe?subject=Cotizaci%C3%B3n&body=Hola%3A%0AGracias");
  });

  it("sin arroba o con espacios, no hay enlace", () => {
    expect(enlaceCorreo("ventas.skf.pe", "a", "b")).toBeNull();
    expect(enlaceCorreo("ventas @skf.pe", "a", "b")).toBeNull();
    expect(enlaceCorreo(null, "a", "b")).toBeNull();
  });

  it("los espacios de los extremos no impiden escribir", () => {
    expect(enlaceCorreo("  ventas@skf.pe  ", "a", "b")).toContain("mailto:ventas@skf.pe");
  });
});

describe("canalesDisponibles", () => {
  it("el campo whatsapp manda sobre el teléfono", () => {
    // Caso real: un fijo en `telefono` y el móvil en `whatsapp`. A un fijo no
    // se le escribe.
    const r = canalesDisponibles({ telefono: "01 4567890", whatsapp: "999888777" });
    expect(r.whatsapp).toBe(true);
  });

  it("si no hay whatsapp se cae al teléfono", () => {
    expect(canalesDisponibles({ telefono: "999888777" }).whatsapp).toBe(true);
  });

  it("un proveedor recién cargado no tiene ningún canal", () => {
    // Es el estado de los 97 que llegaron el 02/09: sin teléfono y sin correo.
    expect(canalesDisponibles({})).toEqual({ whatsapp: false, correo: false });
  });

  it("el correo se detecta por su lado", () => {
    expect(canalesDisponibles({ email: "a@b.pe" })).toEqual({
      whatsapp: false,
      correo: true,
    });
  });
});
