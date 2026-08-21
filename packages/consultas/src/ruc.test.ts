import { describe, expect, it, vi } from "vitest";
import { consultarRuc, rucValido } from "./ruc";
import { ClienteSupabaseFalso, CONFIGURACION_CUOTA_PRUEBA, crearContextoPrueba, respuestaFalsa } from "./soporte-pruebas";

const RUC_VALIDO_JURIDICA = "20609715732"; // persona jurídica real, dígito verificador correcto
const RUC_VALIDO_REXTIE = "20601030013"; // el mismo del ejemplo de la especificación

describe("rucValido — dígito verificador módulo 11", () => {
  it("acepta RUCs reales con su dígito verificador correcto", () => {
    expect(rucValido(RUC_VALIDO_JURIDICA)).toBe(true);
    expect(rucValido(RUC_VALIDO_REXTIE)).toBe(true);
  });

  it("rechaza un dígito verificador incorrecto", () => {
    expect(rucValido("10456789012")).toBe(false); // dígito verificador falso
    expect(rucValido("20609715733")).toBe(false); // último dígito cambiado
  });

  it("rechaza longitudes distintas de 11", () => {
    expect(rucValido("2060971573")).toBe(false); // 10 dígitos
    expect(rucValido("206097157321")).toBe(false); // 12 dígitos
    expect(rucValido("")).toBe(false);
  });

  it("rechaza caracteres no numéricos", () => {
    expect(rucValido("2060971573a")).toBe(false);
    expect(rucValido("20 609715732")).toBe(false);
  });

  it("rechaza prefijos que no son de contribuyente (solo valen 10/15/17/20)", () => {
    expect(rucValido("30609715732")).toBe(false);
  });
});

describe("consultarRuc — validación local antes de gastar cuota", () => {
  it("un RUC inválido no toca caché, cuota ni red", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchEspia = vi.fn();
    const contexto = crearContextoPrueba({ cliente, fetch: fetchEspia as unknown as typeof fetch });

    const resultado = await consultarRuc("12345678901", contexto);

    expect(resultado.ok).toBe(false);
    expect(resultado.origen).toBe("invalido");
    expect(resultado.errorCodigo).toBe("VALIDACION_LOCAL");
    expect(fetchEspia).not.toHaveBeenCalled();
    expect(cliente.llamadasRpc).toHaveLength(0);
    expect(cliente.llamadasFrom).toHaveLength(0);
  });
});

describe("consultarRuc — flujo completo con proveedor falso", () => {
  it("consulta exitosa: gasta 1 de cuota y queda en caché", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchFalso = vi.fn(async () =>
      respuestaFalsa(200, {
        razon_social: "REXTIE S.A.C.",
        numero_documento: RUC_VALIDO_REXTIE,
        estado: "ACTIVO",
        condicion: "HABIDO",
        direccion: "AV. JOSE GALVEZ BARRENECHEA NRO 566",
        distrito: "SAN ISIDRO",
        provincia: "LIMA",
        departamento: "LIMA",
        es_agente_retencion: false,
        es_buen_contribuyente: false,
      }),
    );
    const contexto = crearContextoPrueba({ cliente, fetch: fetchFalso as unknown as typeof fetch });

    const primero = await consultarRuc(RUC_VALIDO_REXTIE, contexto);
    expect(primero.ok).toBe(true);
    expect(primero.origen).toBe("api");
    expect(primero.datos?.razonSocial).toBe("REXTIE S.A.C.");
    expect(primero.cuota?.consumidas).toBe(1);
    expect(fetchFalso).toHaveBeenCalledTimes(1);

    // Segunda consulta del MISMO RUC: debe salir de caché y NO gastar cuota
    // ni volver a llamar al proveedor (checklist de la especificación).
    const segundo = await consultarRuc(RUC_VALIDO_REXTIE, contexto);
    expect(segundo.ok).toBe(true);
    expect(segundo.origen).toBe("cache");
    expect(fetchFalso).toHaveBeenCalledTimes(1); // sigue en 1: no volvió a llamar
    expect(cliente.llamadasRpc.filter((r) => r.nombre === "consultas_reservar_cuota")).toHaveLength(1);
  });

  it("422 (documento inexistente) se normaliza y se cachea en negativo", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchFalso = vi.fn(async () => respuestaFalsa(422, { message: "ruc no valido" }));
    const contexto = crearContextoPrueba({ cliente, fetch: fetchFalso as unknown as typeof fetch });

    const primero = await consultarRuc(RUC_VALIDO_REXTIE, contexto);
    expect(primero.ok).toBe(false);
    expect(primero.errorCodigo).toBe("DOCUMENTO_INVALIDO");
    expect(fetchFalso).toHaveBeenCalledTimes(1);

    const segundo = await consultarRuc(RUC_VALIDO_REXTIE, contexto);
    expect(segundo.ok).toBe(false);
    expect(segundo.origen).toBe("cache");
    expect(fetchFalso).toHaveBeenCalledTimes(1); // recordado en caché negativa, no reintenta
  });

  it("sin token configurado, degrada sin lanzar excepción", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchEspia = vi.fn();
    const contexto = crearContextoPrueba({ cliente, token: undefined, fetch: fetchEspia as unknown as typeof fetch });

    const resultado = await consultarRuc(RUC_VALIDO_REXTIE, contexto);
    expect(resultado.ok).toBe(false);
    expect(resultado.origen).toBe("sin_configurar");
    expect(resultado.mensaje).toMatch(/mano/);
    expect(fetchEspia).not.toHaveBeenCalled();
    expect(cliente.llamadasRpc).toHaveLength(0); // ni siquiera reserva cuota
  });

  it("con la cuota al 100%, no sale ninguna petición HTTP", async () => {
    const cliente = new ClienteSupabaseFalso();
    const config = { ...CONFIGURACION_CUOTA_PRUEBA, limite: 1 };
    const fetchFalso = vi.fn(async () => respuestaFalsa(200, { razon_social: "X", numero_documento: RUC_VALIDO_REXTIE }));
    const contexto = crearContextoPrueba({ cliente, cuota: config, fetch: fetchFalso as unknown as typeof fetch });

    // Se agota la única unidad de cuota con un RUC distinto.
    await consultarRuc(RUC_VALIDO_JURIDICA, contexto);
    expect(fetchFalso).toHaveBeenCalledTimes(1);

    const bloqueado = await consultarRuc(RUC_VALIDO_REXTIE, contexto);
    expect(bloqueado.ok).toBe(false);
    expect(bloqueado.origen).toBe("quota_blocked");
    expect(bloqueado.cuota?.estado).toBe("BLOCKED");
    expect(fetchFalso).toHaveBeenCalledTimes(1); // no aumentó: no salió la segunda petición
  });

  it("en modo reserva, una prioridad 'normal' es rechazada y 'critical' pasa", async () => {
    const cliente = new ClienteSupabaseFalso();
    const config = { ...CONFIGURACION_CUOTA_PRUEBA, limite: 100, reservaPorcentaje: 5 };
    const fetchFalso = vi.fn(async () => respuestaFalsa(200, { razon_social: "X", numero_documento: RUC_VALIDO_REXTIE }));
    const contexto = crearContextoPrueba({ cliente, cuota: config, fetch: fetchFalso as unknown as typeof fetch });

    // Deja el ciclo en 95/100 con prioridad crítica. `forzarActualizacion`
    // salta la caché en cada vuelta para que cada llamada gaste una unidad.
    for (let i = 0; i < 95; i++) {
      await consultarRuc(RUC_VALIDO_REXTIE, contexto, { prioridad: "critical", forzarActualizacion: true });
    }

    const normal = await consultarRuc(RUC_VALIDO_REXTIE, contexto, { prioridad: "normal", forzarActualizacion: true });
    expect(normal.ok).toBe(false);
    expect(normal.origen).toBe("quota_blocked");

    const critica = await consultarRuc(RUC_VALIDO_REXTIE, contexto, { prioridad: "critical", forzarActualizacion: true });
    expect(critica.ok).toBe(true);
  });

  it("429 del proveedor marca el ciclo como agotado y no reintenta", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchFalso = vi.fn(async () => respuestaFalsa(429, { error: "rate limited" }));
    const contexto = crearContextoPrueba({ cliente, fetch: fetchFalso as unknown as typeof fetch });

    const resultado = await consultarRuc(RUC_VALIDO_REXTIE, contexto);
    expect(resultado.ok).toBe(false);
    expect(resultado.errorCodigo).toBe("CUOTA_PROVEEDOR_AGOTADA");
    expect(fetchFalso).toHaveBeenCalledTimes(1); // no reintenta un 429

    const siguiente = await consultarRuc(RUC_VALIDO_JURIDICA, contexto);
    expect(siguiente.ok).toBe(false);
    expect(siguiente.origen).toBe("quota_blocked"); // el ciclo quedó bloqueado
  });

  it("un 5xx se reintenta hasta 3 veces y no se cachea", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchFalso = vi.fn(async () => respuestaFalsa(503, { error: "down" }));
    const contexto = crearContextoPrueba({ cliente, fetch: fetchFalso as unknown as typeof fetch, backoffBaseMs: 0 });

    const resultado = await consultarRuc(RUC_VALIDO_REXTIE, contexto);
    expect(resultado.ok).toBe(false);
    expect(resultado.errorCodigo).toBe("ERROR_PROVEEDOR");
    expect(fetchFalso).toHaveBeenCalledTimes(3); // 1 intento + 2 reintentos

    // Un 5xx nunca se cachea: la siguiente consulta vuelve a intentar la red.
    const otraVez = await consultarRuc(RUC_VALIDO_REXTIE, contexto);
    expect(otraVez.ok).toBe(false);
    expect(fetchFalso).toHaveBeenCalledTimes(6);
  });

  it("un timeout/error de red libera la reserva de cuota antes de reintentar", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchFalso = vi.fn(async () => {
      throw new Error("network down");
    });
    const contexto = crearContextoPrueba({ cliente, fetch: fetchFalso as unknown as typeof fetch, backoffBaseMs: 0 });

    const resultado = await consultarRuc(RUC_VALIDO_REXTIE, contexto);
    expect(resultado.ok).toBe(false);
    expect(resultado.errorCodigo).toBe("RED");
    expect(fetchFalso).toHaveBeenCalledTimes(3);
    // Cada intento reserva y libera: al final no debe quedar cuota consumida.
    const filaCuota = cliente.filaCuota(resultado.cuota?.periodo ?? "");
    expect(filaCuota?.consumidas).toBe(0);
  });
});
