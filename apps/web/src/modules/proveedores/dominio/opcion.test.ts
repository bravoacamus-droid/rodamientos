import { describe, expect, it } from "vitest";

import {
  motivoNoSeleccionable,
  resumenMarcas,
  resumenPago,
  ultimaVez,
  type ProveedorOpcion,
} from "./opcion";

const base: ProveedorOpcion = {
  id: "1",
  codigo: "PRV0001",
  razon_social: "IMPORTACIONES DEL NORTE SAC",
  numero_documento: "20100000001",
  tipo_documento: "RUC",
  tipo: "local",
  pais: "Perú",
  direccion: null,
  contacto: null,
  telefono: null,
  whatsapp: null,
  email: null,
  dias_pago: 0,
  lead_time_dias: 0,
  activo: true,
  marcas: [],
  compras: 0,
  ultima_compra: null,
};

describe("motivoNoSeleccionable", () => {
  it("deja elegir a un proveedor activo", () => {
    expect(motivoNoSeleccionable(base)).toBeNull();
  });

  it("explica por qué no se puede elegir a uno dado de baja", () => {
    const motivo = motivoNoSeleccionable({ ...base, activo: false });
    // Lo que importa no es el texto exacto sino que DIGA algo accionable: la
    // fila sale en la lista a propósito (033) para que nadie lo dé de alta dos
    // veces, así que tiene que explicar qué hacer con ella.
    expect(motivo).toContain("Reactívalo");
  });
});

describe("resumenPago", () => {
  it("dice «Al contado» cuando no hay días de pago", () => {
    expect(resumenPago({ dias_pago: 0, lead_time_dias: 0 })).toBe("Al contado");
  });

  it("dice a cuántos días paga", () => {
    expect(resumenPago({ dias_pago: 30, lead_time_dias: 0 })).toBe("Paga a 30 días");
  });

  it("añade la entrega cuando el proveedor tarda", () => {
    expect(resumenPago({ dias_pago: 30, lead_time_dias: 7 })).toBe(
      "Paga a 30 días · entrega en 7 días",
    );
  });

  it("no dice «1 días»", () => {
    expect(resumenPago({ dias_pago: 0, lead_time_dias: 1 })).toBe(
      "Al contado · entrega en 1 día",
    );
  });

  it("un lead time negativo no pinta nada", () => {
    // No debería pasar —`proveedores_dias_pos` lo impide en la base— pero el
    // dominio no puede fiarse de que quien lo llame venga de ahí.
    expect(resumenPago({ dias_pago: 15, lead_time_dias: -3 })).toBe("Paga a 15 días");
  });
});

describe("resumenMarcas", () => {
  it("no dice nada cuando no hay marcas", () => {
    expect(resumenMarcas([])).toBe("");
  });

  it("las lista enteras cuando caben", () => {
    expect(resumenMarcas(["SKF", "FAG"])).toBe("SKF, FAG");
  });

  it("no recorta cuando son exactamente las que caben", () => {
    expect(resumenMarcas(["SKF", "FAG", "NSK"])).toBe("SKF, FAG, NSK");
  });

  it("dice cuántas quedan fuera", () => {
    // El «+12» es el dato: sin él, un distribuidor de quince marcas y otro de
    // cuatro se leen igual.
    const muchas = ["SKF", "FAG", "NSK", "NTN", "KOYO", "TIMKEN", "INA"];
    expect(resumenMarcas(muchas)).toBe("SKF, FAG, NSK +4");
  });

  it("respeta cuántas se le piden", () => {
    expect(resumenMarcas(["SKF", "FAG", "NSK", "NTN"], 1)).toBe("SKF +3");
  });
});

describe("ultimaVez", () => {
  const hoy = "2026-08-31";

  it("dice que nunca se le compró", () => {
    expect(ultimaVez(null, hoy)).toBe("Nunca se le compró");
  });

  it("hoy y ayer no llevan «hace»", () => {
    expect(ultimaVez("2026-08-31", hoy)).toBe("Comprado hoy");
    expect(ultimaVez("2026-08-30", hoy)).toBe("Comprado ayer");
  });

  it("cuenta días sueltos dentro de la semana", () => {
    expect(ultimaVez("2026-08-28", hoy)).toBe("Comprado hace 3 días");
  });

  it("pasa a semanas y a meses", () => {
    expect(ultimaVez("2026-08-17", hoy)).toBe("Comprado hace 2 semanas");
    expect(ultimaVez("2026-06-01", hoy)).toBe("Comprado hace 3 meses");
  });

  it("pasa a años", () => {
    expect(ultimaVez("2024-08-31", hoy)).toBe("Comprado hace 2 años");
  });

  it("una fecha futura se lee como hoy, no como «hace -3 días»", () => {
    // Pasa: una compra fechada a mano hacia adelante.
    expect(ultimaVez("2026-09-03", hoy)).toBe("Comprado hoy");
  });

  it("una fecha ilegible no revienta la fila", () => {
    expect(ultimaVez("no es una fecha", hoy)).toBe("Comprado hoy");
  });
});
