import { describe, expect, it } from "vitest";

import {
  agruparPorFamilia,
  familiaDe,
  haceCuanto,
  ordenarBandeja,
  resumir,
  tonoSeveridad,
} from "./alerta";
import type { Alerta, Severidad, TipoAlerta } from "./tipos";

let n = 0;

function alerta(campos: Partial<Alerta> = {}): Alerta {
  n += 1;
  return {
    id: `alerta-${n}`,
    tipo: "stock_bajo",
    severidad: "media",
    titulo: "Stock bajo el mínimo",
    mensaje: "6205-2RS · saldo 3 (mínimo 10)",
    entidad_tipo: "producto",
    entidad_id: "11111111-1111-1111-1111-111111111111",
    entidad_nombre: "6205-2RS",
    valor: 3,
    accion_url: "/productos/11111111-1111-1111-1111-111111111111",
    leida: false,
    archivada: false,
    notificado_en: null,
    generada_en: "2026-08-26T10:00:00.000Z",
    ...campos,
  };
}

describe("ordenarBandeja", () => {
  it("pone lo más grave primero, aunque sea lo más viejo", () => {
    const orden = ordenarBandeja([
      alerta({ severidad: "baja", generada_en: "2026-08-26T12:00:00.000Z" }),
      alerta({ severidad: "critica", generada_en: "2026-08-20T08:00:00.000Z" }),
      alerta({ severidad: "media", generada_en: "2026-08-26T11:00:00.000Z" }),
    ]);

    expect(orden.map((a) => a.severidad)).toEqual(["critica", "media", "baja"]);
  });

  it("dentro del mismo nivel, lo no leído antes que lo leído", () => {
    const orden = ordenarBandeja([
      alerta({ severidad: "alta", leida: true, generada_en: "2026-08-26T12:00:00.000Z" }),
      alerta({ severidad: "alta", leida: false, generada_en: "2026-08-26T09:00:00.000Z" }),
    ]);

    expect(orden.map((a) => a.leida)).toEqual([false, true]);
  });

  it("a igual nivel y estado, lo más reciente primero", () => {
    const orden = ordenarBandeja([
      alerta({ generada_en: "2026-08-24T10:00:00.000Z" }),
      alerta({ generada_en: "2026-08-26T10:00:00.000Z" }),
    ]);

    expect(orden[0]?.generada_en).toBe("2026-08-26T10:00:00.000Z");
  });

  it("no toca el array que recibe", () => {
    const entrada = [alerta({ severidad: "baja" }), alerta({ severidad: "critica" })];
    const copia = [...entrada];

    ordenarBandeja(entrada);

    expect(entrada).toEqual(copia);
  });
});

describe("familiaDe", () => {
  const casos: Array<[TipoAlerta, string]> = [
    ["quiebre_stock", "almacen"],
    ["sobrestock", "almacen"],
    ["stock_negativo", "almacen"],
    ["credito_vencido", "dinero"],
    ["linea_credito", "dinero"],
    ["margen_bajo", "dinero"],
    ["cotizacion_por_vencer", "documentos"],
    ["sunat_rechazo", "documentos"],
  ];

  it.each(casos)("%s va a %s", (tipo, esperada) => {
    expect(familiaDe(tipo)).toBe(esperada);
  });
});

describe("agruparPorFamilia", () => {
  it("solo devuelve las familias que tienen algo", () => {
    const grupos = agruparPorFamilia([
      alerta({ tipo: "quiebre_stock" }),
      alerta({ tipo: "sunat_rechazo" }),
    ]);

    expect(grupos.map((g) => g.familia)).toEqual(["almacen", "documentos"]);
  });

  it("conserva el orden de entrada dentro del grupo", () => {
    const primera = alerta({ tipo: "stock_bajo" });
    const segunda = alerta({ tipo: "sobrestock" });

    const [grupo] = agruparPorFamilia([primera, segunda]);

    expect(grupo?.alertas.map((a) => a.id)).toEqual([primera.id, segunda.id]);
  });
});

describe("resumir", () => {
  it("cuenta el total, lo no leído y lo crítico", () => {
    const r = resumir([
      alerta({ severidad: "critica", leida: false }),
      alerta({ severidad: "critica", leida: true }),
      alerta({ severidad: "baja", leida: false }),
    ]);

    expect(r.total).toBe(3);
    expect(r.sinLeer).toBe(2);
    expect(r.criticas).toBe(2);
    expect(r.porSeveridad.baja).toBe(1);
  });

  it("de una bandeja vacía devuelve ceros y sin última", () => {
    const r = resumir([]);

    expect(r.total).toBe(0);
    expect(r.ultima).toBeNull();
  });

  it("la última es la más reciente, no la primera de la lista", () => {
    const r = resumir([
      alerta({ generada_en: "2026-08-20T10:00:00.000Z" }),
      alerta({ generada_en: "2026-08-26T10:00:00.000Z" }),
      alerta({ generada_en: "2026-08-22T10:00:00.000Z" }),
    ]);

    expect(r.ultima).toBe("2026-08-26T10:00:00.000Z");
  });
});

describe("tonoSeveridad", () => {
  const casos: Array<[Severidad, string]> = [
    ["critica", "danger"],
    ["alta", "danger"],
    ["media", "warning"],
    ["baja", "info"],
    ["info", "neutral"],
  ];

  it.each(casos)("%s → %s", (severidad, tono) => {
    expect(tonoSeveridad(severidad)).toBe(tono);
  });
});

describe("haceCuanto", () => {
  const AHORA = new Date("2026-08-26T12:00:00.000Z");

  it("redondea hacia abajo", () => {
    // 119 minutos son «1 h», no «2 h»: decir de menos es más honesto que
    // decir de más.
    expect(haceCuanto("2026-08-26T10:01:00.000Z", AHORA)).toBe("hace 1 h");
  });

  it("por debajo del minuto no da un número", () => {
    expect(haceCuanto("2026-08-26T11:59:30.000Z", AHORA)).toBe("hace un momento");
  });

  it("usa singular en el día y en el mes", () => {
    expect(haceCuanto("2026-08-25T11:00:00.000Z", AHORA)).toBe("hace un día");
    expect(haceCuanto("2026-07-20T12:00:00.000Z", AHORA)).toBe("hace un mes");
  });

  it("una fecha en el futuro no da un negativo", () => {
    expect(haceCuanto("2026-08-26T12:05:00.000Z", AHORA)).toBe("ahora mismo");
  });

  it("con una fecha ilegible devuelve vacío en lugar de reventar", () => {
    expect(haceCuanto("no es una fecha", AHORA)).toBe("");
  });
});
