import { describe, expect, it } from "vitest";

import {
  avisosDelInicial,
  formatearNumero,
  huecosQueDeja,
  ordenarSeries,
  proximoCorrelativo,
  proximoNumero,
  serieValida,
} from "./serie";
import type { SerieDocumento } from "./tipos";

function serie(campos: Partial<SerieDocumento> = {}): SerieDocumento {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tipo: "factura",
    serie: "F001",
    correlativo_inicial: 1,
    correlativo_actual: 0,
    longitud: 8,
    predeterminada: true,
    activo: true,
    descripcion: null,
    ...campos,
  };
}

describe("proximoCorrelativo", () => {
  // Los mismos casos límite que `siguiente_correlativo()` en la base:
  //   greatest(correlativo_actual + 1, correlativo_inicial)

  it("serie recién creada: arranca en el inicial", () => {
    expect(proximoCorrelativo({ correlativo_actual: 0, correlativo_inicial: 1 })).toBe(1);
  });

  it("serie migrada sin emitir nada todavía: arranca donde quedó la anterior", () => {
    expect(
      proximoCorrelativo({ correlativo_actual: 0, correlativo_inicial: 1235 }),
    ).toBe(1235);
  });

  it("en marcha: sigue por el actual, no por el inicial", () => {
    expect(
      proximoCorrelativo({ correlativo_actual: 1240, correlativo_inicial: 1235 }),
    ).toBe(1241);
  });

  it("un inicial por debajo del actual no hace retroceder nada", () => {
    expect(proximoCorrelativo({ correlativo_actual: 50, correlativo_inicial: 1 })).toBe(51);
  });
});

describe("formatearNumero", () => {
  it("rellena con ceros hasta la longitud", () => {
    expect(formatearNumero({ serie: "F001", longitud: 8 }, 1235)).toBe("F001-00001235");
  });

  it("una serie interna usa su propia longitud", () => {
    expect(formatearNumero({ serie: "CMP", longitud: 5 }, 7)).toBe("CMP-00007");
  });

  it("un número que no cabe no se recorta: se ve entero y se ve el problema", () => {
    expect(formatearNumero({ serie: "F001", longitud: 4 }, 123456)).toBe("F001-123456");
  });
});

describe("proximoNumero", () => {
  it("junta las dos reglas", () => {
    expect(proximoNumero(serie({ correlativo_actual: 12, correlativo_inicial: 1235 }))).toBe(
      "F001-00001235",
    );
  });
});

describe("huecosQueDeja", () => {
  it("cuenta los que se saltan", () => {
    expect(huecosQueDeja({ correlativo_actual: 12 }, 1235)).toBe(1222);
  });

  it("continuar sin saltos deja cero", () => {
    expect(huecosQueDeja({ correlativo_actual: 12 }, 13)).toBe(0);
  });

  it("un inicial por debajo no deja huecos negativos", () => {
    expect(huecosQueDeja({ correlativo_actual: 100 }, 5)).toBe(0);
  });
});

describe("avisosDelInicial", () => {
  it("rechaza el cero", () => {
    const avisos = avisosDelInicial(serie(), 0);
    expect(avisos[0]?.tono).toBe("danger");
  });

  it("rechaza un número que no cabe en la longitud", () => {
    const avisos = avisosDelInicial(serie({ longitud: 4 }), 123456);
    expect(avisos.some((a) => a.tono === "danger")).toBe(true);
  });

  it("avisa de que no hará nada si el inicial va por detrás", () => {
    const avisos = avisosDelInicial(serie({ correlativo_actual: 500 }), 100);
    expect(avisos.some((a) => a.texto.includes("no cambiará nada"))).toBe(true);
    // Y no promete un próximo número que no va a pasar.
    expect(avisos.some((a) => a.texto.includes("El próximo documento será"))).toBe(false);
  });

  it("en una serie fiscal, los huecos son un aviso", () => {
    const avisos = avisosDelInicial(serie({ tipo: "factura", correlativo_actual: 12 }), 1235);
    const hueco = avisos.find((a) => a.texto.includes("1222"));
    expect(hueco?.tono).toBe("warning");
    expect(hueco?.texto).toContain("SUNAT");
  });

  it("en una serie interna, los huecos son solo información", () => {
    const avisos = avisosDelInicial(
      serie({ tipo: "compra", serie: "CMP", longitud: 5, correlativo_actual: 12 }),
      100,
    );
    const hueco = avisos.find((a) => a.texto.includes("87"));
    expect(hueco?.tono).toBe("info");
  });

  it("siempre termina diciendo cuál será el próximo número", () => {
    const avisos = avisosDelInicial(serie({ correlativo_actual: 12 }), 1235);
    expect(avisos.at(-1)?.texto).toContain("F001-00001235");
  });
});

describe("serieValida", () => {
  it.each(["F001", "B001", "T1", "EF01"])("%s vale", (s) => {
    expect(serieValida(s)).toBe(true);
  });

  it.each(["f001", "F", "F0011234", "F-01", "F 01", ""])("%s no vale", (s) => {
    expect(serieValida(s)).toBe(false);
  });
});

describe("ordenarSeries", () => {
  it("pone primero lo que ve SUNAT, en el orden en que se emite", () => {
    const orden = ordenarSeries([
      serie({ tipo: "compra", serie: "CMP" }),
      serie({ tipo: "boleta", serie: "B001" }),
      serie({ tipo: "factura", serie: "F001" }),
    ]);

    expect(orden.map((s) => s.tipo)).toEqual(["factura", "boleta", "compra"]);
  });

  it("dentro del mismo tipo, la predeterminada arriba", () => {
    const orden = ordenarSeries([
      serie({ serie: "F002", predeterminada: false }),
      serie({ serie: "F001", predeterminada: true }),
    ]);

    expect(orden[0]?.serie).toBe("F001");
  });
});
