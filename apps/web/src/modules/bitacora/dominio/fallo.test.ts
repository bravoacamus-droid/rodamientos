import { describe, expect, it } from "vitest";

import { fraseDelFallo, queFallo } from "./fallo";

const f = (mensaje: string, codigo: string | null = null, origen = "pagina") => ({ mensaje, codigo, origen });

describe("fraseDelFallo", () => {
  it("una pantalla que no cargó dice que se recargue", () => {
    expect(fraseDelFallo(f("Loading chunk app/layout failed."))).toMatch(/recargando/);
  });

  it("sin conexión dice que es un servicio de fuera", () => {
    expect(fraseDelFallo(f("fetch failed"))).toMatch(/servicio de fuera/);
  });

  it("un permiso negado lo dice sin jerga", () => {
    expect(fraseDelFallo(f("permission denied for table pagos", "42501"))).toMatch(/su rol/);
  });

  it("un repetido dice que ya existía", () => {
    expect(fraseDelFallo(f("duplicate key value violates unique constraint", "23505"))).toMatch(/ya existía/);
  });

  it("lo desconocido no enseña el error en crudo", () => {
    const frase = fraseDelFallo(f("_api_consultas__WEBPACK_IMPORTED_MODULE_4__.x is not a function"));
    expect(frase).not.toMatch(/WEBPACK/);
    expect(frase).toMatch(/hay que revisarlo/);
  });
});

describe("queFallo", () => {
  it("una pantalla del navegador dice cuál, sin el id", () => {
    expect(queFallo("navegador", "/cotizaciones/513615be-8d6d-4958-93e3-d60c9d750f77")).toBe(
      "Una pantalla dejó de responder: la ficha de una cotización",
    );
    expect(queFallo("navegador", "/facturacion/nueva")).toBe(
      "Una pantalla dejó de responder: al hacer una factura nueva",
    );
    expect(queFallo("navegador", "/dashboard")).toBe("Una pantalla dejó de responder: la pantalla de Inicio");
    expect(queFallo("navegador", null)).toBe("Una pantalla dejó de responder");
  });

  it("un fallo del servidor dice el módulo, no la función", () => {
    expect(queFallo("facturacion/detalleComprobante", null)).toBe("Falló algo en Facturación");
    expect(queFallo("compras/listosParaEntregar", "/compras")).toBe(
      "Falló algo en Compras, en la pantalla de Compras",
    );
  });

  it("lo que no conoce no se lo inventa", () => {
    expect(queFallo("otra/cosa", "/raro/abc")).toBe("Falló algo en el servidor");
  });
});
