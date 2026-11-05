import { describe, expect, it } from "vitest";

import { familiaDeLaDescripcion, marcaDeLaDescripcion, proponerClasificacion } from "./clasificar";

const MARCAS = ["FAG", "SKF", "NTN", "FN", "OPTIBELT", "PARKER", "MC GILL", "TTO", "NAK", "SIN MARCA"];

describe("proponer la clasificación por la descripción (05/11)", () => {
  it("la marca es la última palabra que es una marca", () => {
    expect(marcaDeLaDescripcion("NJ207-E-XL-M1.C3 RODAMIENTO DE RODILLOS CILINDRICOS FAG", MARCAS)).toBe("FAG");
    expect(marcaDeLaDescripcion("OV-5.3X325 ORING DE VITON FN", MARCAS)).toBe("FN");
    expect(marcaDeLaDescripcion("3308 A RODAMIENTO DE BOLAS DE CONTACTO ANGULAR-SKF", MARCAS)).toBe("SKF");
    expect(marcaDeLaDescripcion("32307 J2/Q RODAMIENTO RODILLOS CONICOS MM_SKF", MARCAS)).toBe("SKF");
  });

  it("entiende cómo escribe SIMPLE algunas marcas", () => {
    expect(marcaDeLaDescripcion("HTD-280 FAJA DENTADA HTD-280 - OPTIBEL", MARCAS)).toBe("OPTIBELT");
    expect(marcaDeLaDescripcion("FAJA T10 1780/32 __ OPT", MARCAS)).toBe("OPTIBELT");
    expect(marcaDeLaDescripcion("VRING VS 30 MM__TT0", MARCAS)).toBe("TTO");
    expect(marcaDeLaDescripcion("CF.3.S RODAMIENTO DE LEVA PARA 3\" MC GILL", MARCAS)).toBe("MC GILL");
  });

  it("sin marca reconocible, no inventa", () => {
    expect(marcaDeLaDescripcion("HK-1015 RODAMIENTO DE AGUJAS", MARCAS)).toBeNull();
    expect(marcaDeLaDescripcion("KIT DE REPARACION BOMBA EBARA", MARCAS)).toBeNull();
  });

  it("la familia sale del tipo de producto", () => {
    expect(familiaDeLaDescripcion("NJ207-E-XL-M1.C3 RODAMIENTO DE RODILLOS CILINDRICOS FAG")).toEqual({
      familia: "RODAMIENTO",
      subfamilia: "DE RODILLOS CILINDRICO",
    });
    expect(familiaDeLaDescripcion("OV-5.3X325 ORING DE VITON FN")).toEqual({ familia: "SELLADO", subfamilia: "ORINGS" });
    expect(familiaDeLaDescripcion("6205-LLB RODAMIENTO DE BOLAS- NTN")?.subfamilia).toBe("RIGIDO DE BOLAS");
    expect(familiaDeLaDescripcion("21318E RODAMIENTO DE RODILLOS A ROTULA SKF")?.subfamilia).toBe("DE RODILLOS ESFERICOS");
    expect(familiaDeLaDescripcion("14M-1190/40 FAJA DE TRANSMISION SINCRONICA OPTIBELT")?.subfamilia).toBe("FAJAS");
    expect(familiaDeLaDescripcion("RACOR NEUMATICO ROSCA 1/2 NPT x 8MM AST")).toBeNull();
  });

  it("devuelve los ids de las listas de la pantalla, o vacío", () => {
    const r = proponerClasificacion("OV-5.3X325 ORING DE VITON FN", {
      marcas: [{ id: "m1", nombre: "FN" }],
      familias: [{ id: "f1", nombre: "SELLADO" }],
      subfamilias: [
        { id: "s1", nombre: "RETENES", familia_id: "f1" },
        { id: "s2", nombre: "ORINGS", familia_id: "f1" },
      ],
    });
    expect(r).toEqual({ marcaId: "m1", familiaId: "f1", subfamiliaId: "s2" });
    expect(proponerClasificacion("ALGO RARO", { marcas: [], familias: [], subfamilias: [] })).toEqual({
      marcaId: "",
      familiaId: "",
      subfamiliaId: "",
    });
  });
});
