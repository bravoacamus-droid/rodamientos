import { describe, expect, it } from "vitest";

import { fraseDelFallo } from "./fallo";

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
