import { describe, expect, it } from "vitest";

import {
  codigoDeCliente,
  esConsultable,
  normalizarDocumento,
  revisarDocumento,
  variante,
} from "./documento";

/**
 * Los RUC de las pruebas son reales y públicos:
 *
 *   20131312955 · SUNAT
 *   20100047218 · Banco de Crédito del Perú
 *   20100070970 · Supermercados Peruanos
 *
 * El 10412458091 no es de nadie en particular: es un número con prefijo 10
 * —persona natural con negocio— y dígito verificador correcto, que es el otro
 * caso que el maestro recibe a diario y que no puede quedar sin cubrir.
 *
 * Se usan de verdad porque el dígito verificador es lo único que separa una
 * consulta útil de una consulta quemada, y un número inventado que «parece»
 * un RUC no prueba nada.
 */

describe("normalizarDocumento", () => {
  it("deja solo dígitos en RUC y DNI", () => {
    expect(normalizarDocumento("RUC", " 20-131312955 ")).toBe("20131312955");
    expect(normalizarDocumento("RUC", "R.U.C. 20131312955")).toBe("20131312955");
    expect(normalizarDocumento("DNI", "46 027 897")).toBe("46027897");
  });

  it("SIN_DOC es siempre null, aunque llegue un número", () => {
    // La restricción `clientes_documento_ok` exige null; un "" o un número
    // suelto ahí rompen el INSERT.
    expect(normalizarDocumento("SIN_DOC", "20131312955")).toBeNull();
    expect(normalizarDocumento("SIN_DOC", "")).toBeNull();
  });

  it("la cadena vacía es null, nunca la cadena vacía", () => {
    expect(normalizarDocumento("RUC", "")).toBeNull();
    expect(normalizarDocumento("RUC", "   ")).toBeNull();
    expect(normalizarDocumento("CE", "  ")).toBeNull();
    expect(normalizarDocumento("RUC", null)).toBeNull();
    expect(normalizarDocumento("RUC", undefined)).toBeNull();
  });

  it("compacta y sube a mayúsculas el carné y el pasaporte", () => {
    expect(normalizarDocumento("CE", " ab 123456 ")).toBe("AB123456");
    expect(normalizarDocumento("PAS", "x1234567")).toBe("X1234567");
  });
});

describe("revisarDocumento · RUC", () => {
  it("acepta RUC reales", () => {
    for (const ruc of ["20131312955", "20100047218", "20100070970", "10412458091"]) {
      expect(revisarDocumento("RUC", ruc)).toEqual({ ok: true, numero: ruc });
    }
  });

  it("normaliza antes de validar", () => {
    expect(revisarDocumento("RUC", " 20-131312955 ")).toEqual({
      ok: true,
      numero: "20131312955",
    });
  });

  it("rechaza un dígito verificador equivocado", () => {
    // Mismo RUC de SUNAT con el último dígito cambiado: es el error de tecleo
    // que más cuota quemaría si saliera a la red.
    const r = revisarDocumento("RUC", "20131312954");
    expect(r.ok).toBe(false);
  });

  it("rechaza longitudes que no son 11", () => {
    expect(revisarDocumento("RUC", "2013131295").ok).toBe(false);
    expect(revisarDocumento("RUC", "201313129550").ok).toBe(false);
  });

  it("rechaza prefijos que SUNAT no emite", () => {
    // 30 no es un tipo de contribuyente; el dígito verificador da igual.
    expect(revisarDocumento("RUC", "30131312955").ok).toBe(false);
  });

  it("sin número dice que falta, no que es inválido", () => {
    const r = revisarDocumento("RUC", "");
    expect(r).toEqual({ ok: false, error: "Falta el número de documento." });
  });
});

describe("revisarDocumento · DNI", () => {
  it("acepta ocho dígitos", () => {
    expect(revisarDocumento("DNI", "46027897")).toEqual({
      ok: true,
      numero: "46027897",
    });
  });

  it("rechaza siete y nueve dígitos", () => {
    expect(revisarDocumento("DNI", "4602789").ok).toBe(false);
    expect(revisarDocumento("DNI", "460278971").ok).toBe(false);
  });

  it("las letras se caen al normalizar y el resto ya no da ocho dígitos", () => {
    expect(revisarDocumento("DNI", "4602789A").ok).toBe(false);
  });
});

describe("revisarDocumento · CE, PAS y SIN_DOC", () => {
  it("acepta alfanuméricos de 4 a 20", () => {
    expect(revisarDocumento("CE", "001234567")).toEqual({
      ok: true,
      numero: "001234567",
    });
    expect(revisarDocumento("PAS", "ab1234")).toEqual({ ok: true, numero: "AB1234" });
  });

  it("rechaza lo que la restricción de la base rechazaría", () => {
    expect(revisarDocumento("CE", "abc").ok).toBe(false);
    expect(revisarDocumento("PAS", "A".repeat(21)).ok).toBe(false);
  });

  it("SIN_DOC pasa siempre, y pasa con número null", () => {
    expect(revisarDocumento("SIN_DOC", null)).toEqual({ ok: true, numero: null });
    expect(revisarDocumento("SIN_DOC", "12345678")).toEqual({ ok: true, numero: null });
  });
});

describe("esConsultable", () => {
  it("solo RUC y DNI válidos salen a la red", () => {
    expect(esConsultable("RUC", "20131312955")).toBe(true);
    expect(esConsultable("DNI", "46027897")).toBe(true);
  });

  it("un documento inválido NUNCA gasta cuota", () => {
    expect(esConsultable("RUC", "20131312954")).toBe(false);
    expect(esConsultable("RUC", "2013131295")).toBe(false);
    expect(esConsultable("DNI", "4602789")).toBe(false);
    expect(esConsultable("RUC", "")).toBe(false);
  });

  it("carné, pasaporte y sin documento no tienen a quién preguntarle", () => {
    expect(esConsultable("CE", "001234567")).toBe(false);
    expect(esConsultable("PAS", "AB1234")).toBe(false);
    expect(esConsultable("SIN_DOC", null)).toBe(false);
  });
});

/**
 * Réplica en JS de `public.normalizar_codigo`: mayúsculas, sin tildes y sin
 * espacios ni separadores (. _ / -). El UNIQUE de `clientes` va sobre ESTA
 * expresión, así que los códigos generados tienen que ser distintos DESPUÉS
 * de pasar por aquí, no antes.
 */
function normalizarCodigo(codigo: string): string {
  return codigo
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toUpperCase()
    .replace(/[\s._/-]+/g, "");
}

describe("codigoDeCliente", () => {
  it("con documento, el código sale del documento", () => {
    expect(codigoDeCliente("RUC", "20131312955", "SUNAT")).toBe("RUC-20131312955");
    expect(codigoDeCliente("DNI", "46027897", "Juan Pérez")).toBe("DNI-46027897");
    expect(codigoDeCliente("CE", "001234567", "Otro")).toBe("CE-001234567");
  });

  it("el mismo número con distinto tipo NO comparte código normalizado", () => {
    // El UNIQUE del documento es (tipo, número): DNI 12345678 y CE 12345678
    // pueden coexistir, y sin el prefijo chocarían por el código.
    const a = codigoDeCliente("DNI", "12345678", "Uno");
    const b = codigoDeCliente("CE", "12345678", "Otro");
    expect(normalizarCodigo(a)).not.toBe(normalizarCodigo(b));
  });

  it("sin documento cae a la razón social, sin tildes ni signos", () => {
    expect(codigoDeCliente("SIN_DOC", null, "Talleres Ñañez S.A.C.")).toBe(
      "SD-TALLERESNANEZSAC",
    );
    expect(codigoDeCliente("SIN_DOC", null, "Mecánica Rápida")).toBe(
      "SD-MECANICARAPIDA",
    );
  });

  it("una razón social sin letras ni números no deja el código vacío", () => {
    // `codigo` es NOT NULL y el UNIQUE va sobre normalizar_codigo(), que
    // devuelve null para la cadena vacía: un código en blanco no es guardable.
    expect(codigoDeCliente("SIN_DOC", null, "···")).toBe("SD-CLIENTE");
    expect(normalizarCodigo(codigoDeCliente("SIN_DOC", null, "···"))).not.toBe("");
  });

  it("es determinista: mismos datos, mismo código", () => {
    expect(codigoDeCliente("RUC", "20100047218", "Banco de Crédito del Perú")).toBe(
      codigoDeCliente("RUC", "20100047218", "Banco de Crédito del Perú"),
    );
  });
});

describe("variante", () => {
  it("cada intento da un código distinto YA NORMALIZADO", () => {
    const base = codigoDeCliente("SIN_DOC", null, "Ferretería El Sol");
    const vistos = new Set([normalizarCodigo(base)]);
    for (let i = 2; i <= 25; i++) {
      const v = normalizarCodigo(variante(base, i));
      expect(vistos.has(v)).toBe(false);
      vistos.add(v);
    }
    expect(vistos.size).toBe(25);
  });
});
