import { describe, expect, it } from "vitest";

import { candidatosPara, queLeFalta } from "./anadir-a-ronda";
import type { ItemConsultado, ProveedorConsultado } from "./comparador";
import type { ProveedorConocido, Referencia } from "./referencia";

function item(p: Partial<ItemConsultado> & { item_id: string; producto_id: string }): ItemConsultado {
  return {
    codigo: "COD",
    descripcion: "Un producto",
    marca: null,
    unidad: "NIU",
    cantidad: 1,
    ...p,
  };
}

function enRonda(
  p: Partial<ProveedorConsultado> & { consulta_proveedor_id: string; proveedor_id: string },
): ProveedorConsultado {
  return {
    proveedor: "Alguien",
    estado: "esperando",
    moneda: "USD",
    tipo_cambio: null,
    incluye_igv: false,
    validez_hasta: null,
    dias_entrega: null,
    nota: null,
    tipoProveedor: "local",
    ...p,
  };
}

function conocido(p: Partial<ProveedorConocido> & { proveedor_id: string; proveedor: string }): ProveedorConocido {
  return {
    ultimoCostoUsd: null,
    ultimaCompra: null,
    activo: true,
    esHabitual: false,
    ...p,
  };
}

function referencia(producto_id: string, proveedores: ProveedorConocido[]): Referencia {
  return {
    producto_id,
    ultimoCosto: null,
    costoPromedio: null,
    precioVenta: null,
    precioMinimo: null,
    proveedores,
    historial: [],
    disponibilidad: null,
    diasPrometidos: null,
  };
}

// Dos productos que no vende la misma gente: unas chapas SKF y un retén. Es
// el caso de Rodatech, no un ejemplo inventado.
const CHAPAS = item({ item_id: "i-chapas", producto_id: "p-chapas", codigo: "TMAS100-005" });
const RETEN = item({ item_id: "i-reten", producto_id: "p-reten", codigo: "50X68X8TC" });
const ITEMS = [CHAPAS, RETEN];

const REFERENCIAS: Record<string, Referencia> = {
  "p-chapas": referencia("p-chapas", [
    conocido({ proveedor_id: "pr-corpus", proveedor: "Corpus", ultimoCostoUsd: 0.2 }),
    conocido({ proveedor_id: "pr-general", proveedor: "General", ultimoCostoUsd: 0.5 }),
  ]),
  "p-reten": referencia("p-reten", [
    conocido({ proveedor_id: "pr-general", proveedor: "General", ultimoCostoUsd: 1.8 }),
    conocido({ proveedor_id: "pr-retenes", proveedor: "Retenes", ultimoCostoUsd: 1.2 }),
    conocido({ proveedor_id: "pr-viejo", proveedor: "Viejo", activo: false }),
  ]),
};

describe("queLeFalta", () => {
  const enLaRonda = [enRonda({ consulta_proveedor_id: "cp1", proveedor_id: "pr-corpus" })];

  it("a quien no está en la ronda le falta todo", () => {
    const r = queLeFalta("pr-nuevo", ["i-chapas", "i-reten"], enLaRonda, new Set());
    expect(r.yaPreguntados).toEqual([]);
    expect(r.porPreguntar).toEqual(["i-chapas", "i-reten"]);
  });

  it("separa lo que ya se le preguntó de lo que no", () => {
    // El caso corriente: vende cuatro de los seis y se le va ampliando.
    const r = queLeFalta(
      "pr-corpus",
      ["i-chapas", "i-reten"],
      enLaRonda,
      new Set(["i-chapas|cp1"]),
    );
    expect(r.yaPreguntados).toEqual(["i-chapas"]);
    expect(r.porPreguntar).toEqual(["i-reten"]);
  });

  it("deja `porPreguntar` vacío cuando ya se le preguntó por todo", () => {
    // Esto es lo que la pantalla tiene que bloquear: un «añadido» que no
    // añade nada.
    const r = queLeFalta(
      "pr-corpus",
      ["i-chapas"],
      enLaRonda,
      new Set(["i-chapas|cp1"]),
    );
    expect(r.porPreguntar).toEqual([]);
  });
});

describe("candidatosPara", () => {
  it("propone a quien consta que vende lo elegido, sin escribir nada", () => {
    const r = candidatosPara(["i-chapas"], ITEMS, REFERENCIAS, [], new Set());
    expect(r.map((c) => c.proveedor)).toEqual(["Corpus", "General"]);
  });

  it("pone delante al que cubre más de lo elegido", () => {
    // General vende los dos, aunque en chapas sea más caro que Corpus: te
    // ahorra una conversación.
    const r = candidatosPara(["i-chapas", "i-reten"], ITEMS, REFERENCIAS, [], new Set());
    expect(r[0]?.proveedor).toBe("General");
    expect(r[0]?.vende).toBe(2);
  });

  it("a igualdad de cobertura, el que cobró menos", () => {
    const r = candidatosPara(["i-reten"], ITEMS, REFERENCIAS, [], new Set());
    expect(r.map((c) => c.proveedor)).toEqual(["Retenes", "General"]);
  });

  it("no propone a los inactivos", () => {
    const r = candidatosPara(["i-reten"], ITEMS, REFERENCIAS, [], new Set());
    expect(r.map((c) => c.proveedor)).not.toContain("Viejo");
  });

  it("manda al final al que ya no tiene nada que aportar, pero no lo esconde", () => {
    // Esconderlo hace pensar que se olvidó; enseñarlo bloqueado dice «a ese ya
    // se le preguntó».
    const enLaRonda = [enRonda({ consulta_proveedor_id: "cp1", proveedor_id: "pr-general", proveedor: "General" })];
    const r = candidatosPara(
      ["i-chapas", "i-reten"],
      ITEMS,
      REFERENCIAS,
      enLaRonda,
      new Set(["i-chapas|cp1", "i-reten|cp1"]),
    );
    expect(r.at(-1)?.proveedor).toBe("General");
    expect(r.at(-1)?.porPreguntar).toEqual([]);
    expect(r.map((c) => c.proveedor)).toContain("General");
  });

  it("al que solo le falta uno lo deja arriba, con lo que le falta", () => {
    const enLaRonda = [enRonda({ consulta_proveedor_id: "cp1", proveedor_id: "pr-general", proveedor: "General" })];
    const r = candidatosPara(
      ["i-chapas", "i-reten"],
      ITEMS,
      REFERENCIAS,
      enLaRonda,
      new Set(["i-chapas|cp1"]),
    );
    const general = r.find((c) => c.proveedor === "General");
    expect(general?.porPreguntar).toEqual(["i-reten"]);
    expect(general?.yaPreguntados).toEqual(["i-chapas"]);
  });

  it("sin referencias no propone a nadie, y no revienta", () => {
    // Pasa el primer día: 790 productos del Excel y cero compras hechas.
    expect(candidatosPara(["i-chapas"], ITEMS, {}, [], new Set())).toEqual([]);
  });
});
