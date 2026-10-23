/**
 * Prueba contra el ambiente BETA de SUNAT, de verdad (23/10).
 *
 * Hasta hoy, desde este ERP no había salido nada a SUNAT (§AS): el XML, la
 * firma, el SOAP y el CDR tenían tests, pero contra nosotros mismos. Esto
 * manda a `e-beta.sunat.gob.pe` lo mismo que manda el botón «Enviar a
 * SUNAT» —`comprobanteParaSunat` y `notaParaSunat` son las funciones que usa
 * `enviarASunat`— y mira qué contesta.
 *
 * Lo que hace falta para beta, y por qué no es nada de Willy:
 *   · Usuario `<RUC>MODDATOS` / `moddatos`: público, de SUNAT, para pruebas.
 *   · Un certificado AUTOFIRMADO, que se genera aquí con OpenSSL. Beta mira
 *     que el XML esté bien firmado, no quién emitió el certificado.
 *
 * Lo que NO prueba: el certificado real de Willy, su usuario SOL, ni la guía
 * (la GRE no tiene beta). Y no toca la base: los comprobantes son de mentira,
 * con un cliente de mentira, y la serie F001 de pruebas.
 *
 *     pnpm sunat:beta
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { crearConector, type ResultadoCdr } from "@rodatech/sunat";

import { enMonedaDelDocumento } from "./moneda-documento";
import { comprobanteParaSunat, notaParaSunat, type EmisorSunat } from "./para-sunat";
import type { ComprobanteDetalle, LineaComprobante } from "./tipos";

const RUC = "20562681206";

const EMPRESA: EmisorSunat = {
  ruc: RUC,
  razon_social: "INVERSIONES RODATECH E.I.R.L.",
  nombre_comercial: "RODATECH",
  direccion: "LIMA - SAN JUAN DE LURIGANCHO",
  ubigeo_codigo: "150132",
  igv_porcentaje: 18,
  // Lo que `enviarASunat` lee de `ubigeo` para el 150132.
  departamento: "Lima",
  provincia: "Lima",
  distrito: "San Juan de Lurigancho",
};

/** Un .pfx autofirmado, generado una vez y guardado fuera del repo. */
function certificado(): { pfx: Buffer; clave: string } {
  const dir = join(tmpdir(), "rodatech-sunat-beta");
  const pfx = join(dir, "beta.pfx");
  const clave = "beta1234";
  if (!existsSync(pfx)) {
    mkdirSync(dir, { recursive: true });
    const key = join(dir, "beta.key");
    const crt = join(dir, "beta.crt");
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", crt, "-days", "3650",
      "-subj", `/CN=RODATECH PRUEBAS BETA/O=${RUC}/C=PE`,
    ]);
    execFileSync("openssl", ["pkcs12", "-export", "-out", pfx, "-inkey", key, "-in", crt, "-passout", `pass:${clave}`]);
  }
  return { pfx: readFileSync(pfx), clave };
}

const { pfx, clave } = certificado();
const conector = crearConector({
  ambiente: "beta",
  certificadoPfx: pfx,
  certificadoClave: clave,
  usuarioSol: `${RUC}MODDATOS`,
  claveSol: "moddatos",
});

// Un número alto y distinto en cada corrida: beta guarda lo que recibe y
// contesta «ya registrado» si se repite.
const BASE = 90_000_000 + (Math.floor(Date.now() / 1000) % 9_000_000);
const HOY = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());

function linea(codigo: string, cantidad: number, valor: number, descuento = 0): LineaComprobante {
  return {
    id: codigo,
    producto_id: null,
    codigo,
    marca: "SKF",
    descripcion: `${codigo} RODAMIENTO RIGIDO DE BOLAS`,
    unidad: "NIU",
    cantidad,
    valor_unitario: valor,
    descuento_pct: descuento,
    importe: Math.round(cantidad * valor * (1 - descuento / 100) * 100) / 100,
  };
}

/** Un comprobante como lo devuelve `detalleComprobante`, con los totales cuadrados como la base. */
function detalle(campos: Partial<ComprobanteDetalle> & { lineas: LineaComprobante[]; correlativo: number }): ComprobanteDetalle {
  const gravada = Math.round(campos.lineas.reduce((s, l) => s + l.importe, 0) * 100) / 100;
  const igv = Math.round(gravada * 0.18 * 100) / 100;
  const total = Math.round((gravada + igv) * 100) / 100;
  return {
    id: "prueba",
    tipo: "factura",
    serie: "F001",
    numero: `F001-${campos.correlativo}`,
    cliente_id: "prueba",
    // SUNAT, como cliente de mentira: un RUC que existe y que no es de nadie
    // de la cartera de Willy.
    cliente: "SUPERINTENDENCIA NACIONAL DE ADUANAS Y DE ADMINISTRACION TRIBUTARIA",
    cliente_documento: "20131312955",
    cliente_tipo_documento: "RUC",
    cliente_direccion: "AV. GARCILASO DE LA VEGA 1472 LIMA",
    cliente_email: null,
    cotizacion_id: null,
    cotizacion_numero: null,
    pedido: null,
    orden_compra_cliente: null,
    referencia_id: null,
    referencia_numero: null,
    motivo_nota_codigo: null,
    fecha_emision: HOY,
    fecha_vencimiento: null,
    condicion_pago: "contado",
    dias_credito: 0,
    moneda: "USD",
    tipo_cambio: null,
    pen: null,
    mostrar_cuenta: true,
    guia_numero: null,
    cuotas: [],
    op_gravada: gravada,
    op_exonerada: 0,
    op_inafecta: 0,
    descuento_global: 0,
    igv,
    total,
    total_letras: null,
    pagado: 0,
    saldo: total,
    estado: "emitido",
    estado_sunat: "pendiente",
    sunat_codigo_respuesta: null,
    sunat_mensaje: null,
    sunat_enviado_en: null,
    sunat_hash_cdr: null,
    detraccion_aplica: false,
    detraccion_porcentaje: 0,
    detraccion_monto: 0,
    detraccion_codigo: null,
    retencion_aplica: false,
    retencion_monto: 0,
    vendedor: null,
    observaciones: null,
    motivo_anulacion: null,
    creado_en: HOY,
    ...campos,
  };
}

function informe(nombre: string, r: ResultadoCdr) {
  console.log(`\n${nombre}: ${r.aceptado ? "ACEPTADO" : "RECHAZADO"} · ${r.codigo} · ${r.descripcion}`);
  for (const o of r.observaciones) console.log(`   observación: ${o}`);
}

describe("SUNAT beta", () => {
  const facturaContado = detalle({
    correlativo: BASE,
    lineas: [linea("6205-2RSH", 10, 3.5), linea("6305-2Z", 4, 7.25, 5)],
  });

  it("factura en dólares al contado", async () => {
    const r = await conector.emitir(comprobanteParaSunat(enMonedaDelDocumento(facturaContado), EMPRESA));
    informe("Factura USD contado", r);
    expect(r.aceptado).toBe(true);
  });

  it("factura en dólares a crédito, con retención y cuotas", async () => {
    // Por encima de S/ 700 para que la retención tenga sentido.
    const d = detalle({ correlativo: BASE + 1, lineas: [linea("22220-E", 20, 45)], condicion_pago: "credito", dias_credito: 30 });
    const r = await conector.emitir(
      comprobanteParaSunat(
        enMonedaDelDocumento({ ...d, retencion_aplica: true, retencion_monto: Math.round(d.total * 0.03 * 100) / 100 }),
        EMPRESA,
      ),
    );
    informe("Factura USD crédito con retención", r);
    expect(r.aceptado).toBe(true);
  });

  it("factura en soles a crédito (116)", async () => {
    const usd = detalle({ correlativo: BASE + 2, lineas: [linea("6205-2Z", 10, 4)], condicion_pago: "credito", dias_credito: 15 });
    // Lo que guarda la base para una venta en soles: los dólares de siempre y
    // los soles impresos al cambio de la cotización.
    const tc = 3.442;
    const gravada = Math.round(usd.lineas.reduce((s, l) => s + Math.round(l.valor_unitario * tc * 100) / 100 * l.cantidad, 0) * 100) / 100;
    const igv = Math.round(gravada * 0.18 * 100) / 100;
    const r = await conector.emitir(
      comprobanteParaSunat(
        enMonedaDelDocumento({
          ...usd,
          moneda: "PEN",
          tipo_cambio: tc,
          pen: { gravada, descuento: 0, igv, total: Math.round((gravada + igv) * 100) / 100, retencion: 0 },
        }),
        EMPRESA,
      ),
    );
    informe("Factura PEN crédito", r);
    expect(r.aceptado).toBe(true);
  });

  it("27 líneas con precios y descuentos incómodos (el redondeo de la base contra el de las líneas)", async () => {
    // `emitir_comprobante` redondea el IGV sobre el TOTAL; el XML lo lleva
    // línea a línea. Con 27 líneas (la factura más larga de la base) la
    // diferencia puede llegar a céntimos, y SUNAT tolera hasta 1.
    const lineas = Array.from({ length: 27 }, (_, i) =>
      linea(`P${i + 1}`, (i % 7) + 1, 0.333 + i * 1.117, i % 4 === 0 ? 7.5 : 0),
    );
    const d = detalle({ correlativo: BASE + 3, lineas });
    const sumaLineas = lineas.reduce((s, l) => s + Math.round(l.importe * 0.18 * 100) / 100, 0);
    console.log(`\nIGV de la base ${d.igv} · suma de las líneas ${sumaLineas.toFixed(2)}`);
    const r = await conector.emitir(comprobanteParaSunat(enMonedaDelDocumento(d), EMPRESA));
    informe("Factura de 27 líneas", r);
    expect(r.aceptado).toBe(true);
  });

  it("nota de crédito por devolución de un producto, sobre la primera", async () => {
    const nota = detalle({
      correlativo: BASE,
      tipo: "nota_credito",
      serie: "FC01",
      numero: `FC01-${BASE}`,
      motivo_nota_codigo: "07",
      lineas: [linea("6205-2RSH", 2, 3.5)],
    });
    const r = await conector.emitirNota(
      notaParaSunat(enMonedaDelDocumento(nota), EMPRESA, {
        afectado: { tipoDocumento: "01", serie: "F001", correlativo: BASE },
        descripcionMotivo: "Devolución por ítem",
      }),
    );
    informe("Nota de crédito 07", r);
    expect(r.aceptado).toBe(true);
  });

  it("comunicación de baja de la factura en soles", async () => {
    const r = await conector.emitirComunicacionBaja({
      correlativo: 1 + (BASE % 900),
      fechaEmisionDocs: new Date(`${HOY}T00:00:00-05:00`),
      fechaComunicacion: new Date(`${HOY}T00:00:00-05:00`),
      emisor: { ruc: RUC, razonSocial: EMPRESA.razon_social },
      documentos: [{ tipoDocumento: "01", serie: "F001", correlativo: BASE + 2, motivo: "Prueba de baja" }],
    });
    console.log(`\nBaja: ${r.aceptadoEnvio ? `ticket ${r.ticket}` : `NO RECIBIDA · ${r.error}`}`);
    expect(r.aceptadoEnvio).toBe(true);

    // El resultado llega después: se pregunta unas veces.
    let final: Awaited<ReturnType<typeof conector.consultarResumen>> = { enProceso: true };
    for (let i = 0; i < 8 && "enProceso" in final; i++) {
      await new Promise((ok) => setTimeout(ok, 4000));
      final = await conector.consultarResumen(r.ticket!);
    }
    if ("enProceso" in final) {
      console.log("Baja: SUNAT sigue procesándola");
    } else {
      informe("Baja", final);
      expect(final.aceptado).toBe(true);
    }
  });
});
