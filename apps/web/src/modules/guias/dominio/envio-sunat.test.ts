/**
 * El viaje de la guía contra un SUNAT falso (auditoría SUNAT 28/10, M4 y M5).
 *
 * Es el mismo SUNAT falso de `packages/sunat/src/transporte/gre.test.ts`
 * (`fetch` sustituido), pero con memoria: recuerda qué números recibió y
 * qué ticket dio a cada uno, y se le puede cortar la red en el peor momento
 * —después de recibir la guía y antes de contestar—. Por encima va el código
 * de verdad: `enviarGre` y `consultarGuia` del conector, con su lectura del
 * CDR, y `mandarGuia`. Solo el firmado se salta: aquí no hay certificado, y
 * el SUNAT falso no lo mira.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { crearConector, enviarGre, MENSAJE_SIN_CONEXION, type ResultadoCdr } from "@rodatech/sunat";

import { esDuplicadoGre, mandarGuia, preguntarGuia, type CambiosGuia, type Previo } from "./envio-sunat";

const NOMBRE = "20562681206-09-T002-559";
const NUMERO = "T002-00000559";
const GRE = {
  clientId: "cid-falso",
  clientSecret: "secreto-falso",
  urlToken: "https://sunat-falso.test/token/{client_id}",
  hostEnvio: "https://sunat-falso.test",
};
const SOL = { usuarioSol: "20562681206MODDATOS", claveSol: "moddatos" };

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

const cdr = (codigo: string, descripcion: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cac:DocumentResponse><cac:Response><cbc:ResponseCode>${codigo}</cbc:ResponseCode><cbc:Description>${descripcion}</cbc:Description></cac:Response></cac:DocumentResponse></ar:ApplicationResponse>`;

/** Un SUNAT de mentira con memoria. */
class SunatFalso {
  /** Número → ticket con el que se recibió. */
  recibidas = new Map<string, string>();
  tickets = new Map<string, { nombre: string; consultas: number; duplicado: boolean }>();
  posts = 0;
  /** Recibe la guía y la red se cae antes de que llegue el ticket. */
  cortarTrasRecibir = false;
  cortarConsultas = false;
  /** Cuántas veces contesta «98, en proceso» antes del resultado. */
  enProceso = 0;
  /** Cómo dice «ya la tengo»: al recibir (422) o en el ticket (99). */
  duplicadoPor: "422" | "ticket" = "422";

  fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/token/")) return json({ access_token: "tok", expires_in: 3600 });

    if (init?.method === "POST") {
      this.posts++;
      const nombre = decodeURIComponent(url.split("/").pop()!);
      const ticket = `t-${this.posts}`;
      if (this.recibidas.has(nombre)) {
        if (this.duplicadoPor === "422") {
          return json(
            { cod: "422", msg: "Error", errors: [{ codError: "1033", desError: "El comprobante fue registrado previamente con otros datos" }] },
            422,
          );
        }
        this.tickets.set(ticket, { nombre, consultas: 0, duplicado: true });
        return json({ numTicket: ticket });
      }
      this.recibidas.set(nombre, ticket);
      this.tickets.set(ticket, { nombre, consultas: 0, duplicado: false });
      if (this.cortarTrasRecibir) throw new TypeError("fetch failed");
      return json({ numTicket: ticket });
    }

    // GET …/envios/{ticket}
    if (this.cortarConsultas) throw new TypeError("fetch failed");
    const t = this.tickets.get(decodeURIComponent(url.split("/").pop()!));
    if (!t) return json({ cod: "422", msg: "Error", errors: [{ codError: "166", desError: "Ticket no existe" }] }, 422);
    t.consultas++;
    if (t.consultas <= this.enProceso) return json({ codRespuesta: "98" });
    if (t.duplicado) {
      return json({ codRespuesta: "99", error: { numError: "1033", desError: "El comprobante fue registrado previamente con otros datos" } });
    }
    const n = t.nombre.split("-").pop();
    return json({
      codRespuesta: "0",
      indCdrGenerado: "1",
      arcCdr: Buffer.from(cdr("0", `La Guia numero T002-${n}, ha sido aceptada`)).toString("base64"),
    });
  });
}

/** La fila de la guía en la base, y el intento tal como lo hace la Server Action. */
class Fila {
  estado_sunat = "pendiente";
  sunat_ticket: string | null = null;
  sunat_enviado_en: string | null = null;
  sunat_codigo_respuesta: string | null = null;
  sunat_mensaje: string | null = null;
  sunat_respuesta: ResultadoCdr | null = null;

  guardar = async (c: CambiosGuia) => {
    Object.assign(this, c);
  };
}

function puertos() {
  const conector = crearConector({
    ambiente: "beta",
    certificadoPfx: Buffer.alloc(0),
    certificadoClave: "",
    ...SOL,
    gre: GRE,
  });
  const zip = Buffer.from("PK-guia-falsa").toString("base64");
  return {
    enviar: async () => ({ ticket: await enviarGre({ ...GRE, ...SOL }, NOMBRE, zip) }),
    consultar: (ticket: string) => conector.consultarGuia(ticket),
  };
}

/** Lo que hace `enviarGuiaASunat`: lee lo anterior, pone el candado y manda. */
async function intento(fila: Fila) {
  const previo: Previo = { ticket: fila.sunat_ticket, yaSeMando: fila.sunat_enviado_en !== null };
  fila.estado_sunat = "enviado";
  fila.sunat_enviado_en = "ahora";
  return mandarGuia({ numero: NUMERO, previo, sunat: puertos(), guia: fila, esperar: async () => {}, pausas: [0, 0, 0] });
}

let sunat: SunatFalso;
function montar() {
  sunat = new SunatFalso();
  vi.stubGlobal("fetch", sunat.fetch);
  return sunat;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guía a SUNAT: el CDR se guarda (M4)", () => {
  it("al aceptarla guarda la constancia entera, con su XML", async () => {
    montar();
    const fila = new Fila();
    const r = await intento(fila);

    expect(r).toMatchObject({ ok: true, estado: "aceptada" });
    expect(fila.estado_sunat).toBe("aceptado");
    expect(fila.sunat_ticket).toBe("t-1");
    expect(fila.sunat_respuesta?.aceptado).toBe(true);
    expect(fila.sunat_respuesta?.cdrXml).toContain("ApplicationResponse");
    expect(fila.sunat_respuesta?.cdrXml).toContain("ha sido aceptada");
  });

  it("al preguntar más tarde por el ticket, también la guarda", async () => {
    montar().enProceso = 5;
    const fila = new Fila();
    expect(await intento(fila)).toMatchObject({ estado: "en_proceso" });
    expect(fila.sunat_respuesta).toBeNull();

    sunat.enProceso = 0;
    const r = await preguntarGuia({ numero: NUMERO, ticket: fila.sunat_ticket!, sunat: puertos(), guia: fila });
    expect(r).toMatchObject({ ok: true, estado: "aceptada" });
    expect(fila.sunat_respuesta?.cdrXml).toContain("ha sido aceptada");
  });
});

describe("guía a SUNAT: un corte no deja rechazada una guía aceptada (M5)", () => {
  it("SUNAT la recibió y la red se cayó antes del ticket: al reintentar dice «ya la tengo» (422) y NO queda rechazada", async () => {
    montar().cortarTrasRecibir = true;
    const fila = new Fila();

    const primero = await intento(fila);
    expect(primero).toEqual({ ok: false, error: MENSAJE_SIN_CONEXION });
    expect(fila.estado_sunat).toBe("pendiente");
    expect(fila.sunat_ticket).toBeNull();
    expect(sunat.recibidas.has(NOMBRE)).toBe(true);

    sunat.cortarTrasRecibir = false;
    const segundo = await intento(fila);
    expect(sunat.posts).toBe(2);
    expect(segundo.ok).toBe(false);
    expect(fila.estado_sunat).toBe("pendiente");
    expect(fila.estado_sunat).not.toBe("rechazado");
    expect(fila.sunat_codigo_respuesta).toBe("1033");
    expect(fila.sunat_mensaje).toMatch(/ya la tiene/);
    expect(fila.sunat_mensaje).toMatch(/NO emitas otra/);
  });

  it("lo mismo si SUNAT da ticket y dice «ya la tengo» al consultarlo (99)", async () => {
    const s = montar();
    s.cortarTrasRecibir = true;
    s.duplicadoPor = "ticket";
    const fila = new Fila();
    await intento(fila);

    s.cortarTrasRecibir = false;
    const segundo = await intento(fila);
    expect(segundo.ok).toBe(false);
    expect(fila.estado_sunat).toBe("pendiente");
    expect(fila.sunat_respuesta?.codigo).toBe("1033");
    expect(fila.sunat_mensaje).toMatch(/ya la tiene/);
  });

  it("con el ticket guardado, antes de reenviar pregunta por él: si ya está aceptada, no la vuelve a mandar", async () => {
    const s = montar();
    s.cortarConsultas = true;
    const fila = new Fila();
    expect(await intento(fila)).toMatchObject({ estado: "en_proceso" });
    expect(fila.sunat_ticket).toBe("t-1");

    // La guía quedó sin respuesta y alguien pulsa «Enviar» otra vez (p. ej.
    // tras un candado muerto o un estado «pendiente» de antes).
    s.cortarConsultas = false;
    fila.estado_sunat = "pendiente";
    const r = await intento(fila);
    expect(r).toMatchObject({ ok: true, estado: "aceptada" });
    expect(s.posts).toBe(1);
    expect(fila.estado_sunat).toBe("aceptado");
    expect(fila.sunat_respuesta?.cdrXml).toContain("ha sido aceptada");
  });

  it("si con el ticket guardado no puede preguntar (red), no reenvía a ciegas", async () => {
    const s = montar();
    s.cortarConsultas = true;
    const fila = new Fila();
    await intento(fila);

    fila.estado_sunat = "pendiente";
    const r = await intento(fila);
    expect(r.ok).toBe(false);
    expect(s.posts).toBe(1);
    expect(fila.estado_sunat).toBe("enviado");
    expect(fila.sunat_mensaje).toMatch(/no se vuelve a mandar/);
  });

  it("si es el PRIMER envío y SUNAT ya tiene ese número, sí es un rechazo (lo usó otro sistema)", async () => {
    const s = montar();
    s.recibidas.set(NOMBRE, "de-otro-sistema");
    const fila = new Fila();
    const r = await intento(fila);
    expect(r).toMatchObject({ ok: true, estado: "rechazada" });
    expect(fila.estado_sunat).toBe("rechazado");
  });

  it("al preguntar por un ticket que dice «ya la tengo», sin saber si fue un reintento, no la marca rechazada y explica las dos salidas", async () => {
    const s = montar();
    s.recibidas.set(NOMBRE, "antes");
    s.duplicadoPor = "ticket";
    const ticket = await puertos().enviar();
    const fila = new Fila();
    fila.estado_sunat = "enviado";
    fila.sunat_ticket = ticket.ticket;
    const r = await preguntarGuia({ numero: NUMERO, ticket: ticket.ticket, sunat: puertos(), guia: fila });
    expect(r.ok).toBe(false);
    expect(fila.estado_sunat).toBe("pendiente");
    expect(fila.sunat_mensaje).toMatch(/Si esta ya se había mandado antes/);
  });
});

describe("esDuplicadoGre", () => {
  it("reconoce el código y el texto", () => {
    expect(esDuplicadoGre("1033", "")).toBe(true);
    expect(esDuplicadoGre("soap-env:Client.1032", null)).toBe(true);
    expect(esDuplicadoGre(null, "El comprobante fue registrado previamente con otros datos")).toBe(true);
    expect(esDuplicadoGre("2xxx", "La guía ya fue presentada")).toBe(true);
    expect(esDuplicadoGre("2800", "El dato ingresado no cumple con el formato")).toBe(false);
    expect(esDuplicadoGre(null, null)).toBe(false);
  });
});
