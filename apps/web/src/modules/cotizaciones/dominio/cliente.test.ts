import { describe, expect, it } from "vitest";

import {
  digitosDe,
  motivoNoSeleccionable,
  pareceDocumento,
  resaltar,
  resumenCredito,
  ultimaVez,
  type ClienteOpcion,
} from "./cliente";

/** Un cliente cualquiera, para no repetir los quince campos en cada caso. */
function cliente(cambios: Partial<ClienteOpcion> = {}): ClienteOpcion {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    codigo: "MIN-01",
    razon_social: "MINERA LOS ANDES S.A.C.",
    nombre_comercial: null,
    numero_documento: "20100047218",
    tipo_documento: "RUC",
    contacto: null,
    telefono: null,
    condicion_pago: "contado",
    dias_credito: 0,
    bloqueado: false,
    motivo_bloqueo: null,
    activo: true,
    cotizaciones: 0,
    ultima_cotizacion: null,
    ...cambios,
  };
}

describe("motivoNoSeleccionable", () => {
  it("deja cotizar a un cliente normal", () => {
    expect(motivoNoSeleccionable(cliente())).toBeNull();
  });

  it("explica el bloqueo con su motivo, que siempre existe", () => {
    expect(
      motivoNoSeleccionable(
        cliente({ bloqueado: true, motivo_bloqueo: "Debe 3 facturas de mayo" }),
      ),
    ).toBe("Bloqueado: Debe 3 facturas de mayo");
  });

  it("aguanta un bloqueo sin motivo escrito", () => {
    expect(motivoNoSeleccionable(cliente({ bloqueado: true, motivo_bloqueo: "  " }))).toBe(
      "Está bloqueado y no se le puede cotizar.",
    );
  });

  it("el desactivado pesa más que el bloqueo: reactivar es el primer paso", () => {
    const r = motivoNoSeleccionable(
      cliente({ activo: false, bloqueado: true, motivo_bloqueo: "Moroso" }),
    );
    expect(r).toContain("desactivado");
  });
});

describe("resumenCredito", () => {
  it("al contado", () => {
    expect(resumenCredito(cliente())).toBe("Al contado");
  });

  it("a crédito dice a cuántos días", () => {
    expect(
      resumenCredito(cliente({ condicion_pago: "credito", dias_credito: 30 })),
    ).toBe("A crédito · 30 días");
  });

  it("a crédito sin días configurados no inventa un «0 días»", () => {
    expect(
      resumenCredito(cliente({ condicion_pago: "credito", dias_credito: 0 })),
    ).toBe("A crédito");
  });
});

describe("ultimaVez", () => {
  const hoy = "2026-08-28";

  it("nunca", () => {
    expect(ultimaVez(null, hoy)).toBe("Nunca cotizado");
  });

  it("hoy y ayer se dicen con su nombre", () => {
    expect(ultimaVez("2026-08-28", hoy)).toBe("Cotizado hoy");
    expect(ultimaVez("2026-08-27", hoy)).toBe("Cotizado ayer");
  });

  it("los primeros días, en días", () => {
    expect(ultimaVez("2026-08-25", hoy)).toBe("Cotizado hace 3 días");
    expect(ultimaVez("2026-08-22", hoy)).toBe("Cotizado hace 6 días");
  });

  it("a partir de la semana, en semanas", () => {
    expect(ultimaVez("2026-08-21", hoy)).toBe("Cotizado hace 1 semana");
    expect(ultimaVez("2026-08-07", hoy)).toBe("Cotizado hace 3 semanas");
  });

  it("pasado el mes, en meses", () => {
    // 31 días exactos: es el primer día que ya no se cuenta en semanas.
    expect(ultimaVez("2026-07-28", hoy)).toBe("Cotizado hace 1 mes");
    expect(ultimaVez("2026-05-28", hoy)).toBe("Cotizado hace 3 meses");
  });

  it("pasado el año, en años", () => {
    expect(ultimaVez("2025-08-28", hoy)).toBe("Cotizado hace 1 año");
    expect(ultimaVez("2023-08-28", hoy)).toBe("Cotizado hace 3 años");
  });

  it("una fecha futura no dice «hace -3 días»", () => {
    // Pasa con una cotización fechada a mano hacia adelante.
    expect(ultimaVez("2026-09-30", hoy)).toBe("Cotizado hoy");
  });

  it("una fecha ilegible no revienta la fila", () => {
    expect(ultimaVez("ayer", hoy)).toBe("Cotizado hoy");
  });
});

describe("resaltar", () => {
  it("sin término, un solo trozo sin marcar", () => {
    expect(resaltar("MINERA LOS ANDES", "")).toEqual([
      { texto: "MINERA LOS ANDES", coincide: false },
    ]);
  });

  it("marca la coincidencia y deja el resto", () => {
    expect(resaltar("MINERA LOS ANDES", "los")).toEqual([
      { texto: "MINERA ", coincide: false },
      { texto: "LOS", coincide: true },
      { texto: " ANDES", coincide: false },
    ]);
  });

  it("devuelve el texto ORIGINAL, no el aplanado", () => {
    const trozos = resaltar("DISTRIBUCIONES PERÚ S.A.C.", "peru");
    expect(trozos.map((t) => t.texto).join("")).toBe("DISTRIBUCIONES PERÚ S.A.C.");
    expect(trozos.find((t) => t.coincide)?.texto).toBe("PERÚ");
  });

  it("una tilde ANTES de la coincidencia no la desplaza", () => {
    // Es el error que mata a la versión ingenua: `normalize("NFD")` alarga la
    // cadena y `indexOf` devuelve un índice que ya no vale para el original.
    const trozos = resaltar("MÁQUINAS ANDINAS", "andinas");
    expect(trozos.find((t) => t.coincide)?.texto).toBe("ANDINAS");
  });

  it("marca TODAS las apariciones", () => {
    const trozos = resaltar("FERRETERÍA FERRETERA", "ferrete");
    expect(trozos.filter((t) => t.coincide)).toHaveLength(2);
    expect(trozos.map((t) => t.texto).join("")).toBe("FERRETERÍA FERRETERA");
  });

  it("sin coincidencia, el texto entero sin marcar", () => {
    expect(resaltar("MINERA LOS ANDES", "zzz")).toEqual([
      { texto: "MINERA LOS ANDES", coincide: false },
    ]);
  });

  it("una eñe se resalta buscándola con ene", () => {
    const trozos = resaltar("ÑAÑEZ HERMANOS", "nanez");
    expect(trozos.find((t) => t.coincide)?.texto).toBe("ÑAÑEZ");
  });
});

describe("digitosDe y pareceDocumento", () => {
  it("se queda solo con los dígitos, como hace la base", () => {
    expect(digitosDe("20-100047 218")).toBe("20100047218");
    expect(digitosDe("MINERA")).toBe("");
  });

  it("once dígitos es un RUC y ocho un DNI", () => {
    expect(pareceDocumento("20100047218")).toBe(true);
    expect(pareceDocumento("46027897")).toBe(true);
    expect(pareceDocumento("20-100047 218")).toBe(true);
  });

  it("un trozo de número no se afirma que sea un documento", () => {
    expect(pareceDocumento("2010")).toBe(false);
    expect(pareceDocumento("")).toBe(false);
  });

  it("un nombre con números dentro no es un documento", () => {
    expect(pareceDocumento("SAC 20100047218")).toBe(false);
  });
});
