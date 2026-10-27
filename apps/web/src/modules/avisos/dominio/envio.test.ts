import { describe, expect, it } from "vitest";

import {
  type AlertaPorAvisar,
  describirAparato,
  endpointPermitido,
  esCodigoDeBaja,
  filtrarPara,
  notificacionesPara,
  planDeEnvio,
  rutaSegura,
  seDaPorAvisada,
} from "./envio";

let n = 0;
function alerta(p: Partial<AlertaPorAvisar> = {}): AlertaPorAvisar {
  n += 1;
  return {
    id: `a${n}`,
    titulo: "Factura por vencer",
    mensaje: `F002-0000055${n} · OVOSUR — saldo $ 100.00`,
    severidad: "media",
    accion_url: `/facturacion/${n}`,
    generada_en: `2026-10-27T12:00:0${n % 10}Z`,
    ...p,
  };
}

describe("filtrarPara", () => {
  it("deja fuera lo que está por debajo de la severidad elegida", () => {
    const lista = [alerta({ severidad: "baja" }), alerta({ severidad: "media" }), alerta({ severidad: "critica" })];
    expect(filtrarPara(lista, "media").map((a) => a.severidad)).toEqual(["critica", "media"]);
    expect(filtrarPara(lista, "alta")).toHaveLength(1);
    expect(filtrarPara(lista, "info")).toHaveLength(3);
  });

  it("a igual gravedad, la más antigua primero", () => {
    const vieja = alerta({ severidad: "alta", generada_en: "2026-10-01T00:00:00Z" });
    const nueva = alerta({ severidad: "alta", generada_en: "2026-10-20T00:00:00Z" });
    expect(filtrarPara([nueva, vieja], "media").map((a) => a.id)).toEqual([vieja.id, nueva.id]);
  });
});

describe("notificacionesPara", () => {
  it("sin nada que le toque, no sale nada", () => {
    expect(notificacionesPara([alerta({ severidad: "baja" })], "media")).toEqual([]);
    expect(notificacionesPara([], "info")).toEqual([]);
  });

  it("hasta tres, una por aviso, con su enlace", () => {
    const lista = [alerta(), alerta({ severidad: "critica", titulo: "Saldo negativo en almacén" }), alerta()];
    const r = notificacionesPara(lista, "media");
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ titulo: "Saldo negativo en almacén", urgente: true });
    expect(r[1]!.url).toMatch(/^\/facturacion\//);
    expect(r[1]!.urgente).toBe(false);
  });

  it("con más de tres, UN resumen que abre la bandeja", () => {
    const lista = [
      ...Array.from({ length: 5 }, () => alerta()),
      alerta({ severidad: "critica", titulo: "Saldo negativo en almacén" }),
      alerta({ severidad: "alta", titulo: "Comprobante sin llegar a SUNAT" }),
    ];
    const r = notificacionesPara(lista, "media");
    expect(r).toHaveLength(1);
    expect(r[0]!.titulo).toBe("Tienes 7 avisos nuevos");
    expect(r[0]!.url).toBe("/alertas");
    expect(r[0]!.urgente).toBe(true);
    expect(r[0]!.cuerpo).toBe(
      "2 son urgentes. Saldo negativo en almacén, Comprobante sin llegar a SUNAT, Factura por vencer (5).",
    );
  });

  it("el resumen corta la lista a tres títulos", () => {
    const lista = ["A", "B", "C", "D"].map((titulo, i) => alerta({ titulo, generada_en: `2026-10-0${i + 1}T00:00:00Z` }));
    const r = notificacionesPara(lista, "media");
    expect(r[0]!.cuerpo).toBe("Ninguno es urgente. A, B, C y más.");
    expect(r[0]!.urgente).toBe(false);
  });

  it("el enlace nunca sale del ERP", () => {
    const r = notificacionesPara([alerta({ accion_url: "https://malo.com" })], "media");
    expect(r[0]!.url).toBe("/alertas");
  });
});

describe("planDeEnvio", () => {
  it("cada aparato con su filtro, y fuera los que no reciben nada", () => {
    const lista = [alerta({ severidad: "media" }), alerta({ severidad: "critica" })];
    const plan = planDeEnvio(lista, [
      { id: "todo", severidad_minima: "info" },
      { id: "urgente", severidad_minima: "alta" },
      { id: "nada", severidad_minima: "critica" },
    ]);
    expect(plan.map((p) => [p.destino.id, p.notificaciones.length])).toEqual([
      ["todo", 2],
      ["urgente", 1],
      ["nada", 1],
    ]);
    expect(planDeEnvio([alerta({ severidad: "baja" })], [{ id: "x", severidad_minima: "media" }])).toEqual([]);
  });
});

describe("rutaSegura", () => {
  it.each([
    [null, "/alertas"],
    ["", "/alertas"],
    ["//otro.sitio/x", "/alertas"],
    ["https://otro.sitio", "/alertas"],
    ["/\\otro.sitio", "/alertas"],
    ["/inventario/ajuste", "/inventario/ajuste"],
  ])("%s → %s", (entrada, salida) => {
    expect(rutaSegura(entrada)).toBe(salida);
  });
});

describe("seDaPorAvisada", () => {
  it("sin aparatos se vacía la cola", () => {
    expect(seDaPorAvisada([])).toBe(true);
  });
  it("con que llegue a uno, basta", () => {
    expect(seDaPorAvisada([{ ok: false, definitivo: false }, { ok: true, definitivo: false }])).toBe(true);
  });
  it("si todo falló por algo pasajero, se reintenta", () => {
    expect(seDaPorAvisada([{ ok: false, definitivo: false }, { ok: false, definitivo: true }])).toBe(false);
  });
  it("si todos los aparatos ya no existen, se da por avisada", () => {
    expect(seDaPorAvisada([{ ok: false, definitivo: true }])).toBe(true);
  });
});

describe("esCodigoDeBaja", () => {
  it("404 y 410 dan de baja; lo demás no", () => {
    expect(esCodigoDeBaja(404)).toBe(true);
    expect(esCodigoDeBaja(410)).toBe(true);
    expect(esCodigoDeBaja(429)).toBe(false);
    expect(esCodigoDeBaja(undefined)).toBe(false);
  });
});

describe("endpointPermitido", () => {
  it.each([
    ["https://fcm.googleapis.com/fcm/send/abc", true],
    ["https://updates.push.services.mozilla.com/wpush/v2/abc", true],
    ["https://web.push.apple.com/QAbc", true],
    ["https://wns2-par02p.notify.windows.com/w/?token=x", true],
    // Chromium 2026 se suscribe aquí, no en fcm.googleapis.com (prueba del 27/10).
    ["https://jmt17.google.com/fcm/send/abc", true],
    ["https://evilgoogle.com/fcm/send/abc", false],
    ["http://fcm.googleapis.com/fcm/send/abc", false],
    ["https://169.254.169.254/latest", false],
    ["https://fcm.googleapis.com.malo.com/x", false],
    ["https://localhost:4005/x", false],
  ])("%s → %s", (ep, ok) => {
    expect(endpointPermitido(ep)).toBe(ok);
  });
});

describe("describirAparato", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      "iPhone · Safari",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
      "Android · Chrome",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
      "Windows · Edge",
    ],
    ["", "Otro aparato"],
  ])("%s", (ua, esperado) => {
    expect(describirAparato(ua)).toBe(esperado);
  });
});
