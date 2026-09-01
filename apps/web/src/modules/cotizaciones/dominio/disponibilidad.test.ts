import { describe, expect, it } from "vitest";

import {
  AYUDA_DISPONIBILIDAD,
  DIAS_POR_DEFECTO,
  DISPONIBILIDADES,
  ETIQUETA_DISPONIBILIDAD,
  diasDe,
  faltaComprar,
  prometeDeMas,
  textoEntrega,
  type Disponibilidad,
} from "./disponibilidad";

/**
 * Lo que se prueba aquí acaba impreso en un PDF que el cliente lee y guarda.
 * Un plazo mal calculado no lo corrige nadie después: se convierte en una
 * promesa incumplida.
 */

describe("los tres valores", () => {
  it("son exactamente los que nombró Willy", () => {
    expect(DISPONIBILIDADES).toEqual(["inmediata", "exterior", "fabricacion"]);
  });

  it("todos tienen etiqueta y ayuda: ninguno sale en blanco en pantalla", () => {
    for (const d of DISPONIBILIDADES) {
      expect(ETIQUETA_DISPONIBILIDAD[d]).toBeTruthy();
      expect(AYUDA_DISPONIBILIDAD[d]).toBeTruthy();
    }
  });
});

describe("DIAS_POR_DEFECTO", () => {
  // Estos números están DOS veces: aquí y en `public.dias_por_defecto()` de la
  // migración 040. La prueba los deja escritos para que cambiar uno solo salte
  // en el momento, y no en una cotización ya enviada.
  it("mantiene los plazos que dio Willy", () => {
    expect(DIAS_POR_DEFECTO.exterior).toBe(15);
    expect(DIAS_POR_DEFECTO.fabricacion).toBe(3);
  });

  it("lo inmediato no tiene plazo, que es lo que significa", () => {
    expect(DIAS_POR_DEFECTO.inmediata).toBeNull();
  });
});

describe("diasDe", () => {
  it("usa el plazo del tipo cuando no se escribió ninguno", () => {
    expect(diasDe("exterior", null)).toBe(15);
    expect(diasDe("fabricacion", null)).toBe(3);
  });

  it("respeta el plazo escrito a mano para esa línea", () => {
    expect(diasDe("exterior", 30)).toBe(30);
    expect(diasDe("fabricacion", 4)).toBe(4);
  });

  it("nunca da plazo a lo inmediato, ni aunque llegue un número", () => {
    // Un 8 aquí vendría de un cambio de tipo con el campo ya escrito. Que
    // ganara el número imprimiría «Inmediata en 8 días» en el PDF.
    expect(diasDe("inmediata", 8)).toBeNull();
  });

  it("descarta lo que no es un plazo y cae al del tipo", () => {
    expect(diasDe("exterior", 0)).toBe(15);
    expect(diasDe("exterior", -5)).toBe(15);
    expect(diasDe("exterior", Number.NaN)).toBe(15);
  });

  it("redondea, porque los días no son fraccionarios", () => {
    expect(diasDe("exterior", 20.4)).toBe(20);
  });
});

describe("textoEntrega · lo que lee el cliente", () => {
  it("lo inmediato se dice en una palabra", () => {
    expect(textoEntrega("inmediata", null)).toBe("Inmediata");
  });

  it("dice el plazo Y el motivo, no solo el número", () => {
    // «15 días» a secas no le dice al cliente si es porque viene de fuera o
    // porque hay que fabricarlo, y eso cambia lo que decide.
    expect(textoEntrega("exterior", null)).toBe("15 días · exterior");
    expect(textoEntrega("fabricacion", null)).toBe("3 días · fabricación");
  });

  it("usa el plazo de la línea cuando lo hay", () => {
    expect(textoEntrega("exterior", 30)).toBe("30 días · exterior");
  });

  it("no escribe «1 días»", () => {
    expect(textoEntrega("fabricacion", 1)).toBe("1 día · fabricación");
  });
});

describe("prometeDeMas", () => {
  it("avisa si se promete inmediato sin tener stock", () => {
    expect(prometeDeMas("inmediata", 10, 4)).toBe(true);
  });

  it("no avisa si el stock alcanza", () => {
    expect(prometeDeMas("inmediata", 10, 10)).toBe(false);
    expect(prometeDeMas("inmediata", 10, 25)).toBe(false);
  });

  it("no avisa cuando ya se declaró que hay que traerlo", () => {
    expect(prometeDeMas("exterior", 10, 0)).toBe(false);
    expect(prometeDeMas("fabricacion", 10, 0)).toBe(false);
  });

  it("no avisa al revés: reservar lo que hay para otro cliente es válido", () => {
    expect(prometeDeMas("exterior", 2, 100)).toBe(false);
  });
});

describe("faltaComprar", () => {
  it("es la resta contra el stock", () => {
    expect(faltaComprar(10, 4)).toBe(6);
  });

  it("tener de sobra no es comprar en negativo", () => {
    expect(faltaComprar(4, 10)).toBe(0);
    expect(faltaComprar(10, 10)).toBe(0);
  });

  it("sin stock hay que comprarlo todo", () => {
    expect(faltaComprar(6, 0)).toBe(6);
  });
});

describe("el tipo cubre el enum de Postgres", () => {
  it("no acepta un valor que la base rechazaría", () => {
    // Compila-o-no-compila: si alguien añade un cuarto valor al enum de la
    // base sin tocar este módulo, el Record de etiquetas deja de cubrirlo.
    const todas: Record<Disponibilidad, boolean> = {
      inmediata: true,
      exterior: true,
      fabricacion: true,
    };
    expect(Object.keys(todas).sort()).toEqual([...DISPONIBILIDADES].sort());
  });
});
