import { describe, expect, it } from "vitest";

import { refDeUrl, revisar } from "./guardia";

/**
 * La guardia se prueba con vitest y no con Playwright a propósito: es lógica
 * pura y tiene que poder comprobarse sin levantar un navegador ni tocar una
 * base. Además así corre en cada `pnpm test`, que es cuando de verdad sirve
 * que alguien se entere de que la rompió.
 */

const CLIENTE = "https://vlvwrobbdrxvcxvahunf.supabase.co";
const PRUEBAS = "https://abcdefghijklmnop.supabase.co";

describe("refDeUrl", () => {
  it("saca el ref de una URL de Supabase", () => {
    expect(refDeUrl(CLIENTE)).toBe("vlvwrobbdrxvcxvahunf");
  });

  it("aguanta espacios de sobra", () => {
    expect(refDeUrl(`  ${PRUEBAS}  `)).toBe("abcdefghijklmnop");
  });

  it("devuelve null con lo que no reconoce", () => {
    expect(refDeUrl(undefined)).toBeNull();
    expect(refDeUrl("")).toBeNull();
    expect(refDeUrl("http://localhost:54321")).toBeNull();
  });
});

describe("revisar", () => {
  it("NIEGA la base del cliente, aunque se pida el permiso a gritos", () => {
    // Es el caso que justifica el archivo entero: el permiso explícito NO
    // desbloquea la base de producción. Un correlativo quemado no se recupera.
    const v = revisar({
      NEXT_PUBLIC_SUPABASE_URL: CLIENTE,
      E2E_PERMITIR_ESCRITURA: "1",
    } as NodeJS.ProcessEnv);

    expect(v.puedeEscribir).toBe(false);
    expect(v.motivo).toContain("CLIENTE");
  });

  it("niega si no sabe contra qué base corre", () => {
    const v = revisar({} as NodeJS.ProcessEnv);
    expect(v.puedeEscribir).toBe(false);
    expect(v.ref).toBeNull();
  });

  it("niega otra base sin el permiso explícito", () => {
    const v = revisar({ NEXT_PUBLIC_SUPABASE_URL: PRUEBAS } as NodeJS.ProcessEnv);
    expect(v.puedeEscribir).toBe(false);
    expect(v.motivo).toContain("E2E_PERMITIR_ESCRITURA");
  });

  it("deja pasar otra base CON el permiso explícito", () => {
    const v = revisar({
      NEXT_PUBLIC_SUPABASE_URL: PRUEBAS,
      E2E_PERMITIR_ESCRITURA: "1",
    } as NodeJS.ProcessEnv);

    expect(v.puedeEscribir).toBe(true);
    expect(v.ref).toBe("abcdefghijklmnop");
  });

  /**
   * El ref del cliente va escrito en el código, no leído del entorno. Si
   * saliera del mismo `.env` que se está comprobando, la guardia se apuntaría a
   * sí misma y dejaría pasar cualquier cosa.
   */
  it("no se puede engañar cambiando el entorno", () => {
    const v = revisar({
      NEXT_PUBLIC_SUPABASE_URL: CLIENTE,
      REF_CLIENTE: "otro-cualquiera",
      E2E_PERMITIR_ESCRITURA: "1",
    } as NodeJS.ProcessEnv);

    expect(v.puedeEscribir).toBe(false);
  });
});
