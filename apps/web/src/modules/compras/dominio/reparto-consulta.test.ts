import { describe, expect, it } from "vitest";

import {
  aPayloadDeConsulta,
  cuantosProveedores,
  gruposDeEnvio,
  modoSugerido,
  sinNadie,
  type ItemConsulta,
  type ProveedorParaRepartir,
} from "./reparto-consulta";

/** El caso real: unas chapas SKF y un retén. Proveedores distintos. */
const CHAPAS: ItemConsulta = {
  producto_id: "p-chapas",
  codigo: "TMAS100-005",
  descripcion: "CHAPAS CALIBRADAS SKF",
  marca: "SKF",
  unidad: "NIU",
  cantidad: 5,
};

const RETEN: ItemConsulta = {
  producto_id: "p-reten",
  codigo: "50X68X8TC",
  descripcion: "RETEN 50 X 68 X 8 TC",
  marca: null,
  unidad: "NIU",
  cantidad: 10,
};

const PROVEEDORES: ProveedorParaRepartir[] = [
  { id: "pr-skf", razon_social: "DISTRIBUIDORA SKF" },
  { id: "pr-retenes", razon_social: "RETENES DEL SUR" },
  { id: "pr-general", razon_social: "ALMACEN GENERAL" },
];

describe("modoSugerido", () => {
  it("propone SEPARADO si ningún proveedor cubre todo", () => {
    // Es el caso de Luis: mandar la lista entera al de retenes es pedirle
    // chapas SKF que no vende.
    expect(
      modoSugerido([CHAPAS, RETEN], {
        "p-chapas": ["pr-skf"],
        "p-reten": ["pr-retenes"],
      }),
    ).toBe("separado");
  });

  it("propone JUNTO si alguien los cubre todos", () => {
    // Con un distribuidor general se le pide de todo aunque no lo tenga todo:
    // es una sola conversación.
    expect(
      modoSugerido([CHAPAS, RETEN], {
        "p-chapas": ["pr-skf", "pr-general"],
        "p-reten": ["pr-retenes", "pr-general"],
      }),
    ).toBe("junto");
  });

  it("con un solo producto la distinción no existe", () => {
    expect(modoSugerido([CHAPAS], { "p-chapas": ["pr-skf"] })).toBe("junto");
  });

  it("sin proveedores conocidos propone separado, que es lo prudente", () => {
    expect(modoSugerido([CHAPAS, RETEN], {})).toBe("separado");
  });
});

describe("gruposDeEnvio", () => {
  it("a cada proveedor SOLO sus productos", () => {
    const grupos = gruposDeEnvio(
      [CHAPAS, RETEN],
      { "p-chapas": ["pr-skf"], "p-reten": ["pr-retenes"] },
      PROVEEDORES,
    );

    expect(grupos).toHaveLength(2);
    expect(grupos.find((g) => g.proveedor.id === "pr-skf")?.items).toEqual([CHAPAS]);
    expect(grupos.find((g) => g.proveedor.id === "pr-retenes")?.items).toEqual([RETEN]);
  });

  it("un proveedor marcado en varios recibe UN mensaje con todos", () => {
    // Tres mensajes a la misma persona por tres productos es lo que hace que
    // dejen de contestar.
    const grupos = gruposDeEnvio(
      [CHAPAS, RETEN],
      { "p-chapas": ["pr-general"], "p-reten": ["pr-general"] },
      PROVEEDORES,
    );
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.items).toEqual([CHAPAS, RETEN]);
  });

  it("respeta el orden de la consulta dentro de cada mensaje", () => {
    const grupos = gruposDeEnvio(
      [RETEN, CHAPAS],
      { "p-chapas": ["pr-general"], "p-reten": ["pr-general"] },
      PROVEEDORES,
    );
    expect(grupos[0]?.items.map((i) => i.codigo)).toEqual([RETEN.codigo, CHAPAS.codigo]);
  });

  it("un proveedor sin nada marcado no recibe mensaje", () => {
    const grupos = gruposDeEnvio([CHAPAS, RETEN], { "p-chapas": [] }, PROVEEDORES);
    expect(grupos).toEqual([]);
  });

  it("ignora a un proveedor que ya no está en la lista", () => {
    const grupos = gruposDeEnvio(
      [CHAPAS],
      { "p-chapas": ["pr-borrado"] },
      PROVEEDORES,
    );
    expect(grupos).toEqual([]);
  });
});

describe("sinNadie y cuantosProveedores", () => {
  it("dice qué productos no va a cotizar nadie", () => {
    expect(
      sinNadie([CHAPAS, RETEN], { "p-chapas": ["pr-skf"] }).map((i) => i.codigo),
    ).toEqual([RETEN.codigo]);
  });

  it("cuenta proveedores distintos, no marcas", () => {
    expect(
      cuantosProveedores({
        "p-chapas": ["pr-general", "pr-skf"],
        "p-reten": ["pr-general"],
      }),
    ).toBe(2);
  });
});

describe("aPayloadDeConsulta", () => {
  it("manda el reparto, no la lista entera a todos", () => {
    const payload = aPayloadDeConsulta(
      [CHAPAS, RETEN],
      { "p-chapas": ["pr-skf"], "p-reten": ["pr-retenes"] },
      PROVEEDORES,
      "del pedido COT1-000004",
    );

    expect(payload.items).toEqual([
      { producto_id: "p-chapas", cantidad: 5 },
      { producto_id: "p-reten", cantidad: 10 },
    ]);
    // Por razón social: «DISTRIBUIDORA SKF» antes que «RETENES DEL SUR».
    expect(payload.proveedores).toEqual([
      { proveedor_id: "pr-skf", productos: ["p-chapas"] },
      { proveedor_id: "pr-retenes", productos: ["p-reten"] },
    ]);
  });

  it("deja fuera el producto que no se le preguntó a nadie", () => {
    // Meterlo en la ronda dejaría una fila que no se puede completar nunca, y
    // la rejilla la enseñaría vacía para siempre.
    const payload = aPayloadDeConsulta(
      [CHAPAS, RETEN],
      { "p-chapas": ["pr-skf"] },
      PROVEEDORES,
      null,
    );
    expect(payload.items).toEqual([{ producto_id: "p-chapas", cantidad: 5 }]);
    expect(payload.proveedores).toHaveLength(1);
  });
});
