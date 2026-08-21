import { describe, expect, it } from "vitest";
import {
  calcularEstado,
  estadoCuota,
  finCicloISO,
  inicioCicloISO,
  liberarCuota,
  marcarAgotado,
  pasaPrioridad,
  periodoActual,
  reservarCuota,
} from "./cuota";
import { ClienteSupabaseFalso, CONFIGURACION_CUOTA_PRUEBA } from "./soporte-pruebas";

describe("calcularEstado — umbrales de la especificación (sección 4.3)", () => {
  it.each([
    [0, "OK"],
    [49, "OK"],
    [50, "INFO"],
    [74, "INFO"],
    [75, "WARN"],
    [89, "WARN"],
    [90, "ALERT"],
    [94, "ALERT"],
    [95, "CRITICAL"],
    [99, "CRITICAL"],
    [100, "BLOCKED"],
    [110, "BLOCKED"],
  ] as const)("%d%% -> %s", (porcentaje, esperado) => {
    expect(calcularEstado(porcentaje)).toBe(esperado);
  });
});

describe("pasaPrioridad — modo reserva", () => {
  it("en BLOCKED nada pasa", () => {
    expect(pasaPrioridad("BLOCKED", "critical")).toBe(false);
    expect(pasaPrioridad("BLOCKED", "normal")).toBe(false);
    expect(pasaPrioridad("BLOCKED", "low")).toBe(false);
  });

  it("en CRITICAL solo pasa 'critical'", () => {
    expect(pasaPrioridad("CRITICAL", "critical")).toBe(true);
    expect(pasaPrioridad("CRITICAL", "normal")).toBe(false);
    expect(pasaPrioridad("CRITICAL", "low")).toBe(false);
  });

  it("en el resto de estados pasa cualquier prioridad", () => {
    for (const estado of ["OK", "INFO", "WARN", "ALERT"] as const) {
      expect(pasaPrioridad(estado, "critical")).toBe(true);
      expect(pasaPrioridad(estado, "normal")).toBe(true);
      expect(pasaPrioridad(estado, "low")).toBe(true);
    }
  });
});

describe("periodoActual / finCicloISO / inicioCicloISO", () => {
  it("con día de reinicio 1, el periodo es el mes calendario", () => {
    expect(periodoActual(new Date("2026-08-20T12:00:00Z"), 1)).toBe("2026-08");
    expect(periodoActual(new Date("2026-08-01T00:00:00Z"), 1)).toBe("2026-08");
    expect(periodoActual(new Date("2026-08-31T23:59:59Z"), 1)).toBe("2026-08");
  });

  it("con día de reinicio > 1, antes de ese día sigue en el ciclo del mes anterior", () => {
    expect(periodoActual(new Date("2026-08-20T00:00:00Z"), 25)).toBe("2026-07");
    expect(periodoActual(new Date("2026-08-25T00:00:00Z"), 25)).toBe("2026-08");
    expect(periodoActual(new Date("2026-08-26T00:00:00Z"), 25)).toBe("2026-08");
  });

  it("cruza el año correctamente", () => {
    expect(periodoActual(new Date("2026-01-05T00:00:00Z"), 10)).toBe("2025-12");
  });

  it("finCicloISO cae en el día de reinicio del mes siguiente", () => {
    expect(finCicloISO("2026-08", 1)).toBe(new Date(Date.UTC(2026, 8, 1)).toISOString());
    expect(finCicloISO("2026-08", 25)).toBe(new Date(Date.UTC(2026, 8, 25)).toISOString());
  });

  it("inicioCicloISO cae en el día de reinicio del mes actual", () => {
    expect(inicioCicloISO("2026-08", 1)).toBe(new Date(Date.UTC(2026, 7, 1)).toISOString());
    expect(inicioCicloISO("2026-08", 25)).toBe(new Date(Date.UTC(2026, 7, 25)).toISOString());
  });
});

describe("reservarCuota — reserva atómica (checklist de aceptación de la especificación)", () => {
  const ahora = new Date("2026-08-20T12:00:00Z");

  it("concede reservas hasta el límite y bloquea la siguiente", async () => {
    const cliente = new ClienteSupabaseFalso();
    const config = { ...CONFIGURACION_CUOTA_PRUEBA, limite: 3, reservaPorcentaje: 0 };

    const r1 = await reservarCuota(cliente, config, "normal", ahora);
    const r2 = await reservarCuota(cliente, config, "normal", ahora);
    const r3 = await reservarCuota(cliente, config, "normal", ahora);
    const r4 = await reservarCuota(cliente, config, "normal", ahora);

    expect(r1.concedida).toBe(true);
    expect(r2.concedida).toBe(true);
    expect(r3.concedida).toBe(true);
    expect(r3.cuota.consumidas).toBe(3);
    expect(r3.cuota.estado).toBe("BLOCKED");

    expect(r4.concedida).toBe(false);
    expect(r4.cuota.estado).toBe("BLOCKED");
    // Al 100% no debe haber salido ninguna petición HTTP: eso lo garantiza
    // quien llama (proveedor.ts) al ver `concedida: false` antes de hacer fetch.
  });

  it("en modo reserva (>=95%) solo 'critical' pasa", async () => {
    const cliente = new ClienteSupabaseFalso();
    const config = { ...CONFIGURACION_CUOTA_PRUEBA, limite: 100, reservaPorcentaje: 5 };

    // Deja el contador en 95/100 reservando con prioridad crítica (siempre pasa).
    for (let i = 0; i < 95; i++) {
      await reservarCuota(cliente, config, "critical", ahora);
    }

    const normal = await reservarCuota(cliente, config, "normal", ahora);
    expect(normal.concedida).toBe(false);
    expect(normal.cuota.estado).toBe("CRITICAL");

    const critica = await reservarCuota(cliente, config, "critical", ahora);
    expect(critica.concedida).toBe(true);
    expect(critica.cuota.consumidas).toBe(96);
  });

  it("dos reservas concurrentes para la última unidad no superan el límite", async () => {
    const cliente = new ClienteSupabaseFalso();
    const config = { ...CONFIGURACION_CUOTA_PRUEBA, limite: 1, reservaPorcentaje: 0 };

    const [a, b] = await Promise.all([
      reservarCuota(cliente, config, "normal", ahora),
      reservarCuota(cliente, config, "normal", ahora),
    ]);

    const concedidas = [a, b].filter((r) => r.concedida);
    expect(concedidas).toHaveLength(1);
  });
});

describe("liberarCuota y marcarAgotado", () => {
  const ahora = new Date("2026-08-20T12:00:00Z");

  it("liberarCuota devuelve una unidad reservada que no llegó a salir", async () => {
    const cliente = new ClienteSupabaseFalso();
    const config = { ...CONFIGURACION_CUOTA_PRUEBA, limite: 5 };

    await reservarCuota(cliente, config, "normal", ahora);
    await reservarCuota(cliente, config, "normal", ahora);
    await liberarCuota(cliente, config, ahora);

    const estado = await estadoCuota(cliente, config, ahora);
    expect(estado.consumidas).toBe(1);
  });

  it("marcarAgotado bloquea el ciclo aunque queden unidades sin usar (429 del proveedor)", async () => {
    const cliente = new ClienteSupabaseFalso();
    const config = { ...CONFIGURACION_CUOTA_PRUEBA, limite: 100 };

    await reservarCuota(cliente, config, "normal", ahora);
    await marcarAgotado(cliente, config, ahora);

    const siguiente = await reservarCuota(cliente, config, "critical", ahora);
    expect(siguiente.concedida).toBe(false);
    expect(siguiente.cuota.estado).toBe("BLOCKED");
  });
});

describe("estadoCuota", () => {
  it("sin reservas previas, devuelve 0% OK", async () => {
    const cliente = new ClienteSupabaseFalso();
    const estado = await estadoCuota(cliente, CONFIGURACION_CUOTA_PRUEBA, new Date("2026-08-20T00:00:00Z"));
    expect(estado.consumidas).toBe(0);
    expect(estado.estado).toBe("OK");
    expect(estado.restantes).toBe(CONFIGURACION_CUOTA_PRUEBA.limite);
  });
});
