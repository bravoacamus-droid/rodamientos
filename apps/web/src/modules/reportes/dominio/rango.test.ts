import { describe, expect, it } from "vitest";

import {
  describirRango,
  diasDelRango,
  etiquetaPeriodo,
  finDeMes,
  granoSugerido,
  inicioDeSemana,
  leerRango,
  periodoAnterior,
  rangoDeAtajo,
  sumarDias,
  sumarMeses,
  type Grano,
} from "./rango";

// Miércoles 26 de agosto de 2026. Es el día de la demo, y sirve para que los
// atajos se lean contra una fecha que no es ni lunes ni fin de mes.
const HOY = "2026-08-26";

describe("sumarDias", () => {
  it("cruza el fin de mes", () => {
    expect(sumarDias("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("cruza el fin de año hacia atrás", () => {
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("aguanta el año bisiesto", () => {
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("sumarMeses", () => {
  it("retrocede sin repetir mes desde un día 31", () => {
    // Restando 30 días a un 31 de marzo se cae en el 1 de marzo, y la serie
    // saldría con marzo dos veces. Por eso es aritmética de año/mes.
    expect(sumarMeses("2026-03-31", -1)).toBe("2026-02-01");
  });

  it("cruza el año en los dos sentidos", () => {
    expect(sumarMeses("2026-01-15", -1)).toBe("2025-12-01");
    expect(sumarMeses("2026-12-15", 1)).toBe("2027-01-01");
  });
});

describe("finDeMes", () => {
  it.each([
    ["2026-02-10", "2026-02-28"],
    ["2028-02-10", "2028-02-29"],
    ["2026-08-01", "2026-08-31"],
    ["2026-04-30", "2026-04-30"],
  ])("%s → %s", (entrada, esperado) => {
    expect(finDeMes(entrada)).toBe(esperado);
  });
});

describe("inicioDeSemana", () => {
  it("parte en LUNES, como date_trunc('week') de Postgres", () => {
    // El 26/08/2026 es miércoles; su lunes es el 24.
    expect(inicioDeSemana("2026-08-26")).toBe("2026-08-24");
  });

  it("un lunes es su propio inicio", () => {
    expect(inicioDeSemana("2026-08-24")).toBe("2026-08-24");
  });

  it("el domingo pertenece a la semana que ya pasó", () => {
    // Domingo 30/08 → lunes 24/08. Partiendo en domingo daría el 30, y la
    // pantalla enseñaría una semana distinta que la base.
    expect(inicioDeSemana("2026-08-30")).toBe("2026-08-24");
  });
});

describe("rangoDeAtajo", () => {
  it("hoy es un solo día", () => {
    expect(rangoDeAtajo("hoy", HOY)).toEqual({ desde: HOY, hasta: HOY });
  });

  it("este mes va del día 1 a hoy, no a fin de mes", () => {
    // Hasta HOY: un informe no puede incluir días que no han pasado.
    expect(rangoDeAtajo("mes", HOY)).toEqual({ desde: "2026-08-01", hasta: HOY });
  });

  it("el mes pasado sí va completo", () => {
    expect(rangoDeAtajo("mes_pasado", HOY)).toEqual({
      desde: "2026-07-01",
      hasta: "2026-07-31",
    });
  });

  it("los últimos 3 meses incluyen el actual", () => {
    expect(rangoDeAtajo("trimestre", HOY)).toEqual({ desde: "2026-06-01", hasta: HOY });
  });

  it("los últimos 12 meses son 12, no 13", () => {
    // De septiembre a agosto: doce meses contando el actual.
    expect(rangoDeAtajo("12_meses", HOY)).toEqual({ desde: "2025-09-01", hasta: HOY });
  });

  it("este año arranca en enero", () => {
    expect(rangoDeAtajo("anio", HOY)).toEqual({ desde: "2026-01-01", hasta: HOY });
  });
});

describe("granoSugerido", () => {
  const casos: Array<[string, string, Grano]> = [
    ["2026-08-01", "2026-08-26", "dia"],
    ["2026-06-01", "2026-08-26", "semana"],
    ["2025-09-01", "2026-08-26", "mes"],
    ["2020-01-01", "2026-08-26", "anio"],
  ];

  it.each(casos)("de %s a %s → %s", (desde, hasta, grano) => {
    expect(granoSugerido(desde, hasta)).toBe(grano);
  });

  it("un solo día se mira por día", () => {
    expect(granoSugerido(HOY, HOY)).toBe("dia");
  });
});

describe("leerRango", () => {
  it("sin parámetros, los últimos 12 meses por mes", () => {
    const r = leerRango({}, HOY);
    expect(r.desde).toBe("2025-09-01");
    expect(r.hasta).toBe(HOY);
    expect(r.grano).toBe("mes");
  });

  it("el atajo manda sobre las fechas sueltas", () => {
    const r = leerRango({ atajo: "hoy", desde: "2020-01-01", hasta: "2020-12-31" }, HOY);
    expect(r.desde).toBe(HOY);
    expect(r.atajo).toBe("hoy");
  });

  it("acepta un rango a mano", () => {
    const r = leerRango({ desde: "2026-01-01", hasta: "2026-03-31" }, HOY);
    expect(r.desde).toBe("2026-01-01");
    expect(r.hasta).toBe("2026-03-31");
    expect(r.atajo).toBeNull();
  });

  it("si las fechas vienen al revés las intercambia, no devuelve vacío", () => {
    // Es un error de dedo evidente. La respuesta útil es el informe que se
    // quería, no una pantalla en blanco.
    const r = leerRango({ desde: "2026-03-31", hasta: "2026-01-01" }, HOY);
    expect(r.desde).toBe("2026-01-01");
    expect(r.hasta).toBe("2026-03-31");
  });

  it("una fecha con formato raro cae al valor por defecto", () => {
    // Llega de la URL, así que cualquiera puede escribir lo que quiera.
    const r = leerRango({ desde: "ayer", hasta: "'; drop table" }, HOY);
    expect(r.desde).toBe("2025-09-01");
    expect(r.hasta).toBe(HOY);
  });

  it("una granularidad inventada cae a la sugerida", () => {
    const r = leerRango({ desde: "2026-08-01", hasta: "2026-08-26", grano: "siglo" }, HOY);
    expect(r.grano).toBe("dia");
  });

  it("la granularidad explícita gana sobre la sugerida", () => {
    const r = leerRango({ desde: "2026-08-01", hasta: "2026-08-26", grano: "mes" }, HOY);
    expect(r.grano).toBe("mes");
  });
});

describe("etiquetaPeriodo", () => {
  it.each([
    ["2026-08-25", "dia", "25 ago"],
    ["2026-08-24", "semana", "sem. 24 ago"],
    ["2026-08-01", "mes", "ago 26"],
    ["2026-01-01", "anio", "2026"],
  ] as Array<[string, Grano, string]>)("%s por %s → %s", (iso, grano, esperado) => {
    expect(etiquetaPeriodo(iso, grano)).toBe(esperado);
  });
});

describe("describirRango", () => {
  it("un rango de un día que es hoy se dice «hoy»", () => {
    expect(describirRango({ desde: HOY, hasta: HOY, grano: "dia" }, HOY)).toBe("hoy");
  });

  it("un día suelto se nombra entero", () => {
    expect(
      describirRango({ desde: "2026-07-04", hasta: "2026-07-04", grano: "dia" }, HOY),
    ).toBe("el 4 de julio de 2026");
  });

  it("un rango se lee de corrido", () => {
    expect(
      describirRango({ desde: "2026-01-01", hasta: "2026-08-26", grano: "mes" }, HOY),
    ).toBe("del 1 de enero de 2026 al 26 de agosto de 2026");
  });
});

describe("diasDelRango", () => {
  it("del 25 al 25 es UN día, no cero", () => {
    // Es el periodo que se mira, no la distancia entre dos fechas. La
    // diferencia importa al sacar un promedio diario.
    expect(diasDelRango({ desde: "2026-08-25", hasta: "2026-08-25" })).toBe(1);
  });

  it("cuenta los dos extremos", () => {
    expect(diasDelRango({ desde: "2026-08-01", hasta: "2026-08-31" })).toBe(31);
  });

  it("nunca baja de uno", () => {
    expect(diasDelRango({ desde: "2026-08-31", hasta: "2026-08-01" })).toBe(1);
  });
});

describe("periodoAnterior", () => {
  it("de julio no da junio: da los 31 días anteriores", () => {
    // Julio tiene 31 días y junio 30. El «mes anterior» del calendario sería
    // una ventana MÁS CORTA, y comparar 31 días contra 30 dice que se vendió
    // más sin que nadie haya vendido más. La comparación es por longitud, así
    // que los 31 días previos al 1 de julio arrancan el 31 de mayo.
    expect(periodoAnterior({ desde: "2026-07-01", hasta: "2026-07-31" })).toEqual({
      desde: "2026-05-31",
      hasta: "2026-06-30",
    });
  });

  it("compara por LONGITUD, no por mes natural", () => {
    // «Este mes» un día 26 son 26 días. Compararlos contra los 31 de julio
    // diría que se vendió menos aunque se esté vendiendo más por día, y ese
    // es el error que hace que nadie se fíe de la comparación.
    expect(periodoAnterior({ desde: "2026-08-01", hasta: "2026-08-26" })).toEqual({
      desde: "2026-07-06",
      hasta: "2026-07-31",
    });
  });

  it("de un solo día da el día anterior", () => {
    expect(periodoAnterior({ desde: HOY, hasta: HOY })).toEqual({
      desde: "2026-08-25",
      hasta: "2026-08-25",
    });
  });

  it("el periodo anterior termina justo antes: no se solapan", () => {
    const rango = { desde: "2026-08-01", hasta: "2026-08-26" };
    const previo = periodoAnterior(rango);
    expect(previo.hasta < rango.desde).toBe(true);
    expect(diasDelRango(previo)).toBe(diasDelRango(rango));
  });
});
