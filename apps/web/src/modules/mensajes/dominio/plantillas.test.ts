import { describe, expect, it } from "vitest";

import {
  TOPE_PLANTILLA,
  VARIABLES,
  listaDeItems,
  renderizar,
  revisarPlantilla,
  sePuede,
  variablesDesconocidas,
  variablesUsadas,
  type Uso,
} from "./plantillas";

/**
 * Lo que se prueba aquí acaba en un mensaje que sale con el nombre de Rodatech
 * a un proveedor. Un `{provedor}` que viaje tal cual da vergüenza; uno que se
 * sustituya por vacío es peor, porque no se nota hasta que el proveedor
 * pregunta de qué empresa le hablan.
 */

const USOS: Uso[] = ["pedido_precio", "cotizacion", "cobranza", "general"];

describe("las variables de cada uso", () => {
  it("todas tienen ayuda y ejemplo: ninguna sale desnuda en la pantalla", () => {
    for (const uso of USOS) {
      for (const v of VARIABLES[uso]) {
        expect(v.clave).toMatch(/^[a-z0-9_]+$/);
        expect(v.ayuda.length).toBeGreaterThan(0);
        expect(v.ejemplo.length).toBeGreaterThan(0);
      }
    }
  });

  it("ninguna se repite dentro del mismo uso", () => {
    for (const uso of USOS) {
      const claves = VARIABLES[uso].map((v) => v.clave);
      expect(new Set(claves).size).toBe(claves.length);
    }
  });

  it("los cuatro usos tienen firma y empresa", () => {
    for (const uso of USOS) {
      const claves = VARIABLES[uso].map((v) => v.clave);
      expect(claves).toContain("yo");
      expect(claves).toContain("empresa");
    }
  });

  it("cobranza NO ofrece {items}: ahí no hay productos que listar", () => {
    expect(VARIABLES.cobranza.map((v) => v.clave)).not.toContain("items");
    expect(VARIABLES.pedido_precio.map((v) => v.clave)).toContain("items");
  });
});

describe("encontrar las variables de un texto", () => {
  it("las saca en orden y sin repetir", () => {
    expect(variablesUsadas("Hola {proveedor}, soy {yo} de {empresa}. {yo}")).toEqual([
      "proveedor",
      "yo",
      "empresa",
    ]);
  });

  it("un texto sin llaves no tiene ninguna", () => {
    expect(variablesUsadas("Buenos días, ¿me cotiza?")).toEqual([]);
  });

  it("no confunde una llave con espacios ni una llave suelta", () => {
    expect(variablesUsadas("precio {de mercado} y { } y {")).toEqual([]);
  });

  it("dice cuáles no existen para ese uso", () => {
    // El caso real: una errata al teclear el nombre de la variable.
    expect(variablesDesconocidas("Hola {provedor}, soy {yo}", "pedido_precio")).toEqual([
      "provedor",
    ]);
  });

  it("una variable buena en otro uso también es desconocida aquí", () => {
    expect(variablesDesconocidas("Debe {items}", "cobranza")).toEqual(["items"]);
  });
});

describe("sustituir", () => {
  it("cambia lo que conoce", () => {
    expect(renderizar("Hola {proveedor}, soy {yo}.", { proveedor: "SKF PERÚ", yo: "Willy" })).toBe(
      "Hola SKF PERÚ, soy Willy.",
    );
  });

  it("la misma variable dos veces se cambia las dos", () => {
    expect(renderizar("{yo} y {yo}", { yo: "Willy" })).toBe("Willy y Willy");
  });

  /**
   * Lo importante de esta prueba: NO se borra. Un hueco en blanco no se ve al
   * revisar y sí lo ve el proveedor.
   */
  it("lo que no conoce se queda tal cual, a la vista", () => {
    expect(renderizar("Hola {provedor}", { proveedor: "SKF" })).toBe("Hola {provedor}");
  });

  it("un valor vacío SÍ sustituye: es una decisión de quien manda", () => {
    expect(renderizar("Hola {proveedor}.", { proveedor: "" })).toBe("Hola .");
  });

  it("un valor con llaves dentro no se vuelve a sustituir", () => {
    // Si el nombre del proveedor llevara llaves, una segunda pasada las
    // interpretaría como variables. `replace` con función no lo hace.
    expect(renderizar("{proveedor}", { proveedor: "{yo}", yo: "Willy" })).toBe("{yo}");
  });
});

describe("la lista de ítems", () => {
  it("una línea por producto, el código primero", () => {
    expect(
      listaDeItems([
        { codigo: "6205-2RS", marca: "SKF", descripcion: "RODAMIENTO", cantidad: 10, unidad: "NIU" },
      ]),
    ).toBe("- 6205-2RS · SKF · RODAMIENTO — 10 NIU");
  });

  it("sin marca ni descripción, solo el código", () => {
    expect(listaDeItems([{ codigo: "0-230", cantidad: 3 }])).toBe("- 0-230 — 3 und");
  });

  it("las cantidades enteras no salen con decimales", () => {
    expect(listaDeItems([{ codigo: "A", cantidad: 2 }])).toContain("— 2 und");
    expect(listaDeItems([{ codigo: "A", cantidad: 2.5 }])).toContain("— 2.50 und");
  });

  it("varios van en líneas separadas", () => {
    const t = listaDeItems([
      { codigo: "A", cantidad: 1 },
      { codigo: "B", cantidad: 2 },
    ]);
    expect(t.split("\n")).toHaveLength(2);
  });

  it("una lista vacía no deja una línea en blanco suelta", () => {
    expect(listaDeItems([])).toBe("");
  });
});

describe("revisar antes de guardar", () => {
  const BUENA = "Hola {proveedor}:\n{items}\nGracias.\n{yo}";

  it("una plantilla bien escrita no tiene nada que decir", () => {
    expect(revisarPlantilla(BUENA, "pedido_precio", "whatsapp")).toEqual([]);
  });

  it("vacía es un error y no se puede guardar", () => {
    const r = revisarPlantilla("   ", "pedido_precio", "whatsapp");
    expect(sePuede(r)).toBe(false);
  });

  it("pasarse del tope es un error, y se dice por qué", () => {
    const r = revisarPlantilla("x".repeat(TOPE_PLANTILLA + 1), "pedido_precio", "whatsapp");
    expect(sePuede(r)).toBe(false);
    expect(r[0]?.mensaje).toContain("WhatsApp corta por el final");
  });

  it("una errata en una variable avisa pero deja guardar", () => {
    const r = revisarPlantilla("Hola {provedor} {items} {yo}", "pedido_precio", "whatsapp");
    expect(sePuede(r)).toBe(true);
    expect(r.map((a) => a.mensaje).join(" ")).toContain("{provedor}");
  });

  it("un pedido de precio sin {items} avisa: no diría qué se pide", () => {
    const r = revisarPlantilla("Hola {proveedor}, ¿me cotiza? {yo}", "pedido_precio", "whatsapp");
    expect(r.map((a) => a.mensaje).join(" ")).toContain("{items}");
    expect(sePuede(r)).toBe(true);
  });

  it("un WhatsApp sin firma avisa", () => {
    const r = revisarPlantilla("Hola {proveedor}: {items}", "pedido_precio", "whatsapp");
    expect(r.map((a) => a.mensaje).join(" ")).toContain("firma");
  });

  it("un correo sin firma no avisa: ahí va en la cuenta que lo manda", () => {
    const r = revisarPlantilla("Hola {proveedor}: {items}", "pedido_precio", "correo");
    expect(r.map((a) => a.mensaje).join(" ")).not.toContain("firma");
  });

  it("en cobranza no se pide {items}", () => {
    const r = revisarPlantilla("Debe {total}, {cliente}. {yo}", "cobranza", "whatsapp");
    expect(r).toEqual([]);
  });
});
