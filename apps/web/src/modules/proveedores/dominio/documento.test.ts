import { describe, expect, it } from "vitest";

import {
  codigoDeProveedor,
  esConsultable,
  normalizarDocumento,
  revisarDocumento,
  variante,
} from "./documento";

/** RUC real de SUNAT con dígito verificador correcto (Backus). */
const RUC_BUENO = "20100113610";

describe("normalizar el documento", () => {
  it("se come todo lo que trae un RUC pegado desde un correo", () => {
    expect(normalizarDocumento("RUC", " R.U.C. 20-100113610 ")).toBe(RUC_BUENO);
  });

  it("deja SIN_DOC en null, no en cadena vacía", () => {
    // La restricción de la base exige `numero_documento is null`. Un "" ahí no
    // es «sin documento», es un documento vacío, y Postgres lo rechaza.
    expect(normalizarDocumento("SIN_DOC", "loquesea")).toBeNull();
  });

  it("compacta y sube a mayúsculas los alfanuméricos", () => {
    // Sin esto, "ab 1234" y "AB1234" entrarían dos veces al maestro.
    expect(normalizarDocumento("CE", "ab 1234")).toBe("AB1234");
  });

  it("devuelve null cuando no queda nada", () => {
    expect(normalizarDocumento("RUC", "sin dígitos")).toBeNull();
  });
});

describe("revisar el documento", () => {
  it("acepta un RUC con dígito verificador correcto", () => {
    expect(revisarDocumento("RUC", RUC_BUENO)).toEqual({ ok: true, numero: RUC_BUENO });
  });

  it("rechaza un RUC con el verificador mal", () => {
    // Es el error de tecleo más común y el más caro: cada uno que sale a la
    // red se lleva una de las 100 consultas del mes.
    const r = revisarDocumento("RUC", "20100113611");
    expect(r.ok).toBe(false);
  });

  it("acepta que un proveedor no tenga documento", () => {
    // No es una excepción rara: el vendedor de fuera que manda por DHL
    // muchas veces no tiene RUC peruano ni nada que sirva de clave.
    expect(revisarDocumento("SIN_DOC", null)).toEqual({ ok: true, numero: null });
  });

  it("exige número cuando el tipo lo pide", () => {
    const r = revisarDocumento("RUC", "");
    expect(r.ok).toBe(false);
  });

  it("acota la longitud de carné y pasaporte", () => {
    expect(revisarDocumento("PAS", "AB1").ok).toBe(false);
    expect(revisarDocumento("PAS", "AB123456").ok).toBe(true);
  });
});

describe("a quién se le puede consultar", () => {
  it("solo RUC y DNI: es lo que expone el proveedor", () => {
    expect(esConsultable("RUC", RUC_BUENO)).toBe(true);
    expect(esConsultable("DNI", "12345678")).toBe(true);
    expect(esConsultable("PAS", "AB123456")).toBe(false);
    expect(esConsultable("SIN_DOC", null)).toBe(false);
  });

  it("un documento inválido no sale a la red", () => {
    expect(esConsultable("RUC", "20100113611")).toBe(false);
  });
});

describe("código del proveedor", () => {
  it("se deriva del documento, que ya es único", () => {
    expect(codigoDeProveedor("RUC", RUC_BUENO, "BACKUS")).toBe(`RUC-${RUC_BUENO}`);
  });

  it("antepone el tipo, porque el UNIQUE es (tipo, número)", () => {
    // Un DNI 12345678 y un CE 12345678 pueden convivir; sin prefijo
    // compartirían código.
    expect(codigoDeProveedor("DNI", "12345678", "X")).toBe("DNI-12345678");
    expect(codigoDeProveedor("CE", "12345678", "X")).toBe("CE-12345678");
  });

  it("sin documento tira de la razón social", () => {
    expect(codigoDeProveedor("SIN_DOC", null, "Bearings Direct Ltd.")).toBe(
      "SD-BEARINGSDIRECTLT",
    );
  });

  it("quita las tildes igual que `unaccent` en la base", () => {
    // Si el código generado y su forma normalizada en Postgres no coinciden,
    // el UNIQUE deja de proteger lo que debería.
    expect(codigoDeProveedor("SIN_DOC", null, "Rodamientos Ñuñez")).toBe(
      "SD-RODAMIENTOSNUNEZ",
    );
  });

  it("no genera un código vacío ni con una razón social impronunciable", () => {
    expect(codigoDeProveedor("SIN_DOC", null, "···")).toBe("SD-PROVEEDOR");
  });

  it("las variantes se distinguen tras normalizar", () => {
    expect(variante("RUC-20100113610", 2)).toBe("RUC-20100113610-2");
    expect(variante("RUC-20100113610", 3)).toBe("RUC-20100113610-3");
  });
});
