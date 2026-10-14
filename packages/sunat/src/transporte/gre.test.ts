import { afterEach, describe, expect, it, vi } from "vitest";

import { consultarTicketGre, enviarGre, ErrorGre, hashZip, olvidarTokenGre, tokenGre, type CredencialesGre } from "./gre";

const CRED: CredencialesGre = {
  clientId: "cid",
  clientSecret: "secreto",
  usuarioSol: "20562681206MODDATOS",
  claveSol: "moddatos",
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  olvidarTokenGre(CRED);
});

describe("GRE por REST", () => {
  it("pide el token con formulario y lo reutiliza", async () => {
    const f = vi.fn(async () => json({ access_token: "tok", expires_in: 3600 }));
    vi.stubGlobal("fetch", f);
    expect(await tokenGre(CRED)).toBe("tok");
    expect(await tokenGre(CRED)).toBe("tok");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-seguridad.sunat.gob.pe/v1/clientessol/cid/oauth2/token/");
    expect(String(init.body)).toContain("grant_type=password");
    expect(String(init.body)).toContain("username=20562681206MODDATOS");
  });

  it("dice por qué SUNAT no dio el token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid_client", error_description: "cliente no válido" }, 400)));
    await expect(tokenGre(CRED)).rejects.toThrow(/cliente no válido/);
  });

  it("manda el ZIP con su nombre, base64 y hash, y devuelve el ticket", async () => {
    const f = vi.fn(async (url: string) =>
      url.includes("oauth2") ? json({ access_token: "tok", expires_in: 3600 }) : json({ numTicket: "uuid-1" }),
    );
    vi.stubGlobal("fetch", f);
    const zip = Buffer.from("PKzip").toString("base64");
    expect(await enviarGre(CRED, "20562681206-09-T002-559", zip)).toBe("uuid-1");
    const [url, init] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/20562681206-09-T002-559");
    expect(JSON.parse(String(init.body))).toEqual({
      archivo: { nomArchivo: "20562681206-09-T002-559.zip", arcGreZip: zip, hashZip: hashZip(zip) },
    });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("un 422 trae el error de validación de SUNAT", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("oauth2")
          ? json({ access_token: "tok", expires_in: 3600 })
          : json({ cod: "422", msg: "Error", errors: [{ codError: "1033", desError: "Ya fue presentado" }] }, 422),
      ),
    );
    const e = await enviarGre(CRED, "x", "eA==").catch((x) => x);
    expect(e).toBeInstanceOf(ErrorGre);
    expect(e).toMatchObject({ codigo: "1033", message: "Ya fue presentado", http: 422 });
  });

  it("lee los tres estados del ticket", async () => {
    const respuestas = [{ codRespuesta: "98" }, { codRespuesta: "0", arcCdr: "Q0RS" }, { codRespuesta: "99", error: { numError: "2800", desError: "mal" } }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("oauth2") ? json({ access_token: "tok", expires_in: 3600 }) : json(respuestas.shift()))),
    );
    expect(await consultarTicketGre(CRED, "t")).toEqual({ estado: "en_proceso" });
    expect(await consultarTicketGre(CRED, "t")).toEqual({ estado: "procesado", cdr: "Q0RS" });
    expect(await consultarTicketGre(CRED, "t")).toEqual({ estado: "error", codigo: "2800", mensaje: "mal", cdr: null });
  });

  it("el hash es el SHA-256 de los bytes del ZIP", () => {
    expect(hashZip(Buffer.from("abc").toString("base64"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
